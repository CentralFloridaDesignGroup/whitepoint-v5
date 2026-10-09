import type { ApiEnv } from '../types/apiTypes'
import { accessToken, qboEnvironment } from './qboSync.ts'
import { invoiceDetail } from './invoiceData.ts'

type QboEntity = {Id:string;Name?:string;SyncToken?:string;DocNumber?:string;PaymentRefNum?:string;PrivateNote?:string;TotalAmt?:number;CustomerRef?:{value?:string};Line?:Array<{LinkedTxn?:Array<{TxnId?:string}>}>}
type QboResult = { Invoice?: QboEntity; Payment?: QboEntity; QueryResponse?: {Invoice?:QboEntity[];Payment?:QboEntity[];PaymentMethod?:QboEntity[]}; Fault?: {Error?:Array<{Detail?:string;Message?:string}>} }
const qboBase=(env:ApiEnv,realmId:string)=>`${qboEnvironment(env)==='sandbox'?'https://sandbox-quickbooks.api.intuit.com':'https://quickbooks.api.intuit.com'}/v3/company/${encodeURIComponent(realmId)}`
async function query(db:D1Database,env:ApiEnv,entity:'Invoice'|'Payment'|'PaymentMethod',field?:'DocNumber'|'PaymentRefNum',value?:string):Promise<QboEntity[]>{
  const {realmId,token}=await accessToken(db,env)
  const statement=field&&value!==undefined?`select * from ${entity} where ${field} = '${value.replaceAll("'","''")}'`:`select * from ${entity}`
  const url=`${qboBase(env,realmId)}/query?query=${encodeURIComponent(statement)}&minorversion=${encodeURIComponent(env.QBO_MINOR_VERSION||'75')}`
  const response=await fetch(url,{headers:{Accept:'application/json',Authorization:`Bearer ${token}`}})
  const data=await response.json().catch(()=>({})) as QboResult
  if(!response.ok)throw new Error(data.Fault?.Error?.[0]?.Detail||data.Fault?.Error?.[0]?.Message||`QuickBooks query returned ${response.status}`)
  return data.QueryResponse?.[entity]||[]
}
async function request(db:D1Database,env:ApiEnv,path:string,body:unknown):Promise<QboResult>{
  const {realmId,token}=await accessToken(db,env)
  const response=await fetch(`${qboBase(env,realmId)}/${path}${path.includes('?')?'&':'?'}minorversion=${encodeURIComponent(env.QBO_MINOR_VERSION||'75')}`,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)})
  const data=await response.json().catch(()=>({})) as QboResult
  if(!response.ok)throw new Error(data.Fault?.Error?.[0]?.Detail||data.Fault?.Error?.[0]?.Message||`QuickBooks returned ${response.status}`)
  return data
}
export async function syncInvoiceQbo(db:D1Database,env:ApiEnv,invoiceId:string){
  try{
    if(!env.QBO_CLIENT_ID||!env.QBO_CLIENT_SECRET)throw new Error('QuickBooks is not configured.')
    const invoice=await invoiceDetail(db,invoiceId);if(!invoice||!['sent','paid'].includes(invoice.status))return
    const project=await db.prepare('SELECT qbo_customer_id FROM projects WHERE id=?').bind(invoice.projectId).first<{qbo_customer_id:string|null}>()
    const setting=await db.prepare('SELECT default_service_item_id FROM qbo_connection WHERE id=1').first<{default_service_item_id:string|null}>()
    const row=await db.prepare('SELECT qbo_invoice_id,qbo_sync_token FROM invoices WHERE id=?').bind(invoiceId).first<{qbo_invoice_id:string|null;qbo_sync_token:string|null}>()
    if(!project?.qbo_customer_id||!setting?.default_service_item_id)throw new Error('QuickBooks project customer and default service item are required.')
    const lines=invoice.lines.filter(l=>l.amountCents>0).map(line=>({DetailType:'SalesItemLineDetail',Description:line.description,Amount:line.amountCents/100,SalesItemLineDetail:{ItemRef:{value:setting.default_service_item_id},Qty:1,UnitPrice:line.amountCents/100}}))
    const matches=row?.qbo_invoice_id?[]:await query(db,env,'Invoice','DocNumber',invoice.invoiceNumber)
    if(matches.length>1)throw new Error('QuickBooks has multiple invoices with this number. Review them before retrying.')
    const existing=matches[0]
    if(existing&&(!existing.PrivateNote?.includes(`V5 invoice ${invoiceId}`)||existing.CustomerRef?.value!==project.qbo_customer_id))throw new Error('QuickBooks already has an invoice with this number. Review it before retrying.')
    const bill=invoice.billingAddress
    const result=existing?{Invoice:existing}:await request(db,env,'invoice',{...(row?.qbo_invoice_id?{Id:row.qbo_invoice_id,SyncToken:row.qbo_sync_token,sparse:false}:{}),CustomerRef:{value:project.qbo_customer_id},DocNumber:invoice.invoiceNumber,TxnDate:invoice.issueDate,DueDate:invoice.dueDate,BillAddr:{Line1:bill.line1,Line2:bill.line2||undefined,City:bill.city,CountrySubDivisionCode:bill.state,PostalCode:bill.postalCode},CustomerMemo:{value:invoice.notes},PrivateNote:`V5 invoice ${invoiceId}`,Line:lines})
    if(!result.Invoice?.Id)throw new Error('QuickBooks returned no invoice ID.')
    await db.prepare("UPDATE invoices SET qbo_invoice_id=?,qbo_sync_token=?,qbo_sync_status='synced',qbo_sync_error=NULL WHERE id=?").bind(result.Invoice.Id,result.Invoice.SyncToken||'',invoiceId).run()
  }catch(error){const message=String(error instanceof Error?error.message:error).slice(0,1000);await db.prepare("UPDATE invoices SET qbo_sync_status=?,qbo_sync_error=? WHERE id=?").bind(message==='QuickBooks is not configured.'?'not_configured':'failed',message,invoiceId).run()}
}
export async function syncPaymentQbo(db:D1Database,env:ApiEnv,paymentId:string){
  const payment=await db.prepare("SELECT * FROM invoice_payments WHERE id=? AND status='succeeded'").bind(paymentId).first<Record<string,unknown>>()
  if(!payment||payment.qbo_payment_id)return
  const invoiceId=String(payment.invoice_id)
  const current=await db.prepare('SELECT qbo_invoice_id FROM invoices WHERE id=?').bind(invoiceId).first<{qbo_invoice_id:string|null}>()
  if(!current?.qbo_invoice_id)await syncInvoiceQbo(db,env,invoiceId)
  try{
    const invoice=await db.prepare('SELECT i.qbo_invoice_id,i.invoice_number,p.qbo_customer_id FROM invoices i JOIN projects p ON p.id=i.project_id WHERE i.id=?').bind(invoiceId).first<{qbo_invoice_id:string|null;invoice_number:string;qbo_customer_id:string|null}>()
    if(!invoice?.qbo_invoice_id||!invoice.qbo_customer_id)throw new Error('QuickBooks invoice is not synced.')
    const amount=Number(payment.amount_cents)/100
    const paymentRef=`WP-${paymentId.replaceAll('-','').slice(0,18)}`
    const matches=await query(db,env,'Payment','PaymentRefNum',paymentRef)
    if(matches.length>1)throw new Error('QuickBooks has multiple payments with this reference. Review them before retrying.')
    const existing=matches[0]
    if(existing&&!(existing.CustomerRef?.value===invoice.qbo_customer_id&&Math.round(Number(existing.TotalAmt||0)*100)===Number(payment.amount_cents)&&existing.Line?.some(line=>line.LinkedTxn?.some(link=>link.TxnId===invoice.qbo_invoice_id))))throw new Error('QuickBooks has an unrelated payment with this reference. Review it before retrying.')
    const setting=existing?null:await db.prepare('SELECT default_deposit_account_id FROM qbo_connection WHERE id=1').first<{default_deposit_account_id:string|null}>()
    if(!existing&&!setting?.default_deposit_account_id)throw new Error('Choose a QuickBooks deposit account before syncing payments.')
    const methods=existing?[]:await query(db,env,'PaymentMethod')
    const names=payment.source==='stripe'?['Stripe']:String(payment.method).toLowerCase()==='ach'?['ACH','Bank Transfer']:[String(payment.method)]
    const paymentMethod=names.map(name=>methods.find(method=>method.Name?.toLowerCase()===name.toLowerCase())).find(Boolean)
    if(!existing&&!paymentMethod)throw new Error(`Create a ${names[0]} payment method in QuickBooks before syncing this payment.`)
    const note=payment.source==='stripe'?`Stripe payment ${String(payment.stripe_payment_intent_id||payment.stripe_session_id||'')} for invoice ${invoice.invoice_number}`:String(payment.reference_number||'')
    const result=existing?{Payment:existing}:await request(db,env,'payment',{CustomerRef:{value:invoice.qbo_customer_id},TotalAmt:amount,TxnDate:String(payment.paid_at||new Date().toISOString()).slice(0,10),PaymentRefNum:paymentRef,PaymentMethodRef:{value:paymentMethod!.Id,name:paymentMethod!.Name},DepositToAccountRef:{value:setting!.default_deposit_account_id},PrivateNote:note,Line:[{Amount:amount,LinkedTxn:[{TxnId:invoice.qbo_invoice_id,TxnType:'Invoice'}]}]})
    if(!result.Payment?.Id)throw new Error('QuickBooks returned no payment ID.')
    await db.prepare("UPDATE invoice_payments SET qbo_payment_id=?,qbo_sync_status='synced',qbo_sync_error=NULL WHERE id=?").bind(result.Payment.Id,paymentId).run()
  }catch(error){await db.prepare("UPDATE invoice_payments SET qbo_sync_status='failed',qbo_sync_error=? WHERE id=?").bind(String(error instanceof Error?error.message:error).slice(0,1000),paymentId).run()}
}
