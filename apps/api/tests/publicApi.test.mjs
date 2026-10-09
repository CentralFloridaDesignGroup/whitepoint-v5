import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createPublicApi } from '../src/routes/publicApi.ts'

const originalFetch = globalThis.fetch
after(() => { globalThis.fetch = originalFetch })

const sent = []
globalThis.fetch = async (url, init) => {
  assert.equal(url, 'https://api.brevo.com/v3/smtp/email')
  sent.push(JSON.parse(init.body))
  return new Response('{}', { status: 201 })
}
const env = {
  BREVO_API_KEY: 'test-key', BREVO_SENDER_EMAIL: 'sender@example.com',
  DB: { prepare: () => ({ bind: () => ({ first: async () => ({ attempts: 1 }) }) }) },
}
const api = createPublicApi()

test('contact sends company mail and sender acknowledgement with server-owned recipients', async () => {
  sent.length = 0
  const response = await api.fetch(new Request('http://localhost/contact', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', phone: '407-555-0000',
      subject: 'Survey quote', preferredMethod: 'Email', message: 'Please survey my property.' }),
  }), env)
  assert.equal(response.status, 200)
  assert.deepEqual(sent.map(message => message.to[0].email), ['info@whitepointsurvey.com', 'jane@example.com'])
  assert.equal(sent[0].replyTo.email, 'jane@example.com')
})

test('job application sends bounded resume to company inbox', async () => {
  sent.length = 0
  const form = new FormData()
  form.set('positionId', '01-0001')
  form.set('applicantName', 'Jane Smith')
  form.set('applicantEmail', 'jane@example.com')
  form.set('applicantPhone', '407-555-0000')
  form.set('applicantMessage', 'CAD drafting experience')
  form.set('resume', new File(['resume text'], 'resume.pdf', { type: 'application/pdf' }))
  const response = await api.fetch(new Request('http://localhost/job-applications', { method: 'POST', body: form }), env)
  assert.equal(response.status, 200)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to[0].email, 'info@whitepointsurvey.com')
  assert.equal(sent[0].attachment[0].name, 'resume.pdf')
})

test('invalid job attachment is rejected before email', async () => {
  sent.length = 0
  const form = new FormData()
  form.set('positionId', '01-0001')
  form.set('applicantName', 'Jane Smith')
  form.set('applicantEmail', 'jane@example.com')
  form.set('applicantPhone', '')
  form.set('applicantMessage', '')
  form.set('resume', new File(['file'], 'resume.exe'))
  const response = await api.fetch(new Request('http://localhost/job-applications', { method: 'POST', body: form }), env)
  assert.equal(response.status, 400)
  assert.equal(sent.length, 0)
})
