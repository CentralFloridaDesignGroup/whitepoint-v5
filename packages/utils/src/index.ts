// Utility scripts and helpers
// Add shared utility functions here

export * as Dates from "./dates";
export * as Numbers from "./numbers";
export { setCsrfToken, getCsrfToken } from './session';
export { createApiClient, resolveApiBaseUrl } from "./apiClient";
export { createFavoritesApi } from './favorites';
export { createInvoicePdf, createInvoicePacket, invoiceHoursBreakdownRows, validatePoPdf, downloadInvoicePdf, openInvoicePdfPreview } from './invoicePdf';
export { allocateEntry, allocateInvoiceDecision } from './invoiceAllocation';
export { INVOICE_TERMS, invoiceDueDate } from './invoiceTerms';
export type { InvoiceTerm } from './invoiceTerms';

export { setPageMetadata } from './pageMetadata';
export type { PageMetadata } from './pageMetadata';
export { downloadBlob } from './browserFiles';
export { formatUsdCents } from './currency';
