import { Hono } from 'hono'
import type { ApiContext, HonoEnv } from '../types/apiTypes'
import { sendTimesheetEmail } from '../services/brevo.ts'

type Row = Record<string, unknown>
type Week = { id: string; user_id: string; week_start: string; status: 'draft'|'submitted'|'approved'; revision: number }
const id = () => crypto.randomUUID()
const has = (c: { get: (key: 'permissions') => { hasPermission: (key: string) => boolean } }, key: string) => c.get('permissions').hasPermission(key)
const actor = (c: { get: (key: 'auth') => { internalUserId: string } }) => c.get('auth').internalUserId
const datePattern = /^\d{4}-\d{2}-\d{2}$/
function date(value: string) { if (!datePattern.test(value)) return null; const d = new Date(`${value}T00:00:00Z`); return Number.isNaN(d.valueOf()) || d.toISOString().slice(0,10) !== value ? null : d }
function monday(value: string) { const d = date(value); return d && d.getUTCDay() === 1 ? d : null }
function inWeek(day: string, start: string) { const d=date(day), m=monday(start); return Boolean(d && m && d.valueOf() >= m.valueOf() && d.valueOf() < m.valueOf()+7*86400000) }
function todayEastern() { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()) }
async function chain(db: D1Database, subject: string, manager: string) {
  const result = await db.prepare(`WITH RECURSIVE supervisors(id,manager_user_id,path) AS (
    SELECT id,manager_user_id,','||id||',' FROM users WHERE id=?
    UNION ALL SELECT u.id,u.manager_user_id,s.path||u.id||',' FROM users u JOIN supervisors s ON u.id=s.manager_user_id WHERE instr(s.path,','||u.id||',')=0
  ) SELECT 1 AS allowed FROM supervisors WHERE id=? AND id<>? LIMIT 1`).bind(subject,manager,subject).first<{allowed:number}>()
  return Boolean(result)
}
async function canReview(c: ApiContext, userId: string) {
  return has(c,'timesheets.approve') && await chain(c.env.DB,userId,actor(c)) || userId===actor(c) && has(c,'timesheets.approve') && !(await c.env.DB.prepare('SELECT manager_user_id FROM users WHERE id=?').bind(userId).first<{manager_user_id:string|null}>())?.manager_user_id
}
async function canRead(c: ApiContext, userId: string) { return userId===actor(c) || has(c,'timesheets.view') || await canReview(c,userId) }
async function week(db:D1Database,userId:string,start:string,create=false):Promise<Week|null>{
  let row=await db.prepare('SELECT id,user_id,week_start,status,revision FROM user_timesheets WHERE user_id=? AND week_start=?').bind(userId,start).first<Week>()
  if(!row&&create){await db.prepare('INSERT OR IGNORE INTO user_timesheets(id,user_id,week_start) VALUES(?,?,?)').bind(id(),userId,start).run();row=await db.prepare('SELECT id,user_id,week_start,status,revision FROM user_timesheets WHERE user_id=? AND week_start=?').bind(userId,start).first<Week>()}
  return row
}
const audit=(db:D1Database,weekId:string,entryId:string|null,userId:string,action:string,details:unknown={})=>db.prepare('INSERT INTO timesheet_audit(id,timesheet_id,entry_id,actor_id,action,details_json) VALUES(?,?,?,?,?,?)').bind(id(),weekId,entryId,userId,action,JSON.stringify(details))
const guard=(db:D1Database,token:string)=>db.prepare('INSERT INTO record_write_guards(id,valid) VALUES(?,CASE WHEN changes()=1 THEN 1 ELSE 0 END)').bind(token)
const clearGuard=(db:D1Database,token:string)=>db.prepare('DELETE FROM record_write_guards WHERE id=?').bind(token)
async function detail(c:ApiContext,w:Week){
  const entries=(await c.env.DB.prepare(`SELECT e.*,p.project_number,p.name AS project_name,t.task_name FROM user_timesheet_entries e JOIN projects p ON p.id=e.project_id LEFT JOIN project_tasks t ON t.id=e.project_task_id WHERE e.timesheet_id=? ORDER BY e.entry_date,e.created_at`).bind(w.id).all<Row>()).results
  const auditRows=(await c.env.DB.prepare('SELECT id,entry_id,actor_id,action,details_json,created_at FROM timesheet_audit WHERE timesheet_id=? ORDER BY created_at,id').bind(w.id).all<Row>()).results
  const financial=has(c,'timesheets.rates.view')
  return {id:w.id,userId:w.user_id,weekStart:w.week_start,status:w.status,revision:w.revision,canReview:await canReview(c,w.user_id),entries:entries.map(e=>({id:e.id,projectId:e.project_id,projectNumber:e.project_number,projectName:e.project_name,taskId:e.project_task_id,taskName:e.task_name,entryDate:e.entry_date,hours:e.hours,note:e.note,billingType:e.billing_type,...financial?{costRateCents:e.cost_rate_cents,chargeRateCents:e.charge_rate_cents,costCents:e.cost_cents,chargeCents:e.charge_cents}:{}})),history:financial?auditRows:auditRows.filter(r=>r.action!=='rates-snapshotted')}
}
export function createTimesheetsApi(){
  const api=new Hono<HonoEnv>()
  api.get('/configuration',async c=>{
    if(!has(c,'timesheets.rates.view')&&!has(c,'timesheets.rates.manage'))return c.json({error:'Forbidden'},403)
    const [positions,tables,rates,settings]=await Promise.all([
      c.env.DB.prepare('SELECT * FROM billing_positions ORDER BY local_id IS NULL, local_id COLLATE NOCASE, name COLLATE NOCASE').all(),
      c.env.DB.prepare('SELECT * FROM pay_tables ORDER BY name COLLATE NOCASE').all(),
      c.env.DB.prepare('SELECT * FROM pay_table_rates').all(),
      c.env.DB.prepare('SELECT revision FROM timesheet_settings WHERE id=1').first<{revision:number}>()
    ])
    return c.json({positions:positions.results,tables:tables.results,rates:rates.results,revision:settings?.revision||1})
  })
  api.put('/configuration',async c=>{
    if(!has(c,'timesheets.rates.manage'))return c.json({error:'Forbidden'},403)
    const body=await c.req.json<{revision:number;positions:Array<{id:string;localId:string|null;name:string;active:boolean}>;tables:Array<{id:string;name:string;active:boolean;expiresOn:string|null;isDefault:boolean;undefinedRateCents:number;rates:Array<{positionId:string;rateCents:number}>}>}>().catch(()=>null)
    if(!body||!Number.isInteger(body.revision)||!Array.isArray(body.positions)||!Array.isArray(body.tables)||body.positions.length>200||body.tables.length>100)return c.json({error:'Invalid rate table changes.'},400)
    const positions=new Set<string>(),localIds=new Set<string>(),tables=new Set<string>()
    for(const p of body.positions){
      const localId=p.localId?.trim()||null
      if(!p.id||!p.name?.trim()||p.name.length>200||typeof p.active!=='boolean'||positions.has(p.id)||p.localId!==null&&typeof p.localId!=='string'||localId&&localId.length>40||localId&&localIds.has(localId.toLowerCase()))return c.json({error:'Billing position names and local IDs must be valid and unique.'},400)
      positions.add(p.id)
      if(localId)localIds.add(localId.toLowerCase())
    }
    if(body.tables.filter(t=>t.isDefault).length!==(body.tables.some(t=>t.active)?1:0)||body.tables.some(t=>t.isDefault&&(!t.active||t.expiresOn&&t.expiresOn<todayEastern())))return c.json({error:'Choose one active, unexpired default table.'},400)
    for(const t of body.tables){if(!t.id||!t.name?.trim()||t.name.length>200||typeof t.active!=='boolean'||typeof t.isDefault!=='boolean'||t.expiresOn!==null&&(!date(t.expiresOn))||!Number.isInteger(t.undefinedRateCents)||t.undefinedRateCents<0||!Array.isArray(t.rates)||tables.has(t.id))return c.json({error:'Invalid pay tables.'},400);tables.add(t.id);if(t.rates.some(r=>!positions.has(r.positionId)||!Number.isInteger(r.rateCents)||r.rateCents<0)||new Set(t.rates.map(r=>r.positionId)).size!==t.rates.length)return c.json({error:'Invalid position rates.'},400)}
    const statements:D1PreparedStatement[]=[]
    const token=id()
    statements.push(c.env.DB.prepare('UPDATE timesheet_settings SET revision=revision+1 WHERE id=1 AND revision=?').bind(body.revision),guard(c.env.DB,token))
    // Clear the partial unique default index before assigning the new default.
    statements.push(c.env.DB.prepare('UPDATE pay_tables SET is_default=0 WHERE is_default=1'))
    for(const p of body.positions)statements.push(c.env.DB.prepare('INSERT INTO billing_positions(id,local_id,name,active) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET local_id=excluded.local_id,name=excluded.name,active=excluded.active').bind(p.id,p.localId?.trim()||null,p.name.trim(),Number(p.active)))
    for(const t of body.tables){
      statements.push(c.env.DB.prepare('INSERT INTO pay_tables(id,name,active,expires_on,is_default,undefined_rate_cents) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active,expires_on=excluded.expires_on,is_default=excluded.is_default,undefined_rate_cents=excluded.undefined_rate_cents,updated_at=CURRENT_TIMESTAMP').bind(t.id,t.name.trim(),Number(t.active),t.expiresOn,Number(t.isDefault),t.undefinedRateCents))
      statements.push(c.env.DB.prepare('DELETE FROM pay_table_rates WHERE pay_table_id=?').bind(t.id))
      for(const r of t.rates)statements.push(c.env.DB.prepare('INSERT INTO pay_table_rates(pay_table_id,position_id,rate_cents) VALUES(?,?,?)').bind(t.id,r.positionId,r.rateCents))
    }
    statements.push(clearGuard(c.env.DB,token))
    try{await c.env.DB.batch(statements)}catch{return c.json({error:'Billing rates changed or could not be saved. Refresh and retry.'},409)}
    return c.json({saved:true})
  })
  api.get('/lookups',async c=>{
    const projects=(await c.env.DB.prepare(`SELECT id,project_number,name FROM projects WHERE active=1 AND archived_at IS NULL ORDER BY project_number DESC`).all()).results
    const tasks=(await c.env.DB.prepare(`SELECT t.id,t.project_id,t.task_name,t.bill_type FROM project_tasks t JOIN projects p ON p.id=t.project_id WHERE t.status='active' AND t.archived_at IS NULL AND p.active=1 AND p.archived_at IS NULL ORDER BY t.sequence`).all()).results
    return c.json({projects,tasks})
  })
  api.get('/weeks',async c=>{
    const userId=c.req.query('userId')||actor(c)
    if(!await canRead(c,userId))return c.json({error:'Forbidden'},403)
    const rows=(await c.env.DB.prepare('SELECT w.id,w.user_id,w.week_start,w.status,w.revision,COUNT(e.id) AS entry_count,COALESCE(SUM(e.hours),0) AS total_hours FROM user_timesheets w LEFT JOIN user_timesheet_entries e ON e.timesheet_id=w.id WHERE w.user_id=? GROUP BY w.id ORDER BY w.week_start DESC LIMIT 52').bind(userId).all()).results
    return c.json({items:rows})
  })
  api.get('/weeks/:start',async c=>{
    const start=c.req.param('start'),userId=c.req.query('userId')||actor(c)
    if(!monday(start))return c.json({error:'Use a Monday week start.'},400)
    if(!await canRead(c,userId))return c.json({error:'Forbidden'},403)
    const w=await week(c.env.DB,userId,start)
    return c.json(w?await detail(c,w):{id:null,userId,weekStart:start,status:'draft',revision:1,canReview:await canReview(c,userId),entries:[],history:[]})
  })
  api.put('/weeks/:start/entries/:entryId',async c=>{
    const start=c.req.param('start'),entryId=c.req.param('entryId'),userId=actor(c)
    if(!monday(start))return c.json({error:'Use a Monday week start.'},400)
    const body=await c.req.json<{projectId:string;taskId?:string|null;entryDate:string;hours:number;note:string;revision:number}>().catch(()=>null)
    if(!body||!inWeek(body.entryDate,start)||typeof body.hours!=='number'||!Number.isFinite(body.hours)||body.hours<=0||body.hours>=24||Math.abs(body.hours*100-Math.round(body.hours*100))>1e-8||!String(body.note||'').trim()||String(body.note).length>4000)return c.json({error:'Enter a date in this week, decimal hours, and a work note.'},400)
    const project=await c.env.DB.prepare('SELECT id FROM projects WHERE id=? AND active=1 AND archived_at IS NULL').bind(body.projectId).first()
    if(!project)return c.json({error:'Select an active project.'},400)
    const tasks=(await c.env.DB.prepare("SELECT id FROM project_tasks WHERE project_id=? AND status='active' AND archived_at IS NULL").bind(body.projectId).all<{id:string}>()).results
    if(tasks.length&&!tasks.some(t=>t.id===body.taskId)||!tasks.length&&body.taskId)return c.json({error:'Select an active task for this project.'},400)
    const w=await week(c.env.DB,userId,start,true)
    if(!w||w.status!=='draft')return c.json({error:'This week is locked.'},409)
    // Older open pages received revision 0 for an empty week. A failed first
    // save may already have created its revision-1 row, so permit that state.
    const emptyInitialWeek=Number(body.revision)===0&&w.revision===1&&!await c.env.DB.prepare('SELECT id FROM user_timesheet_entries WHERE timesheet_id=? LIMIT 1').bind(w.id).first()
    if(Number(body.revision)!==w.revision&&!emptyInitialWeek)return c.json({error:'Timesheet changed. Refresh before saving.'},409)
    const existing=await c.env.DB.prepare('SELECT id FROM user_timesheet_entries WHERE id=? AND timesheet_id=?').bind(entryId,w.id).first()
    const foreign=await c.env.DB.prepare('SELECT id FROM user_timesheet_entries WHERE id=?').bind(entryId).first()
    if(foreign&&!existing)return c.json({error:'Entry does not belong to this week.'},404)
    const token=id()
    try{await c.env.DB.batch([
      c.env.DB.prepare("UPDATE user_timesheets SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND status='draft'").bind(w.id,w.revision),guard(c.env.DB,token),
      existing?c.env.DB.prepare('UPDATE user_timesheet_entries SET project_id=?,project_task_id=?,entry_date=?,hours=?,note=?,cost_rate_cents=NULL,charge_rate_cents=NULL,cost_cents=NULL,charge_cents=NULL,billing_type=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND timesheet_id=?').bind(body.projectId,body.taskId||null,body.entryDate,body.hours,body.note.trim(),entryId,w.id):c.env.DB.prepare('INSERT INTO user_timesheet_entries(id,timesheet_id,project_id,project_task_id,entry_date,hours,note) VALUES(?,?,?,?,?,?,?)').bind(entryId,w.id,body.projectId,body.taskId||null,body.entryDate,body.hours,body.note.trim()),
      audit(c.env.DB,w.id,entryId,userId,existing?'entry-updated':'entry-added',{projectId:body.projectId,entryDate:body.entryDate,hours:body.hours}),clearGuard(c.env.DB,token)
    ])}catch{return c.json({error:'Could not save entry. Refresh and retry.'},409)}
    return c.json(await detail(c,(await week(c.env.DB,userId,start))!))
  })
  api.delete('/weeks/:start/entries/:entryId',async c=>{
    const start=c.req.param('start'),w=await week(c.env.DB,actor(c),start)
    if(!w||w.status!=='draft')return c.json({error:'Draft week not found.'},404)
    const e=await c.env.DB.prepare('SELECT * FROM user_timesheet_entries WHERE id=? AND timesheet_id=?').bind(c.req.param('entryId'),w.id).first()
    if(!e)return c.json({error:'Entry not found.'},404)
    const token=id()
    try{await c.env.DB.batch([c.env.DB.prepare("UPDATE user_timesheets SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND status='draft'").bind(w.id,w.revision),guard(c.env.DB,token),c.env.DB.prepare('DELETE FROM user_timesheet_entries WHERE id=? AND timesheet_id=?').bind(c.req.param('entryId'),w.id),audit(c.env.DB,w.id,c.req.param('entryId'),actor(c),'entry-deleted',{projectId:e.project_id,entryDate:e.entry_date,hours:e.hours,note:e.note}),clearGuard(c.env.DB,token)])}catch{return c.json({error:'Timesheet changed. Refresh before deleting.'},409)}
    return c.json(await detail(c,(await week(c.env.DB,actor(c),start))!))
  })
  api.post('/weeks/:start/submit',async c=>{
    const start=c.req.param('start');if(!monday(start))return c.json({error:'Use a Monday week start.'},400)
    const w=await week(c.env.DB,actor(c),start,true)
    if(!w||w.status!=='draft')return c.json({error:'This week is locked.'},409)
    const user=await c.env.DB.prepare('SELECT u.pay_basis,u.pay_amount_cents,u.billing_position_id,bp.active AS position_active FROM users u LEFT JOIN billing_positions bp ON bp.id=u.billing_position_id WHERE u.id=?').bind(actor(c)).first<Row>()
    const entries=(await c.env.DB.prepare('SELECT * FROM user_timesheet_entries WHERE timesheet_id=?').bind(w.id).all<Row>()).results
    const statements:D1PreparedStatement[]=[]
    if(entries.length&&(!user?.pay_basis||user.pay_amount_cents===null||!user.billing_position_id||Number(user.position_active)!==1))return c.json({error:'Your pay rate and active billing position need setup before submission.'},409)
    const costRate=user?.pay_basis==='salary'?Number(user.pay_amount_cents)/2080:Number(user?.pay_amount_cents)
    for(const e of entries){
      const project=await c.env.DB.prepare('SELECT pay_table_id,active,archived_at FROM projects WHERE id=?').bind(e.project_id).first<Row>()
      if(!project?.pay_table_id||Number(project.active)!==1||project.archived_at)return c.json({error:'A project needs an active record and pay table before submission.'},409)
      const table=await c.env.DB.prepare('SELECT active,expires_on,undefined_rate_cents FROM pay_tables WHERE id=?').bind(project.pay_table_id).first<Row>()
      if(!table||Number(table.active)!==1||table.expires_on&&String(table.expires_on)<todayEastern())return c.json({error:'A project pay table is inactive or expired.'},409)
      const activeTasks=(await c.env.DB.prepare("SELECT id FROM project_tasks WHERE project_id=? AND status='active' AND archived_at IS NULL").bind(e.project_id).all<{id:string}>()).results
      if(activeTasks.length&&!activeTasks.some(t=>t.id===e.project_task_id)||!activeTasks.length&&e.project_task_id)return c.json({error:'An entry needs a current active task.'},409)
      const task=e.project_task_id?await c.env.DB.prepare('SELECT bill_type FROM project_tasks WHERE id=?').bind(e.project_task_id).first<Row>():null
      const rate=await c.env.DB.prepare('SELECT rate_cents FROM pay_table_rates WHERE pay_table_id=? AND position_id=?').bind(project.pay_table_id,user?.billing_position_id).first<{rate_cents:number}>()
      const chargeRate=rate?.rate_cents??Number(table.undefined_rate_cents),hours=Number(e.hours),roundedCostRate=Math.round(costRate)
      statements.push(c.env.DB.prepare('UPDATE user_timesheet_entries SET cost_rate_cents=?,charge_rate_cents=?,cost_cents=?,charge_cents=?,billing_type=?,pay_table_id=?,billing_position_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(roundedCostRate,chargeRate,Math.round(hours*roundedCostRate),Math.round(hours*chargeRate),task?.bill_type||'project',project.pay_table_id,user?.billing_position_id,e.id))
      statements.push(audit(c.env.DB,w.id,String(e.id),actor(c),'rates-snapshotted',{costRateCents:roundedCostRate,chargeRateCents:chargeRate}))
    }
    const token=id()
    statements.unshift(c.env.DB.prepare("UPDATE user_timesheets SET status='submitted',submitted_at=CURRENT_TIMESTAMP,approved_at=NULL,approved_by=NULL,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='draft' AND revision=?").bind(w.id,w.revision),guard(c.env.DB,token))
    statements.push(audit(c.env.DB,w.id,null,actor(c),'submitted',{entries:entries.length}),clearGuard(c.env.DB,token))
    try{await c.env.DB.batch(statements)}catch{return c.json({error:'Timesheet changed. Refresh before submitting.'},409)}
    return c.json(await detail(c,(await week(c.env.DB,actor(c),start))!))
  })
  api.get('/review',async c=>{
    if(!has(c,'timesheets.approve')&&!has(c,'timesheets.view'))return c.json({error:'Forbidden'},403)
    const rows=(await c.env.DB.prepare("SELECT w.id,w.user_id,w.week_start,w.status,u.display_name,u.manager_user_id FROM user_timesheets w JOIN users u ON u.id=w.user_id WHERE w.status='submitted' OR ?=1 ORDER BY u.manager_user_id,u.display_name,w.week_start DESC LIMIT 500").bind(Number(has(c,'timesheets.view'))).all<Row>()).results
    const items=[];for(const row of rows)if(has(c,'timesheets.view')||await canReview(c,String(row.user_id)))items.push(row)
    return c.json({items})
  })
  api.post('/weeks/:start/:action',async c=>{
    const action=c.req.param('action');if(!['approve','reject','reopen'].includes(action))return c.json({error:'Not found'},404)
    const userId=c.req.query('userId')||actor(c),start=c.req.param('start'),w=await week(c.env.DB,userId,start)
    if(!w)return c.json({error:'Week not found.'},404)
    if(!await canReview(c,userId))return c.json({error:'Forbidden'},403)
    const body=await c.req.json<{reason?:string}>().catch(()=>({reason:''})),reason=String(body.reason||'').trim().slice(0,2000)
    if(action==='reject'&&!reason)return c.json({error:'A rejection reason is required.'},400)
    if(action==='reopen'&&w.status!=='approved'||action!=='reopen'&&w.status!=='submitted')return c.json({error:'Week is not in the required state.'},409)
    if(action==='reopen'&&(await c.env.DB.prepare('SELECT e.id FROM user_timesheet_entries e JOIN invoice_entry_allocations a ON a.entry_id=e.id JOIN invoices i ON i.id=a.invoice_id WHERE e.timesheet_id=? AND i.status<>\'void\' LIMIT 1').bind(w.id).first()))return c.json({error:'Invoiced time cannot be reopened.'},409)
    const status=action==='approve'?'approved':'draft'
    const token=id()
    try{await c.env.DB.batch([c.env.DB.prepare('UPDATE user_timesheets SET status=?,approved_at=CASE WHEN ?=\'approved\' THEN CURRENT_TIMESTAMP ELSE NULL END,approved_by=CASE WHEN ?=\'approved\' THEN ? ELSE NULL END,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND status=?').bind(status,status,status,actor(c),w.id,w.revision,w.status),guard(c.env.DB,token),audit(c.env.DB,w.id,null,actor(c),action,{reason}),clearGuard(c.env.DB,token)])}catch{return c.json({error:'Timesheet changed. Refresh before deciding.'},409)}
    if(action==='reject'){
      const user=await c.env.DB.prepare('SELECT email,display_name FROM users WHERE id=?').bind(userId).first<{email:string;display_name:string}>()
      if(user)try{await sendTimesheetEmail(c.env,user.email,user.display_name,'Timesheet rejected',`Your timesheet for ${start} was rejected. Reason: ${reason}`)}catch(error){console.error('Timesheet rejection email failed',error)}
    }
    return c.json(await detail(c,(await week(c.env.DB,userId,start))!))
  })
  api.get('/invoice-pool',async c=>{
    if(!has(c,'timesheets.rates.view'))return c.json({error:'Forbidden'},403)
    const rows=(await c.env.DB.prepare(`SELECT e.id AS entry_id,w.user_id,w.week_start,e.project_id,e.project_task_id,e.entry_date,e.hours,e.note,e.cost_cents,e.charge_cents,e.billing_type FROM user_timesheet_entries e JOIN user_timesheets w ON w.id=e.timesheet_id LEFT JOIN invoice_entry_allocations a ON a.entry_id=e.id WHERE w.status='approved' AND a.entry_id IS NULL AND e.billing_type IN ('fixed-fee','time-and-materials','time-and-materials-nte') ORDER BY e.entry_date,e.id`).all()).results
    return c.json({items:rows})
  })
  return api
}
