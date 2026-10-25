import type {
  InvoiceLine,
  InvoicePaymentTerm,
  InvoiceRecord,
  InvoiceWriteoffReason,
} from "@whitepoint/types";
import {
  allocateEntry,
  allocateInvoiceDecision,
} from "@whitepoint/utils/invoice-allocation";

export type Choice = {
  entryId: string;
  disposition: "billed" | "hold" | "write-off" | "split";
  splitBasis: "hours" | "charge";
  splitValue: string;
  splitRemainder?: "hold" | "write-off";
  writeoffReason?: InvoiceWriteoffReason | null;
  writeoffExplanation?: string;
};
export type Draft = {
  issueDate: string;
  dueDate: string;
  paymentTerm: InvoicePaymentTerm;
  includeHoursBreakdown: boolean;
  includeLineItemNotes: boolean;
  notes: string;
  internalNote: string;
  recipientIds: string[];
  lines: InvoiceLine[];
  choices: Choice[];
  fixedFeeOverrides: string[];
};

export function fixedFeeSuggestedAmount(
  invoice: InvoiceRecord,
  taskId: string,
  chargeCents: number,
) {
  const task = invoice.reviewTasks.find(
    (item) => item.projectTaskId === taskId,
  );
  return Math.min(
    Math.max(
      0,
      (task?.contractAmountCents || 0) - (task?.previouslyInvoicedCents || 0),
    ),
    chargeCents,
  );
}

export function defaultSplitValue(
  source: InvoiceRecord["allocations"][number],
  basis: Choice["splitBasis"],
) {
  const value =
    basis === "hours"
      ? Math.floor(Math.round(source.sourceHours * 100) / 2)
      : Math.floor(source.sourceChargeCents / 2);
  if (value < 1) return "";
  try {
    allocateEntry(
      source.sourceHours,
      source.sourceChargeCents,
      "split",
      basis,
      basis === "hours" ? value / 100 : value,
    );
    return (value / 100).toFixed(2);
  } catch {
    return "";
  }
}

export function draftPreview(invoice: InvoiceRecord, draft: Draft) {
  const byTask = new Map<string, number>(),
    byTaskHours = new Map<string, number>(),
    byTaskWriteoffHours = new Map<string, number>(),
    byTaskWriteoffCharge = new Map<string, number>(),
    byTaskHeldHours = new Map<string, number>(),
    byTaskHeldCharge = new Map<string, number>(),
    byTaskCharge = new Map<string, number>(),
    byEntry = new Map<string, ReturnType<typeof allocateInvoiceDecision>>();
  try {
    for (const choice of draft.choices) {
      const source = invoice.allocations.find(
        (entry) => entry.entryId === choice.entryId,
      );
      if (!source) throw new Error("Unknown time entry.");
      const splitValue =
        choice.disposition === "split"
          ? choice.splitBasis === "charge"
            ? Math.round(Number(choice.splitValue) * 100)
            : Number(choice.splitValue)
          : undefined;
      const allocation = allocateInvoiceDecision(
        source.sourceHours,
        source.sourceChargeCents,
        choice.disposition,
        choice.splitBasis,
        splitValue,
        choice.splitRemainder,
      );
      const taskId = source.projectTaskId || "";
      byEntry.set(source.entryId, allocation);
      byTaskHours.set(
        taskId,
        (byTaskHours.get(taskId) || 0) + allocation.billedHoursHundredths / 100,
      );
      byTaskWriteoffHours.set(
        taskId,
        (byTaskWriteoffHours.get(taskId) || 0) +
          allocation.writeoffHoursHundredths / 100,
      );
      byTaskWriteoffCharge.set(
        taskId,
        (byTaskWriteoffCharge.get(taskId) || 0) +
          allocation.writeoffChargeCents,
      );
      byTaskHeldHours.set(
        taskId,
        (byTaskHeldHours.get(taskId) || 0) +
          allocation.heldHoursHundredths / 100,
      );
      byTaskHeldCharge.set(
        taskId,
        (byTaskHeldCharge.get(taskId) || 0) + allocation.heldChargeCents,
      );
      byTaskCharge.set(
        taskId,
        (byTaskCharge.get(taskId) || 0) + allocation.billedChargeCents,
      );
      if (source.billingType !== "fixed-fee")
        byTask.set(
          taskId,
          (byTask.get(taskId) || 0) + allocation.billedChargeCents,
        );
    }
    const byTaskAmount = new Map<string, number>();
    let timeTotal = 0,
      fixedFeeTotal = 0,
      otherTotal = 0;
    for (const line of draft.lines) {
      const taskId = line.projectTaskId || "",
        amount =
          line.kind === "time"
            ? byTask.get(taskId) || 0
            : line.kind === "fixed-fee" &&
                !draft.fixedFeeOverrides.includes(line.id)
              ? fixedFeeSuggestedAmount(
                  invoice,
                  taskId,
                  byTaskCharge.get(taskId) || 0,
                )
              : line.amountCents;
      if (line.projectTaskId)
        byTaskAmount.set(
          line.projectTaskId,
          (byTaskAmount.get(line.projectTaskId) || 0) + amount,
        );
      if (line.kind === "time") timeTotal += amount;
      else if (line.kind === "fixed-fee") fixedFeeTotal += amount;
      else otherTotal += amount;
    }
    return {
      byTask,
      byTaskHours,
      byTaskWriteoffHours,
      byTaskWriteoffCharge,
      byTaskHeldHours,
      byTaskHeldCharge,
      byTaskCharge,
      byTaskAmount,
      byEntry,
      timeTotal,
      fixedFeeTotal,
      otherTotal,
      total: timeTotal + fixedFeeTotal + otherTotal,
    };
  } catch {
    return null;
  }
}
