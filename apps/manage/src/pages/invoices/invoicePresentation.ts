import type { InvoiceRecord, PublicInvoice } from '@whitepoint/types';
import { draftPreview, fixedFeeSuggestedAmount, type Draft } from './invoiceDraft';

export function fromInvoice(invoice: InvoiceRecord): Draft {
  return {
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    paymentTerm: invoice.paymentTerm,
    includeHoursBreakdown: invoice.includeHoursBreakdown,
    includeLineItemNotes: invoice.includeLineItemNotes,
    copyPm: invoice.copyPm,
    notes: invoice.notes,
    internalNote: invoice.internalNote,
    recipientIds: invoice.recipients
      .filter((x) => x.selected)
      .map((x) => x.contactId),
    lines: invoice.lines,
    choices: invoice.allocations.map((a) => ({
      entryId: a.entryId,
      disposition: a.disposition,
      splitBasis: a.splitBasis || "hours",
      splitValue:
        a.splitBasis === "charge"
          ? (a.billedChargeCents / 100).toFixed(2)
          : a.billedHours.toFixed(2),
      splitRemainder: a.heldHours > 0 ? "hold" : "write-off",
      writeoffReason: a.writeoffReason,
      writeoffExplanation: a.writeoffExplanation,
    })),
    fixedFeeOverrides: invoice.lines
      .filter(
        (line) =>
          line.kind === "fixed-fee" &&
          line.amountCents !==
            fixedFeeSuggestedAmount(
              invoice,
              line.projectTaskId || "",
              invoice.reviewTasks.find(
                (task) => task.projectTaskId === line.projectTaskId,
              )?.currentChargeCents || 0,
            ),
      )
      .map((line) => line.id),
  };
}
export function clientView(
  invoice: InvoiceRecord,
  draft: Draft,
  preview: NonNullable<ReturnType<typeof draftPreview>>,
): PublicInvoice {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    issueDate: draft.issueDate,
    dueDate: draft.dueDate,
    notes: draft.notes,
    billingName: invoice.billingName,
    billingAddress: invoice.billingAddress,
    projectReference: invoice.projectReference,
    poNumber: invoice.poNumber,
    projectAddress: invoice.projectAddress,
    branding: invoice.branding,
    poDocuments: invoice.poDocuments,
    lines: draft.lines.map((line) =>
      line.kind === "time"
        ? {
            ...line,
            amountCents: preview.byTask.get(line.projectTaskId || "") || 0,
          }
        : line.kind === "fixed-fee"
          ? {
              ...line,
              amountCents:
                preview.byTaskAmount.get(line.projectTaskId || "") || 0,
            }
          : line,
    ),
    totalCents: preview.total,
    paidCents: invoice.paidCents,
    balanceCents: Math.max(0, preview.total - invoice.paidCents),
  };
}

