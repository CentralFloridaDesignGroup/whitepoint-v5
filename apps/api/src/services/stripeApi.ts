import type { ApiEnv } from '../types/apiTypes'

export type StripeBalanceTransaction = {id:string;amount:number;fee:number;net:number;type:string;source:string|null;currency:string}
export type StripePayout = {id:string;amount:number;currency:string;automatic:boolean;status:string;reconciliation_status?:string;arrival_date?:number}
export type StripeCharge = {id:string;balance_transaction?:StripeBalanceTransaction|string|null;payment_method_details?:{type?:string;card?:{last4?:string};us_bank_account?:{last4?:string}}}
export type StripeIntent = {id:string;status:string;amount_received:number;metadata?:{invoice_id?:string};latest_charge?:StripeCharge|string|null}

export async function stripeGet<T>(env:ApiEnv,path:string,params?:URLSearchParams):Promise<T>{
  if(!env.STRIPE_SECRET_KEY)throw new Error('Stripe is not configured.')
  const url=new URL(`https://api.stripe.com/v1/${path.replace(/^\//,'')}`)
  if(params)url.search=params.toString()
  const response=await fetch(url,{headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Stripe-Version':'2025-03-31.basil'}})
  const data=await response.json().catch(()=>({})) as T&{error?:{message?:string}}
  if(!response.ok)throw new Error(data.error?.message||`Stripe returned ${response.status}`)
  return data
}

export async function stripePost<T>(env:ApiEnv,path:string,params:URLSearchParams,key?:string):Promise<T>{
  if(!env.STRIPE_SECRET_KEY)throw new Error('Stripe is not configured.')
  const response=await fetch(`https://api.stripe.com/v1/${path.replace(/^\//,'')}`,{method:'POST',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Stripe-Version':'2025-03-31.basil','Content-Type':'application/x-www-form-urlencoded',...(key?{'Idempotency-Key':key}:{})},body:params.toString()})
  const data=await response.json().catch(()=>({})) as T&{error?:{message?:string}}
  if(!response.ok)throw new Error(data.error?.message||`Stripe returned ${response.status}`)
  return data
}

export async function retrieveIntent(env:ApiEnv,id:string):Promise<StripeIntent>{
  const params=new URLSearchParams();params.append('expand[]','latest_charge.balance_transaction')
  return stripeGet<StripeIntent>(env,`payment_intents/${encodeURIComponent(id)}`,params)
}

export async function retrievePayout(env:ApiEnv,id:string):Promise<StripePayout>{return stripeGet<StripePayout>(env,`payouts/${encodeURIComponent(id)}`)}

export async function payoutTransactions(env:ApiEnv,id:string):Promise<StripeBalanceTransaction[]>{
  const all:StripeBalanceTransaction[]=[];let after:string|undefined
  do{
    const params=new URLSearchParams({payout:id,limit:'100'});if(after)params.set('starting_after',after)
    const page=await stripeGet<{data:StripeBalanceTransaction[];has_more:boolean}>(env,'balance_transactions',params)
    if(!Array.isArray(page.data)||page.has_more&&!page.data.length)throw new Error('Stripe returned an incomplete payout page.')
    all.push(...page.data);after=page.has_more?page.data.at(-1)?.id:undefined
    if(all.length>10000)throw new Error('Payout has too many transactions for one reconciliation.')
  }while(after)
  return all
}
