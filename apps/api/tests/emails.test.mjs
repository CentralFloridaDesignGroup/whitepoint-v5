import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accountAccessEmail } from '../src/emails/account.ts'
import { contactRequestEmail } from '../src/emails/contact.ts'
import { jobApplicationEmail } from '../src/emails/jobApplication.ts'
import { timesheetRejectedEmail, timesheetReminderEmail, timesheetReportEmail } from '../src/emails/timesheet.ts'
import { clientInvoiceEmail, invoiceDraftEmail } from '../src/emails/invoice.ts'
import { paymentNoticeEmail } from '../src/emails/payment.ts'
import { sendEmail } from '../src/services/brevo.ts'

test('all email families render HTML and plain text', () => {
  const samples = [
    accountAccessEmail('https://app.whitepointsurvey.com/login?token=abc'),
    contactRequestEmail({ firstName:'Jane', lastName:'Smith', email:'jane@example.com', phone:'407-555-0000', preferredMethod:'Email', subject:'Survey', message:'Please call.' }),
    jobApplicationEmail({ positionId:'01-0001', name:'Jane Smith', email:'jane@example.com', phone:'', message:'Experience.' }),
    timesheetReminderEmail('2026-10-19'),
    timesheetReportEmail('2026-10-19',['Jane Smith'],['Sam Staff']),
    timesheetRejectedEmail('2026-10-19','Missing notes'),
    invoiceDraftEmail('INV-1','Project One','https://app.whitepointsurvey.com/invoices/1'),
    clientInvoiceEmail('INV-1','Project One',12345,'https://payment.whitepointsurvey.com/pay/abc'),
    paymentNoticeEmail('Payment received','Payment received for INV-1.'),
  ]
  for (const content of samples) {
    assert.ok(content.text.length)
    assert.match(content.html, /<!doctype html>/)
    assert.match(content.html, /White Point Survey/)
  }
})

test('dynamic text is escaped and server links remain usable', () => {
  const message = contactRequestEmail({ firstName:'<script>', lastName:'& Sons', email:'jane@example.com', phone:'407-555-0000', preferredMethod:'Email', subject:'"Quote"', message:'<img src=x onerror=alert(1)>' })
  assert.doesNotMatch(message.html, /<script>|<img src=x/)
  assert.match(message.html, /&lt;script&gt;/)
  assert.match(message.html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.match(message.text, /<img src=x onerror=alert\(1\)>/)
  const access = accountAccessEmail('https://app.whitepointsurvey.com/login?token=a&next=b')
  assert.match(access.html, /href="https:\/\/app\.whitepointsurvey\.com\/login\?token=a&amp;next=b"/)
  const notice = paymentNoticeEmail('Verification needed', 'Return to https://payment.whitepointsurvey.com/pay/abc?x=1&y=2 to finish.')
  assert.match(notice.html, /href="https:\/\/payment\.whitepointsurvey\.com\/pay\/abc\?x=1&amp;y=2"/)
})

test('Brevo receives both formats while keeping reply-to and attachments', async () => {
  const originalFetch = globalThis.fetch
  let payload
  globalThis.fetch = async (_url, init) => { payload = JSON.parse(init.body); return new Response('{}', { status: 201 }) }
  try {
    await sendEmail({ BREVO_API_KEY:'test', BREVO_SENDER_EMAIL:'sender@example.com' }, {
      to:[{ email:'jane@example.com' }], subject:'Invoice', ...clientInvoiceEmail('INV-1','Project',12345,'https://payment.whitepointsurvey.com/pay/abc'),
      replyTo:{ email:'staff@example.com' }, attachments:[{ name:'invoice.pdf', content:'YQ==' }],
    })
    assert.match(payload.htmlContent, /View and pay invoice/)
    assert.match(payload.textContent, /Amount due: \$123\.45/)
    assert.equal(payload.replyTo.email, 'staff@example.com')
    assert.equal(payload.attachment[0].name, 'invoice.pdf')
  } finally { globalThis.fetch = originalFetch }
})
