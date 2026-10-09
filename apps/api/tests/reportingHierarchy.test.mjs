import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateReportingManagers } from '../src/services/reportingHierarchy.ts'

test('reporting chains allow multiple levels and reject cycles or inactive targets',()=>{
  assert.equal(validateReportingManagers(new Map([['leader',null],['manager','leader'],['staff','manager']])),null)
  assert.match(validateReportingManagers(new Map([['a','b'],['b','a']]))||'',/cycle/)
  assert.match(validateReportingManagers(new Map([['a','missing']]))||'',/active internal manager/)
})
