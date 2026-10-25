import { emailLayout } from './layout.ts'

export function paymentNoticeEmail(subject: string, body: string) {
  return emailLayout({ title: subject, text: body, paragraphs: [body] })
}
