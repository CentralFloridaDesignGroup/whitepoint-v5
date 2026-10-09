import { jsPDF } from 'jspdf'
import type { PublicInvoice } from '@whitepoint/types'

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
const date = (value: string) => /^(\d{4})-(\d{2})-(\d{2})$/.test(value) ? `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(0, 4)}` : value
const filename = (invoice: PublicInvoice) => `${invoice.invoiceNumber.replace(/[^a-z0-9_-]+/gi, '_') || 'invoice'}.pdf`
const navy = [15, 23, 42] as const
const blue = [28, 61, 90] as const
const ink = [17, 24, 39] as const
const muted = [100, 116, 139] as const

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
export async function createInvoicePdf(invoice: PublicInvoice, paymentUrl: string, apiBaseUrl: string): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const left = 54, right = 558, bottom = 703, footerY = 727
  const logo = invoice.branding.logoUrl ? await loadLogo(`${apiBaseUrl.replace(/\/$/, '')}${invoice.branding.logoUrl}`) : null
  const setColor = (rgb: readonly [number, number, number]) => pdf.setTextColor(rgb[0], rgb[1], rgb[2])
  let y = 0

  function draftMark() {
    if (invoice.status !== 'draft') return
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(58); pdf.setTextColor(238, 242, 247)
    pdf.text('DRAFT', 306, 412, { align: 'center', angle: 30 })
  }
  function newPage() {
    pdf.addPage(); draftMark()
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

  draftMark()
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
  for (const line of addressLines(invoice.projectAddress)) y += body(line, left, y, 350)
  y += 17

  tableHeader()
  if (!invoice.lines.length) {
    y += 16; body('No charges have been added.', left + 9, y, 350); y += 18
  }
  for (const item of invoice.lines) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10)
    const description = pdf.splitTextToSize(item.description, 320) as string[]
    const rowHeight = Math.max(36, description.length * 14 + 16)
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
  if (invoice.status === 'paid') { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(22, 163, 74); pdf.text('PAID', summaryX, y + 3); y += 18 }
  if (invoice.status === 'void') { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(220, 38, 38); pdf.text('VOID', summaryX, y + 3); y += 18 }

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

export async function downloadInvoicePdf(invoice: PublicInvoice, paymentUrl: string, apiBaseUrl: string): Promise<void> {
  const pdf = await createInvoicePdf(invoice, paymentUrl, apiBaseUrl)
  pdf.save(filename(invoice))
}

export async function openInvoicePdfPreview(invoice: PublicInvoice, paymentUrl: string, apiBaseUrl: string): Promise<boolean> {
  const preview = window.open('', '_blank')
  if (!preview) return false
  try {
    const pdf = await createInvoicePdf(invoice, paymentUrl, apiBaseUrl)
    const url = URL.createObjectURL(pdf.output('blob'))
    preview.location.href = url
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return true
  } catch (error) {
    preview.close()
    throw error
  }
}
