import { emailLayout } from './layout.ts'

export function timesheetReminderEmail(weekStart: string) {
  const text = `Your timesheet for the week of ${weekStart} has not been submitted. Please submit your hours or an explicit zero-hour week in NorthStar.`
  return emailLayout({ title: 'Timesheet reminder', text, paragraphs: [text] })
}

export function timesheetReportEmail(weekStart: string, missing: string[], pending: string[]) {
  const unsubmitted = missing.join(', ') || 'None'
  const awaitingApproval = pending.join(', ') || 'None'
  return emailLayout({
    title: 'Timesheet status report',
    text: [`Timesheets for week of ${weekStart}`, `Unsubmitted (${missing.length}): ${unsubmitted}`, `Pending approval (${pending.length}): ${awaitingApproval}`].join('\n'),
    paragraphs: [`Timesheets for week of ${weekStart}`],
    details: [[`Unsubmitted (${missing.length})`, unsubmitted], [`Pending approval (${pending.length})`, awaitingApproval]],
  })
}

export function timesheetRejectedEmail(weekStart: string, reason: string) {
  return emailLayout({
    title: 'Timesheet rejected',
    text: `Your timesheet for ${weekStart} was rejected. Reason: ${reason}`,
    paragraphs: [`Your timesheet for ${weekStart} was rejected.`],
    details: [['Reason', reason]],
  })
}
