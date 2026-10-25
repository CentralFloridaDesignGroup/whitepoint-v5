import type { DashboardResponse } from '@whitepoint/types'

type Row = Record<string, unknown>
type Access = { projects: boolean; financials: boolean; utilization: boolean; multiplier: boolean }
const zone = 'America/New_York'
const money = (value: unknown) => Number(value || 0)

export function businessDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function businessMonth(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7)
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  if (Number.isNaN(date.valueOf())) return null
  return businessDay(date).slice(0, 7)
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function monthKeys(today: string): string[] {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 12 + index, 1))
    return date.toISOString().slice(0, 7)
  })
}

export function completedFourWeekWindow(today: string): { from: string; through: string } {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
  const currentMonday = shiftDay(today, -((weekday + 6) % 7))
  return { from: shiftDay(currentMonday, -28), through: shiftDay(currentMonday, -1) }
}

// NULL retains the 40-hour default; 0 needs setup and -1 has no minimum.
export function weeklyTargetHours(user: { weekly_hours: number | null }): number { return user.weekly_hours ?? 40 }

export async function dashboardData(db: D1Database, access: Access, now = new Date()): Promise<DashboardResponse> {
  const today = businessDay(now)
  const monthStart = `${today.slice(0, 7)}-01`
  const utilizationWindow = completedFourWeekWindow(today)
  const result: DashboardResponse = { asOf: today, projects: null, financials: null, staff: { utilization: null, incomeMultiplier: null } }

  if (access.projects) {
    const rows = (await db.prepare(`SELECT stage, due_date FROM projects WHERE archived_at IS NULL AND active=1 AND stage IN ('active','opportunity','proposal','shortlisted','negotiating')`).all<Row>()).results || []
    const active = rows.filter(row => row.stage === 'active')
    const dueLimit = shiftDay(today, 7)
    result.projects = {
      active: active.length,
      dueSoon: active.filter(row => typeof row.due_date === 'string' && row.due_date >= today && row.due_date <= dueLimit).length,
      overdue: active.filter(row => typeof row.due_date === 'string' && row.due_date < today).length,
      opportunities: {
        opportunity: rows.filter(row => row.stage === 'opportunity').length,
        proposal: rows.filter(row => row.stage === 'proposal').length,
        shortlisted: rows.filter(row => row.stage === 'shortlisted').length,
        negotiating: rows.filter(row => row.stage === 'negotiating').length,
      },
    }
  }

  let currentMonthSentCents = 0
  if (access.financials || access.multiplier) {
    const [invoices, payments] = await Promise.all([
      db.prepare(`SELECT i.id, i.status, i.sent_at, i.due_date, COALESCE(SUM(l.amount_cents),0) AS total_cents FROM invoices i LEFT JOIN invoice_lines l ON l.invoice_id=i.id WHERE i.status IN ('draft','sent','paid') GROUP BY i.id`).all<Row>(),
      db.prepare(`SELECT ip.invoice_id, ip.paid_at, MAX(0,ip.amount_cents-ip.refunded_cents-ip.disputed_cents) AS net_cents FROM invoice_payments ip JOIN invoices i ON i.id=ip.invoice_id WHERE ip.status='succeeded' AND i.status IN ('sent','paid')`).all<Row>(),
    ])
    const keys = monthKeys(today)
    const buckets = new Map(keys.map(month => [month, { month, sentCents: 0, incomeCents: 0 }]))
    const paidByInvoice = new Map<string, number>()
    for (const payment of payments.results || []) {
      const amount = money(payment.net_cents)
      const id = String(payment.invoice_id)
      paidByInvoice.set(id, (paidByInvoice.get(id) || 0) + amount)
      const month = typeof payment.paid_at === 'string' ? businessMonth(payment.paid_at) : null
      const bucket = month ? buckets.get(month) : null
      if (bucket) bucket.incomeCents += amount
    }
    const invoiceValue = { draftCents: 0, paidCents: 0, outstandingCents: 0, lateCents: 0, lateCount: 0 }
    for (const invoice of invoices.results || []) {
      const total = money(invoice.total_cents)
      if (invoice.status === 'draft') { invoiceValue.draftCents += total; continue }
      const paid = Math.min(total, paidByInvoice.get(String(invoice.id)) || 0)
      invoiceValue.paidCents += paid
      const balance = Math.max(0, total - paid)
      if (balance > 0 && typeof invoice.due_date === 'string' && invoice.due_date < today) {
        invoiceValue.lateCents += balance
        invoiceValue.lateCount++
      } else invoiceValue.outstandingCents += balance
      const month = typeof invoice.sent_at === 'string' ? businessMonth(invoice.sent_at) : null
      const bucket = month ? buckets.get(month) : null
      if (bucket) bucket.sentCents += total
      if (month === today.slice(0, 7)) currentMonthSentCents += total
    }
    if (access.financials) result.financials = { months: [...buckets.values()], invoiceValue }
  }

  if (access.utilization || access.multiplier) {
    const workStart = access.utilization && (!access.multiplier || utilizationWindow.from < monthStart) ? utilizationWindow.from : monthStart
    const [users, worked] = await Promise.all([
      access.utilization ? db.prepare(`SELECT id,weekly_hours FROM users WHERE user_type='internal' AND active=1 AND archived_at IS NULL`).all<{ id: string; weekly_hours: number | null }>() : Promise.resolve({ results: [] as { id: string; weekly_hours: number | null }[] }),
      db.prepare(`SELECT w.user_id,e.entry_date,e.hours,e.cost_cents,e.billing_type FROM user_timesheet_entries e JOIN user_timesheets w ON w.id=e.timesheet_id WHERE w.status='approved' AND e.entry_date>=? AND e.entry_date<=?`).bind(workStart, today).all<Row>(),
    ])
    const entries = worked.results || []
    if (access.utilization) {
      const targets = new Map((users.results || []).map(user => [user.id, weeklyTargetHours(user)]))
      const billableHours = entries.filter(row => typeof row.user_id === 'string' && (targets.get(row.user_id) || 0) > 0 && typeof row.entry_date === 'string' && row.entry_date >= utilizationWindow.from && row.entry_date <= utilizationWindow.through && row.billing_type && row.billing_type !== 'non-billable' && row.billing_type !== 'project').reduce((sum, row) => sum + money(row.hours), 0)
      const targetHours = [...targets.values()].reduce((sum, hours) => sum + (hours > 0 ? hours * 4 : 0), 0)
      const missingTargetCount = [...targets.values()].filter(hours => hours === 0).length
      result.staff.utilization = { billableHours, targetHours, percent: targetHours ? Math.round(billableHours / targetHours * 100) : 0, missingTargetCount, ...utilizationWindow }
    }
    if (access.multiplier) {
      const laborCost = entries.filter(row => typeof row.entry_date === 'string' && row.entry_date >= monthStart && row.entry_date <= today).reduce((sum, row) => sum + money(row.cost_cents), 0)
      result.staff.incomeMultiplier = laborCost > 0 ? Math.round(currentMonthSentCents / laborCost * 100) / 100 : null
    }
  }
  return result
}
