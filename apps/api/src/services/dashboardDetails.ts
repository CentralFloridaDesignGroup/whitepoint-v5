import type { DashboardDetailMetric, DashboardDetailResponse, DashboardDetailRow } from '@whitepoint/types'
import { businessDay, businessMonth, completedFourWeekWindow, dashboardMonthKeys, shiftBusinessDay, weeklyTargetHours } from './dashboardData.ts'

type Row = Record<string, unknown>
type Access = { projects: boolean; invoices: boolean; utilization: boolean; multiplier: boolean }
const s = (value: unknown) => String(value ?? '')
const n = (value: unknown) => Number(value ?? 0)
const projectMetrics = new Set<DashboardDetailMetric>(['project-active','project-due-soon','project-overdue','project-opportunity','project-proposal','project-shortlisted','project-negotiating'])
const invoiceMetrics = new Set<DashboardDetailMetric>(['invoice-paid','invoice-all','invoice-outstanding','invoice-late','invoice-draft','month'])

function invoiceQuery(db: D1Database) {
  return db.prepare(`SELECT i.id,i.invoice_number,i.status,i.sent_at,i.issue_date,i.due_date,
    p.id AS project_id,p.project_number,p.name AS project_name,c.name AS client_name,
    COALESCE(SUM(l.amount_cents),0) AS total_cents
    FROM invoices i JOIN projects p ON p.id=i.project_id JOIN clients c ON c.id=i.client_id
    LEFT JOIN invoice_lines l ON l.invoice_id=i.id
    WHERE i.status IN ('draft','sent','paid') GROUP BY i.id ORDER BY i.due_date,i.invoice_number`).all<Row>()
}

async function paidByInvoice(db: D1Database) {
  const rows = (await db.prepare(`SELECT ip.invoice_id,MAX(0,ip.amount_cents-ip.refunded_cents-ip.disputed_cents) AS net_cents
    FROM invoice_payments ip JOIN invoices i ON i.id=ip.invoice_id
    WHERE ip.status='succeeded' AND i.status IN ('sent','paid')`).all<Row>()).results || []
  const result = new Map<string, number>()
  for (const row of rows) {
    const id = s(row.invoice_id)
    result.set(id, (result.get(id) || 0) + n(row.net_cents))
  }
  return result
}

function invoiceRow(row: Row, amountCents: number, amountLabel: string, secondaryAmountCents?: number, secondaryAmountLabel?: string): DashboardDetailRow {
  return {
    id: s(row.id), kind: 'invoice', label: s(row.invoice_number),
    description: `${s(row.client_name)} · ${s(row.project_number)} ${s(row.project_name)}`,
    status: s(row.status), date: s(row.due_date), amountCents, amountLabel,
    ...(secondaryAmountCents===undefined?{}:{secondaryAmountCents}),
    ...(secondaryAmountLabel?{secondaryAmountLabel}:{}),relatedProjectId: s(row.project_id),
  }
}

async function projects(db: D1Database, metric: DashboardDetailMetric, today: string): Promise<DashboardDetailResponse> {
  const dueLimit = shiftBusinessDay(today, 7)
  const conditions: Record<string, string> = {
    'project-active': "p.stage='active'",
    'project-due-soon': "p.stage='active' AND p.due_date>=? AND p.due_date<=?",
    'project-overdue': "p.stage='active' AND p.due_date<?",
    'project-opportunity': "p.stage='opportunity'",
    'project-proposal': "p.stage='proposal'",
    'project-shortlisted': "p.stage='shortlisted'",
    'project-negotiating': "p.stage='negotiating'",
  }
  const condition = conditions[metric]!
  const query = db.prepare(`SELECT p.id,p.project_number,p.name AS project_name,p.stage,p.due_date,c.name AS client_name
    FROM projects p JOIN clients c ON c.id=p.client_id
    WHERE p.archived_at IS NULL AND p.active=1 AND ${condition}
    ORDER BY c.name COLLATE NOCASE,p.project_number`)
  const bound = metric === 'project-due-soon' ? query.bind(today,dueLimit)
    : metric === 'project-overdue' ? query.bind(today) : query
  const rows = (await bound.all<Row>()).results || []
  const titles: Record<string, string> = {
    'project-active':'Active projects','project-due-soon':'Projects due in 7 days','project-overdue':'Overdue projects',
    'project-opportunity':'Opportunities','project-proposal':'Projects in proposal','project-shortlisted':'Shortlisted projects','project-negotiating':'Projects in negotiation',
  }
  return { title: titles[metric]!, sections: [{ title: titles[metric]!, rows: rows.map(row => ({
    id:s(row.id),kind:'project',label:`${s(row.project_number)} · ${s(row.project_name)}`,
    description:s(row.client_name),status:s(row.stage),date:s(row.due_date),
  })) }] }
}

async function invoices(db: D1Database, metric: DashboardDetailMetric, today: string, month?: string): Promise<DashboardDetailResponse> {
  const [invoiceResult, paid] = await Promise.all([invoiceQuery(db), paidByInvoice(db)])
  const rows = invoiceResult.results || []
  if (metric === 'month') {
    const monthInvoices = rows.filter(row => typeof row.sent_at === 'string' && businessMonth(row.sent_at) === month)
    const payments = (await db.prepare(`SELECT ip.id,ip.invoice_id,ip.paid_at,ip.method,
      MAX(0,ip.amount_cents-ip.refunded_cents-ip.disputed_cents) AS net_cents,
      i.invoice_number,p.id AS project_id,p.project_number,p.name AS project_name,c.name AS client_name
      FROM invoice_payments ip JOIN invoices i ON i.id=ip.invoice_id JOIN projects p ON p.id=i.project_id JOIN clients c ON c.id=i.client_id
      WHERE ip.status='succeeded' AND i.status IN ('sent','paid') ORDER BY ip.paid_at,i.invoice_number`).all<Row>()).results || []
    const sentRows = monthInvoices.map(row => invoiceRow(row, n(row.total_cents), 'Sent'))
    const paymentRows = payments.filter(row => typeof row.paid_at === 'string' && businessMonth(row.paid_at) === month).map(row => ({
      id:s(row.id),kind:'payment' as const,label:s(row.invoice_number),
      description:`${s(row.client_name)} · ${s(row.project_number)} ${s(row.project_name)} · ${s(row.method)}`,
      date:s(row.paid_at),amountCents:n(row.net_cents),amountLabel:'Received',relatedInvoiceId:s(row.invoice_id),
    }))
    return { title:`Invoiced and received · ${month}`, sections:[
      {title:'Invoices sent',rows:sentRows},
      {title:'Payments received',rows:paymentRows},
    ] }
  }

  const titles: Record<string, string> = {
    'invoice-paid':'Paid amounts','invoice-all':'All current invoices','invoice-outstanding':'Outstanding invoices','invoice-late':'Late invoices','invoice-draft':'Draft invoices',
  }
  const items: DashboardDetailRow[] = []
  for (const row of rows) {
    const total = n(row.total_cents)
    if (metric === 'invoice-draft') {
      if (row.status === 'draft') items.push(invoiceRow(row,total,'Draft total'))
      continue
    }
    if(metric==='invoice-all'){
      const paidAmount=Math.min(total,paid.get(s(row.id))||0)
      items.push(invoiceRow(row,total,'Invoice total',paidAmount,'Paid'))
      continue
    }
    if (row.status === 'draft') continue
    const paidAmount = Math.min(total,paid.get(s(row.id)) || 0)
    const balance = Math.max(0,total-paidAmount)
    if (metric === 'invoice-paid' && paidAmount > 0) items.push(invoiceRow(row,paidAmount,'Paid',balance,'Remaining'))
    if (metric === 'invoice-late' && balance > 0 && s(row.due_date) < today) items.push(invoiceRow(row,balance,'Late',paidAmount,'Paid'))
    if (metric === 'invoice-outstanding' && balance > 0 && s(row.due_date) >= today) items.push(invoiceRow(row,balance,'Outstanding',paidAmount,'Paid'))
  }
  return { title:titles[metric]!, sections:[{title:titles[metric]!,rows:items}] }
}

async function utilization(db: D1Database, today: string, missing: boolean): Promise<DashboardDetailResponse> {
  const users = (await db.prepare(`SELECT id,display_name,weekly_hours FROM users_named
    WHERE user_type='internal' AND active=1 AND archived_at IS NULL ORDER BY display_name COLLATE NOCASE`).all<Row>()).results || []
  if (missing) {
    const rows = users.filter(user => user.weekly_hours !== null && Number(user.weekly_hours) === 0).map(user => ({
      id:s(user.id),kind:'staff' as const,label:s(user.display_name),status:'Missing weekly target',
    }))
    return {title:'Staff missing weekly targets',sections:[{title:'Needs setup',rows}]}
  }
  const window = completedFourWeekWindow(today)
  const entries = (await db.prepare(`SELECT w.user_id,e.entry_date,e.hours,e.billing_type
    FROM user_timesheet_entries e JOIN user_timesheets w ON w.id=e.timesheet_id
    WHERE w.status='approved' AND e.entry_date>=? AND e.entry_date<=?
      AND e.billing_type NOT IN ('non-billable','project')`).bind(window.from,window.through).all<Row>()).results || []
  const hours = new Map<string,number>()
  for (const entry of entries) hours.set(s(entry.user_id),(hours.get(s(entry.user_id))||0)+n(entry.hours))
  const rows = users.filter(user => weeklyTargetHours({weekly_hours:user.weekly_hours===null?null:n(user.weekly_hours)})>0).map(user => ({
    id:s(user.id),kind:'staff' as const,label:s(user.display_name),description:`${n(hours.get(s(user.id)))} approved billable hours · ${window.from} to ${window.through}`,
    hours:n(hours.get(s(user.id))),targetHours:weeklyTargetHours({weekly_hours:user.weekly_hours===null?null:n(user.weekly_hours)})*4,
  }))
  return {title:'Utilization · approved billable hours',sections:[{title:`${window.from} to ${window.through}`,rows}]}
}

async function multiplier(db: D1Database, today: string, monthStart: string): Promise<DashboardDetailResponse> {
  const rows = (await invoiceQuery(db)).results || []
  const invoiceRows = rows.filter(row => typeof row.sent_at==='string' && businessMonth(row.sent_at)===today.slice(0,7)).map(row => invoiceRow(row,n(row.total_cents),'Sent this month'))
  const labor = (await db.prepare(`SELECT e.id,e.entry_date,e.hours,e.cost_cents,p.id AS project_id,p.project_number,p.name AS project_name,u.display_name
    FROM user_timesheet_entries e JOIN user_timesheets w ON w.id=e.timesheet_id
    JOIN projects p ON p.id=e.project_id JOIN users_named u ON u.id=w.user_id
    WHERE w.status='approved' AND e.entry_date>=? AND e.entry_date<=? ORDER BY e.entry_date,u.display_name,p.project_number`).bind(monthStart,today).all<Row>()).results || []
  return {title:'Income multiplier · month to date',sections:[
    {title:'Invoices sent',rows:invoiceRows},
    {title:'Approved labor cost',rows:labor.map(row=>({
      id:s(row.id),kind:'time-entry',label:`${s(row.display_name)} · ${s(row.entry_date)}`,
      description:`${s(row.project_number)} ${s(row.project_name)} · ${n(row.hours)} hours`,
      amountCents:n(row.cost_cents),amountLabel:'Labor cost',hours:n(row.hours),relatedProjectId:s(row.project_id),
    }))},
  ]}
}

export async function dashboardDetails(
  db: D1Database,
  metric: DashboardDetailMetric,
  access: Access,
  month?: string,
  now = new Date(),
): Promise<DashboardDetailResponse> {
  const today = businessDay(now)
  if (projectMetrics.has(metric)) {
    if (!access.projects) throw new Error('FORBIDDEN')
    return projects(db,metric,today)
  }
  if (invoiceMetrics.has(metric)) {
    if (!access.invoices) throw new Error('FORBIDDEN')
    if (metric==='month') {
      if (!month || !dashboardMonthKeys(today).includes(month)) throw new Error('INVALID_MONTH')
      return invoices(db,metric,today,month)
    }
    return invoices(db,metric,today)
  }
  if (metric==='utilization' || metric==='missing-targets') {
    if (!access.utilization) throw new Error('FORBIDDEN')
    return utilization(db,today,metric==='missing-targets')
  }
  if (metric==='income-multiplier') {
    if (!access.multiplier) throw new Error('FORBIDDEN')
    return multiplier(db,today,`${today.slice(0,7)}-01`)
  }
  throw new Error('INVALID_METRIC')
}
