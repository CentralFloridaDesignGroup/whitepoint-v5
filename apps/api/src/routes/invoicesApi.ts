import { Hono } from 'hono'
import type { InvoiceLine } from '@whitepoint/types'
import { allocateEntry } from '../services/invoiceCore.ts'
import { createInvoiceDraft, eligibleEntries, event, guard, invoiceDetail, invoiceList, publicInvoice, refreshPaid, reserveInvoiceEntries, unguard } from '../services/invoiceData.ts'
import { syncInvoiceQbo, syncPaymentQbo } from '../services/invoiceQbo.ts'
import { companyLogoResponse } from '../services/companyBranding.ts'
import { sendTimesheetEmail } from '../services/brevo.ts'
import type { ApiContext, HonoEnv } from '../types/apiTypes'

const actor=(c:ApiContext)=>c.get('auth').internalUserId || ''
const has=(c:ApiContext,key:string)=>c.get('permissions').hasPermission(key)
const text=(v:unknown,max=1000)=>typeof v==='string'?v.trim().slice(0,max):''
const cents=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0?Number(v):null
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v?v:null
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
  if(!invoice||!invoice.billingEmail)throw new Error('A billing email is required.')
  const notification=uid()
  await c.env.DB.prepare("INSERT INTO invoice_notifications(id,invoice_id,kind,status,recipient_email) VALUES(?,?,'client','pending',?) ON CONFLICT(invoice_id,kind) DO UPDATE SET id=excluded.id,status='pending',recipient_email=excluded.recipient_email,error=NULL,updated_at=CURRENT_TIMESTAMP").bind(notification,invoiceId,invoice.billingEmail).run()
  const url=`${c.env.PAYMENT_APP_URL||'https://payment.whitepointsurvey.com'}/pay/${encodeURIComponent(invoice.publicToken)}`
  try{
    await sendTimesheetEmail(c.env,invoice.billingEmail,invoice.billingName,`Invoice ${invoice.invoiceNumber} from White Point Survey`,`Invoice ${invoice.invoiceNumber} for ${invoice.projectReference} is ready. Amount due: $${(invoice.balanceCents/100).toFixed(2)}. View and pay: ${url}`)
    await c.env.DB.batch([c.env.DB.prepare("UPDATE invoice_notifications SET status='accepted',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(notification),c.env.DB.prepare("UPDATE invoices SET email_status='accepted',email_error=NULL WHERE id=?").bind(invoiceId)])
  }catch(error){const message=String(error instanceof Error?error.message:error).slice(0,1000);await c.env.DB.batch([c.env.DB.prepare("UPDATE invoice_notifications SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(message,notification),c.env.DB.prepare("UPDATE invoices SET email_status='failed',email_error=? WHERE id=?").bind(message,invoiceId)])}
}
export function createInvoicesApi(){
  const api=new Hono<HonoEnv>()
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
    return c.json({items:rows.map(r=>({entryId:r.id,taskId:r.project_task_id,taskName:r.task_name,entryDate:r.entry_date,hours:r.hours,chargeCents:r.charge_cents,billingType:r.billing_type,note:r.note}))})
  })
  api.get('/public/:token',async c=>{
    const row=await c.env.DB.prepare("SELECT id FROM invoices WHERE public_token=? AND status IN ('sent','paid')").bind(c.req.param('token')).first<{id:string}>()
    if(!row)return c.json({error:'Invoice not found.'},404)
    const invoice=await invoiceDetail(c.env.DB,row.id)
    return invoice?c.json({invoice:publicInvoice(invoice,c.req.param('token'))}):c.json({error:'Invoice not found.'},404)
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
    const params=new URLSearchParams()
    params.set('mode','payment');params.set('ui_mode','custom');params.set('return_url',`${c.env.PAYMENT_APP_URL||'https://payment.whitepointsurvey.com'}/pay/${encodeURIComponent(c.req.param('token'))}?payment=return&session_id={CHECKOUT_SESSION_ID}`)
    params.set('client_reference_id',invoice.id);params.set('customer_email',invoice.billingEmail)
    params.set('line_items[0][quantity]','1');params.set('line_items[0][price_data][currency]','usd');params.set('line_items[0][price_data][unit_amount]',String(invoice.balanceCents));params.set('line_items[0][price_data][product_data][name]',`Invoice ${invoice.invoiceNumber}`)
    params.set('metadata[invoice_id]',invoice.id);params.set('payment_intent_data[metadata][invoice_id]',invoice.id)
    const response=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${c.env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded','Stripe-Version':'2025-03-31.basil'},body:params.toString()})
    const result=await response.json().catch(()=>({})) as {id?:string;client_secret?:string;error?:{message?:string}}
    if(!response.ok||!result.client_secret)return c.json({error:result.error?.message||'Stripe checkout failed.'},502)
    return c.json({clientSecret:result.client_secret,checkoutSessionId:result.id,publishableKey:c.env.STRIPE_PUBLISHABLE_KEY})
  })
  api.post('/',async c=>{
    const body=await c.req.json<{projectId?:string;entryIds?:string[];issueDate?:string;dueDate?:string}>().catch(()=>null)
    if(!body?.projectId||!await projectAccess(c,body.projectId,'invoices.create'))return c.json({error:'Forbidden'},403)
    if(body.entryIds&&!Array.isArray(body.entryIds))return c.json({error:'Invalid entry IDs.'},400)
    if(body.issueDate&&!date(body.issueDate)||body.dueDate&&!date(body.dueDate))return c.json({error:'Use valid dates.'},400)
    try{const id=await createInvoiceDraft(c.env.DB,body.projectId,actor(c),{source:'manual',entryIds:body.entryIds||[],issueDate:body.issueDate,dueDate:body.dueDate});return c.json({invoice:await invoiceDetail(c.env.DB,id!,actor(c),has(c,'invoices.manage'))},201)}catch(error){return c.json({error:String(error instanceof Error?error.message:error)},409)}
  })
  api.get('/:id/logo',async c=>{
    if(!await invoiceAccess(c,c.req.param('id'),'invoices.view'))return c.notFound()
    return await companyLogoResponse(c.env) || c.notFound()
  })
  api.get('/:id',async c=>{
    if(!await invoiceAccess(c,c.req.param('id'),'invoices.view'))return c.json({error:'Invoice not found.'},404)
    const invoice=await invoiceDetail(c.env.DB,c.req.param('id'),actor(c),has(c,'invoices.manage'))
    return invoice?c.json({invoice}):c.json({error:'Invoice not found.'},404)
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
    const body=await c.req.json<{revision:number;issueDate:string;dueDate:string;notes:string;internalNote:string;billingEmail:string;allocations:Array<{entryId:string;disposition:'billed'|'write-off'|'split';splitBasis?:'hours'|'charge';splitValue?:number}>;lines:Array<Pick<InvoiceLine,'id'|'kind'|'description'|'amountCents'|'projectTaskId'>>}>().catch(()=>null)
    if(!body||body.revision!==current.revision||!date(body.issueDate)||!date(body.dueDate)||!Array.isArray(body.allocations)||!Array.isArray(body.lines))return c.json({error:'Invoice changed or the update is invalid. Reload before saving.'},409)
    if(body.allocations.length!==current.allocations.length||new Set(body.allocations.map(a=>a.entryId)).size!==current.allocations.length)return c.json({error:'Every source entry needs one decision.'},400)
    const statements:D1PreparedStatement[]=[],amounts=new Map<string,number>(),fixedCharges=new Map<string,number>(),fixedAmounts=new Map<string,number>()
    try{
      for(const choice of body.allocations){
        const source=current.allocations.find(a=>a.entryId===choice.entryId);if(!source)throw new Error('Unknown time entry.')
        const value=allocateEntry(source.sourceHours,source.sourceChargeCents,choice.disposition,choice.splitBasis||null,choice.splitValue)
        statements.push(c.env.DB.prepare('UPDATE invoice_entry_allocations SET disposition=?,split_basis=?,billed_hours_hundredths=?,writeoff_hours_hundredths=?,billed_charge_cents=?,writeoff_charge_cents=? WHERE entry_id=? AND invoice_id=?').bind(value.disposition,value.splitBasis,value.billedHoursHundredths,value.writeoffHoursHundredths,value.billedChargeCents,value.writeoffChargeCents,source.entryId,invoiceId))
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
    const newEmail=text(body.billingEmail,255)
    if(newEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))return c.json({error:'Enter a valid billing email.'},400)
    const update=c.env.DB.prepare('UPDATE invoices SET issue_date=?,due_date=?,notes=?,internal_note=?,billing_email=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND status=\'draft\'').bind(body.issueDate,body.dueDate,text(body.notes,4000),text(body.internalNote,4000),newEmail,actor(c),invoiceId,current.revision)
    const write:D1PreparedStatement[]=[update,guard(c.env.DB,token),...statements]
    for(const line of current.lines.filter(l=>l.kind==='time'))write.push(c.env.DB.prepare('UPDATE invoice_lines SET amount_cents=? WHERE id=? AND invoice_id=?').bind(amounts.get(line.projectTaskId||'')||0,line.id,invoiceId))
    write.push(c.env.DB.prepare("DELETE FROM invoice_lines WHERE invoice_id=? AND kind='manual'").bind(invoiceId))
    for(const line of body.lines.filter(l=>l.kind==='fixed-fee'))write.push(c.env.DB.prepare("UPDATE invoice_lines SET description=?,amount_cents=? WHERE id=? AND invoice_id=? AND kind='fixed-fee'").bind(text(line.description,500),fixedAmounts.get(line.id)||0,line.id,invoiceId))
    let order=current.lines.length
    for(const line of body.lines.filter(l=>l.kind==='manual'))write.push(c.env.DB.prepare("INSERT INTO invoice_lines(id,invoice_id,kind,description,amount_cents,sort_order) VALUES(?,?,'manual',?,?,?)").bind(uid(),invoiceId,text(line.description,500),line.amountCents,order++))
    write.push(event(c.env.DB,invoiceId,actor(c),'draft-updated'),unguard(c.env.DB,token))
    try{await c.env.DB.batch(write)}catch{return c.json({error:'Invoice changed. Reload before saving.'},409)}
    return c.json({invoice:await invoiceDetail(c.env.DB,invoiceId,actor(c),has(c,'invoices.manage'))})
  })
  api.post('/:id/send',async c=>{
    const invoiceId=c.req.param('id')
    if(!await invoiceAccess(c,invoiceId,'invoices.manage'))return c.json({error:'Forbidden'},403)
    const invoice=await invoiceDetail(c.env.DB,invoiceId,actor(c),has(c,'invoices.manage'))
    if(!invoice||!['draft','sent'].includes(invoice.status))return c.json({error:'Invoice cannot be sent.'},409)
    if(invoice.status==='sent'&&invoice.emailStatus==='accepted')return c.json({error:'Invoice was already emailed.'},409)
    if(invoice.status==='draft'){
      if(invoice.totalCents<=0||!invoice.billingEmail)return c.json({error:'A positive invoice total and billing email are required.'},400)
      if(invoice.reviewTasks.some(t=>t.billingType==='fixed-fee'&&t.currentBilledHours>0&&t.currentAmountCents<=0))return c.json({error:'Set an amount for every fixed fee task with billed hours.'},400)
      await c.env.DB.batch([c.env.DB.prepare("UPDATE invoices SET status='sent',sent_at=CURRENT_TIMESTAMP,email_status='pending',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='draft'").bind(invoiceId),event(c.env.DB,invoiceId,actor(c),'sent')])
    }
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
    return c.json({invoice:await invoiceDetail(c.env.DB,invoiceId,actor(c),true)})
  })
  api.post('/:id/qbo/retry',async c=>{
    if(!has(c,'invoices.manage'))return c.json({error:'Forbidden'},403)
    const invoiceId=c.req.param('id');if(!await invoiceAccess(c,invoiceId,'invoices.manage'))return c.json({error:'Not found.'},404)
    const state=await c.env.DB.prepare('SELECT status FROM invoices WHERE id=?').bind(invoiceId).first<{status:string}>()
    if(!state||!['sent','paid'].includes(state.status))return c.json({error:'Only sent invoices can be synced.'},409)
    await syncInvoiceQbo(c.env.DB,c.env,invoiceId)
    const payments=(await c.env.DB.prepare("SELECT id FROM invoice_payments WHERE invoice_id=? AND status='succeeded' AND qbo_payment_id IS NULL").bind(invoiceId).all<{id:string}>()).results||[]
    for(const payment of payments)await syncPaymentQbo(c.env.DB,c.env,payment.id)
    return c.json({invoice:await invoiceDetail(c.env.DB,invoiceId,actor(c),true)})
  })
  return api
}
