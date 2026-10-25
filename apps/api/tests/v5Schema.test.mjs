import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

test('fresh V5 migrations include weekly hours without V4 accounting objects', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON')
  for (const number of ['0001_company_initialization', '0002_roles_permissions', '0003_user_init_auth_seed', '0004_client_init', '0005_project_init', '0006_timesheet_init', '0007_invoice_init']) {
    db.exec(readFileSync(new URL(`../migrations/${number}.sql`, import.meta.url), 'utf8'))
  }
  const userColumns = db.prepare('PRAGMA table_info(users)').all()
  const weeklyHours = userColumns.find(column => column.name === 'weekly_hours')
  assert.equal(weeklyHours?.dflt_value, '0')
  for (const table of ['legacy_import_metadata', 'legacy_stripe_payout_guards', 'legacy_stripe_payment_guards']) {
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table), undefined)
  }
  for (const table of ['invoices', 'invoice_payments', 'stripe_payouts']) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name)
    assert.equal(columns.includes('origin'), false)
    assert.equal(columns.includes('legacy_qbo_deposit_id'), false)
  }
  db.close()
})
