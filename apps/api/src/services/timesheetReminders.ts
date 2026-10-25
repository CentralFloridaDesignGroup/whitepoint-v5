import type { ApiEnv } from '../types/apiTypes'
import { sendEmail } from './brevo.ts'
import { timesheetReminderEmail, timesheetReportEmail } from '../emails/timesheet.ts'
import type { EmailContent } from '../emails/layout.ts'
import { reminderWindow } from './reminderWindow.ts'

type User = { id:string; email:string; display_name:string; role_id?:string; permissions?:string }
export async function sendTimesheetReminders(env:ApiEnv,timestamp:number){
  const window=reminderWindow(timestamp);if(!window)return
  const users=(await env.DB.prepare("SELECT id,email,display_name FROM users_named WHERE user_type='internal' AND active=1 AND archived_at IS NULL").all<User>()).results
  const weeks=(await env.DB.prepare('SELECT user_id,status FROM user_timesheets WHERE week_start=?').bind(window.weekStart).all<{user_id:string;status:string}>()).results
  const statuses=new Map(weeks.map(w=>[w.user_id,w.status]))
  const missing=users.filter(u=>!statuses.has(u.id)||statuses.get(u.id)==='draft'||statuses.get(u.id)==='rejected')
  if(window.kind==='missing'){
    for(const user of missing)try{await deliver(env,window.weekStart,'missing',user,'Timesheet reminder',timesheetReminderEmail(window.weekStart))}catch(error){console.error('Timesheet reminder failed',error)}
    return
  }
  const pending=users.filter(u=>statuses.get(u.id)==='submitted')
  const recipients=(await env.DB.prepare("SELECT u.id,u.email,u.display_name,r.id AS role_id,r.permissions FROM users_named u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.user_type='internal' AND u.active=1 AND u.archived_at IS NULL").all<User>()).results.filter(u=>u.role_id==='super-administrator'||JSON.parse(u.permissions||'[]').includes('timesheets.hr.notify'))
  const report=timesheetReportEmail(window.weekStart,missing.map(u=>u.display_name),pending.map(u=>u.display_name))
  for(const user of recipients)try{await deliver(env,window.weekStart,'report',user,'Timesheet status report',report)}catch(error){console.error('Timesheet report failed',error)}
}
async function deliver(env:ApiEnv,start:string,kind:'missing'|'report',user:User,subject:string,content:EmailContent){
  const claim=crypto.randomUUID()
  const created=await env.DB.prepare('INSERT OR IGNORE INTO timesheet_notifications(id,week_start,kind,recipient_user_id) VALUES(?,?,?,?)').bind(claim,start,kind,user.id).run()
  if(!created.meta.changes){
    const retried=await env.DB.prepare("UPDATE timesheet_notifications SET id=?,status='pending',claimed_at=CURRENT_TIMESTAMP WHERE week_start=? AND kind=? AND recipient_user_id=? AND (status='failed' OR (status='pending' AND claimed_at<datetime('now','-30 minutes')))").bind(claim,start,kind,user.id).run()
    if(!retried.meta.changes)return
  }
  try{await sendEmail(env,{to:[{email:user.email,name:user.display_name}],subject,...content});await env.DB.prepare("UPDATE timesheet_notifications SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").bind(claim).run()}
  catch(error){await env.DB.prepare("UPDATE timesheet_notifications SET status='failed' WHERE id=? AND status='pending'").bind(claim).run();throw error}
}
