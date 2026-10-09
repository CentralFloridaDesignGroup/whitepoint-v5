import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { createHmac } from 'node:crypto'
import { Hono } from 'hono'
import { createTimesheetsApi } from '../src/routes/timesheetsApi.ts'
import { projectTimeEntries } from '../src/routes/projectTimeEntries.ts'
import { createInvoicesApi } from '../src/routes/invoicesApi.ts'
import { generateMonthlyInvoices } from '../src/services/monthlyInvoices.ts'
import { createStripeInvoiceWebhook } from '../src/webhooks/stripeInvoiceWebhook.ts'
import { syncInvoiceQbo, syncPaymentQbo } from '../src/services/invoiceQbo.ts'

function fixture(){
  const sqlite=new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys=ON')
  for(const name of ['0001_baseline.sql','0002_webauthn_challenges.sql','0003_manage_settings.sql','0004_record_views.sql','0005_timesheets.sql','0006_billing_position_local_id.sql','0007_invoices.sql'])sqlite.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'))
  const db={
    prepare(sql){const execute=(values)=>({first:async()=>sqlite.prepare(sql).get(...values)||null,all:async()=>({results:sqlite.prepare(sql).all(...values)}),run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}})});return {...execute([]),bind(...values){return execute(values)}}},
    async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}
  }
  sqlite.exec("INSERT INTO users(id,email,display_name) VALUES('2','manager@example.com','Manager'),('3','staff@example.com','Staff'),('4','leader@example.com','Leader'); UPDATE users SET manager_user_id='1' WHERE id='2'; UPDATE users SET manager_user_id='2' WHERE id='3';")
  sqlite.exec("INSERT INTO billing_positions(id,name) VALUES('surveyor','Surveyor'); INSERT INTO pay_tables(id,name,is_default,undefined_rate_cents) VALUES('standard','Standard',1,10000); INSERT INTO pay_table_rates(pay_table_id,position_id,rate_cents) VALUES('standard','surveyor',15000); UPDATE users SET billing_position_id='surveyor',pay_basis='hourly',pay_amount_cents=4000 WHERE id='3';")
  sqlite.exec("INSERT INTO clients(id,name) VALUES('c','Client'); INSERT INTO projects(id,project_number,client_id,name,pay_table_id,active) VALUES('p','P-1','c','Project','standard',1),('p2','P-2','c','Inactive project','standard',0); INSERT INTO project_tasks(id,project_id,task_id,sequence,task_name,bill_type) VALUES('t','p','A',1,'Field work','time-and-materials'),('t2','p','B',2,'Fixed work','fixed-fee'),('ti','p','C',3,'Inactive work','time-and-materials'); UPDATE project_tasks SET status='inactive' WHERE id='ti';")
  const app=new Hono()
  app.use('*',async(c,next)=>{const user=c.req.header('X-Test-User')||'3';c.set('auth',{internalUserId:user});c.set('permissions',{hasPermission:(key)=>user==='1'||user==='2'&&key==='timesheets.approve'||user==='4'&&key==='timesheets.approve'||user==='3'&&key==='projects.view'});await next()})
  app.route('/timesheets',createTimesheetsApi())
  app.route('/invoices',createInvoicesApi())
  app.route('/webhooks',createStripeInvoiceWebhook())
  app.get('/records/projects/:id/time-entries',projectTimeEntries)
  async function requestAt(user,path,method='GET',body,envOverride={},headers={}){const response=await app.request(path,{method,headers:{'X-Test-User':user,...body===undefined?{}:{'Content-Type':'application/json'},...headers},body:body===undefined?undefined:JSON.stringify(body)},{DB:db,BREVO_API_KEY:'test',BREVO_SENDER_EMAIL:'sender@example.com',...envOverride});return {status:response.status,body:await response.json()}}
  const request=(user,path,method='GET',body)=>requestAt(user,`/timesheets${path}`,method,body)
  return {sqlite,db,app,request,requestAt}
}

test('manual invoice reservations and monthly fixed fee drafts remain separate',async()=>{
  const {sqlite,db,requestAt}=fixture()
  sqlite.exec("UPDATE projects SET manager_user_id='2' WHERE id='p'; UPDATE clients SET email='billing@example.com' WHERE id='c'; UPDATE project_tasks SET contract_amount_cents=100000 WHERE id='t2'; INSERT INTO project_tasks(id,project_id,task_id,sequence,task_name,bill_type,contract_amount_cents) VALUES('tn','p','N',4,'Capped work','time-and-materials-nte',5000);")
  sqlite.exec("INSERT INTO user_timesheets(id,user_id,week_start,status) VALUES('invoice-week','3','2026-10-19','approved'); INSERT INTO user_timesheet_entries(id,timesheet_id,project_id,project_task_id,entry_date,hours,note,charge_cents,billing_type) VALUES('manual-entry','invoice-week','p','t','2026-10-20',2,'T&M work',30000,'time-and-materials'),('fixed-entry','invoice-week','p','t2','2026-10-21',3,'Fixed work',45000,'fixed-fee'),('cap-entry','invoice-week','p','tn','2026-10-22',2,'NTE work',10000,'time-and-materials-nte');")
  assert.equal((await requestAt('3','/invoices','POST',{projectId:'p',entryIds:[]})).status,403)
  assert.equal((await requestAt('2','/invoices','POST',{projectId:'p2',entryIds:[]})).status,403)
  const manual=await requestAt('2','/invoices','POST',{projectId:'p',entryIds:['manual-entry']})
  assert.equal(manual.status,201)
  assert.deepEqual(manual.body.invoice.allocations.map(a=>a.entryId),['manual-entry'])
  assert.equal((await requestAt('2','/invoices','POST',{projectId:'p',entryIds:['manual-entry']})).status,409)
  await generateMonthlyInvoices({DB:db},Date.parse('2026-11-10T14:00:00Z'))
  await generateMonthlyInvoices({DB:db},Date.parse('2026-11-10T14:00:00Z'))
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM invoices').get().n,2)
  const monthly=sqlite.prepare("SELECT id FROM invoices WHERE source='monthly'").get()
  const detail=await requestAt('2',`/invoices/${monthly.id}`)
  assert.equal(detail.status,200)
  assert.deepEqual(detail.body.invoice.allocations.map(a=>a.entryId),['fixed-entry','cap-entry'])
  assert.equal(detail.body.invoice.allocations.find(a=>a.entryId==='cap-entry').billedChargeCents,5000)
  assert.equal(detail.body.invoice.allocations.find(a=>a.entryId==='cap-entry').writeoffHours,1)
  assert.equal(detail.body.invoice.totalCents,50000)
  assert.equal((await requestAt('3',`/invoices/${monthly.id}`)).status,404)
  assert.equal(detail.body.invoice.lines.find(line=>line.kind==='fixed-fee').amountCents,45000)
  const invoice=detail.body.invoice
  const saved=await requestAt('2',`/invoices/${monthly.id}`,'PUT',{revision:invoice.revision,issueDate:invoice.issueDate,dueDate:invoice.dueDate,notes:'',internalNote:'',billingEmail:'billing@example.com',allocations:invoice.allocations.map(a=>({entryId:a.entryId,disposition:a.disposition,splitBasis:a.splitBasis,splitValue:a.splitBasis==='charge'?a.billedChargeCents:undefined})),lines:invoice.lines.map(line=>({...line,amountCents:line.kind==='fixed-fee'?20000:line.amountCents}))})
  assert.equal(saved.status,200)
  assert.equal(saved.body.invoice.totalCents,25000)
  assert.equal(saved.body.invoice.reviewTasks.find(t=>t.billingType==='fixed-fee').currentBilledHours,3)
  const sent=await requestAt('2',`/invoices/${monthly.id}/send`,'POST',{}, {BREVO_API_KEY:undefined})
  assert.equal(sent.status,200)
  assert.equal(sent.body.invoice.status,'sent')
  assert.equal(sent.body.invoice.emailStatus,'failed')
  const token=sent.body.invoice.publicToken
  const publicView=await requestAt('3',`/invoices/public/${token}`)
  assert.equal(publicView.status,200)
  assert.equal(publicView.body.invoice.totalCents,25000)
  assert.equal(publicView.body.invoice.branding.logoUrl,null)
  assert.equal(publicView.body.invoice.allocations,undefined)
  assert.equal((await requestAt('2',`/invoices/${monthly.id}/payments`,'POST',{amountCents:10000,method:'Cash'})).status,403)
  const partial=await requestAt('1',`/invoices/${monthly.id}/payments`,'POST',{amountCents:10000,method:'Cash'})
  assert.equal(partial.body.invoice.status,'sent')
  assert.equal(partial.body.invoice.balanceCents,15000)
  const paid=await requestAt('1',`/invoices/${monthly.id}/payments`,'POST',{amountCents:15000,method:'Check',referenceNumber:'1001'})
  assert.equal(paid.body.invoice.status,'paid')
  assert.equal(paid.body.invoice.balanceCents,0)
})

test('draft time totals follow billed, write-off, and split decisions',async()=>{
  const {sqlite,requestAt}=fixture()
  sqlite.exec("UPDATE projects SET manager_user_id='2' WHERE id='p'; INSERT INTO user_timesheets(id,user_id,week_start,status) VALUES('decision-week','3','2026-10-19','approved'); INSERT INTO user_timesheet_entries(id,timesheet_id,project_id,project_task_id,entry_date,hours,note,charge_cents,billing_type) VALUES('decision-entry','decision-week','p','t','2026-10-20',2,'Field work',30000,'time-and-materials');")
  const created=await requestAt('2','/invoices','POST',{projectId:'p',entryIds:['decision-entry']})
  assert.equal(created.status,201)
  let invoice=created.body.invoice
  assert.equal(invoice.totalCents,30000)
  async function decide(disposition,splitValue){
    const result=await requestAt('2',`/invoices/${invoice.id}`,'PUT',{revision:invoice.revision,issueDate:invoice.issueDate,dueDate:invoice.dueDate,notes:invoice.notes,internalNote:invoice.internalNote,billingEmail:invoice.billingEmail,lines:invoice.lines,allocations:[{entryId:'decision-entry',disposition,...disposition==='split'?{splitBasis:'hours',splitValue}:{}}]})
    assert.equal(result.status,200)
    invoice=result.body.invoice
  }
  await decide('write-off')
  assert.equal(invoice.totalCents,0)
  assert.equal(invoice.reviewTasks[0].currentBilledHours,0)
  assert.equal(invoice.reviewTasks[0].writeoffHours,2)
  await decide('split',1)
  assert.equal(invoice.totalCents,15000)
  assert.equal(invoice.reviewTasks[0].currentBilledHours,1)
  await decide('billed')
  assert.equal(invoice.totalCents,30000)
  assert.equal(invoice.reviewTasks[0].currentBilledHours,2)
})

test('a blank draft can add approved time without changing its invoice number',async()=>{
  const {sqlite,requestAt}=fixture()
  sqlite.exec("UPDATE projects SET manager_user_id='2' WHERE id='p'; UPDATE project_tasks SET contract_amount_cents=100000 WHERE id='t2'; INSERT INTO user_timesheets(id,user_id,week_start,status) VALUES('add-week','3','2026-10-19','approved'); INSERT INTO user_timesheet_entries(id,timesheet_id,project_id,project_task_id,entry_date,hours,note,charge_cents,billing_type) VALUES('add-entry','add-week','p','t','2026-10-20',2,'Additional field work',30000,'time-and-materials'),('add-fixed','add-week','p','t2','2026-10-20',3,'Fixed fee field work',45000,'fixed-fee');")
  const created=await requestAt('2','/invoices','POST',{projectId:'p',entryIds:[]})
  assert.equal(created.status,201)
  const initial=created.body.invoice
  assert.equal(initial.totalCents,0)
  assert.equal((await requestAt('3',`/invoices/${initial.id}/entries`,'POST',{revision:initial.revision,entryIds:['add-entry']})).status,403)
  const added=await requestAt('2',`/invoices/${initial.id}/entries`,'POST',{revision:initial.revision,entryIds:['add-entry','add-fixed']})
  assert.equal(added.status,200)
  assert.equal(added.body.invoice.invoiceNumber,initial.invoiceNumber)
  assert.equal(added.body.invoice.totalCents,75000)
  assert.equal(added.body.invoice.allocations[0].entryId,'add-entry')
  assert.equal(added.body.invoice.lines.find(line=>line.kind==='fixed-fee').amountCents,45000)
  assert.equal(added.body.invoice.reviewTasks.find(task=>task.billingType==='fixed-fee').currentBilledHours,3)
  const update=(invoice,disposition,amountCents)=>({revision:invoice.revision,issueDate:invoice.issueDate,dueDate:invoice.dueDate,notes:invoice.notes,internalNote:invoice.internalNote,billingEmail:invoice.billingEmail,allocations:invoice.allocations.map(a=>({entryId:a.entryId,disposition:a.entryId==='add-fixed'?disposition:a.disposition})),lines:invoice.lines.map(line=>({...line,amountCents:line.kind==='fixed-fee'?amountCents:line.amountCents}))})
  const writtenOff=await requestAt('2',`/invoices/${initial.id}`,'PUT',update(added.body.invoice,'write-off',45000))
  assert.equal(writtenOff.status,200)
  assert.equal(writtenOff.body.invoice.lines.find(line=>line.kind==='fixed-fee').amountCents,0)
  const rebilled=await requestAt('2',`/invoices/${initial.id}`,'PUT',update(writtenOff.body.invoice,'billed',0))
  assert.equal(rebilled.status,200)
  assert.equal(rebilled.body.invoice.lines.find(line=>line.kind==='fixed-fee').amountCents,45000)
  assert.equal((await requestAt('2',`/invoices/${initial.id}`,'PUT',update(rebilled.body.invoice,'billed',100001))).status,400)
  const ahead=await requestAt('2',`/invoices/${initial.id}`,'PUT',update(rebilled.body.invoice,'billed',80000))
  assert.equal(ahead.status,200)
  assert.equal(ahead.body.invoice.lines.find(line=>line.kind==='fixed-fee').amountCents,80000)
  assert.equal((await requestAt('2',`/invoices/${initial.id}/entries`,'POST',{revision:ahead.body.invoice.revision,entryIds:['add-entry']})).status,409)
})

test('fixed fee draft creation caps saved time charges at the task contract',async()=>{
  const {sqlite,requestAt}=fixture()
  sqlite.exec("UPDATE projects SET manager_user_id='2' WHERE id='p'; UPDATE project_tasks SET contract_amount_cents=30000 WHERE id='t2'; INSERT INTO user_timesheets(id,user_id,week_start,status) VALUES('fee-week','3','2026-10-19','approved'); INSERT INTO user_timesheet_entries(id,timesheet_id,project_id,project_task_id,entry_date,hours,note,charge_cents,billing_type) VALUES('fee-entry','fee-week','p','t2','2026-10-20',3,'Fixed work',45000,'fixed-fee');")
  const created=await requestAt('2','/invoices','POST',{projectId:'p',entryIds:['fee-entry']})
  assert.equal(created.status,201)
  assert.equal(created.body.invoice.totalCents,30000)
  assert.equal(created.body.invoice.reviewTasks[0].currentBilledHours,3)
})

test('public logo requires a sent invoice token and uses the current company upload',async()=>{
  const {sqlite,db,app}=fixture()
  sqlite.exec("UPDATE app_settings SET company_name='Custom Survey',rectangular_logo_key='logo-wide' WHERE id=1; UPDATE projects SET manager_user_id='2' WHERE id='p'; INSERT INTO invoices(id,project_id,client_id,invoice_number,source,status,issue_date,due_date,billing_name,project_reference,public_token) VALUES('logo-invoice','p','c','INV-LOGO','manual','draft','2026-10-10','2026-11-09','Client','P-1','logo-token');")
  const keys=[]
  const env={DB:db,BRAND_ASSETS:{get:async key=>{keys.push(key);return {body:new Response('logo image').body,httpMetadata:{contentType:'image/png'}}}}}
  const path='/invoices/public/logo-token/logo'
  assert.equal((await app.request('/invoices/logo-invoice/logo',{headers:{'X-Test-User':'3'}},env)).status,404)
  const managerLogo=await app.request('/invoices/logo-invoice/logo',{headers:{'X-Test-User':'2'}},env)
  assert.equal(managerLogo.status,200)
  const managerInvoice=await app.request('/invoices/logo-invoice',{headers:{'X-Test-User':'2'}},env)
  assert.equal((await managerInvoice.json()).invoice.branding.logoUrl,'/invoices/logo-invoice/logo?v=1')
  assert.equal((await app.request(path,{},env)).status,404)
  sqlite.exec("UPDATE invoices SET status='sent' WHERE id='logo-invoice'")
  assert.equal((await app.request('/invoices/public/invalid/logo',{},env)).status,404)
  const response=await app.request(path,{},env)
  assert.equal(response.status,200)
  assert.equal(response.headers.get('Content-Type'),'image/png')
  assert.deepEqual(keys,['logo-wide','logo-wide'])
  const invoice=await app.request('/invoices/public/logo-token',{},env)
  const data=await invoice.json()
  assert.equal(data.invoice.branding.companyName,'Custom Survey')
  assert.equal(data.invoice.branding.logoUrl,path)
})

test('a later monthly run captures late approved work from an older month',async()=>{
  const {sqlite,db}=fixture()
  sqlite.exec("INSERT INTO user_timesheets(id,user_id,week_start,status) VALUES('late-week','3','2026-09-28','approved'); INSERT INTO user_timesheet_entries(id,timesheet_id,project_id,project_task_id,entry_date,hours,note,charge_cents,billing_type) VALUES('first-work','late-week','p','t','2026-09-29',1,'First work',15000,'time-and-materials');")
  await generateMonthlyInvoices({DB:db},Date.parse('2026-10-10T13:00:00Z'))
  sqlite.exec("INSERT INTO user_timesheet_entries(id,timesheet_id,project_id,project_task_id,entry_date,hours,note,charge_cents,billing_type) VALUES('late-work','late-week','p','t','2026-09-30',1,'Late approval',15000,'time-and-materials');")
  await generateMonthlyInvoices({DB:db},Date.parse('2026-11-10T14:00:00Z'))
  const rows=sqlite.prepare("SELECT i.billing_month,a.entry_id FROM invoices i JOIN invoice_entry_allocations a ON a.invoice_id=i.id ORDER BY i.billing_month").all().map(row=>({billing_month:row.billing_month,entry_id:row.entry_id}))
  assert.deepEqual(rows,[{billing_month:'2026-10',entry_id:'first-work'},{billing_month:'2026-11',entry_id:'late-work'}])
})

test('assigned managers delete drafts and release reserved work without reusing invoice numbers',async()=>{
  const {sqlite,requestAt}=fixture()
  sqlite.exec("UPDATE projects SET manager_user_id='2' WHERE id='p'; UPDATE clients SET email='billing@example.com' WHERE id='c'; INSERT INTO user_timesheets(id,user_id,week_start,status) VALUES('delete-week','3','2026-10-19','approved'); INSERT INTO user_timesheet_entries(id,timesheet_id,project_id,project_task_id,entry_date,hours,note,charge_cents,billing_type) VALUES('delete-entry','delete-week','p','t','2026-10-20',2,'Delete test',30000,'time-and-materials');")
  const created=await requestAt('2','/invoices','POST',{projectId:'p',entryIds:['delete-entry']})
  assert.equal(created.status,201)
  const {id,invoiceNumber,revision}=created.body.invoice
  sqlite.prepare("INSERT INTO invoice_notifications(id,invoice_id,kind,status,recipient_email) VALUES('delete-notice',?,'manager','accepted','manager@example.com')").run(id)
  assert.equal((await requestAt('3',`/invoices/${id}`,'DELETE',{revision})).status,403)
  assert.equal((await requestAt('2',`/invoices/${id}`,'DELETE',{revision:revision+1})).status,409)
  assert.equal((await requestAt('2',`/invoices/${id}`,'DELETE',{revision})).status,200)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM invoices WHERE id=?').get(id).count,0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM invoice_entry_allocations WHERE invoice_id=?').get(id).count,0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM invoice_lines WHERE invoice_id=?').get(id).count,0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM invoice_notifications WHERE invoice_id=?').get(id).count,0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM invoice_events WHERE invoice_id=?').get(id).count,0)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE record_type='invoice' AND record_id=? AND action='deleted'").get(id).count,1)
  const next=await requestAt('2','/invoices','POST',{projectId:'p',entryIds:['delete-entry']})
  assert.equal(next.status,201)
  assert.notEqual(next.body.invoice.invoiceNumber,invoiceNumber)
  const sent=await requestAt('2',`/invoices/${next.body.invoice.id}/send`,'POST',{}, {BREVO_API_KEY:undefined})
  assert.equal(sent.body.invoice.status,'sent')
  assert.equal((await requestAt('2',`/invoices/${next.body.invoice.id}`,'DELETE',{revision:sent.body.invoice.revision})).status,409)
})

test('signed Stripe events confirm delayed payment once, independent of return URLs',async()=>{
  const {sqlite,requestAt}=fixture()
  sqlite.exec("INSERT INTO invoices(id,project_id,client_id,invoice_number,source,status,issue_date,due_date,billing_name,project_reference,public_token) VALUES('stripe-invoice','p','c','INV-STRIPE','manual','sent','2026-10-10','2026-11-09','Client','P-1','stripe-token'); INSERT INTO invoice_lines(id,invoice_id,kind,description,amount_cents) VALUES('stripe-line','stripe-invoice','manual','Work',5000);")
  const secret='whsec_test',timestamp=Math.floor(Date.now()/1000)
  async function deliver(id,type){const payload={id,type,created:timestamp,data:{object:{id:'pi_test',amount:5000,metadata:{invoice_id:'stripe-invoice'}}}},raw=JSON.stringify(payload),signature=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex');return requestAt('3','/webhooks/stripe','POST',payload,{STRIPE_WEBHOOK_SECRET:secret},{'Stripe-Signature':`t=${timestamp},v1=${signature}`})}
  assert.equal((await deliver('evt_processing','payment_intent.processing')).status,200)
  assert.equal(sqlite.prepare("SELECT status FROM invoices WHERE id='stripe-invoice'").get().status,'sent')
  assert.equal((await deliver('evt_success','payment_intent.succeeded')).status,200)
  assert.equal(sqlite.prepare("SELECT status FROM invoices WHERE id='stripe-invoice'").get().status,'paid')
  assert.equal(sqlite.prepare("SELECT paid_at FROM invoice_payments WHERE invoice_id='stripe-invoice'").get().paid_at,new Date(timestamp*1000).toISOString())
  assert.equal((await deliver('evt_success','payment_intent.succeeded')).body.duplicate,true)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM invoice_payments WHERE invoice_id='stripe-invoice'").get().n,1)
})

test('draft validation, chain approval, snapshots, and invoice eligibility',async()=>{
  const {sqlite,request}=fixture(),start='2026-10-19',path=`/weeks/${start}`
  assert.equal((await request('3',`${path}?userId=2`)).status,403)
  const entry={projectId:'p',taskId:'t',entryDate:'2026-10-20',hours:2.25,note:'Field measurements',revision:1}
  assert.equal((await request('3',`${path}/entries/e1`,'PUT',{...entry,taskId:null})).status,400)
  assert.equal((await request('3',`${path}/entries/e1`,'PUT',{...entry,projectId:'p2'})).status,400)
  assert.equal((await request('3',`${path}/entries/e1`,'PUT',{...entry,taskId:'ti'})).status,400)
  assert.equal((await request('3',`${path}/entries/e1`,'PUT',entry)).status,200)
  assert.equal((await request('3',`${path}/entries/e2`,'PUT',{...entry,taskId:'t2',revision:2})).status,200)
  const weeks=await request('3','/weeks')
  assert.equal(weeks.body.items[0].entry_count,2)
  assert.equal(weeks.body.items[0].total_hours,4.5)
  assert.equal((await request('3',`${path}/submit`,'POST')).status,200)
  assert.equal((await request('3',`${path}/entries/e3`,'PUT',{...entry,revision:3})).status,409)
  assert.equal((await request('3',`${path}/approve`,'POST')).status,403)
  assert.equal((await request('1',`${path}/approve?userId=3`,'POST')).status,200)
  const snapshot=sqlite.prepare('SELECT cost_rate_cents,charge_rate_cents,cost_cents,charge_cents FROM user_timesheet_entries WHERE id=?').get('e1')
  assert.deepEqual({...snapshot},{cost_rate_cents:4000,charge_rate_cents:15000,cost_cents:9000,charge_cents:33750})
  sqlite.exec("UPDATE pay_table_rates SET rate_cents=25000 WHERE pay_table_id='standard'")
  assert.equal(sqlite.prepare('SELECT charge_cents FROM user_timesheet_entries WHERE id=?').get('e1').charge_cents,33750)
  const pool=await request('1','/invoice-pool')
  assert.equal(pool.status,200);assert.deepEqual(pool.body.items.map(item=>item.entry_id),['e1','e2'])
  assert.equal((await request('1',`${path}/reopen?userId=3`,'POST')).status,200)
  assert.equal((await request('1','/invoice-pool')).body.items.length,0)
})

test('the first entry saves against a previously empty week',async()=>{
  const {request}=fixture(),start='2026-10-19'
  const empty=await request('3',`/weeks/${start}`)
  assert.equal(empty.body.revision,1)
  assert.equal(empty.body.id,null)
  const saved=await request('3',`/weeks/${start}/entries/first`,'PUT',{projectId:'p',taskId:'t',entryDate:'2026-10-20',hours:1.5,note:'Initial work',revision:empty.body.revision})
  assert.equal(saved.status,200)
  assert.equal(saved.body.revision,2)
  assert.equal(saved.body.entries[0].id,'first')
  const legacy=await request('3','/weeks/2026-10-26/entries/legacy','PUT',{projectId:'p',taskId:'t',entryDate:'2026-10-26',hours:1,note:'Older open page',revision:0})
  assert.equal(legacy.status,200)
  const {sqlite,request:retry}=fixture()
  sqlite.exec("INSERT INTO user_timesheets(id,user_id,week_start) VALUES('empty','3','2026-10-26')")
  const recovered=await retry('3','/weeks/2026-10-26/entries/retry','PUT',{projectId:'p',taskId:'t',entryDate:'2026-10-26',hours:1,note:'Retry after failed first save',revision:0})
  assert.equal(recovered.status,200)
})

test('project time entries include all statuses and redact costs without rate access',async()=>{
  const {request,requestAt}=fixture(),start='2026-10-19'
  const entry={projectId:'p',taskId:'t',entryDate:'2026-10-20',hours:2.25,note:'Field measurements',revision:1}
  assert.equal((await request('3',`/weeks/${start}/entries/field`,'PUT',entry)).status,200)
  const draft=await requestAt('3','/records/projects/p/time-entries')
  assert.equal(draft.status,200)
  assert.equal(draft.body.entryCount,1)
  assert.equal(draft.body.totalHours,2.25)
  assert.equal(draft.body.items[0].weekStatus,'draft')
  assert.equal(draft.body.items[0].employeeName,'Staff')
  assert.equal(draft.body.items[0].taskName,'Field work')
  assert.equal('costCents' in draft.body.items[0],false)
  assert.equal((await requestAt('4','/records/projects/p/time-entries')).status,403)
  assert.equal((await requestAt('3','/records/projects/p2/time-entries')).body.entryCount,0)
  assert.equal((await request('3',`/weeks/${start}/submit`,'POST')).status,200)
  const submitted=await requestAt('1','/records/projects/p/time-entries')
  assert.equal(submitted.body.items[0].weekStatus,'submitted')
  assert.equal(submitted.body.items[0].costCents,9000)
  assert.equal(submitted.body.items[0].chargeCents,33750)
  assert.equal((await request('1',`/weeks/${start}/approve?userId=3`,'POST')).status,200)
  assert.equal((await requestAt('3','/records/projects/p/time-entries')).body.items[0].weekStatus,'approved')
})

test('project time entry pages cover the full project history',async()=>{
  const {sqlite,requestAt}=fixture()
  sqlite.exec("INSERT INTO user_timesheets(id,user_id,week_start) VALUES('many','3','2026-10-19')")
  const insert=sqlite.prepare("INSERT INTO user_timesheet_entries(id,timesheet_id,project_id,project_task_id,entry_date,hours,note) VALUES(?,'many','p','t','2026-10-20',1,'Work')")
  for(let index=0;index<101;index++)insert.run(`many-${index}`)
  const first=await requestAt('3','/records/projects/p/time-entries?page=0')
  const second=await requestAt('3','/records/projects/p/time-entries?page=1')
  assert.equal(first.body.items.length,100)
  assert.equal(first.body.entryCount,101)
  assert.equal(first.body.totalHours,101)
  assert.equal(first.body.hasMore,true)
  assert.equal(second.body.items.length,1)
  assert.equal(second.body.hasMore,false)
  assert.equal((await requestAt('3','/records/projects/p/time-entries?page=-1')).status,400)
})

test('missing rates block a filled week, while zero-hour weeks can be submitted',async()=>{
  const {sqlite,request}=fixture(),start='2026-10-19'
  sqlite.exec("UPDATE users SET pay_amount_cents=NULL WHERE id='3'")
  assert.equal((await request('3',`/weeks/${start}/entries/e1`,'PUT',{projectId:'p',taskId:'t',entryDate:'2026-10-20',hours:1,note:'Work',revision:1})).status,200)
  assert.equal((await request('3',`/weeks/${start}/submit`,'POST')).status,409)
  assert.equal((await request('4',`/weeks/${start}/submit`,'POST')).status,200)
  assert.equal((await request('4',`/weeks/${start}/approve`,'POST')).status,200)
})

test('a reporting manager rejects with a reason and reopens the employee draft',async()=>{
  const {request}=fixture(),start='2026-10-19',originalFetch=globalThis.fetch
  let email
  globalThis.fetch=async(_url,options)=>{email=JSON.parse(options.body);return {ok:true}}
  try{
    await request('3',`/weeks/${start}/submit`,'POST')
    assert.equal((await request('2',`/weeks/${start}/reject?userId=3`,'POST',{})).status,400)
    const result=await request('2',`/weeks/${start}/reject?userId=3`,'POST',{reason:'Add the missing field notes'})
    assert.equal(result.status,200)
    assert.equal(result.body.status,'draft')
    assert.ok(result.body.history.some(item=>item.action==='reject'&&JSON.parse(item.details_json).reason==='Add the missing field notes'))
    assert.match(email?.textContent||'',/Add the missing field notes/)
  }finally{globalThis.fetch=originalFetch}
})

test('rate table edits require the current revision and one default',async()=>{
  const {request}=fixture()
  const current=await request('1','/configuration')
  assert.equal(current.status,200)
  const positions=current.body.positions.map(p=>({id:p.id,localId:p.local_id,name:p.name,active:p.active===1}))
  const tables=current.body.tables.map(t=>({id:t.id,name:t.name,active:t.active===1,expiresOn:t.expires_on,isDefault:t.is_default===1,undefinedRateCents:t.undefined_rate_cents,rates:[{positionId:'surveyor',rateCents:17000}]}))
  assert.equal((await request('1','/configuration','PUT',{revision:current.body.revision,positions,tables:tables.map(t=>({...t,isDefault:false}))})).status,400)
  assert.equal((await request('1','/configuration','PUT',{revision:current.body.revision,positions,tables})).status,200)
  assert.equal((await request('1','/configuration','PUT',{revision:current.body.revision,positions,tables})).status,409)
  assert.equal((await request('3','/configuration')).status,403)
})

test('billing position local IDs are unique, saved, and sort configuration results',async()=>{
  const {request}=fixture()
  const current=await request('1','/configuration')
  const tables=current.body.tables.map(t=>({id:t.id,name:t.name,active:t.active===1,expiresOn:t.expires_on,isDefault:t.is_default===1,undefinedRateCents:t.undefined_rate_cents,rates:[{positionId:'surveyor',rateCents:15000}]}))
  const positions=[
    {id:'surveyor',localId:'20',name:'Surveyor',active:true},
    {id:'technician',localId:'10',name:'Technician',active:true},
  ]
  assert.equal((await request('1','/configuration','PUT',{revision:current.body.revision,positions:[...positions,{id:'duplicate',localId:' 10 ',name:'Duplicate',active:true}],tables})).status,400)
  assert.equal((await request('1','/configuration','PUT',{revision:current.body.revision,positions,tables})).status,200)
  const updated=await request('1','/configuration')
  assert.deepEqual(updated.body.positions.map(p=>p.local_id),['10','20'])
  assert.deepEqual(updated.body.positions.map(p=>p.name),['Technician','Surveyor'])
})

test('QBO retries adopt an already created invoice and payment',async()=>{
  const {sqlite,db}=fixture()
  sqlite.exec("UPDATE projects SET qbo_customer_id='customer-1' WHERE id='p'; INSERT INTO qbo_connection(id,realm_id,environment,access_token,refresh_token,token_expires_at,connected_at,updated_at,default_service_item_id) VALUES(1,'realm','sandbox','token','refresh','2099-01-01T00:00:00Z',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'service-1'); INSERT INTO invoices(id,project_id,client_id,invoice_number,source,status,issue_date,due_date,billing_name,project_reference,public_token) VALUES('retry-invoice','p','c','INV-RETRY','manual','sent','2026-10-10','2026-11-09','Client','P-1','retry-token'); INSERT INTO invoice_lines(id,invoice_id,kind,description,amount_cents) VALUES('retry-line','retry-invoice','manual','Work',5000); INSERT INTO invoice_payments(id,invoice_id,source,status,amount_cents,method,paid_at) VALUES('retry-payment','retry-invoice','manual','succeeded',5000,'Check','2026-10-11');")
  const originalFetch=globalThis.fetch,calls=[]
  globalThis.fetch=async(url,init)=>{
    calls.push({url:String(url),method:init?.method||'GET'})
    const query=new URL(String(url)).searchParams.get('query')||''
    if(query.includes('from Invoice'))return Response.json({QueryResponse:{Invoice:[{Id:'qbo-invoice',SyncToken:'3',DocNumber:'INV-RETRY',CustomerRef:{value:'customer-1'},PrivateNote:'V5 invoice retry-invoice'}]}})
    if(query.includes('from Payment'))return Response.json({QueryResponse:{Payment:[{Id:'qbo-payment',CustomerRef:{value:'customer-1'},TotalAmt:50,Line:[{LinkedTxn:[{TxnId:'qbo-invoice'}]}]}]}})
    throw new Error('Retry attempted a duplicate QBO create.')
  }
  try{
    const env={QBO_CLIENT_ID:'client',QBO_CLIENT_SECRET:'secret',QBO_ENVIRONMENT:'sandbox'}
    await syncInvoiceQbo(db,env,'retry-invoice')
    await syncPaymentQbo(db,env,'retry-payment')
    assert.equal(sqlite.prepare("SELECT qbo_invoice_id FROM invoices WHERE id='retry-invoice'").get().qbo_invoice_id,'qbo-invoice')
    assert.equal(sqlite.prepare("SELECT qbo_payment_id FROM invoice_payments WHERE id='retry-payment'").get().qbo_payment_id,'qbo-payment')
    assert.equal(calls.length,2)
    assert.ok(calls.every(call=>call.method==='GET'))
  }finally{globalThis.fetch=originalFetch}
})

test('Stripe payment export uses the exact amount, method, deposit account, and invoice link',async()=>{
  const {sqlite,db}=fixture()
  sqlite.exec("UPDATE projects SET qbo_customer_id='customer-1' WHERE id='p'; INSERT INTO qbo_connection(id,realm_id,environment,access_token,refresh_token,token_expires_at,connected_at,updated_at,default_deposit_account_id) VALUES(1,'realm','sandbox','token','refresh','2099-01-01T00:00:00Z',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'deposit-1'); INSERT INTO invoices(id,project_id,client_id,invoice_number,source,status,issue_date,due_date,billing_name,project_reference,public_token,qbo_invoice_id) VALUES('stripe-qbo-invoice','p','c','INV-STRIPE','manual','paid','2026-10-10','2026-11-09','Client','P-1','stripe-qbo-token','qbo-invoice'); INSERT INTO invoice_payments(id,invoice_id,source,status,amount_cents,method,paid_at,stripe_payment_intent_id) VALUES('stripe-qbo-payment','stripe-qbo-invoice','stripe','succeeded',114000,'Stripe','2026-10-23T16:00:00Z','pi_test_123');")
  const originalFetch=globalThis.fetch;let body
  globalThis.fetch=async(url,init)=>{
    const query=new URL(String(url)).searchParams.get('query')||''
    if(query.includes('from PaymentMethod'))return Response.json({QueryResponse:{PaymentMethod:[{Id:'method-stripe',Name:'Stripe'}]}})
    if(query.includes('from Payment'))return Response.json({QueryResponse:{Payment:[]}})
    if(String(url).includes('/payment?')){body=JSON.parse(init.body);return Response.json({Payment:{Id:'qbo-payment'}})}
    throw new Error('Unexpected QuickBooks request.')
  }
  try{
    await syncPaymentQbo(db,{QBO_CLIENT_ID:'client',QBO_CLIENT_SECRET:'secret',QBO_ENVIRONMENT:'sandbox'},'stripe-qbo-payment')
    assert.equal(body.TotalAmt,1140)
    assert.equal(body.TxnDate,'2026-10-23')
    assert.deepEqual(body.PaymentMethodRef,{value:'method-stripe',name:'Stripe'})
    assert.deepEqual(body.DepositToAccountRef,{value:'deposit-1'})
    assert.deepEqual(body.Line,[{Amount:1140,LinkedTxn:[{TxnId:'qbo-invoice',TxnType:'Invoice'}]}])
    assert.match(body.PrivateNote,/pi_test_123/)
  }finally{globalThis.fetch=originalFetch}
})
