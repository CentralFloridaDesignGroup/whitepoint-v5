import { test } from 'node:test'
import assert from 'node:assert/strict'
import { invoiceDueDate } from '@whitepoint/utils/invoice-terms'

test('invoice terms use the selected issue date and calendar days',()=>{
  assert.equal(invoiceDueDate('2026-01-31','due-on-receipt'),'2026-01-31')
  assert.equal(invoiceDueDate('2026-01-31','net-15'),'2026-02-15')
  assert.equal(invoiceDueDate('2026-01-31','net-30'),'2026-03-02')
  assert.equal(invoiceDueDate('2026-01-31','net-45'),'2026-03-17')
  assert.equal(invoiceDueDate('2026-01-31','net-60'),'2026-04-01')
  assert.equal(invoiceDueDate('2024-02-28','net-15'),'2024-03-14')
  assert.throws(()=>invoiceDueDate('2026-02-30','net-30'))
})
