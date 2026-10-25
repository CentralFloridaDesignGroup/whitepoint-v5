import type { ApiEnv } from '../types/apiTypes'
import { event, refreshPaid } from './invoiceData.ts'
import { placeClientHold } from './paymentHold.ts'
import { paymentNotice } from './paymentNotices.ts'
import { payoutTransactions, retrieveIntent, retrievePayout, stripeGet, type StripeBalanceTransaction, type StripeCharge } from './stripeApi.ts'
import { syncPayoutQbo } from './invoiceQbo.ts'

type StripeEvent={id?:string;type?:string;created?:number;data?:{object?:Record<string,unknown>}}
const objectId=(value:unknown)=>typeof value==='string'?value:typeof value==='object'&&value!==null&&'id' in value?String(value.id):''
const cents=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0?Number(value):null
const eventTime=(value:unknown)=>Number.isSafeInteger(value)?new Date(Number(value)*1000).toISOString():new Date().toISOString()

async function adjustmentTotals(db:D1Database,paymentId:string,invoiceId:string){
  const totals=await db.prepare("SELECT COALESCE(SUM(CASE WHEN kind='refund' AND status='succeeded' THEN amount_cents END),0) refunded,COALESCE(SUM(CASE WHEN kind='dispute' AND status IN ('open','lost') THEN amount_cents END),0) disputed FROM stripe_payment_adjustments WHERE payment_id=?").bind(paymentId).first<{refunded:number;disputed:number}>()
  await db.prepare('UPDATE invoice_payments SET refunded_cents=?,disputed_cents=? WHERE id=?').bind(totals?.refunded||0,totals?.disputed||0,paymentId).run()
  await refreshPaid(db,invoiceId)
  const balance=await db.prepare("SELECT COALESCE((SELECT SUM(amount_cents) FROM invoice_lines WHERE invoice_id=?),0) total,COALESCE((SELECT SUM(MAX(0,amount_cents-refunded_cents-disputed_cents)) FROM invoice_payments WHERE invoice_id=? AND status='succeeded'),0) paid").bind(invoiceId,invoiceId).first<{total:number;paid:number}>()
  if(balance&&balance.paid<=balance.total)await db.prepare("UPDATE invoice_payments SET review_error=NULL WHERE invoice_id=? AND review_error='Captured payment exceeds invoice balance; finance review required.'").bind(invoiceId).run()
}

async function paymentEvent(env:ApiEnv,payload:StripeEvent,object:Record<string,unknown>){
  const db=env.DB,type=payload.type||''
  const objectValue=objectId(object.id),intentId=objectId(object.payment_intent)||(objectValue.startsWith('pi_')?objectValue:'')
  const sessionId=objectValue.startsWith('cs_')?objectValue:''
  const session=sessionId?await db.prepare('SELECT invoice_id,amount_cents FROM stripe_checkout_sessions WHERE id=?').bind(sessionId).first<{invoice_id:string;amount_cents:number}>():null
  const metadata=object.metadata as {invoice_id?:string}|undefined
  const invoiceId=session?.invoice_id||metadata?.invoice_id||String(object.client_reference_id||'')
  if(!invoiceId)return false
  const invoice=await db.prepare("SELECT id,invoice_number,project_reference,public_token FROM invoices WHERE id=? AND status IN ('sent','paid')").bind(invoiceId).first<{id:string;invoice_number:string;project_reference:string;public_token:string}>()
  if(!invoice)throw new Error('Stripe event references an unavailable invoice.')
  const success=type==='payment_intent.succeeded'||type==='checkout.session.async_payment_succeeded'||type==='checkout.session.completed'&&object.payment_status==='paid'
  const failed=type==='payment_intent.payment_failed'||type==='checkout.session.async_payment_failed'
  const processing=type==='payment_intent.processing'||type==='checkout.session.completed'&&object.payment_status!=='paid'
  const verification=type==='payment_intent.requires_action'
  if(!success&&!failed&&!processing&&!verification)return false
  const actual=success&&intentId?await retrieveIntent(env,intentId):null
  if(success&&(!actual||actual.status!=='succeeded'||actual.metadata?.invoice_id!==invoiceId))throw new Error('Stripe PaymentIntent verification failed.')
  const chargeId=objectId(actual?.latest_charge)
  const charge=chargeId&&typeof actual?.latest_charge==='string'?await stripeGet<StripeCharge>(env,`charges/${encodeURIComponent(chargeId)}`):typeof actual?.latest_charge==='object'?actual.latest_charge:null
  const transactionId=objectId(charge?.balance_transaction)
  const transaction=transactionId&&typeof charge?.balance_transaction==='string'?await stripeGet<StripeBalanceTransaction>(env,`balance_transactions/${encodeURIComponent(transactionId)}`):typeof charge?.balance_transaction==='object'?charge.balance_transaction:null
  if(success&&transaction&&transaction.currency!=='usd')throw new Error('Stripe charge balance transaction has an unexpected currency.')
  const amount=success?cents(actual?.amount_received):cents(object.amount_received??object.amount_total??object.amount)
  if(!amount||session&&amount!==session.amount_cents)throw new Error('Stripe amount does not match checkout session.')
  const existing=await db.prepare("SELECT id,status,invoice_id FROM invoice_payments WHERE (?<>'' AND stripe_payment_intent_id=?) OR (?<>'' AND stripe_session_id=?)").bind(intentId,intentId,sessionId,sessionId).first<{id:string;status:string;invoice_id:string}>()
  if(existing&&existing.invoice_id!==invoiceId)throw new Error('Stripe payment belongs to another invoice.')
  if(existing?.status==='succeeded'&&!success)return true
  const paymentId=existing?.id||crypto.randomUUID(),status=success?'succeeded':failed?'failed':'pending'
  const lastFour=charge?.payment_method_details?.card?.last4||charge?.payment_method_details?.us_bank_account?.last4||null
  const method=charge?.payment_method_details?.type||'Stripe'
  if(existing)await db.prepare("UPDATE invoice_payments SET status=?,amount_cents=?,method=?,paid_at=CASE WHEN ?='succeeded' THEN ? ELSE paid_at END,stripe_session_id=COALESCE(stripe_session_id,?),stripe_payment_intent_id=COALESCE(stripe_payment_intent_id,?),stripe_charge_id=COALESCE(stripe_charge_id,?),stripe_balance_transaction_id=COALESCE(stripe_balance_transaction_id,?),stripe_fee_cents=COALESCE(?,stripe_fee_cents),stripe_net_cents=COALESCE(?,stripe_net_cents),stripe_last_four=COALESCE(stripe_last_four,?) WHERE id=?").bind(status,amount,method,status,eventTime(payload.created),sessionId||null,intentId||null,charge?.id||null,transaction?.id||null,transaction?.fee??null,transaction?.net??null,lastFour,paymentId).run()
  else await db.prepare("INSERT INTO invoice_payments(id,invoice_id,source,status,amount_cents,method,paid_at,stripe_session_id,stripe_payment_intent_id,stripe_charge_id,stripe_balance_transaction_id,stripe_fee_cents,stripe_net_cents,stripe_last_four) VALUES(?,?,'stripe',?,?,?,?,?,?,?,?,?,?,?)").bind(paymentId,invoiceId,status,amount,method,success?eventTime(payload.created):null,sessionId||null,intentId||null,charge?.id||null,transaction?.id||null,transaction?.fee||0,transaction?.net??null,lastFour).run()
  if(sessionId)await db.prepare('UPDATE stripe_checkout_sessions SET status=? WHERE id=?').bind(success?'complete':failed?'expired':'open',sessionId).run()
  await db.batch([event(db,invoiceId,null,`stripe-${status}`,{paymentId,stripeEventId:payload.id}),db.prepare('INSERT INTO invoice_webhook_events(event_id,event_type) VALUES(?,?)').bind(payload.id,payload.type)])
  await refreshPaid(db,invoiceId)
  if(success){const prior=await db.prepare("SELECT payout_id FROM stripe_payout_transactions WHERE balance_transaction_id=? OR (?<>'' AND source_id=?) LIMIT 1").bind(transaction?.id||'',chargeId,chargeId).first<{payout_id:string}>();if(prior)await payoutEvent(env,{id:`late-payment-${payload.id}`,type:'payout.reconciliation_completed'},{id:prior.payout_id})}
  const detail=`Project ${invoice.project_reference}, invoice ${invoice.invoice_number}, $${(amount/100).toFixed(2)}, ${method}${lastFour?` ending ${lastFour}`:''}, Stripe ${intentId||sessionId}.`
  if(success){
    const balance=await db.prepare("SELECT COALESCE((SELECT SUM(amount_cents) FROM invoice_lines WHERE invoice_id=?),0) total,COALESCE((SELECT SUM(MAX(0,amount_cents-refunded_cents-disputed_cents)) FROM invoice_payments WHERE invoice_id=? AND status='succeeded'),0) paid").bind(invoiceId,invoiceId).first<{total:number;paid:number}>()
    if(balance&&balance.paid>balance.total)await db.prepare('UPDATE invoice_payments SET review_error=? WHERE id=?').bind('Captured payment exceeds invoice balance; finance review required.',paymentId).run()
    await paymentNotice(env,`receipt:${paymentId}`,'Payment received',`We received your payment. ${detail} Current invoice balance: $${(Math.max(0,(balance?.total||0)-(balance?.paid||0))/100).toFixed(2)}.`,{invoiceId,customer:true})
    await paymentNotice(env,`staff-payment:${paymentId}`,'Invoice payment received',detail,{invoiceId,tier:'finance',manager:true})
  }else if(verification)await paymentNotice(env,`verification:${intentId}`,'Payment needs verification',`Your payment needs additional verification. Return to ${(env.PAYMENT_APP_URL||'https://payment.whitepointsurvey.com')}/pay/${encodeURIComponent(invoice.public_token)} to complete it. The invoice is not paid until Stripe confirms it. ${detail}`,{invoiceId,customer:true,tier:'finance',manager:true})
  else if(processing)await paymentNotice(env,`processing:${paymentId}`,'Invoice payment processing',`Payment submitted and processing; it is not yet received. ${detail}`,{invoiceId,tier:'finance',manager:true})
  return true
}

async function adjustmentEvent(env:ApiEnv,payload:StripeEvent,object:Record<string,unknown>){
  const type=payload.type||'',dispute=type.startsWith('charge.dispute.'),refund=type.startsWith('refund.')
  if(!dispute&&!refund)return false
  const live=await stripeGet<Record<string,unknown>>(env,`${dispute?'disputes':'refunds'}/${encodeURIComponent(objectId(object.id))}`)
  object=live
  const objectValue=objectId(object.id),intentId=objectId(object.payment_intent),chargeId=objectId(object.charge)||(objectValue.startsWith('ch_')?objectValue:'')
  const payment=await env.DB.prepare("SELECT id,invoice_id FROM invoice_payments WHERE source='stripe' AND ((?<>'' AND stripe_payment_intent_id=?) OR (?<>'' AND stripe_charge_id=?))").bind(intentId,intentId,chargeId,chargeId).first<{id:string;invoice_id:string}>()
  if(!payment){
    throw new Error('Stripe adjustment has no matching payment.')
  }
  const adjustmentId=objectValue,amount=cents(object.amount)
  if(!adjustmentId||!amount)throw new Error('Invalid Stripe adjustment.')
  const status=dispute?['won','lost'].includes(String(object.status))?String(object.status):'open':String(object.status||'pending')
  const balanceTransaction=objectId(object.balance_transaction)
  await env.DB.prepare("INSERT INTO stripe_payment_adjustments(id,payment_id,kind,status,amount_cents,balance_transaction_id,reason) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,balance_transaction_id=COALESCE(excluded.balance_transaction_id,stripe_payment_adjustments.balance_transaction_id),reason=excluded.reason,updated_at=CURRENT_TIMESTAMP").bind(adjustmentId,payment.id,dispute?'dispute':'refund',status,amount,balanceTransaction||null,String(object.reason||'').slice(0,500)).run()
  const transactionIds=[balanceTransaction,...(Array.isArray(object.balance_transactions)?object.balance_transactions.map(objectId):[])].filter(Boolean)
  for(const transactionId of new Set(transactionIds))await env.DB.prepare('INSERT OR IGNORE INTO stripe_adjustment_transactions(balance_transaction_id,adjustment_id) VALUES(?,?)').bind(transactionId,adjustmentId).run()
  await adjustmentTotals(env.DB,payment.id,payment.invoice_id)
  for(const transactionId of new Set(transactionIds)){const prior=await env.DB.prepare('SELECT payout_id FROM stripe_payout_transactions WHERE balance_transaction_id=?').bind(transactionId).first<{payout_id:string}>();if(prior)await payoutEvent(env,{id:`late-adjustment-${payload.id}-${transactionId}`,type:'payout.reconciliation_completed'},{id:prior.payout_id})}
  await env.DB.batch([event(env.DB,payment.invoice_id,null,dispute?'stripe-dispute':'stripe-refund',{adjustmentId,status,amount}),env.DB.prepare('INSERT INTO invoice_webhook_events(event_id,event_type) VALUES(?,?)').bind(payload.id,payload.type)])
  if(dispute||status==='succeeded'){
    if(status!=='won')await placeClientHold(env.DB,payment.invoice_id,adjustmentId,dispute?'Stripe dispute':'Stripe refund')
    const invoice=await env.DB.prepare('SELECT invoice_number,project_reference,billing_name FROM invoices WHERE id=?').bind(payment.invoice_id).first<{invoice_number:string;project_reference:string;billing_name:string}>()
    await paymentNotice(env,`adjustment:${adjustmentId}:${status}`,dispute?'Stripe dispute needs review':'Stripe refund needs review',`${invoice?.project_reference||''}, ${invoice?.billing_name||''}, invoice ${invoice?.invoice_number||''}, $${(amount/100).toFixed(2)}. Reason: ${String(object.reason||'not supplied')}. Client-wide work and billing hold is active; super-administrator review is required.`,{invoiceId:payment.invoice_id,tier:'sensitive',manager:true})
  }
  return true
}

async function payoutEvent(env:ApiEnv,payload:StripeEvent,object:Record<string,unknown>){
  const payoutId=objectId(object.id)
  if(!payoutId)return false
  const payout=await retrievePayout(env,payoutId)
  if(!payout.automatic||payout.currency!=='usd')throw new Error('Only automatic USD payouts are supported.')
  const reconciled=payout.reconciliation_status==='completed'||payload.type==='payout.reconciliation_completed',paid=payout.status==='paid'
  await env.DB.prepare("INSERT INTO stripe_payouts(id,amount_cents,currency,paid,reconciled,status,arrival_date) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET amount_cents=excluded.amount_cents,paid=excluded.paid,reconciled=MAX(stripe_payouts.reconciled,excluded.reconciled),status=excluded.status,arrival_date=excluded.arrival_date,updated_at=CURRENT_TIMESTAMP").bind(payoutId,payout.amount,payout.currency,Number(paid),Number(reconciled),payout.status,payout.arrival_date?eventTime(payout.arrival_date).slice(0,10):null).run()
  if(reconciled){
    const transactions=await payoutTransactions(env,payoutId)
    let net=0,unmatched=0,mismatched=0
    for(const txn of transactions){
      if(txn.currency!=='usd'||!Number.isSafeInteger(txn.net))throw new Error('Invalid payout transaction.')
      net+=txn.net
      const payment=await env.DB.prepare("SELECT id FROM invoice_payments WHERE stripe_balance_transaction_id=? OR (?<>'' AND stripe_charge_id=?) LIMIT 1").bind(txn.id,txn.type==='charge'?txn.source||'':'',txn.type==='charge'?txn.source||'':'').first<{id:string}>()
      const adjustment=await env.DB.prepare('SELECT adjustment_id AS id FROM stripe_adjustment_transactions WHERE balance_transaction_id=?').bind(txn.id).first<{id:string}>()
      if(!payment&&!adjustment)unmatched++
      if(payment){const source=await env.DB.prepare('SELECT amount_cents,stripe_balance_transaction_id,stripe_fee_cents,stripe_net_cents FROM invoice_payments WHERE id=?').bind(payment.id).first<{amount_cents:number;stripe_balance_transaction_id:string|null;stripe_fee_cents:number;stripe_net_cents:number|null}>();if(source){if(source.amount_cents!==txn.amount||source.stripe_balance_transaction_id&&(source.stripe_balance_transaction_id!==txn.id||source.stripe_fee_cents!==txn.fee||source.stripe_net_cents!==txn.net))mismatched++;if(!source.stripe_balance_transaction_id)await env.DB.prepare('UPDATE invoice_payments SET stripe_balance_transaction_id=?,stripe_fee_cents=?,stripe_net_cents=? WHERE id=? AND stripe_balance_transaction_id IS NULL').bind(txn.id,txn.fee,txn.net,payment.id).run()}}
      await env.DB.prepare('INSERT INTO stripe_payout_transactions(balance_transaction_id,payout_id,amount_cents,fee_cents,net_cents,type,source_id,payment_id,adjustment_id) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(balance_transaction_id) DO UPDATE SET payout_id=excluded.payout_id,payment_id=excluded.payment_id,adjustment_id=excluded.adjustment_id').bind(txn.id,payoutId,txn.amount,txn.fee,txn.net,txn.type,txn.source||null,payment?.id||null,adjustment?.id||null).run()
      if(payment)await env.DB.prepare('UPDATE invoice_payments SET stripe_payout_id=? WHERE id=?').bind(payoutId,payment.id).run()
    }
    const error=net!==payout.amount?`Payout net ${net} differs from Stripe amount ${payout.amount}.`:unmatched?`${unmatched} payout transactions have no matching invoice payment or adjustment.`:mismatched?`${mismatched} payout transactions differ from saved payment amounts.`:!transactions.length?'Payout has no balance transactions.':null
    await env.DB.prepare('UPDATE stripe_payouts SET review_error=? WHERE id=?').bind(error,payoutId).run()
  }
  await env.DB.prepare('INSERT INTO invoice_webhook_events(event_id,event_type) VALUES(?,?)').bind(payload.id,payload.type).run()
  const saved=await env.DB.prepare('SELECT reconciled,review_error FROM stripe_payouts WHERE id=?').bind(payoutId).first<{reconciled:number;review_error:string|null}>()
  if(saved?.reconciled&&paid)await syncPayoutQbo(env.DB,env,payoutId)
  if(saved?.reconciled){
    const summary=await env.DB.prepare('SELECT COUNT(DISTINCT payment_id) payment_count,COALESCE(SUM(fee_cents),0) fees FROM stripe_payout_transactions WHERE payout_id=?').bind(payoutId).first<{payment_count:number;fees:number}>()
    const invoices=(await env.DB.prepare('SELECT DISTINCT i.invoice_number FROM stripe_payout_transactions t JOIN invoice_payments p ON p.id=t.payment_id JOIN invoices i ON i.id=p.invoice_id WHERE t.payout_id=? ORDER BY i.invoice_number').bind(payoutId).all<{invoice_number:string}>()).results||[]
    await paymentNotice(env,`payout:${payoutId}`,'Stripe payout reconciled',`Stripe payout ${payoutId}: ${summary?.payment_count||0} invoice payments (${invoices.map(row=>row.invoice_number).join(', ')}), fees $${((summary?.fees||0)/100).toFixed(2)}, net $${(payout.amount/100).toFixed(2)}, status ${payout.status}.${saved.review_error?` Review required: ${saved.review_error}`:''}`,{tier:'sensitive'})
  }else if(['failed','canceled'].includes(payout.status))await paymentNotice(env,`payout-failed:${payoutId}`,'Stripe payout failed',`Stripe payout ${payoutId} is ${payout.status}. Review the bank destination and reconciliation in Manage.`,{tier:'sensitive'})
  else if(payload.type==='payout.created')await paymentNotice(env,`payout-submitted:${payoutId}`,'Stripe payout submitted',`Stripe submitted payout ${payoutId} for $${(payout.amount/100).toFixed(2)}. The matched invoice and fee breakdown will follow reconciliation.`,{tier:'sensitive'})
  return true
}

export async function processStripeEvent(env:ApiEnv,value:unknown):Promise<{received:boolean;duplicate?:boolean}>{
  const payload=value as StripeEvent
  if(!payload?.id||!payload.type||!payload.data?.object)throw new Error('Invalid Stripe event.')
  if(await env.DB.prepare('SELECT 1 FROM invoice_webhook_events WHERE event_id=?').bind(payload.id).first())return {received:true,duplicate:true}
  const object=payload.data.object
  if(payload.type.startsWith('payout.'))await payoutEvent(env,payload,object)
  else if(payload.type.startsWith('refund.')||payload.type.startsWith('charge.dispute.'))await adjustmentEvent(env,payload,object)
  else await paymentEvent(env,payload,object)
  if(!await env.DB.prepare('SELECT 1 FROM invoice_webhook_events WHERE event_id=?').bind(payload.id).first())await env.DB.prepare('INSERT INTO invoice_webhook_events(event_id,event_type) VALUES(?,?)').bind(payload.id,payload.type).run()
  return {received:true}
}
