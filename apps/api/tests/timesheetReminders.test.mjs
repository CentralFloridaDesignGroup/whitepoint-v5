import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reminderWindow } from '../src/services/reminderWindow.ts'
import { sendTimesheetReminders } from '../src/services/timesheetReminders.ts'

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

test('rejected weeks remain unsubmitted for Monday reminders',async()=>{
  const sent=[],originalFetch=globalThis.fetch
  globalThis.fetch=async(_url,options)=>{sent.push(JSON.parse(options.body));return {ok:true}}
  const DB={prepare(sql){return {bind(){return this},async all(){return {results:sql.startsWith('SELECT id,email,display_name FROM users_named')?[{id:'a',email:'a@example.com',display_name:'A'},{id:'b',email:'b@example.com',display_name:'B'}]:[{user_id:'a',status:'rejected'},{user_id:'b',status:'approved'}]}},async run(){return {meta:{changes:1}}}}}}
  try{
    await sendTimesheetReminders({DB,BREVO_API_KEY:'test',BREVO_SENDER_EMAIL:'sender@example.com'},Date.parse('2026-10-26T13:00:00Z'))
    assert.deepEqual(sent.map(message=>message.to[0].email),['a@example.com'])
  }finally{globalThis.fetch=originalFetch}
})
