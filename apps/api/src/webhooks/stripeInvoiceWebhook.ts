import { Hono } from 'hono'
import type { HonoEnv } from '../types/apiTypes'
import { processStripeEvent } from '../services/stripePayments.ts'

const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('')
async function verify(raw:string,header:string,secret:string){
  const parts=header.split(',').map(x=>x.trim()),timestamp=parts.find(x=>x.startsWith('t='))?.slice(2),signatures=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3))
  if(!timestamp||!/^\d+$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp)*1000)>300000||!signatures.length)return false
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  const expected=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${raw}`)))
  return signatures.some(value=>value.length===expected.length&&value.split('').reduce((diff,char,index)=>diff|(char.charCodeAt(0)^expected.charCodeAt(index)),0)===0)
}
export function createStripeInvoiceWebhook(){
  const api=new Hono<HonoEnv>()
  api.post('/stripe',async c=>{
    if(!c.env.STRIPE_WEBHOOK_SECRET)return c.json({error:'Stripe webhook is not configured.'},503)
    const raw=await c.req.text()
    if(!await verify(raw,c.req.header('Stripe-Signature')||'',c.env.STRIPE_WEBHOOK_SECRET))return c.json({error:'Invalid Stripe signature.'},400)
    let payload:unknown
    try{payload=JSON.parse(raw)}catch{return c.json({error:'Invalid event.'},400)}
    try{return c.json(await processStripeEvent(c.env,payload))}
    catch(error){console.error('Stripe event processing failed',error);return c.json({error:'Stripe event could not be processed; retry.'},500)}
  })
  return api
}
