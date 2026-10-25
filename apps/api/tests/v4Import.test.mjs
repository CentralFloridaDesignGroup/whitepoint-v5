import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const migrations = ['0001_company_initialization', '0002_roles_permissions', '0003_user_init_auth_seed', '0004_client_init', '0005_project_init', '0006_timesheet_init', '0007_invoice_init']
const read = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')

test('V4 import applies on top of existing V5 records with valid references', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON')
  for (const name of migrations) db.exec(read(name))
  db.exec(`INSERT INTO client_number_sequences(period,last_value) VALUES('all',1);
    INSERT INTO clients(id,client_number,name,qbo_customer_id) VALUES('existing-client','C-0001','Existing','246');
    INSERT INTO projects(id,project_number,client_id,name,qbo_customer_id) VALUES('existing-project','26-9999','existing-client','Existing project','247')`)
  db.exec(read('0008_v4_import'))

  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  const count = table => db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE id LIKE 'v4-%'`).get().n
  assert.equal(count('clients'), 56)
  assert.equal(count('projects'), 93)
  assert.equal(count('invoices'), 9)
  assert.equal(db.prepare("SELECT COUNT(*) n FROM invoices WHERE status<>'sent'").get().n, 0)
  assert.equal(db.prepare("SELECT client_number FROM clients WHERE id LIKE 'v4-%' ORDER BY client_number LIMIT 1").get().client_number, 'C-0002')
  assert.equal(db.prepare("SELECT last_value FROM client_number_sequences WHERE period='all'").get().last_value, 57)
  assert.equal(db.prepare("SELECT last_value FROM number_sequences WHERE kind='project' AND period='2026'").get().last_value, 123)
  assert.deepEqual(db.prepare("SELECT project_number FROM projects WHERE project_number LIKE '%-B' ORDER BY 1").all().map(r => r.project_number), ['26-0007-B', '26-0025-B', '26-0026-B'])
  for (const row of db.prepare('SELECT i.invoice_number, i.public_token, (SELECT SUM(amount_cents) FROM invoice_lines WHERE invoice_id=i.id) lines FROM invoices i WHERE i.id LIKE \'v4-%\'').all()) {
    assert.ok(row.lines > 0, row.invoice_number)
  }
  assert.equal(db.prepare("SELECT SUM(amount_cents) n FROM invoice_lines WHERE invoice_id='v4-invoice-35'").get().n, 125000)
  assert.equal(db.prepare("SELECT public_token FROM invoices WHERE id='v4-invoice-55'").get().public_token.length > 20, true)
  db.close()
})
