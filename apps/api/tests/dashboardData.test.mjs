import { test } from 'node:test'
import assert from 'node:assert/strict'
import { businessDay, businessMonth, completedFourWeekWindow, dashboardData, weeklyTargetHours } from '../src/services/dashboardData.ts'

function database(data) {
  const calls = []
  return {
    calls,
    prepare(sql) {
      calls.push(sql)
      const key = sql.includes('FROM projects WHERE') ? 'projects'
        : sql.includes('FROM invoices i LEFT JOIN') ? 'invoices'
        : sql.includes('FROM invoice_payments ip') ? 'payments'
        : sql.includes('FROM users WHERE') ? 'users' : 'worked'
      return { bind() { return this }, async all() { return { results: data[key] || [] } } }
    },
  }
}

test('New York dates handle month and daylight-saving boundaries', () => {
  assert.equal(businessMonth('2026-11-01T01:00:00Z'), '2026-10')
  assert.equal(businessMonth('2026-11-01T05:00:00Z'), '2026-11')
  assert.equal(businessMonth('2026-10-29'), '2026-10')
  assert.equal(businessDay(new Date('2026-10-29T01:00:00Z')), '2026-10-28')
  assert.deepEqual(completedFourWeekWindow('2026-10-29'), { from: '2026-09-28', through: '2026-10-25' })
  assert.deepEqual(completedFourWeekWindow('2026-11-02'), { from: '2026-10-05', through: '2026-11-01' })
})

test('dashboard counts deadlines, payment splits, approved time, and zero-filled months', async () => {
  const db = database({
    projects: [
      { stage: 'active', due_date: '2026-10-28' },
      { stage: 'active', due_date: '2026-10-29' },
      { stage: 'active', due_date: '2026-11-05' },
      { stage: 'active', due_date: '2026-11-06' },
      { stage: 'proposal', due_date: null },
    ],
    invoices: [
      { id: 'one', status: 'sent', sent_at: '2026-10-15 14:00:00', due_date: '2026-10-28', total_cents: 10000 },
      { id: 'two', status: 'paid', sent_at: '2026-10-01 14:00:00', due_date: '2026-10-01', total_cents: 2000 },
      { id: 'three', status: 'draft', sent_at: null, due_date: '2026-10-01', total_cents: 5000 },
      { id: 'four', status: 'sent', sent_at: '2026-10-29 14:00:00', due_date: '2026-10-29', total_cents: 4000 },
    ],
    payments: [
      { invoice_id: 'one', paid_at: '2026-10-20', net_cents: 3000 },
      { invoice_id: 'two', paid_at: '2026-10-25', net_cents: 2000 },
    ],
    users: [{ id: 'staff-one', weekly_hours: null }],
    worked: [
      { user_id: 'staff-one', entry_date: '2026-10-20', hours: 10, cost_cents: 5000, billing_type: 'fixed-fee' },
      { user_id: 'staff-one', entry_date: '2026-10-21', hours: 4, cost_cents: 1000, billing_type: 'non-billable' },
      { user_id: 'staff-one', entry_date: '2026-10-28', hours: 6, cost_cents: 2000, billing_type: 'fixed-fee' },
      { user_id: 'staff-one', entry_date: '2026-09-30', hours: 5, cost_cents: 2000, billing_type: 'fixed-fee' },
    ],
  })
  const result = await dashboardData(db, { projects: true, financials: true, utilization: true, multiplier: true }, new Date('2026-10-29T16:00:00Z'))
  assert.deepEqual(result.projects, { active: 4, dueSoon: 2, overdue: 1, opportunities: { opportunity: 0, proposal: 1, shortlisted: 0, negotiating: 0 } })
  assert.deepEqual(result.financials.invoiceValue, { draftCents: 5000, paidCents: 5000, outstandingCents: 4000, lateCents: 7000, lateCount: 1 })
  assert.equal(result.financials.months.length, 12)
  assert.deepEqual(result.financials.months.at(-1), { month: '2026-10', sentCents: 16000, incomeCents: 5000 })
  assert.equal(result.financials.months[0].sentCents, 0)
  assert.deepEqual(result.staff.utilization, { billableHours: 15, targetHours: 160, percent: 9, missingTargetCount: 0, from: '2026-09-28', through: '2026-10-25' })
  assert.equal(result.staff.incomeMultiplier, 2)
  assert.ok(db.calls[0].includes('archived_at IS NULL AND active=1'))
  assert.ok(db.calls.at(-1).includes("w.status='approved'"))
})

test('weekly targets distinguish default, missing, exempt, and individual hours', async () => {
  assert.equal(weeklyTargetHours({ weekly_hours: null }), 40)
  assert.equal(weeklyTargetHours({ weekly_hours: 0 }), 0)
  assert.equal(weeklyTargetHours({ weekly_hours: -1 }), -1)
  assert.equal(weeklyTargetHours({ weekly_hours: 32 }), 32)
  const db = database({
    users: [
      { id: 'default', weekly_hours: null },
      { id: 'part-time', weekly_hours: 20 },
      { id: 'missing', weekly_hours: 0 },
      { id: 'exempt', weekly_hours: -1 },
    ],
    worked: [
      { user_id: 'default', entry_date: '2026-10-20', hours: 10, billing_type: 'fixed-fee' },
      { user_id: 'part-time', entry_date: '2026-10-20', hours: 20, billing_type: 'fixed-fee' },
      { user_id: 'missing', entry_date: '2026-10-20', hours: 10, billing_type: 'fixed-fee' },
      { user_id: 'exempt', entry_date: '2026-10-20', hours: 10, billing_type: 'fixed-fee' },
      { user_id: 'inactive', entry_date: '2026-10-20', hours: 10, billing_type: 'fixed-fee' },
    ],
  })
  const result = await dashboardData(db, { projects: false, financials: false, utilization: true, multiplier: false }, new Date('2026-10-29T16:00:00Z'))
  assert.deepEqual(result.staff.utilization, { billableHours: 30, targetHours: 240, percent: 13, missingTargetCount: 1, from: '2026-09-28', through: '2026-10-25' })
})

test('restricted sections issue no business-data queries', async () => {
  const db = database({})
  const result = await dashboardData(db, { projects: false, financials: false, utilization: false, multiplier: false })
  assert.equal(result.projects, null)
  assert.equal(result.financials, null)
  assert.deepEqual(result.staff, { utilization: null, incomeMultiplier: null })
  assert.equal(db.calls.length, 0)
})

test('multiplier is unavailable without approved labor cost', async () => {
  const db = database({ invoices: [{ id: 'one', status: 'sent', sent_at: '2026-10-15 14:00:00', total_cents: 10000 }] })
  const result = await dashboardData(db, { projects: false, financials: false, utilization: false, multiplier: true }, new Date('2026-10-29T16:00:00Z'))
  assert.equal(result.financials, null)
  assert.equal(result.staff.incomeMultiplier, null)
})
