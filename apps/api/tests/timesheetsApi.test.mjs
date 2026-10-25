import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { createHmac } from 'node:crypto'
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { Hono } from 'hono'
import { createTimesheetsApi } from '../src/routes/timesheetsApi.ts'
import { projectTimeEntries } from '../src/routes/projectTimeEntries.ts'
import { createInvoicesApi } from '../src/routes/invoicesApi.ts'
import { generateMonthlyInvoices } from '../src/services/monthlyInvoices.ts'
import { createStripeInvoiceWebhook } from '../src/webhooks/stripeInvoiceWebhook.ts'
import { correctPaymentQbo, syncInvoiceQbo, syncPaymentQbo, syncPayoutQbo } from '../src/services/invoiceQbo.ts'
import { payoutTransactions } from '../src/services/stripeApi.ts'
import { processStripeEvent } from '../src/services/stripePayments.ts'
import { paymentNotice, retryFailedPaymentNotices } from '../src/services/paymentNotices.ts'
import { createInvoicePdf, invoiceHoursBreakdownRows } from '@whitepoint/utils/invoice-pdf'
import { publicInvoice } from '../src/services/invoiceData.ts'

function fixture(){
  const sqlite=new DatabaseSync(':memory:')
  const documents=new Map()
  const RECORD_DOCUMENTS={put:async(key,value)=>{documents.set(key,value)},get:async key=>{const value=documents.get(key);return value?{arrayBuffer:async()=>value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength),body:new Blob([value]).stream()}:null},delete:async key=>documents.delete(key)}
  sqlite.exec('PRAGMA foreign_keys=ON')
  for(const name of ['0001_company_initialization.sql','0002_roles_permissions.sql','0003_user_init_auth_seed.sql','0004_client_init.sql','0005_project_init.sql','0006_timesheet_init.sql','0007_invoice_init.sql'])sqlite.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'))
  const db={
    prepare(sql){const execute=(values)=>({first:async()=>sqlite.prepare(sql).get(...values)||null,all:async()=>({results:sqlite.prepare(sql).all(...values)}),run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}})});return {...execute([]),bind(...values){return execute(values)}}},
    async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}
  }
  sqlite.exec("INSERT INTO users(id,email,first_name,last_name) VALUES('2','manager@example.com','Morgan','Manager'),('3','staff@example.com','Sam','Staff'),('4','leader@example.com','Lee','Leader'); UPDATE users SET manager_user_id='1' WHERE id='2'; UPDATE users SET manager_user_id='2' WHERE id='3';")
  sqlite.exec("INSERT INTO billing_positions(id,name) VALUES('surveyor','Surveyor'); INSERT INTO pay_tables(id,name,is_default,undefined_rate_cents) VALUES('standard','Standard',1,10000); INSERT INTO pay_table_rates(pay_table_id,position_id,rate_cents) VALUES('standard','surveyor',15000); UPDATE users SET billing_position_id='surveyor',pay_basis='hourly',pay_amount_cents=4000 WHERE id='3';")
  sqlite.exec("INSERT INTO clients(id,name) VALUES('c','Client'); INSERT INTO contacts(id,client_id,name,email,is_poc,is_billing_poc) VALUES('billing-contact','c','Billing Contact','billing@example.com',1,1); INSERT INTO projects(id,project_number,client_id,name,pay_table_id,active,contact_id) VALUES('p','P-1','c','Project','standard',1,'billing-contact'),('p2','P-2','c','Inactive project','standard',0,'billing-contact'); INSERT INTO project_tasks(id,project_id,task_id,sequence,task_name,bill_type) VALUES('t','p','A',1,'Field work','time-and-materials'),('t2','p','B',2,'Fixed work','fixed-fee'),('ti','p','C',3,'Inactive work','time-and-materials'); UPDATE project_tasks SET status='inactive' WHERE id='ti';")
  const app=new Hono()
  app.use('*',async(c,next)=>{const user=c.req.header('X-Test-User')||'3';c.set('auth',{internalUserId:user});c.set('permissions',{hasPermission:(key)=>user==='1'||user==='2'&&['timesheets.approve','timesheet.team.modify'].includes(key)||user==='4'&&key==='timesheets.approve'||user==='3'&&key==='projects.view'});await next()})
  app.route('/timesheets',createTimesheetsApi())
  app.route('/invoices',createInvoicesApi())
  app.route('/webhooks',createStripeInvoiceWebhook())
  app.get('/records/projects/:id/time-entries',projectTimeEntries)
  async function requestAt(user,path,method='GET',body,envOverride={},headers={}){const response=await app.request(path,{method,headers:{'X-Test-User':user,...body===undefined?{}:{'Content-Type':'application/json'},...headers},body:body===undefined?undefined:JSON.stringify(body)},{DB:db,RECORD_DOCUMENTS,BREVO_API_KEY:'test',BREVO_SENDER_EMAIL:'sender@example.com',...envOverride});return {status:response.status,body:await response.json()}}
  const request=(user,path,method='GET',body)=>requestAt(user,`/timesheets${path}`,method,body)
  return {sqlite,db,app,request,requestAt,documents}
}

test('invoice recipients default to project contact and either billing POC marker',async()=>{
  const {sqlite,requestAt}=fixture()
  sqlite.exec("UPDATE projects SET manager_user_id='2' WHERE id='p'; INSERT INTO contacts(id,client_id,name,email,is_billing_poc) VALUES('project-billing','c','Project Billing','project@example.com',0),('flagged-billing','c','Flagged Billing','flagged@example.com',1),('unassigned','c','Unassigned','other@example.com',1); INSERT INTO project_contacts(project_id,role,contact_id) VALUES('p','clientBillingPoc','project-billing'),('p','clientStakeholder','flagged-billing');")
  const created=await requestAt('2','/invoices','POST',{projectId:'p',entryIds:[]})
  assert.equal(created.status,201)
  const invoice=created.body.invoice
  assert.deepEqual(invoice.recipients.map(x=>x.contactId),['billing-contact','flagged-billing','project-billing'])
  assert(invoice.recipients.every(x=>x.selected))
  const payload={revision:invoice.revision,issueDate:'2026-01-31',paymentTerm:'net-45',includeHoursBreakdown:false,includeLineItemNotes:false,notes:'',internalNote:'',recipientIds:['project-billing'],allocations:[],lines:[]}
  const updated=await requestAt('2',`/invoices/${invoice.id}`,'PUT',payload)
  assert.equal(updated.status,200)
  assert.equal(updated.body.invoice.dueDate,'2026-03-17')
  assert.deepEqual(updated.body.invoice.recipients.filter(x=>x.selected).map(x=>x.contactId),['project-billing'])
  assert.equal((await requestAt('2',`/invoices/${invoice.id}`,'PUT',{...payload,revision:updated.body.invoice.revision,recipientIds:['unassigned']})).status,400)
})

test('a billed split can hold its balance for a later invoice',async()=>{
  const {sqlite,requestAt}=fixture()
  sqlite.exec("UPDATE projects SET manager_user_id='2' WHERE id='p'; INSERT INTO user_timesheets(id,user_id,week_start,status) VALUES('split-week','3','2026-10-19','approved'); INSERT INTO user_timesheet_entries(id,timesheet_id,project_id,project_task_id,entry_date,hours,note,charge_cents,billing_type) VALUES('split-held','split-week','p','t','2026-10-20',2,'Split work',30000,'time-and-materials');")
  const created=await requestAt('2','/invoices','POST',{projectId:'p',entryIds:['split-held']})
  const invoice=created.body.invoice
  const saved=await requestAt('2',`/invoices/${invoice.id}`,'PUT',{revision:invoice.revision,issueDate:invoice.issueDate,paymentTerm:invoice.paymentTerm,includeHoursBreakdown:invoice.includeHoursBreakdown,includeLineItemNotes:invoice.includeLineItemNotes,recipientIds:invoice.recipients.filter(x=>x.selected).map(x=>x.contactId),notes:'',internalNote:'',lines:invoice.lines,allocations:[{entryId:'split-held',disposition:'split',splitBasis:'hours',splitValue:1,splitRemainder:'hold'}]})
  assert.equal(saved.status,200)
  assert.equal(saved.body.invoice.allocations[0].heldHours,1)
  const pool=await requestAt('2','/invoices/pool?projectId=p')
  assert.equal(pool.body.items.find(x=>x.entryId==='split-held').hours,1)
  assert.equal(pool.body.items.find(x=>x.entryId==='split-held').chargeCents,15000)
  const next=await requestAt('2','/invoices','POST',{projectId:'p',entryIds:['split-held']})
  assert.equal(next.status,201)
  assert.equal(next.body.invoice.allocations[0].sourceHours,1)
  assert.equal((await requestAt('2','/invoices/pool?projectId=p')).body.items.some(x=>x.entryId==='split-held'),false)
})

test('billed time and materials hours appear between the invoice and PO when selected',async()=>{
  const {sqlite,requestAt,documents}=fixture()
  sqlite.exec("UPDATE projects SET manager_user_id='2' WHERE id='p'; INSERT INTO user_timesheets(id,user_id,week_start,status) VALUES('hours-week','3','2026-10-19','approved'); INSERT INTO user_timesheet_entries(id,timesheet_id,project_id,project_task_id,entry_date,hours,note,charge_cents,billing_type) VALUES('hours-entry','hours-week','p','t','2026-10-20',2,'Field visit',30000,'time-and-materials');")
  const created=await requestAt('2','/invoices','POST',{projectId:'p',entryIds:['hours-entry']})
  assert.equal(created.status,201)
  const invoice=created.body.invoice
  const po=await createInvoicePdf(publicInvoice({...invoice,status:'sent'},invoice.publicToken),'','')
  documents.set('projects/p/po/hours-test',new Uint8Array(po.output('arraybuffer')))
  sqlite.exec("INSERT INTO project_po_documents(id,project_id,name,size_bytes,r2_key) VALUES('hours-test','p','Hours PO.pdf',100,'projects/p/po/hours-test')")
  const saved=await requestAt('2',`/invoices/${invoice.id}`,'PUT',{revision:invoice.revision,issueDate:invoice.issueDate,paymentTerm:invoice.paymentTerm,includeHoursBreakdown:true,includeLineItemNotes:true,notes:'',internalNote:'',recipientIds:invoice.recipients.filter(x=>x.selected).map(x=>x.contactId),lines:invoice.lines,allocations:[{entryId:'hours-entry',disposition:'split',splitBasis:'hours',splitValue:1,splitRemainder:'hold'}]})
  assert.equal(saved.status,200)
  assert.equal(saved.body.invoice.includeHoursBreakdown,true)
  assert.equal(saved.body.invoice.includeLineItemNotes,true)
  assert.deepEqual(invoiceHoursBreakdownRows(saved.body.invoice.allocations).map(row=>row.hours),[1])
  assert.equal(invoiceHoursBreakdownRows(saved.body.invoice.allocations)[0].note,undefined)
  assert.equal(invoiceHoursBreakdownRows(saved.body.invoice.allocations,undefined,true)[0].note,'Field visit')
  const sent=await requestAt('2',`/invoices/${invoice.id}/mark-sent`,'POST',{})
  assert.equal(sent.status,200)
  const packet=await PDFDocument.load(documents.get(`invoices/${invoice.id}/packet.pdf`))
  assert.equal(packet.getPageCount(),3)
})

test('sending attaches a PDF packet with active project POs and deduplicates recipient email',async()=>{
  const {sqlite,requestAt,documents,app,db}=fixture()
  sqlite.exec("UPDATE projects SET manager_user_id='2',po_number='PO-77' WHERE id='p'; INSERT INTO contacts(id,client_id,name,email,is_billing_poc) VALUES('duplicate-recipient','c','Second billing contact','billing@example.com',1); INSERT INTO project_contacts(project_id,role,contact_id) VALUES('p','clientBillingPoc','duplicate-recipient');")
  const created=await requestAt('2','/invoices','POST',{projectId:'p',entryIds:[]})
  const invoice=created.body.invoice
  const po=await createInvoicePdf(publicInvoice({...invoice,status:'sent'},invoice.publicToken),'','')
  documents.set('projects/p/po/po-test',new Uint8Array(po.output('arraybuffer')))
  sqlite.exec("INSERT INTO project_po_documents(id,project_id,name,size_bytes,r2_key) VALUES('po-test','p','Signed PO.pdf',100,'projects/p/po/po-test')")
  const saved=await requestAt('2',`/invoices/${invoice.id}`,'PUT',{revision:invoice.revision,issueDate:'2026-03-01',paymentTerm:'net-15',includeHoursBreakdown:false,includeLineItemNotes:false,notes:'',internalNote:'',recipientIds:invoice.recipients.filter(x=>x.selected).map(x=>x.contactId),allocations:[],lines:[{id:'new-line',kind:'manual',description:'Survey work',amountCents:10000,projectTaskId:null}]})
  assert.equal(saved.status,200)
  const sentMail=[];const originalFetch=globalThis.fetch
  globalThis.fetch=async(url,init)=>{if(String(url).includes('api.brevo.com')){sentMail.push(JSON.parse(init.body));return new Response('{}',{status:201})}throw new Error('Unexpected network request')}
  try{
    const sent=await requestAt('2',`/invoices/${invoice.id}/send`,'POST',{})
    assert.equal(sent.status,200)
    assert.equal(sent.body.invoice.emailStatus,'accepted')
    assert.equal(sent.body.invoice.poNumber,'PO-77')
    assert.deepEqual(sent.body.invoice.poDocuments.map(x=>x.name),['Signed PO.pdf'])
    const issuedPacket=await PDFDocument.load(documents.get(`invoices/${invoice.id}/packet.pdf`))
    assert.equal(issuedPacket.getPageCount(),2)
    const annotations=issuedPacket.getPage(0).node.Annots()
    assert(annotations?.size()>=2,'issued invoice should show both first-page payment links')
    const links=annotations?.asArray().map(ref=>issuedPacket.context.lookup(ref,PDFDict).lookup(PDFName.of('A'),PDFDict)?.lookup(PDFName.of('URI'))?.toString())||[]
    assert(links.some(url=>url?.includes(`/pay/${invoice.publicToken}`)),'issued invoice first page should link to its payment page')
    assert.equal(sentMail.length,1)
    assert(sentMail[0].attachment[0].content.length>100)
    assert.match(sentMail[0].htmlContent, /View and pay invoice/)
    assert.match(sentMail[0].textContent, /View and pay:/)
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM invoice_notifications WHERE invoice_id=? AND kind='client'").get(invoice.id).n,1)
    const packet=await app.request(`/invoices/public/${invoice.publicToken}/packet`,{}, {DB:db,RECORD_DOCUMENTS:{get:async key=>({body:new Blob([documents.get(key)]).stream()})}})
    assert.equal(packet.status,200)
    assert.equal((await packet.text()).slice(0,5),'%PDF-')
  }finally{globalThis.fetch=originalFetch}
})

test('mark sent omits email and a failed recipient retry sends only the failed address',async()=>{
  const {sqlite,requestAt,documents}=fixture()
  sqlite.exec("UPDATE projects SET manager_user_id='2' WHERE id='p'; INSERT INTO contacts(id,client_id,name,email,is_billing_poc) VALUES('second-recipient','c','Second Contact','second@example.com',1); INSERT INTO project_contacts(project_id,role,contact_id) VALUES('p','clientBillingPoc','second-recipient');")
  const created=await requestAt('2','/invoices','POST',{projectId:'p',entryIds:[]})
  const invoice=created.body.invoice
  const updated=await requestAt('2',`/invoices/${invoice.id}`,'PUT',{revision:invoice.revision,issueDate:invoice.issueDate,paymentTerm:invoice.paymentTerm,includeHoursBreakdown:invoice.includeHoursBreakdown,includeLineItemNotes:invoice.includeLineItemNotes,notes:'',internalNote:'',recipientIds:invoice.recipients.filter(x=>x.selected).map(x=>x.contactId),allocations:[],lines:[{id:'line-1',kind:'manual',description:'Survey work',amountCents:10000,projectTaskId:null}]})
  assert.equal(updated.status,200)
  const marked=await requestAt('2',`/invoices/${invoice.id}/mark-sent`,'POST',{})
  assert.equal(marked.status,200)
  assert.equal(marked.body.invoice.status,'sent')
  assert.equal(marked.body.invoice.emailStatus,'none')
  assert(documents.has(`invoices/${invoice.id}/packet.pdf`))
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM invoice_notifications WHERE invoice_id=? AND kind='client'").get(invoice.id).n,0)
  const calls=[];let failSecond=true;const originalFetch=globalThis.fetch
  globalThis.fetch=async(url,init)=>{if(!String(url).includes('api.brevo.com'))throw new Error('Unexpected network request');const payload=JSON.parse(init.body),email=payload.to[0].email;assert.match(payload.htmlContent,/View and pay invoice/);assert.match(payload.textContent,/View and pay:/);calls.push(email);return new Response('{}',{status:email==='second@example.com'&&failSecond?500:201})}
  try{
    const first=await requestAt('2',`/invoices/${invoice.id}/send`,'POST',{})
    assert.equal(first.body.invoice.emailStatus,'failed')
    assert.deepEqual(first.body.invoice.recipients.map(x=>x.deliveryStatus),['accepted','failed'])
    failSecond=false
    const retried=await requestAt('2',`/invoices/${invoice.id}/send`,'POST',{})
    assert.equal(retried.body.invoice.emailStatus,'accepted')
    assert.deepEqual(calls,['billing@example.com','second@example.com','second@example.com'])
  }finally{globalThis.fetch=originalFetch}
})

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
  const saved=await requestAt('2',`/invoices/${monthly.id}`,'PUT',{revision:invoice.revision,issueDate:invoice.issueDate,paymentTerm:invoice.paymentTerm,includeHoursBreakdown:invoice.includeHoursBreakdown,includeLineItemNotes:invoice.includeLineItemNotes,recipientIds:invoice.recipients.filter(x=>x.selected).map(x=>x.contactId),notes:'',internalNote:'',allocations:invoice.allocations.map(a=>({entryId:a.entryId,disposition:a.disposition,splitBasis:a.splitBasis,splitValue:a.splitBasis==='charge'?a.billedChargeCents:undefined,writeoffReason:a.writeoffReason,writeoffExplanation:a.writeoffExplanation})),lines:invoice.lines.map(line=>({...line,amountCents:line.kind==='fixed-fee'?20000:line.amountCents}))})
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
    const result=await requestAt('2',`/invoices/${invoice.id}`,'PUT',{revision:invoice.revision,issueDate:invoice.issueDate,paymentTerm:invoice.paymentTerm,includeHoursBreakdown:invoice.includeHoursBreakdown,includeLineItemNotes:invoice.includeLineItemNotes,recipientIds:invoice.recipients.filter(x=>x.selected).map(x=>x.contactId),notes:invoice.notes,internalNote:invoice.internalNote,lines:invoice.lines,allocations:[{entryId:'decision-entry',disposition,writeoffReason:'advance',writeoffExplanation:'Client advance',...disposition==='split'?{splitBasis:'hours',splitValue}:{}}]})
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
  const update=(invoice,disposition,amountCents)=>({revision:invoice.revision,issueDate:invoice.issueDate,paymentTerm:invoice.paymentTerm,includeHoursBreakdown:invoice.includeHoursBreakdown,includeLineItemNotes:invoice.includeLineItemNotes,recipientIds:invoice.recipients.filter(x=>x.selected).map(x=>x.contactId),notes:invoice.notes,internalNote:invoice.internalNote,allocations:invoice.allocations.map(a=>({entryId:a.entryId,disposition:a.entryId==='add-fixed'?disposition:a.disposition,writeoffReason:'over-budget',writeoffExplanation:'Budget review'})),lines:invoice.lines.map(line=>({...line,amountCents:line.kind==='fixed-fee'?amountCents:line.amountCents}))})
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
  const originalFetch=globalThis.fetch
  globalThis.fetch=async url=>String(url).includes('/payment_intents/')?Response.json({id:'pi_test',status:'succeeded',amount_received:5000,metadata:{invoice_id:'stripe-invoice'},latest_charge:{id:'ch_test',balance_transaction:{id:'txn_test',amount:5000,fee:175,net:4825,currency:'usd',type:'charge',source:'ch_test'},payment_method_details:{type:'card',card:{last4:'4242'}}}}):Response.json({messageId:'mail'})
  try{
    async function deliver(id,type){const payload={id,type,created:timestamp,data:{object:{id:'pi_test',amount:5000,metadata:{invoice_id:'stripe-invoice'}}}},raw=JSON.stringify(payload),signature=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex');return requestAt('3','/webhooks/stripe','POST',payload,{STRIPE_WEBHOOK_SECRET:secret,STRIPE_SECRET_KEY:'sk_test'},{'Stripe-Signature':`t=${timestamp},v1=${signature}`})}
    assert.equal((await deliver('evt_processing','payment_intent.processing')).status,200)
    assert.equal(sqlite.prepare("SELECT status FROM invoices WHERE id='stripe-invoice'").get().status,'sent')
    assert.equal((await deliver('evt_success','payment_intent.succeeded')).status,200)
    assert.equal(sqlite.prepare("SELECT status FROM invoices WHERE id='stripe-invoice'").get().status,'paid')
    assert.equal(sqlite.prepare("SELECT paid_at,stripe_fee_cents,stripe_balance_transaction_id,qbo_payment_id FROM invoice_payments WHERE invoice_id='stripe-invoice'").get().paid_at,new Date(timestamp*1000).toISOString())
    assert.equal(sqlite.prepare("SELECT stripe_fee_cents FROM invoice_payments WHERE invoice_id='stripe-invoice'").get().stripe_fee_cents,175)
    assert.equal(sqlite.prepare("SELECT qbo_payment_id FROM invoice_payments WHERE invoice_id='stripe-invoice'").get().qbo_payment_id,null)
    assert.equal((await deliver('evt_success','payment_intent.succeeded')).body.duplicate,true)
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM invoice_payments WHERE invoice_id='stripe-invoice'").get().n,1)
  }finally{globalThis.fetch=originalFetch}
})

test('confirmed Stripe payment credits D1 before its balance transaction exists',async()=>{
  const {sqlite,db}=fixture()
  sqlite.exec("INSERT INTO invoices(id,project_id,client_id,invoice_number,source,status,issue_date,due_date,billing_name,project_reference,public_token) VALUES('pending-txn-invoice','p','c','INV-PENDING','manual','sent','2026-10-10','2026-11-09','Client','P-1','pending-token'); INSERT INTO invoice_lines(id,invoice_id,kind,description,amount_cents) VALUES('pending-txn-line','pending-txn-invoice','manual','Work',5000); INSERT INTO stripe_checkout_sessions(id,invoice_id,amount_cents) VALUES('cs_pending','pending-txn-invoice',5000);")
  const originalFetch=globalThis.fetch
  globalThis.fetch=async url=>{
    const value=String(url)
    if(value.includes('/payment_intents/pi_pending'))return Response.json({id:'pi_pending',status:'succeeded',amount_received:5000,metadata:{invoice_id:'pending-txn-invoice'},latest_charge:{id:'ch_pending',balance_transaction:null,payment_method_details:{type:'card',card:{last4:'4242'}}}})
    if(value.includes('/payouts/po_pending'))return Response.json({id:'po_pending',amount:4825,currency:'usd',automatic:true,status:'paid',reconciliation_status:'completed'})
    if(value.includes('/balance_transactions'))return Response.json({data:[{id:'txn_pending',amount:5000,fee:175,net:4825,type:'charge',source:'ch_pending',currency:'usd'}],has_more:false})
    return Response.json({messageId:'mail'})
  }
  try{
    const env={DB:db,STRIPE_SECRET_KEY:'sk_test'}
    assert.deepEqual(await processStripeEvent(env,{id:'evt_checkout_pending',type:'checkout.session.completed',data:{object:{id:'cs_pending',payment_intent:'pi_pending',payment_status:'paid',amount_total:5000}}}),{received:true})
    assert.equal(sqlite.prepare("SELECT status FROM invoices WHERE id='pending-txn-invoice'").get().status,'paid')
    assert.equal(sqlite.prepare("SELECT stripe_balance_transaction_id FROM invoice_payments WHERE invoice_id='pending-txn-invoice'").get().stripe_balance_transaction_id,null)
    assert.deepEqual(await processStripeEvent(env,{id:'evt_intent_pending',type:'payment_intent.succeeded',data:{object:{id:'pi_pending',metadata:{invoice_id:'pending-txn-invoice'}}}}),{received:true})
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM invoice_payments WHERE invoice_id='pending-txn-invoice'").get().n,1)
    assert.deepEqual(await processStripeEvent(env,{id:'evt_payout_pending',type:'payout.reconciliation_completed',data:{object:{id:'po_pending'}}}),{received:true})
    const payment=sqlite.prepare("SELECT stripe_balance_transaction_id,stripe_fee_cents,stripe_net_cents,stripe_payout_id FROM invoice_payments WHERE invoice_id='pending-txn-invoice'").get()
    assert.deepEqual({...payment},{stripe_balance_transaction_id:'txn_pending',stripe_fee_cents:175,stripe_net_cents:4825,stripe_payout_id:'po_pending'})
    assert.equal(sqlite.prepare("SELECT review_error FROM stripe_payouts WHERE id='po_pending'").get().review_error,null)
  }finally{globalThis.fetch=originalFetch}
})

test('QBO customer payment, fee purchase, and bank transfer wait for a reconciled paid payout',async()=>{
  const {sqlite,requestAt}=fixture()
  sqlite.exec("UPDATE projects SET qbo_customer_id='qbo-customer' WHERE id='p'; INSERT INTO qbo_connection(id,realm_id,environment,access_token,refresh_token,token_expires_at,connected_at,updated_at,stripe_clearing_account_id,stripe_payout_bank_account_id,stripe_fee_expense_account_id) VALUES(1,'realm','sandbox','token','refresh','2099-01-01T00:00:00Z',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'clearing','bank','fees'); INSERT INTO invoices(id,project_id,client_id,invoice_number,source,status,issue_date,due_date,billing_name,project_reference,public_token,qbo_invoice_id) VALUES('payout-invoice','p','c','INV-PAYOUT','manual','paid','2026-10-10','2026-11-09','Client','P-1','payout-token','qbo-invoice'); INSERT INTO invoice_lines(id,invoice_id,kind,description,amount_cents) VALUES('payout-line','payout-invoice','manual','Work',5000); INSERT INTO invoice_payments(id,invoice_id,source,status,amount_cents,method,paid_at,stripe_payment_intent_id,stripe_charge_id,stripe_balance_transaction_id,stripe_fee_cents,stripe_net_cents) VALUES('payment-1','payout-invoice','stripe','succeeded',5000,'card','2026-10-23T16:00:00Z','pi_1','ch_1','txn_1',175,4825);")
  const secret='whsec_test',timestamp=Math.floor(Date.now()/1000),created=[];let payoutStatus='pending'
  const originalFetch=globalThis.fetch
  globalThis.fetch=async(url,init={})=>{
    const value=String(url),query=new URL(value).searchParams.get('query')||''
    if(value.includes('/payouts/po_1'))return Response.json({id:'po_1',amount:4825,currency:'usd',automatic:true,status:payoutStatus,reconciliation_status:'completed',arrival_date:timestamp})
    if(value.includes('/balance_transactions'))return Response.json({data:[{id:'txn_1',amount:5000,fee:175,net:4825,type:'charge',source:'ch_1',currency:'usd'}],has_more:false})
    if(query.includes('from PaymentMethod'))return Response.json({QueryResponse:{PaymentMethod:[{Id:'method-stripe',Name:'Stripe'}]}})
    if(query.includes('from Payment'))return Response.json({QueryResponse:{Payment:[]}})
    if(query.includes('from Purchase'))return Response.json({QueryResponse:{Purchase:[]}})
    if(query.includes('from Transfer'))return Response.json({QueryResponse:{Transfer:[]}})
    if(value.includes('/payment?')||value.includes('/purchase?')||value.includes('/transfer?')){created.push({url:value,body:JSON.parse(init.body)});return Response.json({[value.includes('/payment?')?'Payment':value.includes('/purchase?')?'Purchase':'Transfer']:{Id:`qbo-${created.length}`}})}
    return Response.json({messageId:'mail'})
  }
  try{
    async function deliver(eventId,type){const payload={id:eventId,type,data:{object:{id:'po_1'}}},raw=JSON.stringify(payload),signature=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex');return requestAt('3','/webhooks/stripe','POST',payload,{STRIPE_WEBHOOK_SECRET:secret,STRIPE_SECRET_KEY:'sk_test',QBO_CLIENT_ID:'client',QBO_CLIENT_SECRET:'secret',QBO_ENVIRONMENT:'sandbox'},{'Stripe-Signature':`t=${timestamp},v1=${signature}`})}
    assert.equal((await deliver('evt_reconciled','payout.reconciliation_completed')).status,200)
    assert.equal(sqlite.prepare("SELECT qbo_payment_id FROM invoice_payments WHERE id='payment-1'").get().qbo_payment_id,null)
    payoutStatus='paid'
    assert.equal((await deliver('evt_paid','payout.paid')).status,200)
    assert.equal(created.length,3)
    assert.deepEqual(created[0].body.DepositToAccountRef,{value:'clearing'})
    assert.equal(created[1].body.Line[0].Amount,1.75)
    assert.deepEqual(created[2].body.FromAccountRef,{value:'clearing'})
    assert.deepEqual(created[2].body.ToAccountRef,{value:'bank'})
    assert.equal((await deliver('evt_paid','payout.paid')).body.duplicate,true)
  }finally{globalThis.fetch=originalFetch}
})

test('one reconciled payout posts two invoice payments and one bank transfer',async()=>{
  const {sqlite,requestAt}=fixture()
  sqlite.exec("UPDATE projects SET qbo_customer_id='qbo-customer-a' WHERE id='p'; UPDATE projects SET qbo_customer_id='qbo-customer-b' WHERE id='p2'; INSERT INTO qbo_connection(id,realm_id,environment,access_token,refresh_token,token_expires_at,connected_at,updated_at,stripe_clearing_account_id,stripe_payout_bank_account_id,stripe_fee_expense_account_id) VALUES(1,'realm','sandbox','token','refresh','2099-01-01T00:00:00Z',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'clearing','bank','fees'); INSERT INTO invoices(id,project_id,client_id,invoice_number,source,status,issue_date,due_date,billing_name,project_reference,public_token,qbo_invoice_id) VALUES('invoice-a','p','c','INV-A','manual','paid','2026-10-10','2026-11-09','Client','P-1','token-a','qbo-invoice-a'),('invoice-b','p2','c','INV-B','manual','paid','2026-10-10','2026-11-09','Client','P-2','token-b','qbo-invoice-b'); INSERT INTO invoice_lines(id,invoice_id,kind,description,amount_cents) VALUES('line-a','invoice-a','manual','Work A',5000),('line-b','invoice-b','manual','Work B',7500); INSERT INTO invoice_payments(id,invoice_id,source,status,amount_cents,method,paid_at,stripe_payment_intent_id,stripe_charge_id,stripe_balance_transaction_id,stripe_fee_cents,stripe_net_cents) VALUES('payment-a','invoice-a','stripe','succeeded',5000,'card','2026-10-23T16:00:00Z','pi_a','ch_a','txn_a',175,4825),('payment-b','invoice-b','stripe','succeeded',7500,'card','2026-10-23T16:00:00Z','pi_b','ch_b','txn_b',225,7275);")
  const secret='whsec_test',timestamp=Math.floor(Date.now()/1000),created=[]
  const originalFetch=globalThis.fetch
  globalThis.fetch=async(url,init={})=>{
    const value=String(url),query=new URL(value).searchParams.get('query')||''
    if(value.includes('/payouts/po_multi'))return Response.json({id:'po_multi',amount:12100,currency:'usd',automatic:true,status:'paid',reconciliation_status:'completed',arrival_date:timestamp})
    if(value.includes('/balance_transactions'))return Response.json({data:[{id:'txn_a',amount:5000,fee:175,net:4825,type:'charge',source:'ch_a',currency:'usd'},{id:'txn_b',amount:7500,fee:225,net:7275,type:'charge',source:'ch_b',currency:'usd'}],has_more:false})
    if(query.includes('from PaymentMethod'))return Response.json({QueryResponse:{PaymentMethod:[{Id:'method-stripe',Name:'Stripe'}]}})
    if(query.includes('from Payment'))return Response.json({QueryResponse:{Payment:[]}})
    if(query.includes('from Purchase'))return Response.json({QueryResponse:{Purchase:[]}})
    if(query.includes('from Transfer'))return Response.json({QueryResponse:{Transfer:[]}})
    if(value.includes('/payment?')||value.includes('/purchase?')||value.includes('/transfer?')){const entity=value.includes('/payment?')?'Payment':value.includes('/purchase?')?'Purchase':'Transfer';created.push({entity,body:JSON.parse(init.body)});return Response.json({[entity]:{Id:`qbo-${created.length}`}})}
    return Response.json({messageId:'mail'})
  }
  try{
    async function deliver(id,type){const payload={id,type,data:{object:{id:'po_multi'}}},raw=JSON.stringify(payload),signature=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex');return requestAt('3','/webhooks/stripe','POST',payload,{STRIPE_WEBHOOK_SECRET:secret,STRIPE_SECRET_KEY:'sk_test',QBO_CLIENT_ID:'client',QBO_CLIENT_SECRET:'secret',QBO_ENVIRONMENT:'sandbox'},{'Stripe-Signature':`t=${timestamp},v1=${signature}`})}
    assert.equal((await deliver('evt_multi_paid','payout.paid')).status,200)
    const payments=created.filter(item=>item.entity==='Payment')
    assert.equal(payments.length,2)
    assert.deepEqual(payments.map(item=>[item.body.CustomerRef.value,item.body.Line[0].LinkedTxn[0].TxnId]),[['qbo-customer-a','qbo-invoice-a'],['qbo-customer-b','qbo-invoice-b']])
    assert.deepEqual(payments.map(item=>item.body.TotalAmt),[50,75])
    assert.equal(created.filter(item=>item.entity==='Purchase').length,2)
    assert.deepEqual(created.filter(item=>item.entity==='Transfer').map(item=>item.body.Amount),[121])
    assert.deepEqual(sqlite.prepare("SELECT invoice_id,stripe_payout_id,qbo_payment_id FROM invoice_payments WHERE stripe_payout_id='po_multi' ORDER BY invoice_id").all().map(row=>row.invoice_id),['invoice-a','invoice-b'])
    assert.equal(sqlite.prepare("SELECT qbo_transfer_id FROM stripe_payouts WHERE id='po_multi'").get().qbo_transfer_id,'qbo-5')
    assert.equal((await deliver('evt_multi_reconciled','payout.reconciliation_completed')).status,200)
    assert.equal(created.length,5)
  }finally{globalThis.fetch=originalFetch}
})

test('a matched adjustment fee posts once from Stripe clearing before the payout transfer',async()=>{
  const {sqlite,db}=fixture()
  sqlite.exec("INSERT INTO qbo_connection(id,realm_id,environment,access_token,refresh_token,token_expires_at,connected_at,updated_at,stripe_clearing_account_id,stripe_payout_bank_account_id,stripe_fee_expense_account_id) VALUES(1,'realm','sandbox','token','refresh','2099-01-01T00:00:00Z',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'clearing','bank','fees'); INSERT INTO invoices(id,project_id,client_id,invoice_number,source,status,issue_date,due_date,billing_name,project_reference,public_token,qbo_invoice_id) VALUES('fee-invoice','p','c','INV-FEE','manual','sent','2026-10-10','2026-11-09','Client','P-1','fee-token','qbo-invoice'); INSERT INTO invoice_payments(id,invoice_id,source,status,amount_cents,method,paid_at,stripe_charge_id,stripe_balance_transaction_id,stripe_fee_cents,stripe_net_cents,stripe_payout_id,refunded_cents,qbo_payment_id,qbo_posted_amount_cents,qbo_fee_purchase_id) VALUES('fee-payment','fee-invoice','stripe','succeeded',5000,'card','2026-10-23T16:00:00Z','ch_fee','txn_charge',175,4825,'po_fee',2000,'qbo-payment',3000,'qbo-charge-fee'); INSERT INTO stripe_payment_adjustments(id,payment_id,kind,status,amount_cents,balance_transaction_id) VALUES('re_fee','fee-payment','refund','succeeded',2000,'txn_refund'); INSERT INTO stripe_payouts(id,amount_cents,currency,paid,reconciled,status) VALUES('po_fee',2725,'usd',1,1,'paid'); INSERT INTO stripe_payout_transactions(balance_transaction_id,payout_id,amount_cents,fee_cents,net_cents,type,source_id,payment_id) VALUES('txn_charge','po_fee',5000,175,4825,'charge','ch_fee','fee-payment'); INSERT INTO stripe_payout_transactions(balance_transaction_id,payout_id,amount_cents,fee_cents,net_cents,type,source_id,adjustment_id) VALUES('txn_refund','po_fee',-2000,100,-2100,'refund','re_fee','re_fee');")
  const originalFetch=globalThis.fetch,created=[]
  globalThis.fetch=async(url,init={})=>{
    const value=String(url),query=new URL(value).searchParams.get('query')||''
    if(query.includes('from Purchase'))return Response.json({QueryResponse:{Purchase:[]}})
    if(query.includes('from Transfer'))return Response.json({QueryResponse:{Transfer:[]}})
    if(value.includes('/purchase?')||value.includes('/transfer?')){created.push({url:value,body:JSON.parse(init.body)});return Response.json({[value.includes('/purchase?')?'Purchase':'Transfer']:{Id:`qbo-${created.length}`}})}
    throw new Error('Unexpected QuickBooks request.')
  }
  try{
    await syncPayoutQbo(db,{QBO_CLIENT_ID:'client',QBO_CLIENT_SECRET:'secret',QBO_ENVIRONMENT:'sandbox'},'po_fee')
    assert.equal(created.length,2)
    assert.equal(created[0].body.Line[0].Amount,1)
    assert.deepEqual(created[0].body.AccountRef,{value:'clearing'})
    assert.deepEqual(created[1].body.FromAccountRef,{value:'clearing'})
    assert.equal(sqlite.prepare("SELECT qbo_fee_purchase_id FROM stripe_payout_transactions WHERE balance_transaction_id='txn_refund'").get().qbo_fee_purchase_id,'qbo-1')
    await syncPayoutQbo(db,{QBO_CLIENT_ID:'client',QBO_CLIENT_SECRET:'secret',QBO_ENVIRONMENT:'sandbox'},'po_fee')
    assert.equal(created.length,2)
  }finally{globalThis.fetch=originalFetch}
})

test('confirmed Stripe refund reopens invoice and holds client work until super-admin release',async()=>{
  const {sqlite,requestAt}=fixture()
  sqlite.exec("UPDATE projects SET manager_user_id='2' WHERE id='p'; INSERT INTO invoices(id,project_id,client_id,invoice_number,source,status,issue_date,due_date,billing_name,project_reference,public_token) VALUES('refund-invoice','p','c','INV-REFUND','manual','paid','2026-10-10','2026-11-09','Client','P-1','refund-token'); INSERT INTO invoice_lines(id,invoice_id,kind,description,amount_cents) VALUES('refund-line','refund-invoice','manual','Work',5000); INSERT INTO invoice_payments(id,invoice_id,source,status,amount_cents,method,paid_at,stripe_payment_intent_id,stripe_charge_id) VALUES('refund-payment','refund-invoice','stripe','succeeded',5000,'card','2026-10-23T16:00:00Z','pi_refund','ch_refund');")
  const originalFetch=globalThis.fetch,timestamp=Math.floor(Date.now()/1000),secret='whsec_test'
  globalThis.fetch=async url=>String(url).includes('/refunds/')?Response.json({id:'re_1',payment_intent:'pi_refund',charge:'ch_refund',amount:5000,status:'succeeded',balance_transaction:'txn_refund',reason:'requested_by_customer'}):Response.json({messageId:'mail'})
  try{
    const payload={id:'evt_refund',type:'refund.updated',data:{object:{id:'re_1'}}},raw=JSON.stringify(payload),signature=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex')
    assert.equal((await requestAt('3','/webhooks/stripe','POST',payload,{STRIPE_WEBHOOK_SECRET:secret,STRIPE_SECRET_KEY:'sk_test'},{'Stripe-Signature':`t=${timestamp},v1=${signature}`})).status,200)
    assert.equal(sqlite.prepare("SELECT status FROM invoices WHERE id='refund-invoice'").get().status,'sent')
    assert.equal(sqlite.prepare("SELECT refunded_cents FROM invoice_payments WHERE id='refund-payment'").get().refunded_cents,5000)
    assert.equal((await requestAt('2','/invoices','POST',{projectId:'p',entryIds:[]})).status,409)
    assert.equal((await requestAt('2','/invoices/payments/holds/c/release','POST',{})).status,403)
    assert.equal((await requestAt('1','/invoices/payments/holds/c/release','POST',{})).status,200)
    assert.equal(sqlite.prepare("SELECT released_at IS NOT NULL AS released FROM client_payment_holds WHERE client_id='c'").get().released,1)
  }finally{globalThis.fetch=originalFetch}
})

test('checkout reuses the saved session and stops new attempts after submission',async()=>{
  const {sqlite,requestAt}=fixture()
  sqlite.exec("INSERT INTO invoices(id,project_id,client_id,invoice_number,source,status,issue_date,due_date,billing_name,project_reference,public_token) VALUES('checkout-invoice','p','c','INV-CHECKOUT','manual','sent','2026-10-10','2026-11-09','Client','P-1','checkout-token'); INSERT INTO invoice_lines(id,invoice_id,kind,description,amount_cents) VALUES('checkout-line','checkout-invoice','manual','Work',5000);")
  const originalFetch=globalThis.fetch;let created=0,status='open'
  globalThis.fetch=async(url,init)=>{
    if(String(url).endsWith('/checkout/sessions')&&init?.method==='POST'){created++;return Response.json({id:'cs_test',client_secret:'secret',expires_at:9999999999})}
    if(String(url).includes('/checkout/sessions/cs_test'))return Response.json({id:'cs_test',status,client_secret:'secret'})
    throw new Error('Unexpected Stripe request.')
  }
  try{
    const env={STRIPE_SECRET_KEY:'sk_test',STRIPE_PUBLISHABLE_KEY:'pk_test'}
    assert.equal((await requestAt('3','/invoices/public/checkout-token/checkout','POST',{},env)).status,200)
    assert.equal((await requestAt('3','/invoices/public/checkout-token/checkout','POST',{},env)).status,200)
    assert.equal(created,1)
    status='complete'
    assert.equal((await requestAt('3','/invoices/public/checkout-token/checkout','POST',{},env)).status,409)
    assert.equal(created,1)
  }finally{globalThis.fetch=originalFetch}
})

test('payout transaction lookup follows Stripe pagination',async()=>{
  const originalFetch=globalThis.fetch,requested=[]
  globalThis.fetch=async url=>{const after=new URL(String(url)).searchParams.get('starting_after');requested.push(after);return Response.json(after?{data:[{id:'txn_2',amount:200,fee:0,net:200,type:'charge',source:'ch_2',currency:'usd'}],has_more:false}:{data:[{id:'txn_1',amount:100,fee:0,net:100,type:'charge',source:'ch_1',currency:'usd'}],has_more:true})}
  try{assert.deepEqual((await payoutTransactions({STRIPE_SECRET_KEY:'sk_test'},'po_1')).map(row=>row.id),['txn_1','txn_2']);assert.deepEqual(requested,[null,'txn_1'])}finally{globalThis.fetch=originalFetch}
})

test('reviewed partial refund corrects the linked QBO payment once',async()=>{
  const {sqlite,db}=fixture()
  sqlite.exec("INSERT INTO qbo_connection(id,realm_id,environment,access_token,refresh_token,token_expires_at,connected_at,updated_at) VALUES(1,'realm','sandbox','token','refresh','2099-01-01T00:00:00Z',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP); INSERT INTO invoices(id,project_id,client_id,invoice_number,source,status,issue_date,due_date,billing_name,project_reference,public_token,qbo_invoice_id) VALUES('correct-invoice','p','c','INV-CORRECT','manual','sent','2026-10-10','2026-11-09','Client','P-1','correct-token','qbo-invoice'); INSERT INTO invoice_payments(id,invoice_id,source,status,amount_cents,method,paid_at,qbo_payment_id,qbo_posted_amount_cents,refunded_cents) VALUES('correct-payment','correct-invoice','stripe','succeeded',5000,'Stripe','2026-10-23T16:00:00Z','qbo-payment',5000,2000);")
  const originalFetch=globalThis.fetch,posted=[]
  globalThis.fetch=async(url,init)=>{
    if(String(url).includes('/payment/qbo-payment?'))return Response.json({Payment:{Id:'qbo-payment',SyncToken:'3',TotalAmt:50}})
    if(String(url).includes('/payment?operation=update')){posted.push(JSON.parse(init.body));return Response.json({Payment:{Id:'qbo-payment'}})}
    throw new Error('Unexpected QuickBooks request.')
  }
  try{
    await correctPaymentQbo(db,{QBO_CLIENT_ID:'client',QBO_CLIENT_SECRET:'secret',QBO_ENVIRONMENT:'sandbox'},'correct-payment')
    assert.equal(posted.length,1)
    assert.equal(posted[0].TotalAmt,30)
    assert.equal(posted[0].Line[0].LinkedTxn[0].TxnId,'qbo-invoice')
    await correctPaymentQbo(db,{QBO_CLIENT_ID:'client',QBO_CLIENT_SECRET:'secret',QBO_ENVIRONMENT:'sandbox'},'correct-payment')
    assert.equal(posted.length,1)
  }finally{globalThis.fetch=originalFetch}
})

test('reviewed full refund voids the linked QBO payment once',async()=>{
  const {sqlite,db}=fixture()
  sqlite.exec("INSERT INTO qbo_connection(id,realm_id,environment,access_token,refresh_token,token_expires_at,connected_at,updated_at) VALUES(1,'realm','sandbox','token','refresh','2099-01-01T00:00:00Z',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP); INSERT INTO invoices(id,project_id,client_id,invoice_number,source,status,issue_date,due_date,billing_name,project_reference,public_token,qbo_invoice_id) VALUES('void-invoice','p','c','INV-VOID','manual','sent','2026-10-10','2026-11-09','Client','P-1','void-token','qbo-invoice'); INSERT INTO invoice_payments(id,invoice_id,source,status,amount_cents,method,paid_at,qbo_payment_id,qbo_posted_amount_cents,refunded_cents) VALUES('void-payment','void-invoice','stripe','succeeded',5000,'Stripe','2026-10-23T16:00:00Z','qbo-payment',5000,5000);")
  const originalFetch=globalThis.fetch,posted=[]
  globalThis.fetch=async(url,init)=>{
    if(String(url).includes('/payment/qbo-payment?'))return Response.json({Payment:{Id:'qbo-payment',SyncToken:'3',TotalAmt:50}})
    if(String(url).includes('/payment?operation=update&include=void')){posted.push(JSON.parse(init.body));return Response.json({Payment:{Id:'qbo-payment',TotalAmt:0}})}
    throw new Error('Unexpected QuickBooks request.')
  }
  try{
    await correctPaymentQbo(db,{QBO_CLIENT_ID:'client',QBO_CLIENT_SECRET:'secret',QBO_ENVIRONMENT:'sandbox'},'void-payment')
    assert.deepEqual(posted,[{Id:'qbo-payment',SyncToken:'3',sparse:true}])
    assert.equal(sqlite.prepare("SELECT qbo_posted_amount_cents FROM invoice_payments WHERE id='void-payment'").get().qbo_posted_amount_cents,0)
    await correctPaymentQbo(db,{QBO_CLIENT_ID:'client',QBO_CLIENT_SECRET:'secret',QBO_ENVIRONMENT:'sandbox'},'void-payment')
    assert.equal(posted.length,1)
  }finally{globalThis.fetch=originalFetch}
})

test('a won dispute restores D1 credit without silently releasing the client hold',async()=>{
  const {sqlite,requestAt}=fixture()
  sqlite.exec("INSERT INTO invoices(id,project_id,client_id,invoice_number,source,status,issue_date,due_date,billing_name,project_reference,public_token) VALUES('dispute-invoice','p','c','INV-DISPUTE','manual','paid','2026-10-10','2026-11-09','Client','P-1','dispute-token'); INSERT INTO invoice_lines(id,invoice_id,kind,description,amount_cents) VALUES('dispute-line','dispute-invoice','manual','Work',5000); INSERT INTO invoice_payments(id,invoice_id,source,status,amount_cents,method,paid_at,stripe_payment_intent_id,stripe_charge_id) VALUES('dispute-payment','dispute-invoice','stripe','succeeded',5000,'card','2026-10-23T16:00:00Z','pi_dispute','ch_dispute');")
  const originalFetch=globalThis.fetch,secret='whsec_test',timestamp=Math.floor(Date.now()/1000);let disputeStatus='needs_response'
  globalThis.fetch=async url=>String(url).includes('/disputes/')?Response.json({id:'dp_1',charge:'ch_dispute',amount:5000,status:disputeStatus,reason:'fraudulent',balance_transactions:['txn_dispute']}):Response.json({messageId:'mail'})
  try{
    async function deliver(eventId,type){const payload={id:eventId,type,data:{object:{id:'dp_1'}}},raw=JSON.stringify(payload),signature=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex');return requestAt('3','/webhooks/stripe','POST',payload,{STRIPE_WEBHOOK_SECRET:secret,STRIPE_SECRET_KEY:'sk_test'},{'Stripe-Signature':`t=${timestamp},v1=${signature}`})}
    assert.equal((await deliver('evt_dispute_open','charge.dispute.created')).status,200)
    assert.equal(sqlite.prepare("SELECT status FROM invoices WHERE id='dispute-invoice'").get().status,'sent')
    disputeStatus='won'
    assert.equal((await deliver('evt_dispute_won','charge.dispute.closed')).status,200)
    assert.equal(sqlite.prepare("SELECT status FROM invoices WHERE id='dispute-invoice'").get().status,'paid')
    assert.equal(sqlite.prepare("SELECT disputed_cents FROM invoice_payments WHERE id='dispute-payment'").get().disputed_cents,0)
    assert.equal(sqlite.prepare("SELECT released_at FROM client_payment_holds WHERE client_id='c'").get().released_at,null)
  }finally{globalThis.fetch=originalFetch}
})

test('finance notices follow active role permissions and failed delivery can retry',async()=>{
  const {sqlite,db}=fixture()
  sqlite.exec("INSERT INTO roles(id,name,permissions) VALUES('finance','finance','[\"finance.emails\"]'),('sensitive','sensitive','[\"finance.emails.sensitive\"]'); INSERT INTO user_roles(user_id,role_id) VALUES('2','finance'),('4','sensitive');")
  const originalFetch=globalThis.fetch,sent=[];let failFinance=true
  globalThis.fetch=async(_url,init)=>{const payload=JSON.parse(init.body),email=payload.to[0].email;assert.match(payload.htmlContent,/<table role="presentation"/);assert.ok(payload.textContent);sent.push(email);if(email==='manager@example.com'&&failFinance)return new Response('',{status:503});return Response.json({messageId:'mail'})}
  try{
    const env={DB:db,BREVO_API_KEY:'test',BREVO_SENDER_EMAIL:'sender@example.com'}
    await paymentNotice(env,'finance-event','Finance notice','Payment processing',{tier:'finance'})
    assert.deepEqual(sent.sort(),['manager@example.com','nwhite@whitepointsurvey.com'])
    assert.equal(sqlite.prepare("SELECT status FROM payment_notice_deliveries WHERE recipient_email='manager@example.com'").get().status,'failed')
    failFinance=false
    assert.equal(await retryFailedPaymentNotices(env),1)
    assert.equal(sqlite.prepare("SELECT status FROM payment_notice_deliveries WHERE recipient_email='manager@example.com'").get().status,'accepted')
    sent.length=0
    await paymentNotice(env,'sensitive-event','Sensitive notice','Refund',{tier:'sensitive'})
    assert.deepEqual(sent.sort(),['leader@example.com','nwhite@whitepointsurvey.com'])
  }finally{globalThis.fetch=originalFetch}
})

test('unmatched payout transaction blocks QuickBooks posting',async()=>{
  const {sqlite,requestAt}=fixture()
  const originalFetch=globalThis.fetch,secret='whsec_test',timestamp=Math.floor(Date.now()/1000)
  globalThis.fetch=async url=>String(url).includes('/payouts/po_unmatched')?Response.json({id:'po_unmatched',amount:900,currency:'usd',automatic:true,status:'paid',reconciliation_status:'completed'}):String(url).includes('/balance_transactions')?Response.json({data:[{id:'txn_unmatched',amount:1000,fee:100,net:900,currency:'usd',type:'charge',source:'ch_unknown'}],has_more:false}):Response.json({messageId:'mail'})
  try{
    const payload={id:'evt_unmatched',type:'payout.reconciliation_completed',data:{object:{id:'po_unmatched'}}},raw=JSON.stringify(payload),signature=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex')
    assert.equal((await requestAt('3','/webhooks/stripe','POST',payload,{STRIPE_WEBHOOK_SECRET:secret,STRIPE_SECRET_KEY:'sk_test'},{'Stripe-Signature':`t=${timestamp},v1=${signature}`})).status,200)
    const payout=sqlite.prepare("SELECT review_error,qbo_transfer_id FROM stripe_payouts WHERE id='po_unmatched'").get()
    assert.match(payout.review_error,/no matching invoice payment/)
    assert.equal(payout.qbo_transfer_id,null)
  }finally{globalThis.fetch=originalFetch}
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
  const weekSummary=sqlite.prepare('SELECT count(*) AS entry_count,sum(e.hours) AS total_hours FROM user_timesheet_entries e JOIN user_timesheets w ON w.id=e.timesheet_id WHERE w.user_id=? AND w.week_start=?').get('3',start)
  assert.equal(weekSummary.entry_count,2)
  assert.equal(weekSummary.total_hours,4.5)
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
  assert.equal(draft.body.items[0].employeeName,'Sam Staff')
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
    assert.equal(result.body.status,'rejected')
    assert.equal(result.body.rejectionReason,'Add the missing field notes')
    assert.match(email?.textContent||'',/Add the missing field notes/)
  }finally{globalThis.fetch=originalFetch}
})

test('weekly rosters include the reporting tree and reserve all-staff access for global viewers',async()=>{
  const {sqlite,request}=fixture(),start='2026-10-19'
  sqlite.exec("INSERT INTO users(id,email,first_name,last_name,manager_user_id) VALUES('5','child@example.com','Alex','Child','3'),('6','zeta@example.com','Zoe','Alpha','2'),('7','amy@example.com','Amy','Alpha','2'),('8','inactive@example.com','Inactive','Person','2'); UPDATE users SET active=0 WHERE id='8'; INSERT INTO user_timesheets(id,user_id,week_start,status) VALUES('submitted-3','3','2026-10-19','submitted'),('rejected-5','5','2026-10-19','rejected'),('approved-7','7','2026-10-19','approved')")
  const team=await request('2',`/roster?weekStart=${start}`)
  assert.equal(team.status,200)
  assert.deepEqual(team.body.items.map(item=>item.userId),['7','6','5','2','3'])
  assert.deepEqual(team.body.items.map(item=>item.status),['approved','draft','rejected','draft','submitted'])
  assert.equal(team.body.items.find(item=>item.userId==='6').hasWeek,false)
  assert.equal((await request('3',`/weeks/${start}?userId=5`)).status,200)
  assert.equal((await request('3',`/weeks/${start}?userId=2`)).status,403)
  assert.equal((await request('2',`/roster?weekStart=${start}&scope=all`)).status,403)
  const all=await request('1',`/roster?weekStart=${start}&scope=all`)
  assert.equal(all.status,200)
  assert.ok(all.body.items.some(item=>item.userId==='4'))
  assert.ok(!all.body.items.some(item=>item.userId==='8'))
  assert.equal((await request('1','/roster?weekStart=2026-10-20')).status,400)
})

test('staff display names are computed from name parts without a stored display_name column',()=>{
  const {sqlite}=fixture()
  assert.equal(sqlite.prepare('PRAGMA table_info(users)').all().some(column=>column.name==='display_name'),false)
  sqlite.exec("UPDATE users SET middle_name='A.',suffix='Jr.' WHERE id='3'")
  assert.equal(sqlite.prepare("SELECT display_name FROM users_named WHERE id='3'").get().display_name,'Sam A. Staff Jr.')
  sqlite.exec("UPDATE users SET middle_name='',suffix='' WHERE id='3'")
  assert.equal(sqlite.prepare("SELECT display_name FROM users_named WHERE id='3'").get().display_name,'Sam Staff')
})


test('team modification is confined to draft and rejected descendant entries',async()=>{
  const {sqlite,request}=fixture(),start='2026-10-19',entry={projectId:'p',taskId:'t',entryDate:'2026-10-20',hours:1,note:'Field work',revision:1}
  sqlite.exec("INSERT INTO users(id,email,first_name,last_name,manager_user_id) VALUES('5','child@example.com','Casey','Child','3')")
  assert.equal((await request('4',`/weeks/${start}/entries/e1?userId=3`,'PUT',entry)).status,403)
  assert.equal((await request('3',`/weeks/${start}/entries/e1?userId=2`,'PUT',entry)).status,403)
  const added=await request('2',`/weeks/${start}/entries/e1?userId=3`,'PUT',entry)
  assert.equal(added.status,200)
  assert.equal(added.body.userId,'3')
  assert.equal(sqlite.prepare("SELECT actor_id FROM timesheet_audit WHERE action='entry-added' AND entry_id='e1'").get().actor_id,'2')
  assert.equal((await request('2',`/weeks/${start}/entries/e2?userId=5`,'PUT',entry)).status,200)
  assert.equal((await request('2',`/weeks/${start}/entries/e1?userId=3`,'DELETE')).status,200)
  const submitted=await request('2',`/weeks/${start}/submit?userId=3`,'POST')
  assert.equal(submitted.status,200)
  assert.equal(submitted.body.userId,'3')
  assert.equal(sqlite.prepare("SELECT actor_id FROM timesheet_audit WHERE action='submitted' AND timesheet_id=(SELECT id FROM user_timesheets WHERE user_id='3' AND week_start=?)").get(start).actor_id,'2')
  assert.equal((await request('2',`/weeks/${start}/entries/locked?userId=3`,'PUT',entry)).status,409)
  const originalFetch=globalThis.fetch
  globalThis.fetch=async()=>({ok:true})
  try{
    const rejected=await request('2',`/weeks/${start}/reject?userId=3`,'POST',{reason:'Correct the project'})
    assert.equal(rejected.body.status,'rejected')
    assert.equal((await request('2',`/roster?weekStart=${start}`)).body.items.find(item=>item.userId==='3').status,'rejected')
    assert.equal((await request('2',`/weeks/${start}/entries/corrected?userId=3`,'PUT',{...entry,revision:rejected.body.revision})).status,200)
    assert.equal((await request('3',`/weeks/${start}`)).body.status,'rejected')
    const resubmitted=await request('2',`/weeks/${start}/submit?userId=3`,'POST')
    assert.equal(resubmitted.body.status,'submitted')
    assert.equal(resubmitted.body.userId,'3')
    assert.equal(sqlite.prepare("SELECT cost_rate_cents FROM user_timesheet_entries WHERE id='corrected'").get().cost_rate_cents,4000)
    assert.equal(resubmitted.body.rejectionReason,null)
    assert.equal((await request('2',`/weeks/${start}/approve?userId=3`,'POST')).body.status,'approved')
    assert.equal((await request('2',`/weeks/${start}/entries/locked?userId=3`,'PUT',{...entry,revision:resubmitted.body.revision+1})).status,409)
  }finally{globalThis.fetch=originalFetch}
})

test('team submission is limited to the reporting chain and super administrators',async()=>{
  const {sqlite,request}=fixture(),start='2026-10-19'
  sqlite.exec("INSERT INTO users(id,email,first_name,last_name,manager_user_id) VALUES('5','child@example.com','Casey','Child','3')")
  assert.equal((await request('2',`/weeks/${start}?userId=3`)).body.canSubmit,true)
  assert.equal((await request('2',`/weeks/${start}?userId=5`)).body.canSubmit,true)
  assert.equal((await request('3',`/weeks/${start}?userId=5`)).body.canSubmit,false)
  assert.equal((await request('1',`/weeks/${start}?userId=4`)).body.canSubmit,true)
  assert.equal((await request('4',`/weeks/${start}/submit?userId=3`,'POST')).status,403)
  assert.equal((await request('3',`/weeks/${start}/submit?userId=5`,'POST')).status,403)
  assert.equal((await request('2',`/weeks/${start}/submit?userId=4`,'POST')).status,403)
  assert.equal((await request('2',`/weeks/${start}/submit?userId=5`,'POST')).body.userId,'5')
  assert.equal((await request('1',`/weeks/${start}/submit?userId=4`,'POST')).body.userId,'4')
  assert.equal((await request('4',`/weeks/${start}/submit`,'POST')).status,409)
  sqlite.exec("INSERT INTO user_timesheets(id,user_id,week_start,status) VALUES('pending-3','3','2026-10-19','submitted')")
  assert.equal((await request('4',`/weeks/${start}/approve?userId=3`,'POST')).status,403)
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
  sqlite.exec("UPDATE projects SET qbo_customer_id='customer-1' WHERE id='p'; INSERT INTO qbo_connection(id,realm_id,environment,access_token,refresh_token,token_expires_at,connected_at,updated_at,default_deposit_account_id,stripe_clearing_account_id) VALUES(1,'realm','sandbox','token','refresh','2099-01-01T00:00:00Z',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'deposit-1','clearing-1'); INSERT INTO invoices(id,project_id,client_id,invoice_number,source,status,issue_date,due_date,billing_name,project_reference,public_token,qbo_invoice_id) VALUES('stripe-qbo-invoice','p','c','INV-STRIPE','manual','paid','2026-10-10','2026-11-09','Client','P-1','stripe-qbo-token','qbo-invoice'); INSERT INTO stripe_payouts(id,amount_cents,currency,paid,reconciled,status) VALUES('po_test',113000,'usd',1,1,'paid'); INSERT INTO invoice_payments(id,invoice_id,source,status,amount_cents,method,paid_at,stripe_payment_intent_id,stripe_payout_id) VALUES('stripe-qbo-payment','stripe-qbo-invoice','stripe','succeeded',114000,'Stripe','2026-10-23T16:00:00Z','pi_test_123','po_test');")
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
    assert.deepEqual(body.DepositToAccountRef,{value:'clearing-1'})
    assert.deepEqual(body.Line,[{Amount:1140,LinkedTxn:[{TxnId:'qbo-invoice',TxnType:'Invoice'}]}])
    assert.match(body.PrivateNote,/pi_test_123/)
  }finally{globalThis.fetch=originalFetch}
})

test('invalid invoice issue dates return validation errors', async () => {
  const { requestAt } = fixture()
  const response = await requestAt('1', '/invoices', 'POST', { projectId: 'p', issueDate: '2026-13-99' })
  assert.equal(response.status, 400)
  assert.match(response.body.error, /valid issue date/)
})
