import { createInvoicePaymentsApi } from './invoicePaymentsApi.ts'
import { Hono } from 'hono'
import type { InvoiceLine } from '@whitepoint/types'
import { invoiceDueDate, INVOICE_TERMS, type InvoiceTerm } from '@whitepoint/utils/invoice-terms'
import { allocateInvoiceDecision } from '@whitepoint/utils/invoice-allocation'
import { createInvoiceDraft, eligibleEntries, event, guard, invoiceDetail, invoiceList, projectInvoiceContacts, publicInvoice, refreshPaid, reserveInvoiceEntries, unguard } from '../services/invoiceData.ts'
import { syncInvoiceQbo, syncPaymentQbo } from '../services/invoiceQbo.ts'
import { companyLogoResponse } from '../services/companyBranding.ts'
import { sendEmail } from '../services/brevo.ts'
import { clientInvoiceEmail } from '../emails/invoice.ts'
import { base64Bytes, buildInvoicePacket, storedInvoicePacket } from '../services/invoicePacket.ts'
import { clientOnHold, projectOnHold } from '../services/paymentHold.ts'
import { stripeGet, stripePost } from '../services/stripeApi.ts'
import { syncPayoutQbo } from '../services/invoiceQbo.ts'
import { paymentNotice } from '../services/paymentNotices.ts'
import type { ApiContext, HonoEnv } from '../types/apiTypes'

const actor=(c:ApiContext)=>c.get('auth').internalUserId || ''
const has=(c:ApiContext,key:string)=>c.get('permissions').hasPermission(key)
const text=(v:unknown,max=1000)=>typeof v==='string'?v.trim().slice(0,max):''
const cents=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0?Number(v):null
const date = (value: unknown): string | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value ? null : value
}
const uid=()=>crypto.randomUUID()
async function projectAccess(c:ApiContext,projectId:string,permission:string){
  const row=await c.env.DB.prepare('SELECT manager_user_id FROM projects WHERE id=? AND archived_at IS NULL').bind(projectId).first<{manager_user_id:string|null}>()
  return Boolean(row&&(has(c,permission)||row.manager_user_id===actor(c)))
}
async function invoiceAccess(c:ApiContext,invoiceId:string,permission:string){
  const row=await c.env.DB.prepare('SELECT project_id FROM invoices WHERE id=?').bind(invoiceId).first<{project_id:string}>()
  return Boolean(row&&await projectAccess(c,row.project_id,permission))
}
async function notifyClient(c:ApiContext,invoiceId:string){
  const invoice=await invoiceDetail(c.env.DB,invoiceId,actor(c),true)
  if(!invoice)throw new Error('Invoice not found.')
  const selected=[...new Map(invoice.recipients.filter(x=>x.selected&&x.email).map(x=>[x.email.toLowerCase(),x])).values()]
  if(!selected.length)throw new Error('Select at least one project contact with an email.')
  const recipients=selected.filter(x=>x.deliveryStatus!=='accepted')
  const packet=await c.env.RECORD_DOCUMENTS.get(`invoices/${invoiceId}/packet.pdf`)
  if(!packet)throw new Error('Invoice packet is missing.')
  const attachment={name:`${invoice.invoiceNumber.replace(/[^a-z0-9_-]/gi,'_')}.pdf`,content:base64Bytes(new Uint8Array(await packet.arrayBuffer()))}
  const url=`${c.env.PAYMENT_APP_URL||'https://payment.whitepointsurvey.com'}/pay/${encodeURIComponent(invoice.publicToken)}`
  let failed=false
  for(const recipient of recipients){
    const notification=uid()
    await c.env.DB.prepare("INSERT INTO invoice_notifications(id,invoice_id,kind,status,recipient_email,contact_id) VALUES(?,?,'client','pending',?,?) ON CONFLICT(invoice_id,kind,recipient_email) DO UPDATE SET id=excluded.id,status='pending',contact_id=excluded.contact_id,error=NULL,updated_at=CURRENT_TIMESTAMP").bind(notification,invoiceId,recipient.email,recipient.contactId).run()
    try{
      await sendEmail(c.env,{to:[{email:recipient.email,name:recipient.name}],subject:`Invoice ${invoice.invoiceNumber} from White Point Survey`,...clientInvoiceEmail(invoice.invoiceNumber,invoice.projectReference,invoice.balanceCents,url),attachments:[attachment]})
      await c.env.DB.prepare("UPDATE invoice_notifications SET status='accepted',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(notification).run()
    }catch(error){failed=true;await c.env.DB.prepare("UPDATE invoice_notifications SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(String(error instanceof Error?error.message:error).slice(0,1000),notification).run()}
  }
  await c.env.DB.prepare('UPDATE invoices SET email_status=?,email_error=? WHERE id=?').bind(failed?'failed':'accepted',failed?'One or more recipient deliveries failed.':null,invoiceId).run()
}
async function issueInvoice(c:ApiContext,invoiceId:string,invoice:NonNullable<Awaited<ReturnType<typeof invoiceDetail>>>){
  if(invoice.totalCents<=0)return 'A positive invoice total is required.'
  if(invoice.reviewTasks.some(t=>t.billingType==='fixed-fee'&&t.currentBilledHours>0&&t.currentAmountCents<=0))return 'Set an amount for every fixed fee task with billed hours.'
  const poRows=(await c.env.DB.prepare('SELECT id,name,r2_key FROM project_po_documents WHERE project_id=? AND archived_at IS NULL ORDER BY created_at,id').bind(invoice.projectId).all<{id:string;name:string;r2_key:string}>()).results||[]
  const project=await c.env.DB.prepare('SELECT po_number FROM projects WHERE id=?').bind(invoice.projectId).first<{po_number:string}>()
  const packet=await buildInvoicePacket(c.env,{...invoice,poNumber:project?.po_number||''},poRows.map(row=>row.r2_key))
  const key=`invoices/${invoiceId}/packet.pdf`
  await c.env.RECORD_DOCUMENTS.put(key,packet,{httpMetadata:{contentType:'application/pdf'}})
  try{
    const statements:D1PreparedStatement[]=[c.env.DB.prepare("UPDATE invoices SET status='sent',sent_at=CURRENT_TIMESTAMP,po_number=(SELECT po_number FROM projects WHERE id=?),revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='draft' AND revision=?").bind(invoice.projectId,invoiceId,invoice.revision)]
    for(const row of poRows)statements.push(c.env.DB.prepare('INSERT INTO invoice_po_documents(invoice_id,project_document_id,name_snapshot,r2_key_snapshot) VALUES(?,?,?,?)').bind(invoiceId,row.id,row.name,row.r2_key))
    const token=uid();statements.push(guard(c.env.DB,token),event(c.env.DB,invoiceId,actor(c),'sent'),unguard(c.env.DB,token))
    await c.env.DB.batch(statements)
  }catch(error){await c.env.RECORD_DOCUMENTS.delete(key);throw error}
  return null
}
export function createInvoicesApi(){
  const api=new Hono<HonoEnv>()
  api.route('/payments', createInvoicePaymentsApi())
  api.get('/',async c=>{
    const broad=has(c,'invoices.view')
    return c.json({items:await invoiceList(c.env.DB,actor(c),broad)})
  })
  api.get('/projects',async c=>{
    const rows=(await c.env.DB.prepare('SELECT p.id,p.project_number,p.name,c.name AS client_name FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.archived_at IS NULL AND (?=1 OR p.manager_user_id=?) ORDER BY c.name COLLATE NOCASE,p.project_number').bind(Number(has(c,'invoices.create')),actor(c)).all()).results||[]
    return c.json({items:rows})
  })
  api.get('/pool',async c=>{
    const projectId=c.req.query('projectId')||''
    if(!projectId||!(await projectAccess(c,projectId,'invoices.create')||await projectAccess(c,projectId,'invoices.manage')))return c.json({error:'Forbidden'},403)
    const rows=await eligibleEntries(c.env.DB,projectId)
    return c.json({items:rows.map(r=>({entryId:r.id,taskId:r.project_task_id,taskName:r.task_name,employeeName:r.employee_name,entryDate:r.entry_date,hours:r.hours,chargeCents:r.charge_cents,billingType:r.billing_type,note:r.note}))})
  })
  api.get('/public/:token',async c=>{
    const row=await c.env.DB.prepare("SELECT id FROM invoices WHERE public_token=? AND status IN ('sent','paid')").bind(c.req.param('token')).first<{id:string}>()
    if(!row)return c.json({error:'Invoice not found.'},404)
    const invoice=await invoiceDetail(c.env.DB,row.id)
    return invoice?c.json({invoice:publicInvoice(invoice,c.req.param('token'))}):c.json({error:'Invoice not found.'},404)
  })
  api.get('/public/:token/packet',async c=>{
    const row=await c.env.DB.prepare("SELECT id,invoice_number,status FROM invoices WHERE public_token=? AND status IN ('sent','paid')").bind(c.req.param('token')).first<{id:string;invoice_number:string;status:'sent'|'paid'}>()
    if(!row)return c.notFound()
    const packet=await storedInvoicePacket(c.env,row.id,row.status)
    return packet?new Response(packet,{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(row.invoice_number+'.pdf')}`,'Cache-Control':'private, no-store'}}):c.notFound()
  })
  api.get('/public/:token/logo',async c=>{
    const row=await c.env.DB.prepare("SELECT id FROM invoices WHERE public_token=? AND status IN ('sent','paid')").bind(c.req.param('token')).first<{id:string}>()
    if(!row)return c.notFound()
    return await companyLogoResponse(c.env) || c.notFound()
  })
  api.post('/public/:token/checkout',async c=>{
    const row=await c.env.DB.prepare("SELECT id FROM invoices WHERE public_token=? AND status='sent'").bind(c.req.param('token')).first<{id:string}>()
    if(!row)return c.json({error:'Invoice is not payable.'},404)
    const invoice=await invoiceDetail(c.env.DB,row.id)
    if(!invoice||invoice.balanceCents<=0)return c.json({error:'Invoice is already paid.'},409)
    if(!c.env.STRIPE_SECRET_KEY?.startsWith('sk_')||!c.env.STRIPE_PUBLISHABLE_KEY?.startsWith('pk_'))return c.json({error:'Stripe is not configured.'},503)
    const open=await c.env.DB.prepare("SELECT id,amount_cents FROM stripe_checkout_sessions WHERE invoice_id=? AND status='open'").bind(invoice.id).first<{id:string;amount_cents:number}>()
    if(open){
      let active:{id:string;status:string;client_secret?:string}
      try{active=await stripeGet(c.env,`checkout/sessions/${encodeURIComponent(open.id)}`)}catch{return c.json({error:'Could not verify the existing Stripe checkout. Retry shortly.'},502)}
      if(active?.status==='open'&&open.amount_cents===invoice.balanceCents&&active.client_secret)return c.json({clientSecret:active.client_secret,checkoutSessionId:open.id,publishableKey:c.env.STRIPE_PUBLISHABLE_KEY})
      if(active?.status==='complete')return c.json({error:'Your submitted payment is awaiting confirmation. Refresh the invoice before trying again.'},409)
      if(active?.status==='open')try{await stripePost(c.env,`checkout/sessions/${encodeURIComponent(open.id)}/expire`,new URLSearchParams())}catch{return c.json({error:'Could not expire the previous checkout. Retry shortly.'},502)}
      await c.env.DB.prepare("UPDATE stripe_checkout_sessions SET status='expired' WHERE id=?").bind(open.id).run()
    }
    const params=new URLSearchParams()
    params.set('mode','payment');params.set('ui_mode','custom');params.set('return_url',`${c.env.PAYMENT_APP_URL||'https://payment.whitepointsurvey.com'}/pay/${encodeURIComponent(c.req.param('token'))}?payment=return&session_id={CHECKOUT_SESSION_ID}`)
    params.set('client_reference_id',invoice.id);params.set('customer_email',invoice.billingEmail)
    params.set('line_items[0][quantity]','1');params.set('line_items[0][price_data][currency]','usd');params.set('line_items[0][price_data][unit_amount]',String(invoice.balanceCents));params.set('line_items[0][price_data][product_data][name]',`Invoice ${invoice.invoiceNumber}`)
    params.set('metadata[invoice_id]',invoice.id);params.set('payment_intent_data[metadata][invoice_id]',invoice.id)
    let result:{id?:string;client_secret?:string;expires_at?:number}
    try{result=await stripePost(c.env,'checkout/sessions',params)}catch(error){return c.json({error:String(error)},502)}
    if(!result.id||!result.client_secret)return c.json({error:'Stripe checkout failed.'},502)
    try{await c.env.DB.prepare('INSERT INTO stripe_checkout_sessions(id,invoice_id,amount_cents,expires_at) VALUES(?,?,?,?)').bind(result.id,invoice.id,invoice.balanceCents,result.expires_at||null).run()}
    catch{await stripePost(c.env,`checkout/sessions/${encodeURIComponent(result.id)}/expire`,new URLSearchParams()).catch(()=>null);return c.json({error:'A checkout is already active. Retry to use it.'},409)}
    return c.json({clientSecret:result.client_secret,checkoutSessionId:result.id,publishableKey:c.env.STRIPE_PUBLISHABLE_KEY})
  })
  api.post('/',async c=>{
    const body=await c.req.json<{projectId?:string;entryIds?:string[];issueDate?:string;paymentTerm?:InvoiceTerm}>().catch(()=>null)
    if(!body?.projectId||!await projectAccess(c,body.projectId,'invoices.create'))return c.json({error:'Forbidden'},403)
    if(await projectOnHold(c.env.DB,body.projectId))return c.json({error:'Client payment hold blocks new invoices.'},409)
    if(body.entryIds&&!Array.isArray(body.entryIds))return c.json({error:'Invalid entry IDs.'},400)
    if(body.issueDate&&!date(body.issueDate)||body.paymentTerm&&!INVOICE_TERMS.includes(body.paymentTerm))return c.json({error:'Use a valid issue date and payment term.'},400)
    try{const id=await createInvoiceDraft(c.env.DB,body.projectId,actor(c),{source:'manual',entryIds:body.entryIds||[],issueDate:body.issueDate,paymentTerm:body.paymentTerm});return c.json({invoice:await invoiceDetail(c.env.DB,id!,actor(c),has(c,'invoices.manage'))},201)}catch(error){return c.json({error:String(error instanceof Error?error.message:error)},409)}
  })
  api.get('/:id/logo',async c=>{
    if(!await invoiceAccess(c,c.req.param('id'),'invoices.view'))return c.notFound()
    return await companyLogoResponse(c.env) || c.notFound()
  })
  api.get('/:id/packet',async c=>{
    const invoiceId=c.req.param('id')
    if(!await invoiceAccess(c,invoiceId,'invoices.view'))return c.notFound()
    const invoice=await c.env.DB.prepare('SELECT status FROM invoices WHERE id=?').bind(invoiceId).first<{status:'draft'|'sent'|'paid'|'void'}>()
    if(!invoice)return c.notFound()
    const packet=await storedInvoicePacket(c.env,invoiceId,invoice.status)
    return packet?new Response(packet,{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline','Cache-Control':'private, no-store'}}):c.notFound()
  })
  api.get('/:id/po-documents/:documentId',async c=>{
    const invoiceId=c.req.param('id'),documentId=c.req.param('documentId')
    if(!await invoiceAccess(c,invoiceId,'invoices.view'))return c.notFound()
    const invoice=await c.env.DB.prepare('SELECT project_id,status FROM invoices WHERE id=?').bind(invoiceId).first<{project_id:string;status:string}>()
    const row=invoice?.status==='draft'
      ?await c.env.DB.prepare('SELECT r2_key FROM project_po_documents WHERE id=? AND project_id=? AND archived_at IS NULL').bind(documentId,invoice.project_id).first<{r2_key:string}>()
      :await c.env.DB.prepare('SELECT r2_key_snapshot AS r2_key FROM invoice_po_documents WHERE invoice_id=? AND project_document_id=?').bind(invoiceId,documentId).first<{r2_key:string}>()
    if(!row)return c.notFound()
    const object=await c.env.RECORD_DOCUMENTS.get(row.r2_key)
    return object?new Response(object.body,{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store'}}):c.notFound()
  })
  api.get('/:id',async c=>{
    if(!await invoiceAccess(c,c.req.param('id'),'invoices.view'))return c.json({error:'Invoice not found.'},404)
    const invoice=await invoiceDetail(c.env.DB,c.req.param('id'),actor(c),has(c,'invoices.manage'))
    return invoice?c.json({invoice}):c.json({error:'Invoice not found.'},404)
  })
  api.get('/:id/analysis',async c=>{
    const invoiceId=c.req.param('id')
    if(!await invoiceAccess(c,invoiceId,'invoices.view'))return c.notFound()
    const invoice=await c.env.DB.prepare('SELECT project_id FROM invoices WHERE id=?').bind(invoiceId).first<{project_id:string}>()
    if(!invoice)return c.notFound()
    const project=await c.env.DB.prepare('SELECT contract_price_cents FROM projects WHERE id=?').bind(invoice.project_id).first<{contract_price_cents:number}>()
    const rows=(await c.env.DB.prepare(`SELECT t.id AS task_id,COALESCE(t.task_name,'General project') AS task_name,COALESCE(t.contract_amount_cents,0) AS contract_cents,
      COALESCE((SELECT SUM(e.cost_cents) FROM user_timesheet_entries e JOIN user_timesheets w ON w.id=e.timesheet_id WHERE e.project_id=? AND e.project_task_id IS t.id AND w.status='approved'),0) AS approved_cost_cents,
      COALESCE((SELECT SUM(l.amount_cents) FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE i.project_id=? AND i.id<>? AND i.status IN ('sent','paid') AND l.project_task_id IS t.id),0) AS prior_invoiced_cents
      FROM (SELECT id,task_name,contract_amount_cents FROM project_tasks WHERE project_id=? UNION ALL SELECT NULL,'General project',0) t`).bind(invoice.project_id,invoice.project_id,invoiceId,invoice.project_id).all<{task_id:string|null;task_name:string;contract_cents:number;approved_cost_cents:number;prior_invoiced_cents:number}>()).results||[]
    const canSeeCost=has(c,'projects.view.financials')&&has(c,'timesheets.rates.view')
    return c.json({projectContractCents:has(c,'projects.view.financials')?project?.contract_price_cents||0:null,rows:rows.map(x=>({taskId:x.task_id,taskName:x.task_name,contractCents:x.contract_cents,approvedCostCents:canSeeCost?x.approved_cost_cents:null,priorInvoicedCents:x.prior_invoiced_cents}))})
  })
  api.post('/:id/entries',async c=>{
    const invoiceId=c.req.param('id')
    if(!await invoiceAccess(c,invoiceId,'invoices.manage'))return c.json({error:'Forbidden'},403)
    const current=await invoiceDetail(c.env.DB,invoiceId,actor(c),has(c,'invoices.manage'))
    if(!current||current.status!=='draft')return c.json({error:'Only draft invoices can add time.'},409)
    const body=await c.req.json<{revision:number;entryIds:string[]}>().catch(()=>null)
    if(!body||body.revision!==current.revision||!Array.isArray(body.entryIds)||!body.entryIds.length||body.entryIds.length>500||body.entryIds.some(id=>typeof id!=='string'||!id)||new Set(body.entryIds).size!==body.entryIds.length)return c.json({error:'Choose available time entries and reload if the draft changed.'},409)
    const all=await eligibleEntries(c.env.DB,current.projectId,current.source==='monthly'&&current.billingMonth?`${current.billingMonth}-01`:undefined)
    const selected=all.filter(entry=>body.entryIds.includes(String(entry.id)))
    if(selected.length!==body.entryIds.length)return c.json({error:'One or more time entries are no longer available.'},409)
    const reserved=await reserveInvoiceEntries(c.env.DB,invoiceId,selected)
    const token=uid(),write:D1PreparedStatement[]=[c.env.DB.prepare("UPDATE invoices SET revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND status='draft'").bind(actor(c),invoiceId,current.revision),guard(c.env.DB,token),...reserved.statements]
    let order=Math.max(-1,...current.lines.map(line=>line.sortOrder))+1
    for(const line of reserved.grouped.values()){
      const existing=current.lines.find(item=>item.projectTaskId===line.taskId&&item.kind===line.kind)
      if(existing){
        if(line.kind==='time')write.push(c.env.DB.prepare('UPDATE invoice_lines SET amount_cents=amount_cents+? WHERE id=? AND invoice_id=?').bind(line.amount,existing.id,invoiceId))
        else {
          const task=current.reviewTasks.find(item=>item.projectTaskId===line.taskId)
          const remaining=Math.max(0,(task?.contractAmountCents||0)-(task?.previouslyInvoicedCents||0))
          const oldSuggested=Math.min(remaining,task?.currentChargeCents||0)
          if(existing.amountCents===oldSuggested)write.push(c.env.DB.prepare('UPDATE invoice_lines SET amount_cents=? WHERE id=? AND invoice_id=?').bind(Math.min(remaining,oldSuggested+line.amount),existing.id,invoiceId))
        }
      }
      else write.push(c.env.DB.prepare('INSERT INTO invoice_lines(id,invoice_id,project_task_id,kind,description,amount_cents,sort_order) VALUES(?,?,?,?,?,?,?)').bind(uid(),invoiceId,line.taskId,line.kind,line.name,line.amount,order++))
    }
    write.push(event(c.env.DB,invoiceId,actor(c),'entries-added',{entryCount:selected.length}),unguard(c.env.DB,token))
    try{await c.env.DB.batch(write)}catch{return c.json({error:'Invoice or time entries changed. Reload and try again.'},409)}
    return c.json({invoice:await invoiceDetail(c.env.DB,invoiceId,actor(c),has(c,'invoices.manage'))})
  })
  api.put('/:id',async c=>{
    const invoiceId=c.req.param('id')
    if(!await invoiceAccess(c,invoiceId,'invoices.manage'))return c.json({error:'Forbidden'},403)
    const current=await invoiceDetail(c.env.DB,invoiceId,actor(c),has(c,'invoices.manage'))
    if(!current||current.status!=='draft')return c.json({error:'Only draft invoices can be edited.'},409)
    const body=await c.req.json<{revision:number;issueDate:string;paymentTerm:InvoiceTerm;includeHoursBreakdown:boolean;includeLineItemNotes:boolean;notes:string;internalNote:string;recipientIds:string[];allocations:Array<{entryId:string;disposition:'billed'|'hold'|'write-off'|'split';splitBasis?:'hours'|'charge';splitValue?:number;splitRemainder?:'hold'|'write-off';writeoffReason?:'advance'|'over-budget';writeoffExplanation?:string}>;lines:Array<Pick<InvoiceLine,'id'|'kind'|'description'|'amountCents'|'projectTaskId'>>}>().catch(()=>null)
    if(!body||body.revision!==current.revision||!date(body.issueDate)||!INVOICE_TERMS.includes(body.paymentTerm)||typeof body.includeHoursBreakdown!=='boolean'||typeof body.includeLineItemNotes!=='boolean'||!Array.isArray(body.recipientIds)||!Array.isArray(body.allocations)||!Array.isArray(body.lines))return c.json({error:'Invoice changed or the update is invalid. Reload before saving.'},409)
    if(body.allocations.length!==current.allocations.length||new Set(body.allocations.map(a=>a.entryId)).size!==current.allocations.length)return c.json({error:'Every source entry needs one decision.'},400)
    const availableContacts=await projectInvoiceContacts(c.env.DB,current.projectId)
    const selectedIds=new Set(body.recipientIds)
    if(selectedIds.size!==body.recipientIds.length||body.recipientIds.some(id=>!availableContacts.some(contact=>contact.contactId===id)))return c.json({error:'Select recipients assigned to this project.'},400)
    const statements:D1PreparedStatement[]=[],amounts=new Map<string,number>(),fixedCharges=new Map<string,number>(),fixedAmounts=new Map<string,number>()
    try{
      for(const choice of body.allocations){
        const source=current.allocations.find(a=>a.entryId===choice.entryId);if(!source)throw new Error('Unknown time entry.')
        const value=allocateInvoiceDecision(source.sourceHours,source.sourceChargeCents,choice.disposition,choice.splitBasis||null,choice.splitValue,choice.splitRemainder)
        const reason=value.writeoffHoursHundredths?choice.writeoffReason:null,explanation=value.writeoffHoursHundredths?text(choice.writeoffExplanation,1000):''
        if(value.writeoffHoursHundredths&&(!['advance','over-budget'].includes(reason||'')||!explanation))throw new Error('Explain and classify every written-off portion.')
        statements.push(c.env.DB.prepare('UPDATE invoice_entry_allocations SET disposition=?,split_basis=?,billed_hours_hundredths=?,writeoff_hours_hundredths=?,held_hours_hundredths=?,billed_charge_cents=?,writeoff_charge_cents=?,held_charge_cents=?,writeoff_reason=?,writeoff_explanation=? WHERE entry_id=? AND invoice_id=?').bind(value.disposition,value.splitBasis,value.billedHoursHundredths,value.writeoffHoursHundredths,value.heldHoursHundredths,value.billedChargeCents,value.writeoffChargeCents,value.heldChargeCents,reason,explanation,source.entryId,invoiceId))
        if(source.billingType==='fixed-fee')fixedCharges.set(source.projectTaskId||'',(fixedCharges.get(source.projectTaskId||'')||0)+value.billedChargeCents)
        else amounts.set(source.projectTaskId||'',(amounts.get(source.projectTaskId||'')||0)+value.billedChargeCents)
      }
      const retained=new Set(current.lines.filter(l=>l.kind==='fixed-fee').map(l=>l.id))
      if(new Set(body.lines.map(line=>line.id)).size!==body.lines.length)throw new Error('Invoice line IDs must be unique.')
      const sourceTime=new Set(current.lines.filter(l=>l.kind==='time').map(l=>l.id))
      for(const line of body.lines){
        if(line.kind==='time'){
          if(!sourceTime.has(line.id))throw new Error('Unknown time line.')
          continue
        }
        if(line.kind==='fixed-fee'&&!retained.has(line.id))throw new Error('Unknown fixed fee line.')
        if(line.kind!=='fixed-fee'&&line.kind!=='manual')throw new Error('Invalid line type.')
        if(!text(line.description,500)||cents(line.amountCents)===null)throw new Error('Line descriptions and amounts are required.')
      }
      if(body.lines.filter(l=>l.kind==='time').length!==sourceTime.size)throw new Error('Keep every time line.')
      for(const line of current.lines.filter(l=>l.kind==='fixed-fee'))if(!body.lines.some(x=>x.id===line.id))throw new Error('Keep every fixed fee task line.')
      for(const line of body.lines.filter(l=>l.kind==='fixed-fee')){
        const task=current.reviewTasks.find(item=>item.projectTaskId===line.projectTaskId)
        const remaining=Math.max(0,(task?.contractAmountCents||0)-(task?.previouslyInvoicedCents||0))
        const saved=current.lines.find(item=>item.id===line.id)
        const oldSuggested=Math.min(remaining,task?.currentChargeCents||0)
        fixedAmounts.set(line.id,line.amountCents===saved?.amountCents&&saved.amountCents===oldSuggested?Math.min(remaining,fixedCharges.get(line.projectTaskId||'')||0):line.amountCents)
      }
      const taskIds=new Set([...amounts.keys(),...current.lines.filter(l=>l.kind==='fixed-fee').map(l=>l.projectTaskId||'')].filter(Boolean))
      for(const taskId of taskIds){
        const task=await c.env.DB.prepare('SELECT bill_type,contract_amount_cents FROM project_tasks WHERE id=?').bind(taskId).first<{bill_type:string;contract_amount_cents:number}>()
        if(!task)throw new Error('Task not found.')
        const previous=await c.env.DB.prepare("SELECT COALESCE(SUM(l.amount_cents),0) AS total FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE l.project_task_id=? AND i.id<>? AND i.status<>'void'").bind(taskId,invoiceId).first<{total:number}>()
        const currentAmount=task.bill_type==='fixed-fee'?body.lines.filter(l=>l.kind==='fixed-fee'&&l.projectTaskId===taskId).reduce((sum,l)=>sum+(fixedAmounts.get(l.id)||0),0):amounts.get(taskId)||0
        if(['fixed-fee','time-and-materials-nte'].includes(task.bill_type)&&currentAmount>Math.max(0,task.contract_amount_cents-(previous?.total||0)))throw new Error(`Task ${taskId} exceeds its contract amount.`)
      }
    }catch(error){return c.json({error:String(error instanceof Error?error.message:error)},400)}
    const token=uid()
    const selected=availableContacts.filter(contact=>selectedIds.has(contact.contactId))
    const primary=selected.find(contact=>contact.isPrimary&&contact.email)||selected.find(contact=>contact.email)
    const update=c.env.DB.prepare('UPDATE invoices SET issue_date=?,due_date=?,payment_term=?,include_hours_breakdown=?,include_line_item_notes=?,notes=?,internal_note=?,billing_email=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND status=\'draft\'').bind(body.issueDate,invoiceDueDate(body.issueDate,body.paymentTerm),body.paymentTerm,Number(body.includeHoursBreakdown),Number(body.includeLineItemNotes),text(body.notes,4000),text(body.internalNote,4000),primary?.email||'',actor(c),invoiceId,current.revision)
    const write:D1PreparedStatement[]=[update,guard(c.env.DB,token),...statements]
    write.push(c.env.DB.prepare('DELETE FROM invoice_recipients WHERE invoice_id=?').bind(invoiceId))
    for(const recipient of availableContacts)write.push(c.env.DB.prepare('INSERT INTO invoice_recipients(invoice_id,contact_id,email_snapshot,name_snapshot,selected) VALUES(?,?,?,?,?)').bind(invoiceId,recipient.contactId,recipient.email,recipient.name,Number(selectedIds.has(recipient.contactId))))
    for(const line of current.lines.filter(l=>l.kind==='time'))write.push(c.env.DB.prepare('UPDATE invoice_lines SET amount_cents=? WHERE id=? AND invoice_id=?').bind(amounts.get(line.projectTaskId||'')||0,line.id,invoiceId))
    write.push(c.env.DB.prepare("DELETE FROM invoice_lines WHERE invoice_id=? AND kind='manual'").bind(invoiceId))
    for(const line of body.lines.filter(l=>l.kind==='fixed-fee'))write.push(c.env.DB.prepare("UPDATE invoice_lines SET description=?,amount_cents=? WHERE id=? AND invoice_id=? AND kind='fixed-fee'").bind(text(line.description,500),fixedAmounts.get(line.id)||0,line.id,invoiceId))
    let order=current.lines.length
    for(const line of body.lines.filter(l=>l.kind==='manual'))write.push(c.env.DB.prepare("INSERT INTO invoice_lines(id,invoice_id,kind,description,amount_cents,sort_order) VALUES(?,?,'manual',?,?,?)").bind(uid(),invoiceId,text(line.description,500),line.amountCents,order++))
    write.push(event(c.env.DB,invoiceId,actor(c),'draft-updated'),unguard(c.env.DB,token))
    try{await c.env.DB.batch(write)}catch{return c.json({error:'Invoice changed. Reload before saving.'},409)}
    return c.json({invoice:await invoiceDetail(c.env.DB,invoiceId,actor(c),has(c,'invoices.manage'))})
  })
  api.post('/:id/mark-sent',async c=>{
    const invoiceId=c.req.param('id')
    if(!await invoiceAccess(c,invoiceId,'invoices.manage'))return c.json({error:'Forbidden'},403)
    const invoice=await invoiceDetail(c.env.DB,invoiceId,actor(c),has(c,'invoices.manage'))
    if(!invoice||invoice.status!=='draft')return c.json({error:'Only a draft can be marked sent.'},409)
    if(await clientOnHold(c.env.DB,invoice.clientId))return c.json({error:'Client payment hold blocks invoice sending.'},409)
    try{const error=await issueInvoice(c,invoiceId,invoice);if(error)return c.json({error},400)}catch(error){return c.json({error:String(error instanceof Error?error.message:error)},409)}
    await syncInvoiceQbo(c.env.DB,c.env,invoiceId)
    return c.json({invoice:await invoiceDetail(c.env.DB,invoiceId,actor(c),has(c,'invoices.manage'))})
  })
  api.post('/:id/send',async c=>{
    const invoiceId=c.req.param('id')
    if(!await invoiceAccess(c,invoiceId,'invoices.manage'))return c.json({error:'Forbidden'},403)
    const invoice=await invoiceDetail(c.env.DB,invoiceId,actor(c),has(c,'invoices.manage'))
    if(!invoice||!['draft','sent'].includes(invoice.status))return c.json({error:'Invoice cannot be sent.'},409)
    if(await clientOnHold(c.env.DB,invoice.clientId))return c.json({error:'Client payment hold blocks invoice sending.'},409)
    if(invoice.status==='sent'&&invoice.emailStatus==='accepted')return c.json({error:'Invoice was already emailed.'},409)
    if(!invoice.recipients.some(recipient=>recipient.selected&&recipient.email))return c.json({error:'Select at least one project contact with an email.'},400)
    if(invoice.status==='draft')try{const error=await issueInvoice(c,invoiceId,invoice);if(error)return c.json({error},400)}catch(error){return c.json({error:String(error instanceof Error?error.message:error)},409)}
    await notifyClient(c,invoiceId)
    await syncInvoiceQbo(c.env.DB,c.env,invoiceId)
    return c.json({invoice:await invoiceDetail(c.env.DB,invoiceId,actor(c),has(c,'invoices.manage'))})
  })
  api.delete('/:id',async c=>{
    const invoiceId=c.req.param('id')
    if(!await invoiceAccess(c,invoiceId,'invoices.manage'))return c.json({error:'Forbidden'},403)
    const invoice=await invoiceDetail(c.env.DB,invoiceId,actor(c),true)
    if(!invoice||invoice.status!=='draft'||invoice.payments.length)return c.json({error:'Only a draft without payments can be deleted.'},409)
    const body=await c.req.json<{revision?:number}>().catch(()=>null)
    if(body?.revision!==invoice.revision)return c.json({error:'Invoice changed. Reload before deleting.'},409)
    const token=uid()
    try{
      await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM invoice_entry_allocations WHERE invoice_id=?').bind(invoiceId),
        c.env.DB.prepare('DELETE FROM invoice_lines WHERE invoice_id=?').bind(invoiceId),
        c.env.DB.prepare('DELETE FROM invoice_recipients WHERE invoice_id=?').bind(invoiceId),
        c.env.DB.prepare('DELETE FROM invoice_po_documents WHERE invoice_id=?').bind(invoiceId),
        c.env.DB.prepare('DELETE FROM invoice_notifications WHERE invoice_id=?').bind(invoiceId),
        c.env.DB.prepare('DELETE FROM invoice_events WHERE invoice_id=?').bind(invoiceId),
        c.env.DB.prepare("DELETE FROM invoices WHERE id=? AND status='draft' AND revision=?").bind(invoiceId,invoice.revision),
        guard(c.env.DB,token),
        c.env.DB.prepare("INSERT INTO audit_log(id,actor_id,record_type,record_id,action,before_json,after_json) VALUES(?,?,'invoice',?,'deleted',?,NULL)").bind(uid(),actor(c),invoiceId,JSON.stringify({invoiceNumber:invoice.invoiceNumber,projectId:invoice.projectId,source:invoice.source,billingMonth:invoice.billingMonth})),
        unguard(c.env.DB,token)
      ])
    }catch{return c.json({error:'Invoice changed. Reload before deleting.'},409)}
    return c.json({deleted:true})
  })
  api.post('/:id/payments',async c=>{
    if(!has(c,'invoices.manage'))return c.json({error:'Forbidden'},403)
    const invoiceId=c.req.param('id'),invoice=await invoiceDetail(c.env.DB,invoiceId,actor(c),true)
    if(!invoice||invoice.status!=='sent')return c.json({error:'Invoice is not open.'},409)
    const body=await c.req.json<{amountCents?:number;method?:string;referenceNumber?:string;paidAt?:string}>().catch(()=>null)
    const amount=cents(body?.amountCents),method=text(body?.method,80),reference=text(body?.referenceNumber,100)
    if(!amount||amount>invoice.balanceCents||!method||method.toLowerCase()==='check'&&!reference||body?.paidAt&&!date(body.paidAt))return c.json({error:'Enter a valid payment up to the remaining balance. Checks require a reference number.'},400)
    const paymentId=uid()
    await c.env.DB.batch([c.env.DB.prepare("INSERT INTO invoice_payments(id,invoice_id,source,status,amount_cents,method,reference_number,paid_at,created_by) VALUES(?,?,'manual','succeeded',?,?,?,?,?)").bind(paymentId,invoiceId,amount,method,reference||null,body?.paidAt||new Date().toISOString().slice(0,10),actor(c)),event(c.env.DB,invoiceId,actor(c),'payment-recorded',{paymentId,amount})])
    await refreshPaid(c.env.DB,invoiceId);await syncPaymentQbo(c.env.DB,c.env,paymentId)
    await paymentNotice(c.env,`manual-receipt:${paymentId}`,'Payment received',`We received your ${method} payment for invoice ${invoice.invoiceNumber}: $${(amount/100).toFixed(2)}. Reference: ${reference||'none'}.`,{invoiceId,customer:true})
    return c.json({invoice:await invoiceDetail(c.env.DB,invoiceId,actor(c),true)})
  })
  api.post('/:id/qbo/retry',async c=>{
    if(!has(c,'invoices.manage'))return c.json({error:'Forbidden'},403)
    const invoiceId=c.req.param('id');if(!await invoiceAccess(c,invoiceId,'invoices.manage'))return c.json({error:'Not found.'},404)
    const state=await c.env.DB.prepare('SELECT status FROM invoices WHERE id=?').bind(invoiceId).first<{status:string}>()
    if(!state||!['sent','paid'].includes(state.status))return c.json({error:'Only sent invoices can be synced.'},409)
    await syncInvoiceQbo(c.env.DB,c.env,invoiceId)
    const payments=(await c.env.DB.prepare("SELECT id,source,stripe_payout_id FROM invoice_payments WHERE invoice_id=? AND status='succeeded' AND qbo_payment_id IS NULL").bind(invoiceId).all<{id:string;source:string;stripe_payout_id:string|null}>()).results||[]
    for(const payment of payments)if(payment.source==='manual')await syncPaymentQbo(c.env.DB,c.env,payment.id);else if(payment.stripe_payout_id)await syncPayoutQbo(c.env.DB,c.env,payment.stripe_payout_id)
    return c.json({invoice:await invoiceDetail(c.env.DB,invoiceId,actor(c),true)})
  })
  return api
}
