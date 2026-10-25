export { allocateEntry } from '@whitepoint/utils/invoice-allocation'
import { invoiceDueDate } from '@whitepoint/utils/invoice-terms'

export function invoiceWindow(timestamp: number) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(timestamp)).map(part => [part.type,part.value]))
  if (parts.day !== '10' || parts.hour !== '09') return null
  const issueDate = `${parts.year}-${parts.month}-10`
  return { issueDate, dueDate: invoiceDueDate(issueDate,'net-30'), billingMonth: `${parts.year}-${parts.month}`, cutoff: `${parts.year}-${parts.month}-01` }
}
