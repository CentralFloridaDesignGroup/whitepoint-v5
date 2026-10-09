import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { allocateEntry, invoiceWindow } from '../src/services/invoiceCore.ts'

test('the monthly window uses 9 a.m. New York time across daylight saving',()=>{
  assert.deepEqual(invoiceWindow(Date.parse('2026-10-10T13:00:00Z')),{issueDate:'2026-10-10',dueDate:'2026-11-09',billingMonth:'2026-10',cutoff:'2026-10-01'})
  assert.deepEqual(invoiceWindow(Date.parse('2026-11-10T14:00:00Z')),{issueDate:'2026-11-10',dueDate:'2026-12-10',billingMonth:'2026-11',cutoff:'2026-11-01'})
  assert.equal(invoiceWindow(Date.parse('2026-11-10T13:00:00Z')),null)
})
test('hour and dollar splits reconcile to original hours and charge',()=>{
  const byHours=allocateEntry(3.75,56300,'split','hours',1.25)
  assert.equal(byHours.billedHoursHundredths,125)
  assert.equal(byHours.writeoffHoursHundredths,250)
  assert.equal(byHours.billedChargeCents+byHours.writeoffChargeCents,56300)
  const byCharge=allocateEntry(3.75,56300,'split','charge',20000)
  assert.equal(byCharge.billedChargeCents,20000)
  assert.equal(byCharge.billedHoursHundredths+byCharge.writeoffHoursHundredths,375)
  assert.throws(()=>allocateEntry(0.01,100,'split','hours',0.005))
  assert.throws(()=>allocateEntry(2,0,'split','charge',1))
})
test('invoice migration accepts allocations and prevents reserving one entry twice',()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON')
  for(const name of ['0001_baseline.sql','0002_webauthn_challenges.sql','0003_manage_settings.sql','0004_record_views.sql','0005_timesheets.sql','0006_billing_position_local_id.sql','0007_invoices.sql'])db.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'))
  db.exec("INSERT INTO clients(id,name) VALUES('c','Client'); INSERT INTO projects(id,project_number,client_id,name) VALUES('p','P-1','c','Project'); INSERT INTO user_timesheets(id,user_id,week_start,status) VALUES('w','1','2026-10-05','approved'); INSERT INTO user_timesheet_entries(id,timesheet_id,project_id,entry_date,hours,note) VALUES('e','w','p','2026-10-06',2,'Work');")
  db.prepare("INSERT INTO invoices(id,project_id,client_id,invoice_number,source,issue_date,due_date,billing_name,project_reference,public_token) VALUES('i','p','c','INV-1','manual','2026-10-10','2026-11-09','Client','P-1','token')").run()
  db.prepare("INSERT INTO invoice_entry_allocations(entry_id,invoice_id,disposition,source_hours_hundredths,billed_hours_hundredths,writeoff_hours_hundredths,source_charge_cents,billed_charge_cents,writeoff_charge_cents) VALUES('e','i','billed',200,200,0,30000,30000,0)").run()
  assert.throws(()=>db.prepare("INSERT INTO invoice_entry_allocations(entry_id,invoice_id,disposition,source_hours_hundredths,billed_hours_hundredths,writeoff_hours_hundredths,source_charge_cents,billed_charge_cents,writeoff_charge_cents) VALUES('e','i','write-off',200,0,200,30000,0,30000)").run())
  db.close()
})
