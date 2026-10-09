import { Hono } from 'hono'
import { sendEmail } from '../services/brevo.ts'
import { allowRequest } from '../services/rateLimit.ts'
import type { HonoEnv } from '../types/apiTypes.ts'

const inbox = 'info@whitepointsurvey.com'
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const maxFileSize = 3 * 1024 * 1024
const maxRequestSize = 7 * 1024 * 1024

function field(form: FormData, name: string, maxLength: number): string | null {
  const value = form.get(name)
  return typeof value === 'string' && value.trim().length <= maxLength ? value.trim() : null
}

function validFile(value: string | File | null): value is File {
  return value instanceof File && value.size > 0 && value.size <= maxFileSize &&
    /\.(pdf|doc|docx)$/i.test(value.name)
}

async function boundedForm(request: Request): Promise<FormData | null> {
  const contentType = request.headers.get('Content-Type') || ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data;') || !request.body) return null
  if (Number(request.headers.get('Content-Length') || 0) > maxRequestSize) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxRequestSize) { await reader.cancel(); return null }
      chunks.push(value)
    }
    return new Request(request.url, { method: 'POST', headers: { 'Content-Type': contentType }, body: new Blob(chunks) }).formData()
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}

function base64(bytes: Uint8Array): string {
  let result = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(result)
}

async function attachment(file: File) {
  return { name: file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120), content: base64(new Uint8Array(await file.arrayBuffer())) }
}

export function createPublicApi() {
  const api = new Hono<HonoEnv>()

  api.post('/contact', async c => {
    const declaredLength = Number(c.req.header('Content-Length') || 0)
    if (declaredLength > 16_384) return c.json({ error: 'Message is too large.' }, 413)
    let body: Record<string, unknown>
    try {
      if (!c.req.raw.body) return c.json({ error: 'Invalid message.' }, 400)
      const reader = c.req.raw.body.getReader()
      const decoder = new TextDecoder()
      let json = ''
      let size = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > 16_384) { await reader.cancel(); return c.json({ error: 'Message is too large.' }, 413) }
          json += decoder.decode(value, { stream: true })
        }
        json += decoder.decode()
      } finally { reader.releaseLock() }
      const parsed: unknown = JSON.parse(json)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return c.json({ error: 'Invalid message.' }, 400)
      body = parsed as Record<string, unknown>
    } catch { return c.json({ error: 'Invalid message.' }, 400) }
    const get = (key: string, max: number) => typeof body[key] === 'string' && (body[key] as string).trim().length <= max ? (body[key] as string).trim() : null
    if (get('website', 200)) return c.json({ ok: true })
    const firstName = get('firstName', 80), lastName = get('lastName', 80)
    const email = get('email', 254), phone = get('phone', 40)
    const subject = get('subject', 160), message = get('message', 5000)
    const preferredMethod = get('preferredMethod', 30)
    if (!firstName || !lastName || !email || !emailPattern.test(email) || !phone || !subject || !message || message.length < 10 ||
      !['Email', 'Phone', 'Text message'].includes(preferredMethod || '')) return c.json({ error: 'Please check the form fields.' }, 400)
    if (!await allowRequest(c.env.DB, `contact:${c.req.header('CF-Connecting-IP') || 'local'}`, 5, 3_600_000)) return c.json({ error: 'Too many messages. Please try again later.' }, 429)
    try {
      await sendEmail(c.env, {
        to: [{ email: inbox }], replyTo: { email, name: `${firstName} ${lastName}` },
        subject: `Contact request: ${subject}`,
        text: [`Name: ${firstName} ${lastName}`, `Email: ${email}`, `Phone: ${phone}`, `Preferred contact: ${preferredMethod}`, '', message].join('\n'),
      })
      try {
        await sendEmail(c.env, { to: [{ email, name: firstName }], subject: 'We received your message',
          text: `Hi ${firstName},\n\nThank you for contacting White Point Survey. We received your message and will follow up soon.\n\nWhite Point Survey` })
      } catch (error) { console.error('Contact acknowledgement failed', error) }
      return c.json({ ok: true })
    } catch (error) {
      console.error('Contact delivery failed', error)
      return c.json({ error: 'Your message could not be sent. Please try again.' }, 502)
    }
  })

  api.post('/job-applications', async c => {
    const form = await boundedForm(c.req.raw)
    if (!form) return c.json({ error: 'Application is too large or has an invalid format.' }, 400)
    if (field(form, 'website', 200)) return c.json({ ok: true })
    const positionId = field(form, 'positionId', 20)
    const name = field(form, 'applicantName', 120)?.replace(/[\r\n]+/g, ' ')
    const email = field(form, 'applicantEmail', 254)
    const phone = field(form, 'applicantPhone', 40)
    const message = field(form, 'applicantMessage', 2000)
    const resume = form.get('resume')
    const optionalCoverLetter = form.get('coverLetter')
    const coverLetter = optionalCoverLetter instanceof File && optionalCoverLetter.size === 0 ? null : optionalCoverLetter
    if (!positionId || !/^\d{2}-\d{4}$/.test(positionId) || !name || !email || !emailPattern.test(email) ||
      phone === null || message === null || !validFile(resume) || (coverLetter !== null && !validFile(coverLetter))) {
      return c.json({ error: 'Please check the form and attach a PDF, DOC, or DOCX resume of 3 MB or less.' }, 400)
    }
    if (!await allowRequest(c.env.DB, `job-application:${c.req.header('CF-Connecting-IP') || 'local'}`, 5, 3_600_000)) return c.json({ error: 'Too many applications. Please try again later.' }, 429)
    try {
      const attachments = [await attachment(resume)]
      if (coverLetter instanceof File) attachments.push(await attachment(coverLetter))
      await sendEmail(c.env, {
        to: [{ email: inbox }], replyTo: { email, name }, subject: `Job application ${positionId} - ${name}`,
        text: [`Position: ${positionId}`, `Name: ${name}`, `Email: ${email}`, `Phone: ${phone || 'Not provided'}`, '', 'Applicant message:', message || 'Not provided'].join('\n'),
        attachments,
      })
      return c.json({ ok: true })
    } catch (error) {
      console.error('Job application delivery failed', error)
      return c.json({ error: 'Application could not be sent. Please try again.' }, 502)
    }
  })
  return api
}
