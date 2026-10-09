import { Hono } from 'hono'
import type { HonoEnv } from '../types/apiTypes'
import { event, invoiceDetail, refreshPaid } from '../services/invoiceData.ts'
import { syncPaymentQbo } from '../services/invoiceQbo.ts'

type StripeObject={id?:string;payment_status?:string;payment_intent?:string|{id?:string};amount_total?:number;amount_received?:number;amount?:number;metadata?:{invoice_id?:string};client_reference_id?:string}
type StripeEvent={id?:string;type?:string;created?:number;data?:{object?:StripeObject}}
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('')
async function verify(raw:string,header:string,secret:string){
  const parts=header.split(',').map(x=>x.trim()),timestamp=parts.find(x=>x.startsWith('t='))?.slice(2),signatures=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3))
  if(!timestamp||!/^\d+$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp)*1000)>300000||!signatures.length)return false
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  const expected=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${raw}`)))
  return signatures.some(value=>value.length===expected.length&&value.split('').reduce((diff,char,index)=>diff|(char.charCodeAt(0)^expected.charCodeAt(index)),0)===0)
}
export function createStripeInvoiceWebhook(){const api=new Hono<HonoEnv>();api.post('/stripe',async c=>{
  if(!c.env.STRIPE_WEBHOOK_SECRET)return c.json({error:'Stripe webhook is not configured.'},503)
  const raw=await c.req.text()
  if(!await verify(raw,c.req.header('Stripe-Signature')||'',c.env.STRIPE_WEBHOOK_SECRET))return c.json({error:'Invalid Stripe signature.'},400)
  let payload:StripeEvent
  try{payload=JSON.parse(raw) as StripeEvent}catch{return c.json({error:'Invalid event.'},400)}
  if(!payload.id||!payload.type)return c.json({error:'Invalid event.'},400)
  if(await c.env.DB.prepare('SELECT 1 FROM invoice_webhook_events WHERE event_id=?').bind(payload.id).first())return c.json({received:true,duplicate:true})
  const object=payload.data?.object,invoiceId=object?.metadata?.invoice_id||object?.client_reference_id||''
  if(!object||!invoiceId){await c.env.DB.prepare('INSERT INTO invoice_webhook_events(event_id,event_type) VALUES(?,?)').bind(payload.id,payload.type).run();return c.json({received:true})}
  const invoice=await invoiceDetail(c.env.DB,invoiceId)
  if(!invoice||!['sent','paid'].includes(invoice.status))return c.json({error:'Invoice is not payable.'},409)
  const intentId=typeof object.payment_intent==='string'?object.payment_intent:object.payment_intent?.id|| (object.id?.startsWith('pi_')?object.id:'')
  const sessionId=object.id?.startsWith('cs_')?object.id:null
  const succeeded=payload.type==='payment_intent.succeeded'||payload.type==='checkout.session.async_payment_succeeded'||payload.type==='checkout.session.completed'&&object.payment_status==='paid'
  const failed=payload.type==='payment_intent.payment_failed'||payload.type==='checkout.session.async_payment_failed'
  const pending=payload.type==='payment_intent.processing'||payload.type==='checkout.session.completed'&&object.payment_status!=='paid'
  if(succeeded||failed||pending){
    const amount=Number(object.amount_received||object.amount_total||object.amount||0)
    if(!Number.isSafeInteger(amount)||amount<=0)return c.json({error:'Invalid payment amount.'},400)
    const existing=await c.env.DB.prepare('SELECT id,status FROM invoice_payments WHERE (? IS NOT NULL AND stripe_session_id=?) OR (?<>\'\' AND stripe_payment_intent_id=?)').bind(sessionId,sessionId,intentId,intentId).first<{id:string;status:string}>()
    if(existing?.status==='succeeded'&&!succeeded){await c.env.DB.prepare('INSERT INTO invoice_webhook_events(event_id,event_type) VALUES(?,?)').bind(payload.id,payload.type).run();return c.json({received:true})}
    const paymentId=existing?.id||crypto.randomUUID(),status=succeeded?'succeeded':failed?'failed':'pending'
    const paidAt=succeeded&&Number.isSafeInteger(payload.created)?new Date(Number(payload.created)*1000).toISOString():new Date().toISOString()
    await c.env.DB.batch([
      existing?c.env.DB.prepare("UPDATE invoice_payments SET status=?,stripe_session_id=COALESCE(stripe_session_id,?),stripe_payment_intent_id=COALESCE(stripe_payment_intent_id,?),paid_at=CASE WHEN ?='succeeded' THEN ? ELSE paid_at END WHERE id=?").bind(status,sessionId,intentId||null,status,paidAt,paymentId):c.env.DB.prepare("INSERT INTO invoice_payments(id,invoice_id,source,status,amount_cents,method,paid_at,stripe_session_id,stripe_payment_intent_id) VALUES(?,?,'stripe',?,?,'Stripe',?,?,?)").bind(paymentId,invoiceId,status,amount,succeeded?paidAt:null,sessionId,intentId||null),
      c.env.DB.prepare('INSERT INTO invoice_webhook_events(event_id,event_type) VALUES(?,?)').bind(payload.id,payload.type),
      event(c.env.DB,invoiceId,null,`stripe-${status}`,{paymentId,stripeEventId:payload.id})
    ])
    await refreshPaid(c.env.DB,invoiceId)
    if(succeeded)await syncPaymentQbo(c.env.DB,c.env,paymentId)
  }else await c.env.DB.prepare('INSERT INTO invoice_webhook_events(event_id,event_type) VALUES(?,?)').bind(payload.id,payload.type).run()
  return c.json({received:true})
});return api}
