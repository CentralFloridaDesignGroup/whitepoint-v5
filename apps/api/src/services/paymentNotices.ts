import type { ApiEnv } from '../types/apiTypes'
import { sendEmail } from './brevo.ts'
import { paymentNoticeEmail } from '../emails/payment.ts'

type Recipient={email:string;display_name:string;permissions:string;role_id:string}
async function recipients(db:D1Database,tier:'finance'|'sensitive',invoiceId?:string):Promise<Array<{email:string;name:string}>>{
  const rows=(await db.prepare("SELECT u.email,u.display_name,r.permissions,ur.role_id FROM users_named u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.active=1 AND u.archived_at IS NULL AND r.archived_at IS NULL").all<Recipient>()).results||[]
  const key=tier==='finance'?'finance.emails':'finance.emails.sensitive'
  const selected=rows.filter(r=>{const permissions=JSON.parse(r.permissions) as string[];return permissions.includes('*')||permissions.includes(key)||tier==='sensitive'&&r.role_id==='super-administrator'})
  if(invoiceId){const manager=await db.prepare('SELECT u.email,u.display_name FROM invoices i JOIN projects p ON p.id=i.project_id JOIN users_named u ON u.id=p.manager_user_id WHERE i.id=? AND u.active=1 AND u.archived_at IS NULL').bind(invoiceId).first<{email:string;display_name:string}>();if(manager)selected.push({...manager,permissions:'[]',role_id:''})}
  return [...new Map(selected.filter(r=>r.email).map(r=>[r.email.toLowerCase(),{email:r.email,name:r.display_name}])).values()]
}

export async function paymentNotice(env:ApiEnv,eventKey:string,subject:string,body:string,options:{tier?:'finance'|'sensitive';invoiceId?:string;customer?:boolean;manager?:boolean}){
  const targets=options.tier?await recipients(env.DB,options.tier,options.manager?options.invoiceId:undefined):[]
  if(options.customer&&options.invoiceId){const customer=await env.DB.prepare('SELECT billing_email,billing_name FROM invoices WHERE id=?').bind(options.invoiceId).first<{billing_email:string;billing_name:string}>();if(customer?.billing_email)targets.push({email:customer.billing_email,name:customer.billing_name})}
  for(const target of [...new Map(targets.map(r=>[r.email.toLowerCase(),r])).values()]){
    const id=crypto.randomUUID()
    const inserted=await env.DB.prepare("INSERT OR IGNORE INTO payment_notice_deliveries(id,event_key,recipient_email,subject,body,status) VALUES(?,?,?,?,?,'pending')").bind(id,eventKey,target.email,subject,body).run()
    if(!inserted.meta.changes)continue
    try{await sendEmail(env,{to:[target],subject,...paymentNoticeEmail(subject,body)});await env.DB.prepare("UPDATE payment_notice_deliveries SET status='accepted' WHERE id=?").bind(id).run()}
    catch(error){await env.DB.prepare("UPDATE payment_notice_deliveries SET status='failed',error=? WHERE id=?").bind(String(error).slice(0,1000),id).run()}
  }
}

export async function retryFailedPaymentNotices(env:ApiEnv){
  const rows=(await env.DB.prepare("SELECT id,recipient_email,subject,body FROM payment_notice_deliveries WHERE status='failed' ORDER BY created_at LIMIT 100").all<{id:string;recipient_email:string;subject:string;body:string}>()).results||[]
  for(const row of rows){
    await env.DB.prepare("UPDATE payment_notice_deliveries SET status='pending',error=NULL WHERE id=? AND status='failed'").bind(row.id).run()
    try{await sendEmail(env,{to:[{email:row.recipient_email}],subject:row.subject,...paymentNoticeEmail(row.subject,row.body)});await env.DB.prepare("UPDATE payment_notice_deliveries SET status='accepted' WHERE id=?").bind(row.id).run()}
    catch(error){await env.DB.prepare("UPDATE payment_notice_deliveries SET status='failed',error=? WHERE id=?").bind(String(error).slice(0,1000),row.id).run()}
  }
  return rows.length
}
