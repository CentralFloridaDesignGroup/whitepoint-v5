import { emailLayout } from './layout.ts'

export function accountAccessEmail(url: string) {
  return emailLayout({
    title: 'White Point account access',
    text: `Open this link to set your password. It expires in 30 minutes: ${url}`,
    paragraphs: ['Use the link below to set your password. This link expires in 30 minutes.'],
    action: { label: 'Set your password', url },
  })
}
