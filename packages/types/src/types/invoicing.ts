export type InvoiceState = 'draft' | 'sent' | 'paid' | 'void';
export type ProjectInvoiceReference = { id: string; invoiceNumber: string; amountCents: number; paidCents: number; dueDate: string | null; status: 'draft' | 'paid' | 'unpaid' | 'overdue' | 'void' };
export type InvoiceDisposition = 'billed' | 'hold' | 'write-off' | 'split';
export type InvoicePaymentTerm = 'due-on-receipt' | 'net-15' | 'net-30' | 'net-45' | 'net-60';
export type InvoiceWriteoffReason = 'advance' | 'over-budget';
export type InvoiceRecipient = { contactId: string; name: string; email: string; selected: boolean; isPrimary: boolean; isBillingPoc: boolean; deliveryStatus: 'none' | 'pending' | 'accepted' | 'failed'; deliveryError: string | null };
export type InvoicePoDocument = { id: string; name: string };
export type InvoiceAnalysis = { projectContractCents:number|null; rows:{taskId:string|null;taskName:string;contractCents:number;approvedCostCents:number|null;priorInvoicedCents:number}[] };
export type InvoiceSplitBasis = 'hours' | 'charge' | null;
export type InvoiceLine = {
  id: string; projectTaskId: string | null; kind: 'time' | 'fixed-fee' | 'manual';
  description: string; amountCents: number; sortOrder: number;
};
export type InvoiceAllocation = {
  entryId: string; projectTaskId: string | null; taskName: string | null; billingType: string;
  entryDate: string; employeeName: string; note: string; sourceHours: number;
  billedHours: number; writeoffHours: number; heldHours: number; sourceChargeCents: number;
  billedChargeCents: number; writeoffChargeCents: number; heldChargeCents: number;
  disposition: InvoiceDisposition; splitBasis: InvoiceSplitBasis;
  writeoffReason: InvoiceWriteoffReason | null; writeoffExplanation: string;
};
export type InvoicePaymentRecord = {
  id: string; source: 'manual' | 'stripe'; status: 'pending' | 'succeeded' | 'failed' | 'void';
  amountCents: number; method: string; referenceNumber: string | null; paidAt: string | null;
  qboSyncStatus: string; qboSyncError: string | null;
  stripePayoutId: string | null; stripeFeeCents: number; stripeNetCents: number | null;
  lastFour: string | null; refundedCents: number; disputedCents: number; reviewError: string | null;
  hasOpenDispute: boolean;
  stripePayoutStatus: string | null; payoutQboStatus: string | null; payoutQboError: string | null; qboPostedAmountCents: number | null;
};
export type InvoiceReviewTask = {
  projectTaskId: string | null; taskName: string; billingType: string;
  workedHours: number; previouslyBilledHours: number; currentBilledHours: number;
  writeoffHours: number; sourceChargeCents: number; currentChargeCents: number;
  contractAmountCents: number; previouslyInvoicedCents: number; currentAmountCents: number;
};
export type InvoiceBranding = { companyName: string; logoUrl: string | null };
export type InvoicePoolEntry = { entryId: string; taskId: string | null; taskName: string; employeeName: string; entryDate: string; hours: number; chargeCents: number; billingType: string; note: string };
export type InvoiceRecord = {
  id: string; invoiceNumber: string; projectId: string; clientId: string; source: 'monthly' | 'manual';
  billingMonth: string | null; status: InvoiceState; issueDate: string; dueDate: string; paymentTerm: InvoicePaymentTerm;
  includeHoursBreakdown: boolean;
  includeLineItemNotes: boolean;
  notes: string; internalNote: string; billingName: string; billingEmail: string;
  billingAddress: {line1:string;line2:string;city:string;state:string;postalCode:string};
  projectReference: string; poNumber: string; projectAddress: {line1:string;city:string;state:string;postalCode:string};
  branding: InvoiceBranding;
  publicToken: string; revision: number; lines: InvoiceLine[]; allocations: InvoiceAllocation[];
  reviewTasks: InvoiceReviewTask[]; payments: InvoicePaymentRecord[];
  recipients: InvoiceRecipient[]; poDocuments: InvoicePoDocument[];
  copyPm: boolean; projectManager: { name: string; email: string } | null;
  pmCopyStatus: 'none' | 'accepted' | 'failed'; pmCopyEmail: string | null; pmCopyError: string | null;
  totalCents: number; paidCents: number; balanceCents: number;
  emailStatus: string; emailError: string | null; managerEmailStatus: string; managerEmailError: string | null;
  qboSyncStatus: string; qboSyncError: string | null;
  canEdit: boolean; canSend: boolean; canVoid: boolean; canRetryQbo: boolean; canRecordPayment: boolean;
};
export type PublicInvoice = Pick<InvoiceRecord,
  'id' | 'invoiceNumber' | 'status' | 'issueDate' | 'dueDate' | 'notes' | 'billingName' |
  'billingAddress' | 'projectReference' | 'poNumber' | 'projectAddress' | 'branding' | 'lines' | 'totalCents' | 'paidCents' | 'balanceCents' | 'poDocuments'>;
export type InvoiceListItem = Pick<InvoiceRecord,'id'|'invoiceNumber'|'projectId'|'clientId'|'source'|'billingMonth'|'status'|'issueDate'|'dueDate'|'totalCents'|'paidCents'|'balanceCents'> & {
  clientName: string; projectName: string; projectNumber: string; managerUserId: string | null;
};
