import { jsPDF } from 'jspdf'
import type { InvoiceAllocation, PublicInvoice } from '@whitepoint/types'

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
const date = (value: string) => /^(\d{4})-(\d{2})-(\d{2})$/.test(value) ? `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(0, 4)}` : value
const navy = [15, 23, 42] as const
const blue = [28, 61, 90] as const
const ink = [17, 24, 39] as const
const muted = [100, 116, 139] as const

export type InvoiceHourRow = { task: string; employee: string; date: string; hours: number; note?: string }

export function invoiceHoursBreakdownRows(allocations: readonly InvoiceAllocation[], billedHoursByEntry?: ReadonlyMap<string, number>, includeNotes=false): InvoiceHourRow[] {
  return allocations.filter(entry => ['time-and-materials', 'time-and-materials-nte'].includes(entry.billingType))
    .map(entry => ({ task: entry.taskName || 'General project', employee: entry.employeeName, date: entry.entryDate, hours: billedHoursByEntry?.get(entry.entryId) ?? entry.billedHours, ...(includeNotes && entry.note.trim() ? {note:entry.note.trim()} : {}) }))
    .filter(row => row.hours > 0)
    .sort((a, b) => a.task.localeCompare(b.task) || a.employee.localeCompare(b.employee) || a.date.localeCompare(b.date))
}

export function createHoursBreakdownPdf(invoice: PublicInvoice, rows: readonly InvoiceHourRow[]): jsPDF {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const left = 54, right = 558
  let y = 0
  function page() {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18); pdf.setTextColor(...navy)
    pdf.text('Time and materials hours', left, 58)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(...muted)
    pdf.text(`Invoice ${invoice.invoiceNumber}  |  ${invoice.projectReference}`, left, 78)
    pdf.setDrawColor(203, 213, 225); pdf.line(left, 94, right, 94)
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...navy)
    pdf.text('Task', left, 118); pdf.text('Employee', 267, 118); pdf.text('Date', 433, 118); pdf.text('Hours', right, 118, { align: 'right' })
    y = 130
  }
  page()
  for (const row of rows) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
    const task = pdf.splitTextToSize(row.task, 205) as string[]
    const employee = pdf.splitTextToSize(row.employee, 155) as string[]
    const height = Math.max(22, Math.max(task.length, employee.length) * 12 + 8)
    if (y + height > 710) { pdf.addPage(); page() }
    pdf.setTextColor(...ink); pdf.text(task, left, y + 13); pdf.text(employee, 267, y + 13)
    pdf.text(date(row.date), 433, y + 13); pdf.text(row.hours.toFixed(2), right, y + 13, { align: 'right' })
    y += height
    if(row.note){
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...muted)
      for(const line of pdf.splitTextToSize(row.note,right-left-12) as string[]){
        if(y+11>710){pdf.addPage();page();pdf.setFont('helvetica', 'normal');pdf.setFontSize(9);pdf.setTextColor(...muted)}
        pdf.text(line,left+12,y+8);y+=11
      }
      y+=5
    }
    pdf.setDrawColor(226, 232, 240); pdf.line(left, y, right, y)
  }
  if (y + 34 > 710) { pdf.addPage(); page() }
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...navy)
  pdf.text('Total billed hours', left, y + 24)
  pdf.text(rows.reduce((sum, row) => sum + row.hours, 0).toFixed(2), right, y + 24, { align: 'right' })
  return pdf
}

type PdfLogo = { dataUrl: string; width: number; height: number }

async function loadLogo(url: string): Promise<PdfLogo | null> {
  try {
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok) return null
    const objectUrl = URL.createObjectURL(await response.blob())
    try {
      const image = new Image()
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Logo image could not be decoded.'))
        image.src = objectUrl
      })
      if (!image.naturalWidth || !image.naturalHeight) return null
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight))
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) return null
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return null
  }
}

function addressLines(address: { line1: string; line2?: string; city: string; state: string; postalCode: string }) {
  return [address.line1, address.line2, [address.city, address.state].filter(Boolean).join(', ') + (address.postalCode ? ` ${address.postalCode}` : '')].filter(Boolean) as string[]
}

/** The same client-facing PDF is used by Manage and Payment. apiBaseUrl resolves the logo held in company settings. */
export async function createInvoicePdf(invoice: PublicInvoice, paymentUrl: string, apiBaseUrl: string, logoDataUrl?:string): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const left = 54, right = 558, bottom = 703, footerY = 727
  const logo = logoDataUrl ? (()=>{const info=pdf.getImageProperties(logoDataUrl);return {dataUrl:logoDataUrl,width:info.width,height:info.height}})() : invoice.branding.logoUrl && typeof Image!=='undefined' ? await loadLogo(`${apiBaseUrl.replace(/\/$/, '')}${invoice.branding.logoUrl}`) : null
  const setColor = (rgb: readonly [number, number, number]) => pdf.setTextColor(rgb[0], rgb[1], rgb[2])
  const setFill = (rgb: readonly [number, number, number]) => pdf.setFillColor(rgb[0], rgb[1], rgb[2])
  let y = 0

  function statusWatermark() {
    if (!['draft', 'paid', 'void'].includes(invoice.status)) return
    const label = invoice.status.toUpperCase()
    const color = invoice.status === 'paid' ? [220, 252, 231] as const : invoice.status === 'void' ? [254, 226, 226] as const : [238, 242, 247] as const
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(58); setColor(color)
    pdf.text(label, 306, 412, { align: 'center', angle: 30 })
  }
  function newPage() {
    pdf.addPage(); statusWatermark()
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); setColor(navy)
    pdf.text(`Invoice ${invoice.invoiceNumber} · continued`, left, 51)
    pdf.setDrawColor(203, 213, 225); pdf.line(left, 61, right, 61)
    y = 80
  }
  function ensureSpace(height: number) { if (y + height > bottom) newPage() }
  function section(label: string, x: number, atY: number) {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); setColor(navy); pdf.text(label, x, atY)
  }
  function body(value: string, x: number, atY: number, maxWidth = 250) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); setColor(ink)
    const lines = pdf.splitTextToSize(value, maxWidth) as string[]
    pdf.text(lines, x, atY)
    return Math.max(1, lines.length) * 16
  }
  function tableHeader() {
    ensureSpace(34)
    pdf.setFillColor(blue[0], blue[1], blue[2]); pdf.rect(left, y, right - left, 30, 'F')
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(255, 255, 255)
    pdf.text('DESCRIPTION', left + 9, y + 19)
    pdf.text('TYPE', 393, y + 19)
    pdf.text('CURRENT', right - 9, y + 19, { align: 'right' })
    y += 30
  }

  statusWatermark()
  if (logo) {
    const scale = Math.min(170 / logo.width, 58 / logo.height)
    pdf.addImage(logo.dataUrl, 'PNG', left, 28, logo.width * scale, logo.height * scale)
  } else {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); setColor(blue)
    pdf.text(pdf.splitTextToSize(invoice.branding.companyName, 295) as string[], left, 52)
  }
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); setColor(navy)
  pdf.text('INVOICE', right, 53, { align: 'right' })
  pdf.setFontSize(20)
  pdf.text(invoice.invoiceNumber, right, 80, { align: 'right', maxWidth: 255 })
  if (invoice.status === 'paid' || invoice.status === 'void') {
    const paid = invoice.status === 'paid'
    setFill(paid ? [22, 163, 74] : [220, 38, 38])
    pdf.roundedRect(right - 78, 88, 78, 24, 3, 3, 'F')
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(255, 255, 255)
    pdf.text(invoice.status.toUpperCase(), right - 39, 104, { align: 'center' })
  }
  if (invoice.status === 'sent' && invoice.balanceCents > 0 && paymentUrl) {
    const label = 'OPEN PAYMENT PAGE'
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); setColor(blue)
    const x = right - pdf.getTextWidth(label)
    pdf.textWithLink(label, x, 98, { url: paymentUrl })
    pdf.setDrawColor(blue[0], blue[1], blue[2]); pdf.line(x, 100, right, 100)
  }

  const detailX = 365, top = 112
  section('BILL TO', left, top); section('DETAILS', detailX, top)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); setColor(ink)
  const clientName = pdf.splitTextToSize(invoice.billingName, detailX - left - 24) as string[]
  pdf.text(clientName, left, top + 20)
  let addressY = top + 20 + clientName.length * 16
  for (const line of addressLines(invoice.billingAddress)) addressY += body(line, left, addressY, detailX - left - 24)
  const detailRow = (label: string, value: string, rowY: number) => {
    body(label, detailX, rowY, 92)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); setColor(ink)
    pdf.text(value, right, rowY, { align: 'right' })
  }
  detailRow('Issue date', date(invoice.issueDate), top + 20)
  detailRow('Due date', date(invoice.dueDate), top + 36)
  detailRow('Status', invoice.status === 'sent' ? 'OPEN' : invoice.status.toUpperCase(), top + 52)
  y = Math.max(addressY, top + 82) + 23

  section('PROJECT INFORMATION', left, y)
  if (invoice.status === 'sent' && invoice.balanceCents > 0 && paymentUrl) {
    pdf.setFillColor(blue[0], blue[1], blue[2]); pdf.roundedRect(right - 120, y - 15, 120, 29, 3, 3, 'F')
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(255, 255, 255)
    pdf.text('Pay Online', right - 60, y + 3, { align: 'center' })
    pdf.link(right - 120, y - 15, 120, 29, { url: paymentUrl })
  }
  y += 19
  y += body(invoice.projectReference, left, y, 350)
  if(invoice.poNumber)y += body(`PO ${invoice.poNumber}`,left,y,350)
  for (const line of addressLines(invoice.projectAddress)) y += body(line, left, y, 350)
  y += 17

  tableHeader()
  if (!invoice.lines.length) {
    y += 16; body('No charges have been added.', left + 9, y, 350); y += 18
  }
  for (const item of invoice.lines) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10)
    const description = pdf.splitTextToSize(item.description, 320) as string[]
    const rowHeight = Math.max(26, description.length * 14 + 12)
    if (y + rowHeight > bottom) { newPage(); tableHeader() }
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10)
    pdf.setFillColor(255, 255, 255); pdf.rect(left, y, right - left, rowHeight, 'F')
    setColor(ink); pdf.text(description, left + 9, y + 17)
    setColor(muted); pdf.text(item.kind === 'fixed-fee' ? 'Fixed fee' : item.kind === 'time' ? 'Time' : 'Other', 393, y + 17)
    setColor(ink); pdf.text(money(item.amountCents), right - 9, y + 17, { align: 'right' })
    y += rowHeight; pdf.setDrawColor(226, 232, 240); pdf.line(left, y, right, y)
  }

  y += 22; ensureSpace(82)
  const summaryX = 365
  const summaryRow = (label: string, amount: number, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(bold ? 13 : 10); setColor(bold ? navy : ink)
    pdf.text(label, summaryX, y); pdf.text(money(amount), right, y, { align: 'right' }); y += bold ? 22 : 17
  }
  summaryRow('Current work total', invoice.totalCents)
  summaryRow('Payments received', invoice.paidCents)
  pdf.setDrawColor(203, 213, 225); pdf.line(summaryX, y - 4, right, y - 4); y += 16
  summaryRow('AMOUNT DUE', invoice.balanceCents, true)
  if (invoice.status === 'paid' || invoice.status === 'void') {
    const paid = invoice.status === 'paid'
    setFill(paid ? [220, 252, 231] : [254, 226, 226])
    pdf.roundedRect(summaryX, y - 8, right - summaryX, 27, 3, 3, 'F')
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); setColor(paid ? [21, 128, 61] : [185, 28, 28])
    pdf.text(invoice.status.toUpperCase(), (summaryX + right) / 2, y + 10, { align: 'center' }); y += 35
  }

  if (invoice.notes.trim()) {
    y += 19; ensureSpace(40); section('NOTES', left, y); y += 18
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); setColor(ink)
    const notes = pdf.splitTextToSize(invoice.notes, right - left) as string[]
    for (const note of notes) { ensureSpace(16); body(note, left, y, right - left); y += 16 }
  }

  const pages = pdf.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setDrawColor(203, 213, 225); pdf.line(left, footerY, right, footerY)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); setColor(muted)
    pdf.text('Thank you for your business! We accept debit cards, credit cards, bank payments, and checks.', 306, footerY + 19, { align: 'center', maxWidth: right - left })
    pdf.text(`${page} / ${pages}`, right, 773, { align: 'right' })
  }
  return pdf
}

