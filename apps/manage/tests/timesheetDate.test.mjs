import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultEntryDate, selectedMonday } from '../src/pages/timesheets/model.ts'

test('new time entries default to today only when today is within the selected week',()=>{
  assert.equal(defaultEntryDate('2026-10-26','2026-10-27'),'2026-10-27')
  assert.equal(defaultEntryDate('2026-10-19','2026-10-27'),'2026-10-19')
  assert.equal(defaultEntryDate('2026-11-02','2026-10-27'),'2026-11-02')
  assert.equal(defaultEntryDate('2026-10-26','2026-11-01'),'2026-11-01')
  assert.equal(selectedMonday('2026-10-29'),'2026-10-26')
})
