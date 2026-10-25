import { createInvoicePacket, invoiceHoursBreakdownRows, markInvoicePacketStatus } from '@whitepoint/utils/invoice-pdf'
import { companyLogoResponse } from './companyBranding.ts'
import { publicInvoice } from './invoiceData.ts'
import { invoiceDetail } from './invoiceRead.ts'
import type { InvoiceRecord } from '@whitepoint/types'
import type { ApiEnv } from '../types/apiTypes.ts'

export function base64Bytes(bytes:Uint8Array):string{
  let value=''
  for(let index=0;index<bytes.length;index+=8192)value+=String.fromCharCode(...bytes.subarray(index,index+8192))
  return btoa(value)
}

export async function buildInvoicePacket(env:ApiEnv,invoice:InvoiceRecord,poKeys:string[]):Promise<Uint8Array>{
  const poPdfs:Uint8Array[]=[]
  for(const key of poKeys){const object=await env.RECORD_DOCUMENTS.get(key);if(!object)throw new Error('A project PO document is missing.');poPdfs.push(new Uint8Array(await object.arrayBuffer()))}
  let logoDataUrl:string|undefined
  const logo=await companyLogoResponse(env)
  if(logo){const kind=logo.headers.get('Content-Type')||'image/png';logoDataUrl=`data:${kind};base64,${base64Bytes(new Uint8Array(await logo.arrayBuffer()))}`}
  const clientInvoice=publicInvoice({...invoice,status:'sent'},invoice.publicToken)
  const paymentUrl=`${env.PAYMENT_APP_URL||'https://payment.whitepointsurvey.com'}/pay/${encodeURIComponent(invoice.publicToken)}`
  return createInvoicePacket(clientInvoice,paymentUrl,'',poPdfs,logoDataUrl,invoice.includeHoursBreakdown?invoiceHoursBreakdownRows(invoice.allocations,undefined,invoice.includeLineItemNotes):[])
}

export async function storedInvoicePacket(env: ApiEnv, invoiceId: string, status: InvoiceRecord['status']) {
  const key = `invoices/${invoiceId}/packet.pdf`
  const object = await env.RECORD_DOCUMENTS.get(key)
  if (object) return markInvoicePacketStatus(new Uint8Array(await new Response(object.body).arrayBuffer()), status)
  // Imported invoices have no stored packet; build and store it on first request.
  if (status !== 'sent' && status !== 'paid') return null
  const invoice = await invoiceDetail(env.DB, invoiceId)
  if (!invoice) return null
  const packet = await buildInvoicePacket(env, invoice, [])
  await env.RECORD_DOCUMENTS.put(key, packet, { httpMetadata: { contentType: 'application/pdf' } })
  return markInvoicePacketStatus(packet, status)
}
