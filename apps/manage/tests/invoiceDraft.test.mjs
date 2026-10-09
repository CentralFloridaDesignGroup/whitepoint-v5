import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultSplitValue, draftPreview } from '../src/pages/invoices/invoiceDraft.ts'

const invoice={allocations:[
  {entryId:'time-entry',projectTaskId:'time-task',billingType:'time-and-materials',sourceHours:2,sourceChargeCents:30000},
  {entryId:'fee-entry',projectTaskId:'fee-task',billingType:'fixed-fee',sourceHours:3,sourceChargeCents:45000},
]}
const lines=[
  {id:'time-line',projectTaskId:'time-task',kind:'time',amountCents:30000},
  {id:'fee-line',projectTaskId:'fee-task',kind:'fixed-fee',amountCents:20000},
  {id:'other-line',projectTaskId:null,kind:'manual',amountCents:5000},
]
const choice=(entryId,disposition,splitValue='')=>({entryId,disposition,splitBasis:'hours',splitValue})
const preview=(time,fixed=choice('fee-entry','billed'),overrides=['fee-line'])=>draftPreview({...invoice,reviewTasks:[{projectTaskId:'fee-task',contractAmountCents:100000,previouslyInvoicedCents:0}]},{lines,choices:[time,fixed],fixedFeeOverrides:overrides})

test('draft review updates time charges and hours as decisions change',()=>{
  const billed=preview(choice('time-entry','billed'))
  assert.equal(billed.total,55000)
  assert.equal(billed.timeTotal,30000)
  assert.equal(billed.fixedFeeTotal,20000)
  assert.equal(billed.otherTotal,5000)
  assert.equal(billed.byTaskHours.get('time-task'),2)

  const split=preview(choice('time-entry','split','1.00'))
  assert.equal(split.total,40000)
  assert.equal(split.timeTotal,15000)
  assert.equal(split.byTaskHours.get('time-task'),1)
  assert.equal(split.byTaskWriteoffHours.get('time-task'),1)

  const writtenOff=preview(choice('time-entry','write-off'))
  assert.equal(writtenOff.total,25000)
  assert.equal(writtenOff.byTaskHours.get('time-task'),0)
})

test('fixed fee hours update independently of the manager-entered invoice amount',()=>{
  const result=preview(choice('time-entry','billed'),choice('fee-entry','write-off'))
  assert.equal(result.total,55000)
  assert.equal(result.byTaskHours.get('fee-task'),0)
  assert.equal(result.byTaskWriteoffHours.get('fee-task'),3)
  assert.equal(defaultSplitValue(invoice.allocations[0],'hours'),'1.00')
  assert.equal(defaultSplitValue(invoice.allocations[0],'charge'),'150.00')
})

test('fixed fee suggestion follows decisions, permits an override, and caps at the contract',()=>{
  assert.equal(preview(choice('time-entry','billed'),choice('fee-entry','billed'),[]).fixedFeeTotal,45000)
  assert.equal(preview(choice('time-entry','billed'),choice('fee-entry','split','1.00'),[]).fixedFeeTotal,15000)
  assert.equal(preview(choice('time-entry','billed'),choice('fee-entry','write-off'),[]).fixedFeeTotal,0)
  assert.equal(preview(choice('time-entry','billed'),choice('fee-entry','write-off')).fixedFeeTotal,20000)
})
