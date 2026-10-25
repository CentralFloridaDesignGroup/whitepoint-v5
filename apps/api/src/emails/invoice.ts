import { emailLayout } from './layout.ts'

export function invoiceDraftEmail(number: string, project: string, url: string) {
  return emailLayout({
    title: `Invoice draft ${number} is ready`,
    text: `Review approved work and billing decisions for ${project}: ${url}`,
    paragraphs: ['An invoice draft is ready for your review.'],
    details: [['Invoice', number], ['Project', project]],
    action: { label: 'Review invoice draft', url },
  })
}

export function clientInvoiceEmail(number: string, project: string, balanceCents: number, url: string) {
  const amount = `$${(balanceCents / 100).toFixed(2)}`
  return emailLayout({
    title: `Invoice ${number} from White Point Survey`,
    text: `Invoice ${number} for ${project} is ready. Amount due: ${amount}. View and pay: ${url}`,
    paragraphs: ['Your invoice is ready. A copy is attached to this email.'],
    details: [['Invoice', number], ['Project', project], ['Amount due', amount]],
    action: { label: 'View and pay invoice', url },
  })
}
