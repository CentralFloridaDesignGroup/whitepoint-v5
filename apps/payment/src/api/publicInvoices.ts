import type { PublicInvoice } from '@whitepoint/types';
import { createApiClient, resolveApiBaseUrl } from '@whitepoint/utils/api-client';

export type CheckoutSession = { clientSecret: string; checkoutSessionId: string; publishableKey: string };
export const apiBaseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL, location.hostname);
const client = createApiClient({ baseUrl: apiBaseUrl });
const invoicePath = (token: string) => `/invoices/public/${encodeURIComponent(token)}`;

export async function fetchPublicInvoice(token: string): Promise<PublicInvoice> {
  const result = await client.requestJson<{ invoice: PublicInvoice }>(invoicePath(token), { authMode: 'public' });
  return result.invoice;
}

export function createCheckout(token: string): Promise<CheckoutSession> {
  return client.requestJson<CheckoutSession>(`${invoicePath(token)}/checkout`, {
    authMode: 'public', method: 'POST', body: '{}',
  });
}

export function fetchInvoicePacket(token: string): Promise<Blob> {
  return client.requestBlob(`${invoicePath(token)}/packet`, { authMode: 'public' });
}

export function fetchInvoicePo(token: string, documentId: string): Promise<Blob> {
  return client.requestBlob(`${invoicePath(token)}/po-documents/${encodeURIComponent(documentId)}`, { authMode: 'public' });
}

