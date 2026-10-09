import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CheckoutElementsProvider, PaymentElement, useCheckoutElements } from '@stripe/react-stripe-js/checkout'
import { loadStripe } from '@stripe/stripe-js'
import { CreditCard, Download } from 'lucide-react'
import { useParams, useSearchParams } from 'react-router-dom'
import type { PublicInvoice } from '@whitepoint/types'
import { createApiClient, downloadInvoicePdf, resolveApiBaseUrl } from '@whitepoint/utils'

type CheckoutSession = { clientSecret: string; checkoutSessionId: string; publishableKey: string }
const base = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL, location.hostname)
const publicApi = createApiClient({ baseUrl: base })
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
const date = (value: string) => /^(\d{4})-(\d{2})-(\d{2})$/.test(value) ? value.slice(5, 7) + '/' + value.slice(8, 10) + '/' + value.slice(0, 4) : value

const request = <T,>(path: string, init: { method?: string; body?: string } = {}) => publicApi.requestJson<T>(path, { ...init, authMode: 'public' })

function PaymentForm({ amount, onComplete }: { amount: number; onComplete: () => void }) {
  const state = useCheckoutElements(), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state.type !== 'success') return
    setBusy(true)
    const result = await state.checkout.confirm({ redirect: 'if_required' })
    if (result.type === 'error') setMessage(result.error.message || 'Payment could not be completed.')
    else { setMessage('Payment submitted. The balance will update when Stripe confirms it.'); onComplete() }
    setBusy(false)
  }
  return <form onSubmit={event => void submit(event)} className="space-y-4 border-t pt-6">
    <h2 className="text-lg font-semibold text-slate-900">Pay this invoice</h2>
    <PaymentElement options={{ layout: 'auto' }}/>
    <p className="rounded bg-blue-50 p-3 text-sm text-blue-900">Stripe securely processes card and bank details. White Point does not store them.</p>
    {message && <p role="status" className="text-sm">{message}</p>}
    <button disabled={busy || state.type !== 'success'} className="flex items-center gap-2 rounded bg-sky-900 px-4 py-3 font-semibold text-white disabled:opacity-50">
      <CreditCard size={17}/>{busy ? 'Submitting…' : 'Pay ' + money(amount)}
    </button>
  </form>
}

export function PayInvoicePage() {
  const { token = '' } = useParams(), [params] = useSearchParams()
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null)
  const [session, setSession] = useState<CheckoutSession | null>(null)
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [logoFailed, setLogoFailed] = useState(false)

  useEffect(() => { document.title = 'Pay Invoice - ' + (invoice?.branding.companyName || 'White Point Survey') }, [invoice?.branding.companyName])
  useEffect(() => {
    let active = true
    void request<{ invoice: PublicInvoice }>('/invoices/public/' + encodeURIComponent(token))
      .then(result => { if (active) setInvoice(result.invoice) })
      .catch(cause => { if (active) setError(String(cause)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])
  useEffect(() => { setLogoFailed(false) }, [invoice?.branding.logoUrl])
  useEffect(() => {
    if (!invoice || invoice.status !== 'sent' || invoice.balanceCents <= 0) return
    let active = true
    void request<CheckoutSession>('/invoices/public/' + encodeURIComponent(token) + '/checkout', { method: 'POST', body: '{}' })
      .then(result => { if (active) setSession(result) })
      .catch(cause => { if (active) setError(String(cause)) })
    return () => { active = false }
  }, [token, invoice?.id, invoice?.balanceCents, invoice?.status])
  const stripe = useMemo(() => session ? loadStripe(session.publishableKey) : null, [session])
  async function refresh() {
    try { const result = await request<{ invoice: PublicInvoice }>('/invoices/public/' + encodeURIComponent(token)); setInvoice(result.invoice) }
    catch { /* Keep the invoice visible while a payment settles. */ }
  }

  return <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
    <article className="mx-auto max-w-4xl space-y-7 rounded-xl border bg-white p-6 shadow-sm sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b pb-6">
        {invoice?.branding.logoUrl && !logoFailed
          ? <img src={base + invoice.branding.logoUrl} onError={() => setLogoFailed(true)} alt={invoice.branding.companyName} className="max-h-16 max-w-60 object-contain"/>
          : <strong className="max-w-64 text-lg text-sky-950">{invoice?.branding.companyName || 'White Point Survey'}</strong>}
        <div className="text-right"><p className="text-sm font-bold tracking-wide">INVOICE</p>
          <h1 className="text-2xl font-bold text-slate-900">{invoice?.invoiceNumber || ''}</h1>
          {invoice && <button className="mt-3 inline-flex items-center gap-2 rounded border px-3 py-2 text-sm" onClick={() => void downloadInvoicePdf(invoice, location.href, base).catch(cause => setError(String(cause)))}><Download size={16}/>Download PDF</button>}
        </div>
      </header>
      {loading && <p>Loading invoice…</p>}
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
      {params.has('payment') && <p className="rounded bg-blue-50 p-3 text-blue-900">Payment return received. The balance below updates after Stripe confirms the payment.</p>}
      {invoice && <>
        <div className="grid gap-7 text-sm sm:grid-cols-2">
          <section><h2 className="mb-3 text-xs font-bold tracking-wide text-slate-900">BILL TO</h2>
            <strong>{invoice.billingName}</strong>
            {[invoice.billingAddress.line1, invoice.billingAddress.line2, [invoice.billingAddress.city, invoice.billingAddress.state].filter(Boolean).join(', ') + (invoice.billingAddress.postalCode ? ' ' + invoice.billingAddress.postalCode : '')].filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}
          </section>
          <section><h2 className="mb-3 text-xs font-bold tracking-wide text-slate-900">DETAILS</h2>
            <dl className="grid grid-cols-2 gap-y-1"><dt>Issue date</dt><dd className="text-right">{date(invoice.issueDate)}</dd><dt>Due date</dt><dd className="text-right">{date(invoice.dueDate)}</dd><dt>Status</dt><dd className="text-right font-medium uppercase">{invoice.status === 'sent' ? 'Open' : invoice.status}</dd></dl>
          </section>
        </div>
        <section className="text-sm"><h2 className="mb-3 text-xs font-bold tracking-wide text-slate-900">PROJECT INFORMATION</h2>
          <p>{invoice.projectReference}</p>
          {[invoice.projectAddress.line1, [invoice.projectAddress.city, invoice.projectAddress.state].filter(Boolean).join(', ') + (invoice.projectAddress.postalCode ? ' ' + invoice.projectAddress.postalCode : '')].filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}
        </section>
        <div className="overflow-auto"><table className="w-full text-sm"><thead className="bg-[#1c3d5a] text-left text-white"><tr><th className="p-3">DESCRIPTION</th><th className="p-3">TYPE</th><th className="p-3 text-right">CURRENT</th></tr></thead>
          <tbody>{invoice.lines.map(line => <tr className="border-b" key={line.id}><td className="p-3">{line.description}</td><td className="p-3 text-slate-500">{line.kind === 'fixed-fee' ? 'Fixed fee' : line.kind === 'time' ? 'Time' : 'Other'}</td><td className="p-3 text-right">{money(line.amountCents)}</td></tr>)}</tbody>
        </table></div>
        <div className="ml-auto w-full max-w-xs space-y-2 text-sm"><div className="flex justify-between"><span>Current work total</span><span>{money(invoice.totalCents)}</span></div><div className="flex justify-between"><span>Payments received</span><span>{money(invoice.paidCents)}</span></div><div className="flex justify-between border-t pt-3 text-lg font-bold"><span>AMOUNT DUE</span><span>{money(invoice.balanceCents)}</span></div></div>
        {invoice.notes && <section className="text-sm"><h2 className="mb-2 text-xs font-bold tracking-wide">NOTES</h2><p className="whitespace-pre-line">{invoice.notes}</p></section>}
        {invoice.status === 'paid'
          ? <p className="rounded bg-green-50 p-3 font-medium text-green-800">This invoice is paid.</p>
          : invoice.status === 'sent' && invoice.balanceCents > 0 && session && stripe
            ? <CheckoutElementsProvider stripe={stripe} options={{ clientSecret: session.clientSecret, elementsOptions: { appearance: { theme: 'stripe' } }, adaptivePricing: { allowed: true } }}><PaymentForm amount={invoice.balanceCents} onComplete={() => { setSession(null); void refresh() }}/></CheckoutElementsProvider>
            : invoice.status === 'sent' && <p>Preparing secure payment form…</p>}
        <button className="text-sm text-sky-800 underline" onClick={() => void refresh()}>Refresh payment status</button>
      </>}
      <p className="border-t pt-5 text-center text-xs text-slate-500">Thank you for your business!</p>
    </article>
  </main>
}
