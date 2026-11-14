import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeStaffReturnPath } from '../src/layout/staffReturnPath.ts'

test('staff login returns to any local route, including root, query and hash', () => {
  const origin = 'https://docs.whitepointsurvey.com'
  for (const path of ['/', '/tools/survey-notes', '/checklists/homebuilder?view=review#section-2'])
    assert.equal(safeStaffReturnPath(path, origin), path)
  for (const path of ['https://attacker.example', '//attacker.example', '/\\attacker.example', '/login', '/login?token=x', '/%2f%2fattacker.example', '/a\nredirect'])
    assert.equal(safeStaffReturnPath(path, origin), null)
})
