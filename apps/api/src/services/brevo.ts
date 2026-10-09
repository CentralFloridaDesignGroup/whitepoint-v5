import type { ApiEnv } from '../types/apiTypes'

type Email = {
  to: { email: string; name?: string }[]
  subject: string
  text: string
  replyTo?: { email: string; name?: string }
  attachments?: { name: string; content: string }[]
}

export async function sendEmail(env: ApiEnv, message: Email): Promise<void> {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) throw new Error('Brevo is not configured.')
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { email: env.BREVO_SENDER_EMAIL, name: 'White Point Survey' },
      to: message.to,
      subject: message.subject,
      textContent: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(message.attachments ? { attachment: message.attachments } : {}),
    }),
  })
  if (!response.ok) throw new Error(`Brevo returned ${response.status}`)
}

export function sendTimesheetEmail(env: ApiEnv, email: string, name: string, subject: string, text: string) {
  return sendEmail(env, { to: [{ email, name }], subject, text })
}
