import { emailLayout } from './layout.ts'

type Application = { positionId: string; name: string; email: string; phone: string; message: string }

export function jobApplicationEmail(application: Application) {
  return emailLayout({
    title: `Job application ${application.positionId} - ${application.name}`,
    text: [`Position: ${application.positionId}`, `Name: ${application.name}`, `Email: ${application.email}`, `Phone: ${application.phone || 'Not provided'}`, '', 'Applicant message:', application.message || 'Not provided'].join('\n'),
    details: [['Position', application.positionId], ['Name', application.name], ['Email', application.email], ['Phone', application.phone || 'Not provided']],
    paragraphs: [`Applicant message:\n${application.message || 'Not provided'}`],
  })
}
