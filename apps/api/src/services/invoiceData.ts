import type { InvoiceAllocation, InvoiceLine, InvoiceListItem, InvoicePaymentRecord, InvoiceRecord, InvoiceReviewTask, PublicInvoice } from '@whitepoint/types'
import { randomToken } from '../auth/session.ts'
import { businessDate, nextNumber } from './numbering.ts'
import { allocateEntry } from './invoiceCore.ts'
import { companyBranding } from './companyBranding.ts'

type Row = Record<string, unknown>
const id = () => crypto.randomUUID()
const s = (value: unknown) => String(value ?? '')
const n = (value: unknown) => Number(value ?? 0)
const parse = <T>(value: unknown, fallback: T): T => { try { return JSON.parse(s(value)) as T } catch { return fallback } }
const address = {line1:'',line2:'',city:'',state:'',postalCode:''}
const projectAddress = {line1:'',city:'',state:'',postalCode:''}
const guard = (db:D1Database,token:string) => db.prepare('INSERT INTO record_write_guards(id,valid) VALUES(?,CASE WHEN changes()=1 THEN 1 ELSE 0 END)').bind(token)
const unguard = (db:D1Database,token:string) => db.prepare('DELETE FROM record_write_guards WHERE id=?').bind(token)
export const event = (db:D1Database,invoiceId:string,actor:string|null,action:string,details:unknown={}) => db.prepare('INSERT INTO invoice_events(id,invoice_id,actor_id,action,details_json) VALUES(?,?,?,?,?)').bind(id(),invoiceId,actor,action,JSON.stringify(details))

export async function eligibleEntries(db:D1Database,projectId:string,cutoff?:string) {
  const result = await db.prepare(`SELECT e.id,e.project_task_id,e.entry_date,e.hours,e.note,e.charge_cents,e.billing_type,t.task_name,t.contract_amount_cents
    FROM user_timesheet_entries e JOIN user_timesheets w ON w.id=e.timesheet_id
    JOIN project_tasks t ON t.id=e.project_task_id
    LEFT JOIN invoice_entry_allocations a ON a.entry_id=e.id
    WHERE e.project_id=? AND w.status='approved' AND a.entry_id IS NULL
      AND e.billing_type IN ('fixed-fee','time-and-materials','time-and-materials-nte')
      AND (? IS NULL OR e.entry_date<?)
    ORDER BY e.entry_date,e.id`).bind(projectId,cutoff||null,cutoff||null).all<Row>()
  return result.results || []
}

export async function createInvoiceDraft(db:D1Database, projectId:string, actor:string|null, options:{source:'monthly'|'manual';billingMonth?:string;entryIds?:string[];issueDate?:string;dueDate?:string}) {
  const project = await db.prepare(`SELECT p.*,c.name AS client_name,c.email AS client_email,c.billing_address_json
    FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.id=? AND p.archived_at IS NULL`).bind(projectId).first<Row>()
  if (!project) throw new Error('Project not found.')
  if (options.source==='monthly' && options.billingMonth) {
    const existing=await db.prepare("SELECT id FROM invoices WHERE project_id=? AND billing_month=? AND source='monthly'").bind(projectId,options.billingMonth).first<{id:string}>()
    if (existing) return existing.id
  }
  const all=await eligibleEntries(db,projectId,options.source==='monthly' ? `${options.billingMonth}-01` : undefined)
  const selected=options.source==='manual' ? all.filter(row => options.entryIds?.includes(s(row.id))) : all
  if (options.source==='manual' && selected.length !== new Set(options.entryIds||[]).size) throw new Error('One or more time entries are no longer available.')
  if (options.source==='monthly' && !selected.length) return null
  const now=businessDate(), issueDate=options.issueDate||`${now.year}-${now.month}-${new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',day:'2-digit'}).format(new Date())}`
  const due=new Date(`${issueDate}T00:00:00Z`);due.setUTCDate(due.getUTCDate()+30)
  const dueDate=options.dueDate||due.toISOString().slice(0,10)
  const setting=await db.prepare('SELECT invoice_number_template,invoice_reset_yearly,default_invoice_note FROM app_settings WHERE id=1').first<Row>()
  if(!setting)throw new Error('Invoice settings are missing.')
  const number=await nextNumber(db,'invoice',{invoiceNumberTemplate:s(setting.invoice_number_template),invoiceResetYearly:n(setting.invoice_reset_yearly)===1,projectNumberTemplate:'',projectResetYearly:false,clientNumberTemplate:'',clientResetYearly:false})
  const contact=await db.prepare(`SELECT name,email FROM contacts WHERE client_id=? AND archived_at IS NULL AND (invoice_recipient=1 OR is_billing_poc=1) AND email<>'' ORDER BY is_billing_poc DESC,invoice_recipient DESC LIMIT 1`).bind(project.client_id).first<Row>()
  const invoiceId=id(), statements:D1PreparedStatement[]=[]
  statements.push(db.prepare(`INSERT INTO invoices(id,project_id,client_id,invoice_number,source,billing_month,issue_date,due_date,notes,billing_name,billing_email,billing_address_json,project_reference,project_address_json,public_token,created_by,updated_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(invoiceId,projectId,project.client_id,number,options.source,options.billingMonth||null,issueDate,dueDate,s(setting.default_invoice_note),s(project.client_name),s(contact?.email||project.client_email),s(project.billing_address_json||'{}'),`${s(project.project_number)} - ${s(project.name)}`,s(project.address_json||'{}'),randomToken(32),actor,actor))
  const reserved=await reserveInvoiceEntries(db,invoiceId,selected)
  statements.push(...reserved.statements)
  let order=0
  for(const line of reserved.grouped.values())statements.push(db.prepare('INSERT INTO invoice_lines(id,invoice_id,project_task_id,kind,description,amount_cents,sort_order) VALUES(?,?,?,?,?,?,?)').bind(id(),invoiceId,line.taskId,line.kind,line.name,line.amount,order++))
  statements.push(event(db,invoiceId,actor,'draft-created',{source:options.source,entryCount:selected.length,billingMonth:options.billingMonth||null}))
  await db.batch(statements)
  return invoiceId
}

export async function reserveInvoiceEntries(db:D1Database,invoiceId:string,selected:Row[]){
  const statements:D1PreparedStatement[]=[],caps=new Map<string,number>(),grouped=new Map<string,{taskId:string;name:string;kind:'time'|'fixed-fee';amount:number}>()
  for(const entry of selected){
    const taskId=s(entry.project_task_id),kind=entry.billing_type==='fixed-fee'?'fixed-fee' as const:'time' as const
    let allocation=allocateEntry(n(entry.hours),n(entry.charge_cents),'billed')
    if(entry.billing_type==='time-and-materials-nte'){
      let remaining=caps.get(taskId)
      if(remaining===undefined){
        const previous=await db.prepare(`SELECT COALESCE(SUM(l.amount_cents),0) AS amount FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE l.project_task_id=? AND i.status<>'void'`).bind(taskId).first<{amount:number}>()
        remaining=Math.max(0,n(entry.contract_amount_cents)-n(previous?.amount))
      }
      const charge=n(entry.charge_cents)
      if(remaining<=0)allocation=allocateEntry(n(entry.hours),charge,'write-off')
      else if(remaining<charge){try{allocation=allocateEntry(n(entry.hours),charge,'split','charge',remaining)}catch{allocation=allocateEntry(n(entry.hours),charge,'write-off')}}
      caps.set(taskId,Math.max(0,remaining-allocation.billedChargeCents))
    }
    statements.push(db.prepare(`INSERT INTO invoice_entry_allocations(entry_id,invoice_id,disposition,split_basis,source_hours_hundredths,billed_hours_hundredths,writeoff_hours_hundredths,source_charge_cents,billed_charge_cents,writeoff_charge_cents) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(entry.id,invoiceId,allocation.disposition,allocation.splitBasis,allocation.sourceHoursHundredths,allocation.billedHoursHundredths,allocation.writeoffHoursHundredths,allocation.sourceChargeCents,allocation.billedChargeCents,allocation.writeoffChargeCents))
    const key=`${taskId}:${kind}`,group=grouped.get(key)||{taskId,name:s(entry.task_name),kind,amount:0}
    if(kind==='time')group.amount+=allocation.billedChargeCents
    else {
      let remaining=caps.get(taskId)
      if(remaining===undefined){
        const previous=await db.prepare(`SELECT COALESCE(SUM(l.amount_cents),0) AS amount FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE l.project_task_id=? AND i.status<>'void'`).bind(taskId).first<{amount:number}>()
        remaining=Math.max(0,n(entry.contract_amount_cents)-n(previous?.amount))
      }
      const amount=Math.min(remaining,allocation.billedChargeCents)
      group.amount+=amount
      caps.set(taskId,remaining-amount)
    }
    grouped.set(key,group)
  }
  return {statements,grouped}
}

export async function invoiceList(db:D1Database,actor:string,broad:boolean):Promise<InvoiceListItem[]>{
  const rows=(await db.prepare(`SELECT i.*,p.name AS project_name,p.project_number,p.manager_user_id,c.name AS client_name,
    COALESCE((SELECT SUM(l.amount_cents) FROM invoice_lines l WHERE l.invoice_id=i.id),0) AS total_cents,
    COALESCE((SELECT SUM(ip.amount_cents) FROM invoice_payments ip WHERE ip.invoice_id=i.id AND ip.status='succeeded'),0) AS paid_cents
    FROM invoices i JOIN projects p ON p.id=i.project_id JOIN clients c ON c.id=i.client_id
    WHERE (?=1 OR p.manager_user_id=?) ORDER BY c.name COLLATE NOCASE,p.project_number,i.created_at DESC`).bind(Number(broad),actor).all<Row>()).results||[]
  return rows.map(r=>({id:s(r.id),invoiceNumber:s(r.invoice_number),projectId:s(r.project_id),clientId:s(r.client_id),source:r.source as 'monthly'|'manual',billingMonth:r.billing_month?s(r.billing_month):null,status:r.status as InvoiceListItem['status'],issueDate:s(r.issue_date),dueDate:s(r.due_date),totalCents:n(r.total_cents),paidCents:n(r.paid_cents),balanceCents:Math.max(0,n(r.total_cents)-n(r.paid_cents)),clientName:s(r.client_name),projectName:s(r.project_name),projectNumber:s(r.project_number),managerUserId:r.manager_user_id?s(r.manager_user_id):null}))
}

export async function invoiceDetail(db:D1Database,invoiceId:string,actor?:string,broad=false):Promise<InvoiceRecord|null>{
  const r=await db.prepare(`SELECT i.*,p.manager_user_id FROM invoices i JOIN projects p ON p.id=i.project_id WHERE i.id=?`).bind(invoiceId).first<Row>();if(!r)return null
  const [lineRows,allocationRows,paymentRows,workedRows,priorRows,managerNotification,brand]=await Promise.all([
    db.prepare('SELECT * FROM invoice_lines WHERE invoice_id=? ORDER BY sort_order,id').bind(invoiceId).all<Row>(),
    db.prepare(`SELECT a.*,e.project_task_id,e.entry_date,e.note,e.billing_type,t.task_name,u.display_name AS employee_name FROM invoice_entry_allocations a JOIN user_timesheet_entries e ON e.id=a.entry_id JOIN user_timesheets w ON w.id=e.timesheet_id JOIN users u ON u.id=w.user_id LEFT JOIN project_tasks t ON t.id=e.project_task_id WHERE a.invoice_id=? ORDER BY e.entry_date,e.id`).bind(invoiceId).all<Row>(),
    db.prepare('SELECT * FROM invoice_payments WHERE invoice_id=? ORDER BY created_at DESC').bind(invoiceId).all<Row>(),
    db.prepare(`SELECT e.project_task_id,SUM(e.hours) AS hours FROM user_timesheet_entries e JOIN user_timesheets w ON w.id=e.timesheet_id WHERE e.project_id=? AND w.status='approved' GROUP BY e.project_task_id`).bind(r.project_id).all<Row>(),
    db.prepare(`SELECT e.project_task_id,SUM(a.billed_hours_hundredths) AS billed_hours,SUM(a.writeoff_hours_hundredths) AS writeoff_hours FROM invoice_entry_allocations a JOIN invoices i ON i.id=a.invoice_id JOIN user_timesheet_entries e ON e.id=a.entry_id WHERE i.project_id=? AND i.id<>? AND i.status IN ('sent','paid') GROUP BY e.project_task_id`).bind(r.project_id,invoiceId).all<Row>(),
    db.prepare("SELECT status,error FROM invoice_notifications WHERE invoice_id=? AND kind='manager'").bind(invoiceId).first<Row>(),
    companyBranding(db)
  ])
  const lines:InvoiceLine[]=(lineRows.results||[]).map(x=>({id:s(x.id),projectTaskId:x.project_task_id?s(x.project_task_id):null,kind:x.kind as InvoiceLine['kind'],description:s(x.description),amountCents:n(x.amount_cents),sortOrder:n(x.sort_order)}))
  const allocations:InvoiceAllocation[]=(allocationRows.results||[]).map(x=>({entryId:s(x.entry_id),projectTaskId:x.project_task_id?s(x.project_task_id):null,taskName:x.task_name?s(x.task_name):null,billingType:s(x.billing_type),entryDate:s(x.entry_date),employeeName:s(x.employee_name),note:s(x.note),sourceHours:n(x.source_hours_hundredths)/100,billedHours:n(x.billed_hours_hundredths)/100,writeoffHours:n(x.writeoff_hours_hundredths)/100,sourceChargeCents:n(x.source_charge_cents),billedChargeCents:n(x.billed_charge_cents),writeoffChargeCents:n(x.writeoff_charge_cents),disposition:x.disposition as InvoiceAllocation['disposition'],splitBasis:x.split_basis as InvoiceAllocation['splitBasis']}))
  const payments:InvoicePaymentRecord[]=(paymentRows.results||[]).map(x=>({id:s(x.id),source:x.source as InvoicePaymentRecord['source'],status:x.status as InvoicePaymentRecord['status'],amountCents:n(x.amount_cents),method:s(x.method),referenceNumber:x.reference_number?s(x.reference_number):null,paidAt:x.paid_at?s(x.paid_at):null,qboSyncStatus:s(x.qbo_sync_status),qboSyncError:x.qbo_sync_error?s(x.qbo_sync_error):null}))
  const totalCents=lines.reduce((sum,l)=>sum+l.amountCents,0),paidCents=payments.filter(p=>p.status==='succeeded').reduce((sum,p)=>sum+p.amountCents,0)
  const taskIds=new Set([...lines.map(l=>l.projectTaskId),...allocations.map(a=>a.projectTaskId)].filter((x):x is string=>Boolean(x)))
  const taskRows=taskIds.size ? (await db.prepare(`SELECT id,task_name,bill_type,contract_amount_cents FROM project_tasks WHERE id IN (${[...taskIds].map(()=>'?').join(',')})`).bind(...taskIds).all<Row>()).results||[] : []
  const taskMap=new Map(taskRows.map(t=>[s(t.id),t]))
  const priorAmounts=taskIds.size?(await db.prepare(`SELECT l.project_task_id,SUM(l.amount_cents) AS amount FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE i.project_id=? AND i.id<>? AND i.status IN ('sent','paid') GROUP BY l.project_task_id`).bind(r.project_id,invoiceId).all<Row>()).results||[]:[]
  const tasks:InvoiceReviewTask[]=[...taskIds].map(taskId=>{const task=taskMap.get(taskId),mine=allocations.filter(a=>a.projectTaskId===taskId),previous=(priorRows.results||[]).find(x=>s(x.project_task_id)===taskId),worked=(workedRows.results||[]).find(x=>s(x.project_task_id)===taskId),line=lines.filter(l=>l.projectTaskId===taskId);return {projectTaskId:taskId,taskName:s(task?.task_name||mine[0]?.taskName),billingType:s(task?.bill_type||mine[0]?.billingType),workedHours:n(worked?.hours),previouslyBilledHours:n(previous?.billed_hours)/100,currentBilledHours:mine.reduce((v,a)=>v+a.billedHours,0),writeoffHours:n(previous?.writeoff_hours)/100+mine.reduce((v,a)=>v+a.writeoffHours,0),sourceChargeCents:mine.reduce((v,a)=>v+a.sourceChargeCents,0),currentChargeCents:mine.reduce((v,a)=>v+a.billedChargeCents,0),contractAmountCents:n(task?.contract_amount_cents),previouslyInvoicedCents:n(priorAmounts.find(x=>s(x.project_task_id)===taskId)?.amount),currentAmountCents:line.reduce((v,l)=>v+l.amountCents,0)}})
  const canEdit=r.status==='draft'&&Boolean(actor)&&(broad||s(r.manager_user_id)===actor),canSend=canEdit
  return {id:s(r.id),invoiceNumber:s(r.invoice_number),projectId:s(r.project_id),clientId:s(r.client_id),source:r.source as InvoiceRecord['source'],billingMonth:r.billing_month?s(r.billing_month):null,status:r.status as InvoiceRecord['status'],issueDate:s(r.issue_date),dueDate:s(r.due_date),notes:s(r.notes),internalNote:s(r.internal_note),billingName:s(r.billing_name),billingEmail:s(r.billing_email),billingAddress:parse(r.billing_address_json,address),projectReference:s(r.project_reference),projectAddress:parse(r.project_address_json,projectAddress),branding:{companyName:brand.companyName,logoUrl:brand.logoKind?`/invoices/${encodeURIComponent(invoiceId)}/logo?v=${brand.revision}`:null},publicToken:actor?s(r.public_token):'',revision:n(r.revision),lines,allocations,reviewTasks:tasks,payments,totalCents,paidCents,balanceCents:Math.max(0,totalCents-paidCents),emailStatus:s(r.email_status),emailError:r.email_error?s(r.email_error):null,managerEmailStatus:s(managerNotification?.status||'none'),managerEmailError:managerNotification?.error?s(managerNotification.error):null,qboSyncStatus:s(r.qbo_sync_status),qboSyncError:r.qbo_sync_error?s(r.qbo_sync_error):null,canEdit,canSend,canRetryQbo:Boolean(actor&&broad),canRecordPayment:Boolean(actor&&broad&&s(r.status)==='sent')}
}

export function publicInvoice(invoice:InvoiceRecord,token:string):PublicInvoice {return {id:invoice.id,invoiceNumber:invoice.invoiceNumber,status:invoice.status,issueDate:invoice.issueDate,dueDate:invoice.dueDate,notes:invoice.notes,billingName:invoice.billingName,billingAddress:invoice.billingAddress,projectReference:invoice.projectReference,projectAddress:invoice.projectAddress,branding:{...invoice.branding,logoUrl:invoice.branding.logoUrl?`/invoices/public/${encodeURIComponent(token)}/logo`:null},lines:invoice.lines,totalCents:invoice.totalCents,paidCents:invoice.paidCents,balanceCents:invoice.balanceCents}}
export async function refreshPaid(db:D1Database,invoiceId:string){
  const totals=await db.prepare(`SELECT COALESCE((SELECT SUM(amount_cents) FROM invoice_lines WHERE invoice_id=?),0) AS total,COALESCE((SELECT SUM(amount_cents) FROM invoice_payments WHERE invoice_id=? AND status='succeeded'),0) AS paid`).bind(invoiceId,invoiceId).first<{total:number;paid:number}>()
  if(totals&&totals.total>0&&totals.paid>=totals.total)await db.prepare("UPDATE invoices SET status='paid',paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('sent','paid')").bind(invoiceId).run()
  else await db.prepare("UPDATE invoices SET status='sent',paid_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='paid'").bind(invoiceId).run()
}

export { guard, unguard }
