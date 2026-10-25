import { Hono } from 'hono'
import type { ApiContext, HonoEnv } from '../types/apiTypes'
import { correctPaymentQbo, syncPayoutQbo } from '../services/invoiceQbo.ts'
import { processStripeEvent } from '../services/stripePayments.ts'
import { retryFailedPaymentNotices } from '../services/paymentNotices.ts'

const actor = (c: ApiContext) => c.get('auth').internalUserId || ''
const canManage = (c: ApiContext) => c.get('permissions').hasPermission('invoices.manage')

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
    return c.json({items:rows})
  })
  api.get('/payouts/:id',async c=>{
    if(!canManage(c))return c.json({error:'Forbidden'},403)
    const payout=await c.env.DB.prepare('SELECT * FROM stripe_payouts WHERE id=?').bind(c.req.param('id')).first()
    if(!payout)return c.json({error:'Payout not found.'},404)
    const transactions=(await c.env.DB.prepare("SELECT t.*,i.invoice_number,p.qbo_payment_id,p.qbo_fee_purchase_id AS payment_qbo_fee_purchase_id FROM stripe_payout_transactions t LEFT JOIN invoice_payments p ON p.id=t.payment_id LEFT JOIN invoices i ON i.id=p.invoice_id WHERE t.payout_id=? ORDER BY t.balance_transaction_id").bind(c.req.param('id')).all()).results||[]
    return c.json({payout,transactions})
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
