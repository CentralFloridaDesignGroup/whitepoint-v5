import type { ApiEnv } from '../types/apiTypes'
import { accessToken, qboApiBase } from './qboSync.ts'
import { invoiceDetail } from './invoiceData.ts'

type QboEntity = {Id:string;Name?:string;SyncToken?:string;DocNumber?:string;PaymentRefNum?:string;PrivateNote?:string;TotalAmt?:number;CustomerRef?:{value?:string};Line?:Array<{LinkedTxn?:Array<{TxnId?:string}>}>}
type QboResult = { Invoice?: QboEntity; Payment?: QboEntity; Purchase?:QboEntity; Transfer?:QboEntity; QueryResponse?: {Invoice?:QboEntity[];Payment?:QboEntity[];PaymentMethod?:QboEntity[];Purchase?:QboEntity[];Transfer?:QboEntity[]}; Fault?: {Error?:Array<{Detail?:string;Message?:string}>} }
async function query(db:D1Database,env:ApiEnv,entity:'Invoice'|'Payment'|'PaymentMethod'|'Purchase'|'Transfer',field?:'DocNumber'|'PaymentRefNum',value?:string):Promise<QboEntity[]>{
  const {realmId,token}=await accessToken(db,env)
  const all:QboEntity[]=[]
  for(let start=1;start<=10001;start+=1000){
    const statement=field&&value!==undefined?`select * from ${entity} where ${field} = '${value.replaceAll("'","''")}'`:`select * from ${entity} STARTPOSITION ${start} MAXRESULTS 1000`
    const url=`${qboApiBase(env,realmId)}/query?query=${encodeURIComponent(statement)}&minorversion=${encodeURIComponent(env.QBO_MINOR_VERSION||'75')}`
    const response=await fetch(url,{headers:{Accept:'application/json',Authorization:`Bearer ${token}`}})
    const data=await response.json().catch(()=>({})) as QboResult
    if(!response.ok)throw new Error(data.Fault?.Error?.[0]?.Detail||data.Fault?.Error?.[0]?.Message||`QuickBooks query returned ${response.status}`)
    const page=data.QueryResponse?.[entity]||[];all.push(...page)
    if(field||page.length<1000)return all
  }
  throw new Error(`QuickBooks ${entity} lookup exceeded 10,000 records; review before retrying.`)
}
async function request(db:D1Database,env:ApiEnv,path:string,body:unknown):Promise<QboResult>{
  const {realmId,token}=await accessToken(db,env)
  const response=await fetch(`${qboApiBase(env,realmId)}/${path}${path.includes('?')?'&':'?'}minorversion=${encodeURIComponent(env.QBO_MINOR_VERSION||'75')}`,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)})
  const data=await response.json().catch(()=>({})) as QboResult
  if(!response.ok)throw new Error(data.Fault?.Error?.[0]?.Detail||data.Fault?.Error?.[0]?.Message||`QuickBooks returned ${response.status}`)
  return data
}
async function readEntity(db:D1Database,env:ApiEnv,entity:string,id:string):Promise<QboResult>{
  const {realmId,token}=await accessToken(db,env)
  const response=await fetch(`${qboApiBase(env,realmId)}/${entity}/${encodeURIComponent(id)}?minorversion=${encodeURIComponent(env.QBO_MINOR_VERSION||'75')}`,{headers:{Accept:'application/json',Authorization:`Bearer ${token}`}})
  const data=await response.json().catch(()=>({})) as QboResult
  if(!response.ok)throw new Error(data.Fault?.Error?.[0]?.Detail||`QuickBooks read returned ${response.status}`)
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
export async function voidInvoiceQbo(db:D1Database,env:ApiEnv,invoiceId:string){
  try{
    const row=await db.prepare("SELECT invoice_number,qbo_invoice_id FROM invoices WHERE id=? AND status='void'").bind(invoiceId).first<{invoice_number:string;qbo_invoice_id:string|null}>()
    if(!row)return
    if(!env.QBO_CLIENT_ID||!env.QBO_CLIENT_SECRET){
      if(row.qbo_invoice_id)throw new Error('QuickBooks is not configured to void the linked invoice.')
      await db.prepare("UPDATE invoices SET qbo_sync_status='not_configured',qbo_sync_error=NULL WHERE id=?").bind(invoiceId).run()
      return
    }
    const matches=row.qbo_invoice_id?[]:await query(db,env,'Invoice','DocNumber',row.invoice_number)
    if(matches.length>1)throw new Error('QuickBooks has multiple invoices with this number. Review them before retrying.')
    const existing=row.qbo_invoice_id?(await readEntity(db,env,'invoice',row.qbo_invoice_id)).Invoice:matches[0]
    if(existing&&!row.qbo_invoice_id&&!existing.PrivateNote?.includes(`V5 invoice ${invoiceId}`))throw new Error('QuickBooks invoice does not match this V5 invoice.')
    if(!existing){await db.prepare("UPDATE invoices SET qbo_sync_status='synced',qbo_sync_error=NULL WHERE id=?").bind(invoiceId).run();return}
    const result=existing.PrivateNote?.startsWith('Voided')?existing: (await request(db,env,'invoice?operation=void',{Id:existing.Id,SyncToken:existing.SyncToken})).Invoice
    if(!result?.Id)throw new Error('QuickBooks did not confirm the invoice void.')
    await db.prepare("UPDATE invoices SET qbo_invoice_id=?,qbo_sync_token=?,qbo_sync_status='synced',qbo_sync_error=NULL WHERE id=?").bind(result.Id,result.SyncToken||'',invoiceId).run()
  }catch(error){await db.prepare("UPDATE invoices SET qbo_sync_status='failed',qbo_sync_error=? WHERE id=?").bind(String(error instanceof Error?error.message:error).slice(0,1000),invoiceId).run()}
}
export async function syncPaymentQbo(db:D1Database,env:ApiEnv,paymentId:string){
  const payment=await db.prepare("SELECT * FROM invoice_payments WHERE id=? AND status='succeeded'").bind(paymentId).first<Record<string,unknown>>()
  if(!payment||payment.qbo_payment_id)return
  if(payment.source==='stripe'){
    if(!payment.stripe_payout_id)return
    const payout=await db.prepare('SELECT paid,reconciled,review_error FROM stripe_payouts WHERE id=?').bind(payment.stripe_payout_id).first<{paid:number;reconciled:number;review_error:string|null}>()
    if(!payout?.paid||!payout.reconciled||payout.review_error)return
  }
  const invoiceId=String(payment.invoice_id)
  const current=await db.prepare('SELECT qbo_invoice_id FROM invoices WHERE id=?').bind(invoiceId).first<{qbo_invoice_id:string|null}>()
  if(!current?.qbo_invoice_id)await syncInvoiceQbo(db,env,invoiceId)
  try{
    const invoice=await db.prepare('SELECT i.qbo_invoice_id,i.invoice_number,p.qbo_customer_id FROM invoices i JOIN projects p ON p.id=i.project_id WHERE i.id=?').bind(invoiceId).first<{qbo_invoice_id:string|null;invoice_number:string;qbo_customer_id:string|null}>()
    if(!invoice?.qbo_invoice_id||!invoice.qbo_customer_id)throw new Error('QuickBooks invoice is not synced.')
    const retained=Math.max(0,Number(payment.amount_cents)-Number(payment.refunded_cents||0)-Number(payment.disputed_cents||0))
    if(payment.source==='stripe'&&retained===0){await db.prepare("UPDATE invoice_payments SET qbo_sync_status='synced',qbo_sync_error=NULL,qbo_posted_amount_cents=0 WHERE id=?").bind(paymentId).run();return}
    const amount=retained/100
    const paymentRef=`WP-${paymentId.replaceAll('-','').slice(0,18)}`
    const matches=await query(db,env,'Payment','PaymentRefNum',paymentRef)
    if(matches.length>1)throw new Error('QuickBooks has multiple payments with this reference. Review them before retrying.')
    const existing=matches[0]
    if(existing&&!(existing.CustomerRef?.value===invoice.qbo_customer_id&&Math.round(Number(existing.TotalAmt||0)*100)===retained&&existing.Line?.some(line=>line.LinkedTxn?.some(link=>link.TxnId===invoice.qbo_invoice_id))))throw new Error('QuickBooks has an unrelated payment with this reference. Review it before retrying.')
    const setting=existing?null:await db.prepare('SELECT default_deposit_account_id,stripe_clearing_account_id FROM qbo_connection WHERE id=1').first<{default_deposit_account_id:string|null;stripe_clearing_account_id:string|null}>()
    const depositId=payment.source==='stripe'?setting?.stripe_clearing_account_id:setting?.default_deposit_account_id
    if(!existing&&!depositId)throw new Error(payment.source==='stripe'?'Choose a Stripe clearing account before syncing payments.':'Choose a QuickBooks deposit account before syncing payments.')
    const methods=existing?[]:await query(db,env,'PaymentMethod')
    const names=payment.source==='stripe'?['Stripe']:String(payment.method).toLowerCase()==='ach'?['ACH','Bank Transfer']:[String(payment.method)]
    const paymentMethod=names.map(name=>methods.find(method=>method.Name?.toLowerCase()===name.toLowerCase())).find(Boolean)
    if(!existing&&!paymentMethod)throw new Error(`Create a ${names[0]} payment method in QuickBooks before syncing this payment.`)
    const note=payment.source==='stripe'?`Stripe payment ${String(payment.stripe_payment_intent_id||payment.stripe_session_id||'')} for invoice ${invoice.invoice_number}`:String(payment.reference_number||'')
    const result=existing?{Payment:existing}:await request(db,env,'payment',{CustomerRef:{value:invoice.qbo_customer_id},TotalAmt:amount,TxnDate:String(payment.paid_at||new Date().toISOString()).slice(0,10),PaymentRefNum:paymentRef,PaymentMethodRef:{value:paymentMethod!.Id,name:paymentMethod!.Name},DepositToAccountRef:{value:depositId},PrivateNote:note,Line:[{Amount:amount,LinkedTxn:[{TxnId:invoice.qbo_invoice_id,TxnType:'Invoice'}]}]})
    if(!result.Payment?.Id)throw new Error('QuickBooks returned no payment ID.')
    await db.prepare("UPDATE invoice_payments SET qbo_payment_id=?,qbo_posted_amount_cents=?,qbo_sync_status='synced',qbo_sync_error=NULL WHERE id=?").bind(result.Payment.Id,retained,paymentId).run()
  }catch(error){await db.prepare("UPDATE invoice_payments SET qbo_sync_status='failed',qbo_sync_error=? WHERE id=?").bind(String(error instanceof Error?error.message:error).slice(0,1000),paymentId).run()}
}

export async function syncPayoutQbo(db:D1Database,env:ApiEnv,payoutId:string){
  const payout=await db.prepare('SELECT * FROM stripe_payouts WHERE id=?').bind(payoutId).first<Record<string,unknown>>()
  if(!payout||!payout.paid||!payout.reconciled||payout.review_error)return
  const claimed=await db.prepare("UPDATE stripe_payouts SET qbo_sync_status='posting',qbo_posting_started_at=CURRENT_TIMESTAMP WHERE id=? AND qbo_sync_status<>'synced' AND (qbo_sync_status<>'posting' OR qbo_posting_started_at<datetime('now','-5 minutes'))").bind(payoutId).run()
  if(!claimed.meta.changes)return
  try{
    const settings=await db.prepare('SELECT stripe_clearing_account_id,stripe_payout_bank_account_id,stripe_fee_expense_account_id FROM qbo_connection WHERE id=1').first<{stripe_clearing_account_id:string|null;stripe_payout_bank_account_id:string|null;stripe_fee_expense_account_id:string|null}>()
    if(!settings?.stripe_clearing_account_id||!settings.stripe_payout_bank_account_id||!settings.stripe_fee_expense_account_id)throw new Error('Configure Stripe clearing, payout bank, and fee expense accounts in QuickBooks settings.')
    const unresolved=await db.prepare("SELECT p.id FROM stripe_payout_transactions t JOIN stripe_payment_adjustments a ON a.id=t.adjustment_id JOIN invoice_payments p ON p.id=a.payment_id WHERE t.payout_id=? AND p.qbo_payment_id IS NOT NULL AND p.qbo_posted_amount_cents>MAX(0,p.amount_cents-p.refunded_cents-p.disputed_cents) LIMIT 1").bind(payoutId).first<{id:string}>()
    if(unresolved)throw new Error(`Review and post the QuickBooks correction for payment ${unresolved.id} before posting this payout.`)
    const payments=(await db.prepare('SELECT * FROM invoice_payments WHERE stripe_payout_id=? ORDER BY id').bind(payoutId).all<Record<string,unknown>>()).results||[]
    for(const payment of payments){
      if(payment.review_error)throw new Error(`Payment ${payment.id} requires finance review: ${payment.review_error}`)
      await syncPaymentQbo(db,env,String(payment.id))
      const current=await db.prepare('SELECT qbo_sync_error,qbo_payment_id,qbo_posted_amount_cents,qbo_fee_purchase_id FROM invoice_payments WHERE id=?').bind(payment.id).first<{qbo_sync_error:string|null;qbo_payment_id:string|null;qbo_posted_amount_cents:number|null;qbo_fee_purchase_id:string|null}>()
      if(current?.qbo_sync_error)throw new Error(`Invoice payment ${payment.id}: ${current.qbo_sync_error}`)
      if(Number(payment.stripe_fee_cents)>0&&!current?.qbo_fee_purchase_id){
        const note=`V5 Stripe fee ${String(payment.stripe_charge_id)} payment ${String(payment.id)}`
        const matches=(await query(db,env,'Purchase')).filter(item=>item.PrivateNote===note)
        if(matches.length>1)throw new Error(`Multiple QuickBooks fee purchases match ${payment.id}.`)
        const result=matches[0]?{Purchase:matches[0]}:await request(db,env,'purchase',{PaymentType:'Cash',AccountRef:{value:settings.stripe_clearing_account_id},TxnDate:String(payment.paid_at).slice(0,10),PrivateNote:note,Line:[{Amount:Number(payment.stripe_fee_cents)/100,DetailType:'AccountBasedExpenseLineDetail',Description:`Stripe processing fee for ${String(payment.stripe_charge_id)}`,AccountBasedExpenseLineDetail:{AccountRef:{value:settings.stripe_fee_expense_account_id}}}]})
        if(!result.Purchase?.Id)throw new Error('QuickBooks returned no fee purchase ID.')
        await db.prepare('UPDATE invoice_payments SET qbo_fee_purchase_id=? WHERE id=?').bind(result.Purchase.Id,payment.id).run()
      }
    }
    const adjustmentFees=(await db.prepare('SELECT balance_transaction_id,fee_cents,qbo_fee_purchase_id FROM stripe_payout_transactions WHERE payout_id=? AND adjustment_id IS NOT NULL AND fee_cents<>0 ORDER BY balance_transaction_id').bind(payoutId).all<{balance_transaction_id:string;fee_cents:number;qbo_fee_purchase_id:string|null}>()).results||[]
    for(const fee of adjustmentFees){
      if(fee.fee_cents<0)throw new Error(`Stripe fee credit ${fee.balance_transaction_id} needs finance review before posting the payout.`)
      if(fee.qbo_fee_purchase_id)continue
      const note=`V5 Stripe adjustment fee ${fee.balance_transaction_id}`
      const matches=(await query(db,env,'Purchase')).filter(item=>item.PrivateNote===note)
      if(matches.length>1)throw new Error(`Multiple QuickBooks fee purchases match ${fee.balance_transaction_id}.`)
      const result=matches[0]?{Purchase:matches[0]}:await request(db,env,'purchase',{PaymentType:'Cash',AccountRef:{value:settings.stripe_clearing_account_id},TxnDate:String(payout.arrival_date||new Date().toISOString()).slice(0,10),PrivateNote:note,Line:[{Amount:fee.fee_cents/100,DetailType:'AccountBasedExpenseLineDetail',Description:`Stripe adjustment fee ${fee.balance_transaction_id}`,AccountBasedExpenseLineDetail:{AccountRef:{value:settings.stripe_fee_expense_account_id}}}]})
      if(!result.Purchase?.Id)throw new Error('QuickBooks returned no adjustment fee purchase ID.')
      await db.prepare('UPDATE stripe_payout_transactions SET qbo_fee_purchase_id=? WHERE balance_transaction_id=?').bind(result.Purchase.Id,fee.balance_transaction_id).run()
    }
    if(!payout.qbo_transfer_id){
      const note=`V5 Stripe payout ${payoutId}`
      const matches=(await query(db,env,'Transfer')).filter(item=>item.PrivateNote===note)
      if(matches.length>1)throw new Error('Multiple QuickBooks transfers match this payout.')
      const result=matches[0]?{Transfer:matches[0]}:await request(db,env,'transfer',{Amount:Number(payout.amount_cents)/100,TxnDate:String(payout.arrival_date||new Date().toISOString()).slice(0,10),FromAccountRef:{value:settings.stripe_clearing_account_id},ToAccountRef:{value:settings.stripe_payout_bank_account_id},PrivateNote:note})
      if(!result.Transfer?.Id)throw new Error('QuickBooks returned no transfer ID.')
      await db.prepare('UPDATE stripe_payouts SET qbo_transfer_id=? WHERE id=?').bind(result.Transfer.Id,payoutId).run()
    }
    await db.prepare("UPDATE stripe_payouts SET qbo_sync_status='synced',qbo_sync_error=NULL,qbo_posting_started_at=NULL WHERE id=?").bind(payoutId).run()
  }catch(error){await db.prepare("UPDATE stripe_payouts SET qbo_sync_status='failed',qbo_sync_error=?,qbo_posting_started_at=NULL WHERE id=?").bind(String(error instanceof Error?error.message:error).slice(0,1000),payoutId).run()}
}

export async function correctPaymentQbo(db:D1Database,env:ApiEnv,paymentId:string){
  const payment=await db.prepare("SELECT * FROM invoice_payments WHERE id=? AND source='stripe' AND qbo_payment_id IS NOT NULL").bind(paymentId).first<Record<string,unknown>>()
  if(!payment)throw new Error('No posted Stripe payment is available for correction.')
  const open=await db.prepare("SELECT 1 FROM stripe_payment_adjustments WHERE payment_id=? AND kind='dispute' AND status='open'").bind(paymentId).first()
  if(open)throw new Error('Wait for the dispute outcome before correcting QuickBooks.')
  const retained=Math.max(0,Number(payment.amount_cents)-Number(payment.refunded_cents||0)-Number(payment.disputed_cents||0))
  if(retained>=Number(payment.qbo_posted_amount_cents))return
  const invoice=await db.prepare('SELECT qbo_invoice_id FROM invoices WHERE id=?').bind(payment.invoice_id).first<{qbo_invoice_id:string|null}>()
  const current=(await readEntity(db,env,'payment',String(payment.qbo_payment_id))).Payment
  if(!current?.Id||!current.SyncToken||!invoice?.qbo_invoice_id)throw new Error('QuickBooks payment or invoice is unavailable.')
  const actual=Math.round(Number(current.TotalAmt||0)*100)
  if(actual===retained){await db.prepare('UPDATE invoice_payments SET qbo_posted_amount_cents=?,qbo_sync_status=\'synced\',qbo_sync_error=NULL WHERE id=?').bind(retained,paymentId).run();return}
  if(actual!==Number(payment.qbo_posted_amount_cents))throw new Error('QuickBooks payment changed outside Manage. Review it before retrying.')
  const result=retained===0?await request(db,env,'payment?operation=update&include=void',{Id:current.Id,SyncToken:current.SyncToken,sparse:true}):await request(db,env,'payment?operation=update',{Id:current.Id,SyncToken:current.SyncToken,sparse:true,TotalAmt:retained/100,Line:[{Amount:retained/100,LinkedTxn:[{TxnId:invoice.qbo_invoice_id,TxnType:'Invoice'}]}]})
  if(!result.Payment?.Id)throw new Error('QuickBooks did not confirm the payment correction.')
  await db.prepare("UPDATE invoice_payments SET qbo_posted_amount_cents=?,qbo_sync_status='synced',qbo_sync_error=NULL WHERE id=?").bind(retained,paymentId).run()
}
