import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reminderWindow } from '../src/services/reminderWindow.ts'

test('Monday reminders use the previous Eastern Monday through Sunday', () => {
  assert.deepEqual(reminderWindow(Date.parse('2026-10-26T13:00:00Z')),{weekStart:'2026-10-19',kind:'missing'})
  assert.deepEqual(reminderWindow(Date.parse('2026-10-26T20:00:00Z')),{weekStart:'2026-10-19',kind:'report'})
  assert.equal(reminderWindow(Date.parse('2026-10-26T14:00:00Z')),null)
})

test('reminder hours follow Eastern daylight saving changes', () => {
  assert.deepEqual(reminderWindow(Date.parse('2026-11-02T14:00:00Z')),{weekStart:'2026-10-26',kind:'missing'})
  assert.deepEqual(reminderWindow(Date.parse('2026-11-02T21:00:00Z')),{weekStart:'2026-10-26',kind:'report'})
  assert.equal(reminderWindow(Date.parse('2026-11-02T13:00:00Z')),null)
})
