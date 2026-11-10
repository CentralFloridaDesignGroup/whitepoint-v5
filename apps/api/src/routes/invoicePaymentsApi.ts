import { Hono } from 'hono'
import type { ApiContext, HonoEnv } from '../types/apiTypes'
import { correctPaymentQbo, qboPayoutCustomers, syncPayoutQbo } from '../services/invoiceQbo.ts'
import { processStripeEvent } from '../services/stripePayments.ts'
import { retrieveIntent, retrievePayout, stripeGet } from '../services/stripeApi.ts'
import { retryFailedPaymentNotices } from '../services/paymentNotices.ts'

const actor = (c: ApiContext) => c.get('auth').internalUserId || ''
const canManage = (c: ApiContext) => c.get('permissions').hasPermission('invoices.manage')
async function isSuper(c:ApiContext){return Boolean(await c.env.DB.prepare("SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND r.id='super-administrator' AND r.archived_at IS NULL LIMIT 1").bind(actor(c)).first())}

export function createInvoicePaymentsApi() {
  const api = new Hono<HonoEnv>()
  api.get('/notices',async c=>{
    if(!canManage(c))return c.json({error:'Forbidden'},403)
    return c.json({items:(await c.env.DB.prepare("SELECT event_key,recipient_email,status,error,created_at FROM payment_notice_deliveries ORDER BY created_at DESC LIMIT 100").all()).results||[]})
  })
  api.post('/notices/retry',async c=>{
    if(!canManage(c))return c.json({error:'Forbidden'},403)
    return c.json({retried:await retryFailedPaymentNotices(c.env)})
  })
  api.get('/payouts',async c=>{
    if(!canManage(c))return c.json({error:'Forbidden'},403)
    const rows=(await c.env.DB.prepare("SELECT p.*,COUNT(t.balance_transaction_id) AS transaction_count FROM stripe_payouts p LEFT JOIN stripe_payout_transactions t ON t.payout_id=p.id GROUP BY p.id ORDER BY p.updated_at DESC LIMIT 100").all()).results||[]
    return c.json({items:rows,canForce:await isSuper(c)})
  })
  api.get('/payouts/customers',async c=>{
    if(!canManage(c)||!(await isSuper(c)))return c.json({error:'Forbidden'},403)
    try{return c.json({items:await qboPayoutCustomers(c.env.DB,c.env)})}catch(error){return c.json({error:String(error)},502)}
  })
  api.get('/payouts/:id',async c=>{
    if(!canManage(c))return c.json({error:'Forbidden'},403)
    const payout=await c.env.DB.prepare('SELECT * FROM stripe_payouts WHERE id=?').bind(c.req.param('id')).first()
    if(!payout)return c.json({error:'Payout not found.'},404)
    const transactions=(await c.env.DB.prepare("SELECT t.*,i.invoice_number,p.qbo_payment_id,p.qbo_fee_purchase_id AS payment_qbo_fee_purchase_id FROM stripe_payout_transactions t LEFT JOIN invoice_payments p ON p.id=t.payment_id LEFT JOIN invoices i ON i.id=p.invoice_id WHERE t.payout_id=? ORDER BY t.balance_transaction_id").bind(c.req.param('id')).all()).results||[]
    return c.json({payout,transactions})
  })
  api.post('/payouts/:id/force',async c=>{
    if(!canManage(c)||!(await isSuper(c)))return c.json({error:'Only a super-administrator can force an unmatched payout.'},403)
    const payoutId=c.req.param('id')
    const body=await c.req.json<{customers?:Array<{balanceTransactionId:string;customerId:string}>}>().catch(()=>null)
    if(!Array.isArray(body?.customers))return c.json({error:'Select a customer for each unmatched payment.'},400)
    try{
      const live=await retrievePayout(c.env,payoutId)
      if(!live.automatic||live.currency!=='usd'||live.status!=='paid'||live.reconciliation_status!=='completed')throw new Error('Stripe payout must be automatic, paid, and fully reconciled.')
      await processStripeEvent(c.env,{id:`force-review-${crypto.randomUUID()}`,type:'payout.reconciliation_completed',data:{object:{id:payoutId}}})
      const payout=await c.env.DB.prepare('SELECT paid,reconciled,review_error,qbo_sync_status,qbo_force_unmatched FROM stripe_payouts WHERE id=?').bind(payoutId).first<{paid:number;reconciled:number;review_error:string|null;qbo_sync_status:string;qbo_force_unmatched:number}>()
      if(payout?.qbo_sync_status==='synced'&&payout.qbo_force_unmatched)return c.json({payout})
      if(!payout?.paid||!payout.reconciled||payout.qbo_sync_status==='synced'||!/^\d+ payout transactions have no matching invoice payment or adjustment\.$/.test(payout.review_error||''))throw new Error('This payout has no eligible unmatched payment review issue.')
      const rows=(await c.env.DB.prepare('SELECT * FROM stripe_payout_transactions WHERE payout_id=? ORDER BY balance_transaction_id').bind(payoutId).all<Record<string,unknown>>()).results||[]
      const net=rows.filter(row=>row.type!=='payout').reduce((sum,row)=>sum+Number(row.net_cents),0)
      if(net!==live.amount)throw new Error('Payout net differs from Stripe amount.')
      const unmatched=rows.filter(row=>!row.payment_id&&!row.adjustment_id&&row.type!=='payout')
      if(!unmatched.length||unmatched.some(row=>!['charge','payment'].includes(String(row.type))||Number(row.amount_cents)<=0||!String(row.source_id||'').startsWith('ch_')))throw new Error('Payout contains an unmatched transaction that is not a Stripe charge.')
      for(const row of rows.filter(row=>row.payment_id)){
        const payment=await c.env.DB.prepare('SELECT amount_cents,stripe_balance_transaction_id,stripe_fee_cents,stripe_net_cents FROM invoice_payments WHERE id=?').bind(row.payment_id).first<{amount_cents:number;stripe_balance_transaction_id:string|null;stripe_fee_cents:number;stripe_net_cents:number|null}>()
        if(!payment||payment.amount_cents!==row.amount_cents||payment.stripe_balance_transaction_id!==row.balance_transaction_id||payment.stripe_fee_cents!==row.fee_cents||payment.stripe_net_cents!==row.net_cents)throw new Error('A matched invoice payment differs from Stripe. Review it before posting.')
      }
      const selected=new Map(body.customers.map(item=>[item.balanceTransactionId,item.customerId]))
      if(body.customers.length!==unmatched.length||selected.size!==unmatched.length||unmatched.some(row=>!selected.get(String(row.balance_transaction_id))))throw new Error('Select one customer for every unmatched payment.')
      if(payout.qbo_force_unmatched&&unmatched.some(row=>row.qbo_customer_id!==selected.get(String(row.balance_transaction_id))))throw new Error('QuickBooks customer choices are locked after the first force attempt.')
      const valid=new Set((await qboPayoutCustomers(c.env.DB,c.env)).map(item=>item.id))
      if([...selected.values()].some(id=>!valid.has(id)))throw new Error('A selected QuickBooks customer is unavailable.')
      for(const row of unmatched){
        const charge=await stripeGet<{payment_intent?:string|null}>(c.env,`charges/${encodeURIComponent(String(row.source_id))}`)
        if(charge.payment_intent){
          const intent=await retrieveIntent(c.env,charge.payment_intent)
          if(intent.metadata?.invoice_id){const linked=await c.env.DB.prepare('SELECT qbo_invoice_id FROM invoices WHERE id=?').bind(intent.metadata.invoice_id).first<{qbo_invoice_id:string|null}>();if(linked?.qbo_invoice_id)throw new Error('A charge is linked to a synced QuickBooks invoice.')}
        }
      }
      for(const row of unmatched)await c.env.DB.prepare('UPDATE stripe_payout_transactions SET qbo_customer_id=? WHERE balance_transaction_id=? AND payout_id=?').bind(selected.get(String(row.balance_transaction_id)),row.balance_transaction_id,payoutId).run()
      await c.env.DB.prepare("UPDATE stripe_payouts SET qbo_force_unmatched=1,qbo_force_actor=?,qbo_force_at=CURRENT_TIMESTAMP WHERE id=? AND qbo_sync_status<>'synced'").bind(actor(c),payoutId).run()
      await syncPayoutQbo(c.env.DB,c.env,payoutId)
      const result=await c.env.DB.prepare('SELECT * FROM stripe_payouts WHERE id=?').bind(payoutId).first<{qbo_sync_status:string;qbo_sync_error:string|null}>()
      if(result?.qbo_sync_status!=='synced')throw new Error(result?.qbo_sync_error||'Payout could not be posted to QuickBooks. Review and retry.')
      return c.json({payout:result})
    }catch(error){return c.json({error:String(error instanceof Error?error.message:error)},409)}
  })
  api.post('/payouts/:id/retry',async c=>{
    if(!canManage(c))return c.json({error:'Forbidden'},403)
    const payout=await c.env.DB.prepare('SELECT id FROM stripe_payouts WHERE id=?').bind(c.req.param('id')).first<{id:string}>()
    if(!payout)return c.json({error:'Payout not found.'},404)
    try{await processStripeEvent(c.env,{id:`review-${crypto.randomUUID()}`,type:'payout.reconciliation_completed',data:{object:{id:c.req.param('id')}}});await syncPayoutQbo(c.env.DB,c.env,c.req.param('id'))}
    catch(error){return c.json({error:String(error)},409)}
    return c.json({payout:await c.env.DB.prepare('SELECT * FROM stripe_payouts WHERE id=?').bind(c.req.param('id')).first()})
  })
  api.get('/holds',async c=>{
    if(!canManage(c))return c.json({error:'Forbidden'},403)
    const role=await c.env.DB.prepare('SELECT role_id FROM user_roles WHERE user_id=?').bind(actor(c)).first<{role_id:string}>()
    return c.json({items:(await c.env.DB.prepare('SELECT h.*,c.name AS client_name FROM client_payment_holds h JOIN clients c ON c.id=h.client_id WHERE h.released_at IS NULL ORDER BY h.created_at DESC').all()).results||[],canRelease:role?.role_id==='super-administrator'})
  })
  api.post('/holds/:clientId/release',async c=>{
    const role=await c.env.DB.prepare('SELECT role_id FROM user_roles WHERE user_id=?').bind(actor(c)).first<{role_id:string}>()
    if(role?.role_id!=='super-administrator')return c.json({error:'Only a super-administrator may release a payment hold.'},403)
    const updated=await c.env.DB.prepare('UPDATE client_payment_holds SET released_at=CURRENT_TIMESTAMP,released_by=? WHERE client_id=? AND released_at IS NULL').bind(actor(c),c.req.param('clientId')).run()
    if(!updated.meta.changes)return c.json({error:'Active hold not found.'},404)
    return c.json({released:true})
  })
  api.post('/:paymentId/qbo/correct',async c=>{
    if(!canManage(c))return c.json({error:'Forbidden'},403)
    try{await correctPaymentQbo(c.env.DB,c.env,c.req.param('paymentId'));return c.json({corrected:true})}
    catch(error){return c.json({error:String(error)},409)}
  })
  return api
}
