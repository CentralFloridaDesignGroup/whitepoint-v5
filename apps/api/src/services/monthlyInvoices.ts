import type { ApiEnv } from '../types/apiTypes'
import { createInvoiceDraft, invoiceDetail } from './invoiceData.ts'
import { invoiceWindow } from './invoiceCore.ts'
import { sendEmail } from './brevo.ts'
import { invoiceDraftEmail } from '../emails/invoice.ts'

export async function generateMonthlyInvoices(env:ApiEnv,timestamp:number){
  const window=invoiceWindow(timestamp);if(!window)return
    const projects=(await env.DB.prepare(`SELECT DISTINCT e.project_id FROM user_timesheet_entries e JOIN user_timesheets w ON w.id=e.timesheet_id JOIN projects p ON p.id=e.project_id LEFT JOIN (SELECT entry_id,SUM(billed_hours_hundredths+writeoff_hours_hundredths) AS claimed_hours FROM invoice_entry_allocations GROUP BY entry_id) a ON a.entry_id=e.id LEFT JOIN client_payment_holds h ON h.client_id=p.client_id AND h.released_at IS NULL WHERE w.status='approved' AND ROUND(e.hours*100)>COALESCE(a.claimed_hours,0) AND e.entry_date<? AND e.billing_type IN ('fixed-fee','time-and-materials','time-and-materials-nte') AND p.archived_at IS NULL AND h.client_id IS NULL ORDER BY e.project_id`).bind(window.cutoff).all<{project_id:string}>()).results||[]
  for(const project of projects){
    try{
      const id=await createInvoiceDraft(env.DB,project.project_id,null,{source:'monthly',billingMonth:window.billingMonth,issueDate:window.issueDate,paymentTerm:'net-30'})
      if(!id)continue
      const manager=await env.DB.prepare('SELECT u.id,u.email,u.display_name FROM projects p JOIN users_named u ON u.id=p.manager_user_id WHERE p.id=? AND u.active=1 AND u.archived_at IS NULL').bind(project.project_id).first<{id:string;email:string;display_name:string}>()
      if(!manager)continue
      const invoice=await invoiceDetail(env.DB,id)
      if(!invoice)continue
      const notificationId=crypto.randomUUID()
      const created=await env.DB.prepare("INSERT OR IGNORE INTO invoice_notifications(id,invoice_id,kind,status,recipient_email) VALUES(?,?,'manager','pending',?)").bind(notificationId,id,manager.email).run()
      if(!created.meta.changes){
        const retry=await env.DB.prepare("UPDATE invoice_notifications SET id=?,status='pending',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE invoice_id=? AND kind='manager' AND status='failed'").bind(notificationId,id).run()
        if(!retry.meta.changes)continue
      }
      try{await sendEmail(env,{to:[{email:manager.email,name:manager.display_name}],subject:`Invoice draft ${invoice.invoiceNumber} is ready`,...invoiceDraftEmail(invoice.invoiceNumber,invoice.projectReference,`${env.STAFF_APP_URL||'https://app.whitepointsurvey.com'}/invoices/${id}`)});await env.DB.prepare("UPDATE invoice_notifications SET status='accepted',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(notificationId).run()}
      catch(error){await env.DB.prepare("UPDATE invoice_notifications SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(String(error instanceof Error?error.message:error).slice(0,1000),notificationId).run()}
    }catch(error){console.error('Monthly invoice generation failed',project.project_id,error)}
  }
}
