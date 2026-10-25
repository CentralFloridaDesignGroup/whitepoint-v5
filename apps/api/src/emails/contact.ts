import { emailLayout } from './layout.ts'

type Contact = { firstName: string; lastName: string; email: string; phone: string; preferredMethod: string; subject: string; message: string }

export function contactRequestEmail(contact: Contact) {
  const name = `${contact.firstName} ${contact.lastName}`
  return emailLayout({
    title: `Contact request: ${contact.subject}`,
    text: [`Name: ${name}`, `Email: ${contact.email}`, `Phone: ${contact.phone}`, `Preferred contact: ${contact.preferredMethod}`, '', contact.message].join('\n'),
    details: [['Name', name], ['Email', contact.email], ['Phone', contact.phone], ['Preferred contact', contact.preferredMethod], ['Subject', contact.subject]],
    paragraphs: [contact.message],
  })
}

export function contactAcknowledgementEmail(firstName: string) {
  return emailLayout({
    title: 'We received your message',
    text: `Hi ${firstName},\n\nThank you for contacting White Point Survey. We received your message and will follow up soon.\n\nWhite Point Survey`,
    paragraphs: [`Hi ${firstName},`, 'Thank you for contacting White Point Survey. We received your message and will follow up soon.'],
  })
}
