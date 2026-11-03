import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { PublicInvoice } from '@whitepoint/types'
import { appendHoursBreakdownPdf, createInvoicePdf, type InvoiceHourRow } from './invoicePdfCompiler.js'

export { createInvoicePdf, invoiceHoursBreakdownRows } from './invoicePdfCompiler.js'
export type { InvoiceHourRow } from './invoicePdfCompiler.js'

const filename = (invoice: PublicInvoice) => `${invoice.invoiceNumber.replace(/[^a-z0-9_-]+/gi, '_') || 'invoice'}.pdf`

export async function createInvoicePacket(invoice:PublicInvoice,paymentUrl:string,apiBaseUrl:string,logoDataUrl?:string,hourRows:readonly InvoiceHourRow[]=[]):Promise<Uint8Array>{
  const invoicePdf=await createInvoicePdf(invoice,paymentUrl,apiBaseUrl,logoDataUrl)
  if(hourRows.length)appendHoursBreakdownPdf(invoicePdf,invoice,hourRows)
  return new Uint8Array(invoicePdf.output('arraybuffer'))
}

export async function markInvoicePacketStatus(bytes: Uint8Array, status: PublicInvoice['status']): Promise<Uint8Array> {
  if (status !== 'paid' && status !== 'void') return bytes
  const document = await PDFDocument.load(bytes)
  const page = document.getPage(0)
  const font = await document.embedFont(StandardFonts.HelveticaBold)
  const label = status.toUpperCase()
  const color = status === 'paid' ? rgb(0.086, 0.639, 0.29) : rgb(0.863, 0.149, 0.149)
  const { width, height } = page.getSize()
  page.drawText(label, { x: width / 2 - font.widthOfTextAtSize(label, 64) / 2, y: height / 2 - 18, size: 64, font, color, opacity: 0.12, rotate: degrees(30) })
  page.drawRectangle({ x: width - 132, y: height - 112, width: 78, height: 24, color })
  page.drawText(label, { x: width - 93 - font.widthOfTextAtSize(label, 11) / 2, y: height - 104, size: 11, font, color: rgb(1, 1, 1) })
  return document.save()
}

export async function validatePoPdf(bytes:Uint8Array):Promise<void>{
  const document=await PDFDocument.load(bytes)
  if(document.getPageCount()<1)throw new Error('The PO PDF has no pages.')
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
