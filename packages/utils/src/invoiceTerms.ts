export const INVOICE_TERMS = ['due-on-receipt', 'net-15', 'net-30', 'net-45', 'net-60'] as const
export type InvoiceTerm = typeof INVOICE_TERMS[number]

export function invoiceDueDate(issueDate: string, term: InvoiceTerm): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate) || !INVOICE_TERMS.includes(term)) throw new Error('Invalid invoice date or payment term.')
  const date = new Date(`${issueDate}T00:00:00Z`)
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== issueDate) throw new Error('Invalid invoice date.')
  date.setUTCDate(date.getUTCDate() + (term === 'due-on-receipt' ? 0 : Number(term.slice(4))))
  return date.toISOString().slice(0, 10)
}
