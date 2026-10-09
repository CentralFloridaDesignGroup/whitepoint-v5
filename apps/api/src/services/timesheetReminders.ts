import type { ApiEnv } from '../types/apiTypes'
import { sendTimesheetEmail } from './brevo.ts'
import { reminderWindow } from './reminderWindow'

type User = { id:string; email:string; display_name:string; role_id?:string; permissions?:string }
export async function sendTimesheetReminders(env:ApiEnv,timestamp:number){
  const window=reminderWindow(timestamp);if(!window)return
  const users=(await env.DB.prepare("SELECT id,email,display_name FROM users WHERE user_type='internal' AND active=1 AND archived_at IS NULL").all<User>()).results
  const weeks=(await env.DB.prepare('SELECT user_id,status FROM user_timesheets WHERE week_start=?').bind(window.weekStart).all<{user_id:string;status:string}>()).results
  const statuses=new Map(weeks.map(w=>[w.user_id,w.status]))
  const missing=users.filter(u=>!statuses.has(u.id)||statuses.get(u.id)==='draft')
  if(window.kind==='missing'){
    for(const user of missing)try{await deliver(env,window.weekStart,'missing',user,'Timesheet reminder',`Your timesheet for the week of ${window.weekStart} has not been submitted. Please submit your hours or an explicit zero-hour week in Manage.`)}catch(error){console.error('Timesheet reminder failed',error)}
    return
  }
  const pending=users.filter(u=>statuses.get(u.id)==='submitted')
  const recipients=(await env.DB.prepare("SELECT u.id,u.email,u.display_name,r.id AS role_id,r.permissions FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.user_type='internal' AND u.active=1 AND u.archived_at IS NULL").all<User>()).results.filter(u=>u.role_id==='super-administrator'||JSON.parse(u.permissions||'[]').includes('timesheets.hr.notify'))
  const lines=[`Timesheets for week of ${window.weekStart}`,`Unsubmitted (${missing.length}): ${missing.map(u=>u.display_name).join(', ')||'None'}`,`Pending approval (${pending.length}): ${pending.map(u=>u.display_name).join(', ')||'None'}`]
  for(const user of recipients)try{await deliver(env,window.weekStart,'report',user,'Timesheet status report',lines.join('\n'))}catch(error){console.error('Timesheet report failed',error)}
}
async function deliver(env:ApiEnv,start:string,kind:'missing'|'report',user:User,subject:string,body:string){
  const claim=crypto.randomUUID()
  const created=await env.DB.prepare('INSERT OR IGNORE INTO timesheet_notifications(id,week_start,kind,recipient_user_id) VALUES(?,?,?,?)').bind(claim,start,kind,user.id).run()
  if(!created.meta.changes){
    const retried=await env.DB.prepare("UPDATE timesheet_notifications SET id=?,status='pending',claimed_at=CURRENT_TIMESTAMP WHERE week_start=? AND kind=? AND recipient_user_id=? AND (status='failed' OR (status='pending' AND claimed_at<datetime('now','-30 minutes')))").bind(claim,start,kind,user.id).run()
    if(!retried.meta.changes)return
  }
  try{await sendTimesheetEmail(env,user.email,user.display_name,subject,body);await env.DB.prepare("UPDATE timesheet_notifications SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").bind(claim).run()}
  catch(error){await env.DB.prepare("UPDATE timesheet_notifications SET status='failed' WHERE id=? AND status='pending'").bind(claim).run();throw error}
}
