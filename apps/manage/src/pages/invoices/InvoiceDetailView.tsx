import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import type {
  InvoiceAnalysis,
  InvoiceLine,
  InvoiceListItem,
  InvoicePoolEntry,
  InvoiceRecord,
} from "@whitepoint/types";
import {
  createInvoicePacket,
  invoiceHoursBreakdownRows,
} from "@whitepoint/utils/invoice-pdf";
import { downloadBlob } from "@whitepoint/utils/browser-files";
import { invoiceDueDate } from "@whitepoint/utils/invoice-terms";
import { apiBaseUrl, requestBlob, requestJson } from "../../api/client";
import { formatUsdCents as money } from "@whitepoint/utils/currency";
import {
  defaultSplitValue,
  draftPreview,
  type Choice,
  type Draft,
} from "./invoiceDraft";
import { clientView, fromInvoice } from "./invoicePresentation";
import { Dropdown, Textarea, Textbox, Toggle } from "@whitepoint/ui/input";
import { ArrowLeft, X } from "lucide-react";
import { CurrencyField } from "../common/CurrencyField";

const termOptions = [
  ["due-on-receipt", "Due on receipt"],
  ["net-15", "Net 15"],
  ["net-30", "Net 30"],
  ["net-45", "Net 45"],
  ["net-60", "Net 60"],
] as const;
const field =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50";
const card = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
const sumMap = (values?: Map<string, number>) =>
  [...(values?.values() || [])].reduce((sum, value) => sum + value, 0);
function patchedChoice(
  choice: Choice,
  patch: Partial<Choice>,
  source?: InvoiceRecord["allocations"][number],
) {
  const next = { ...choice, ...patch };
  if (
    source &&
    ((patch.disposition === "split" && choice.disposition !== "split") ||
      (patch.splitBasis && patch.splitBasis !== choice.splitBasis))
  )
    next.splitValue = defaultSplitValue(source, next.splitBasis);
  if (
    patch.disposition &&
    patch.disposition !== "write-off" &&
    patch.disposition !== "split"
  ) {
    next.writeoffReason = null;
    next.writeoffExplanation = "";
  }
  return next;
}

export function InvoiceDetailPage() {
  const { id = "" } = useParams(),
    navigate = useNavigate();
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null),
    [draft, setDraft] = useState<Draft | null>(null);
  const [history, setHistory] = useState<InvoiceListItem[]>([]),
    [available, setAvailable] = useState<InvoicePoolEntry[]>([]),
    [analysis, setAnalysis] = useState<InvoiceAnalysis | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [previewUrl, setPreviewUrl] = useState(""),
    [previewBusy, setPreviewBusy] = useState(false),
    [previewStale, setPreviewStale] = useState(true);
  const [openNote, setOpenNote] = useState<{
    task: string;
    employee: string;
    date: string;
    note: string;
    hours: number;
    charge: number;
  } | null>(null);
  const [decisionEditor, setDecisionEditor] = useState<{
    entryId: string;
    choice: Choice;
  } | null>(null);
  const [decisionEditorError, setDecisionEditorError] = useState("");
  const [paymentAmount, setPaymentAmount] = useState(""),
    [paymentMethod, setPaymentMethod] = useState("Check"),
    [paymentRef, setPaymentRef] = useState("");
  const preview = invoice && draft ? draftPreview(invoice, draft) : null;
  const paymentUrl = invoice
    ? `${location.hostname === "localhost" ? "http://localhost:5400" : "https://payment.whitepointsurvey.com"}/pay/${invoice.publicToken}`
    : "";
  const projectHistory = useMemo(
    () =>
      history.filter(
        (item) =>
          item.projectId === invoice?.projectId && item.id !== invoice.id,
      ),
    [history, invoice],
  );

  async function reload(currentId = id) {
    const result = await requestJson<{ invoice: InvoiceRecord }>(
      `/invoices/${encodeURIComponent(currentId)}`,
      { authMode: "session" },
    );
    setInvoice(result.invoice);
    setDraft(fromInvoice(result.invoice));
    setPreviewUrl("");
    setPreviewStale(true);
    const [list, pool, costs] = await Promise.all([
      requestJson<{ items: InvoiceListItem[] }>("/invoices", {
        authMode: "session",
      }),
      requestJson<{ items: InvoicePoolEntry[] }>(
        `/invoices/pool?projectId=${encodeURIComponent(result.invoice.projectId)}`,
        { authMode: "session" },
      ).catch(() => ({ items: [] })),
      requestJson<InvoiceAnalysis>(
        `/invoices/${encodeURIComponent(currentId)}/analysis`,
        { authMode: "session" },
      ),
    ]);
    setHistory(list.items);
    setAvailable(pool.items);
    setAnalysis(costs);
  }
  useEffect(() => {
    void reload().catch((cause) => setError(String(cause)));
  }, [id]);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  function updateDraft(next: Draft) {
    setDraft(next);
    setPreviewStale(true);
  }
  function changeChoice(entryId: string, patch: Partial<Choice>) {
    if (!draft || !invoice) return;
    updateDraft({
      ...draft,
      choices: draft.choices.map((choice) => {
        if (choice.entryId !== entryId) return choice;
        const source = invoice.allocations.find(
          (entry) => entry.entryId === entryId,
        );
        return patchedChoice(choice, patch, source);
      }),
    });
  }
  function openDecisionEditor(
    entryId: string,
    disposition?: Choice["disposition"],
  ) {
    if (!draft || !invoice) return;
    const choice = draft.choices.find((item) => item.entryId === entryId);
    if (!choice) return;
    const source = invoice.allocations.find((item) => item.entryId === entryId),
      nextChoice = patchedChoice(
        choice,
        disposition ? { disposition } : {},
        source,
      );
    setDecisionEditor({ entryId, choice: nextChoice });
    setDecisionEditorError("");
  }
  function saveDecisionEditor() {
    if (!draft || !invoice || !decisionEditor) return;
    const nextDraft = {
        ...draft,
        choices: draft.choices.map((choice) =>
          choice.entryId === decisionEditor.entryId
            ? decisionEditor.choice
            : choice,
        ),
      },
      calculation = draftPreview(invoice, nextDraft),
      allocation = calculation?.byEntry.get(decisionEditor.entryId);
    if (!calculation) {
      setDecisionEditorError("Enter a valid split value.");
      return;
    }
    if (
      allocation?.writeoffHoursHundredths &&
      (!decisionEditor.choice.writeoffReason ||
        !decisionEditor.choice.writeoffExplanation?.trim())
    ) {
      setDecisionEditorError(
        "Choose a write-off reason and enter an explanation.",
      );
      return;
    }
    updateDraft(nextDraft);
    setDecisionEditor(null);
    setDecisionEditorError("");
  }
  function changeLine(index: number, patch: Partial<InvoiceLine>) {
    if (!draft) return;
    const line = draft.lines[index];
    updateDraft({
      ...draft,
      lines: draft.lines.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
      fixedFeeOverrides:
        line?.kind === "fixed-fee" && patch.amountCents !== undefined
          ? [...new Set([...draft.fixedFeeOverrides, line.id])]
          : draft.fixedFeeOverrides,
    });
  }
  async function act(path: string, method: "PUT" | "POST", body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<{ invoice: InvoiceRecord }>(
        `/invoices/${encodeURIComponent(id)}${path}`,
        { authMode: "session", method, body: JSON.stringify(body ?? {}) },
      );
      setInvoice(result.invoice);
      setDraft(fromInvoice(result.invoice));
      setPreviewUrl("");
      setPreviewStale(true);
      return result.invoice;
    } catch (cause) {
      setError(String(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!invoice || !draft) return null;
    const calculation = draftPreview(invoice, draft);
    if (!calculation) {
      setError("Fix the split values before saving.");
      return null;
    }
    for (const choice of draft.choices) {
      const allocation = calculation.byEntry.get(choice.entryId);
      if (
        allocation?.writeoffHoursHundredths &&
        (!choice.writeoffReason || !choice.writeoffExplanation?.trim())
      ) {
        setError(
          "Choose a write-off reason and enter an explanation for every written-off portion.",
        );
        return null;
      }
    }
    return act("", "PUT", {
      revision: invoice.revision,
      issueDate: draft.issueDate,
      paymentTerm: draft.paymentTerm,
      includeHoursBreakdown: draft.includeHoursBreakdown,
      includeLineItemNotes: draft.includeLineItemNotes,
      copyPm: draft.copyPm,
      notes: draft.notes,
      internalNote: draft.internalNote,
      recipientIds: draft.recipientIds,
      lines: draft.lines.map((line) => ({
        id: line.id,
        kind: line.kind,
        description: line.description,
        amountCents:
          line.kind === "fixed-fee"
            ? calculation.byTaskAmount.get(line.projectTaskId || "") || 0
            : line.amountCents,
        projectTaskId: line.projectTaskId,
      })),
      allocations: draft.choices.map((choice) => ({
        entryId: choice.entryId,
        disposition: choice.disposition,
        splitBasis:
          choice.disposition === "split" ? choice.splitBasis : undefined,
        splitValue:
          choice.disposition === "split"
            ? choice.splitBasis === "charge"
              ? Math.round(Number(choice.splitValue) * 100)
              : Number(choice.splitValue)
            : undefined,
        splitRemainder: choice.splitRemainder,
        writeoffReason: choice.writeoffReason,
        writeoffExplanation: choice.writeoffExplanation,
      })),
    });
  }
  async function saveClose() {
    if (await save()) navigate("/invoices");
  }
  async function issue(path: "/send" | "/resend" | "/mark-sent") {
    if (!invoice) return;
    const saved = invoice.canEdit ? await save() : invoice;
    if (!saved) return;
    if (await act(path, "POST")) await reload();
  }
  async function addTime(entryId: string) {
    const saved = await save();
    if (!saved) return;
    if (
      await act("/entries", "POST", {
        revision: saved.revision,
        entryIds: [entryId],
      })
    )
      await reload();
  }
  async function deleteDraft() {
    if (
      !invoice ||
      !window.confirm("Delete this draft and release its timesheet entries?")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await requestJson(`/invoices/${encodeURIComponent(id)}`, {
        authMode: "session",
        method: "DELETE",
        body: JSON.stringify({ revision: invoice.revision }),
      });
      navigate("/invoices", { replace: true });
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function voidInvoice() {
    if (
      !invoice ||
      !window.confirm(
        `Void invoice ${invoice.invoiceNumber}? This disables its payment page and releases its time for another invoice.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await requestJson(`/invoices/${encodeURIComponent(id)}/void`, {
        authMode: "session",
        method: "POST",
        body: JSON.stringify({ revision: invoice.revision }),
      });
      await reload();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function recordPayment() {
    if (
      await act("/payments", "POST", {
        amountCents: Math.round(Number(paymentAmount) * 100),
        method: paymentMethod,
        referenceNumber: paymentRef,
      })
    ) {
      setPaymentAmount("");
      setPaymentRef("");
    }
  }
  async function correctPayment(paymentId: string, retainedCents: number) {
    if (
      !window.confirm(
        `Post the reviewed QuickBooks payment correction? Retained amount: ${money(retainedCents)}.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await requestJson(
        `/invoices/payments/${encodeURIComponent(paymentId)}/qbo/correct`,
        { authMode: "session", method: "POST", body: "{}" },
      );
      await reload();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function refreshPreview() {
    if (!invoice || !draft || !preview) return;
    setPreviewBusy(true);
    setError("");
    try {
      let blob: Blob;
      if (invoice.status === "draft") {
        const billedHours = new Map(
          [...preview.byEntry].map(([entryId, allocation]) => [
            entryId,
            allocation.billedHoursHundredths / 100,
          ]),
        );
        const hourRows = draft.includeHoursBreakdown
          ? invoiceHoursBreakdownRows(
              invoice.allocations,
              billedHours,
              draft.includeLineItemNotes,
            )
          : [];
        const packet = await createInvoicePacket(
          clientView(invoice, draft, preview),
          paymentUrl,
          apiBaseUrl,
          undefined,
          hourRows,
        );
        blob = new Blob([new Uint8Array(packet)], { type: "application/pdf" });
      } else
        blob = await requestBlob(`/invoices/${encodeURIComponent(id)}/packet`, {
          authMode: "session",
        });
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewStale(false);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPreviewBusy(false);
    }
  }
  async function downloadPo(documentId: string, name: string) {
    setError("");
    try {
      const blob = await requestBlob(
        `/invoices/${encodeURIComponent(id)}/po-documents/${encodeURIComponent(documentId)}`,
        { authMode: "session" },
      );
      downloadBlob(blob, name);
    } catch (cause) {
      setError(String(cause));
    }
  }
  useEffect(() => {
    if (invoice && draft && !previewUrl) void refreshPreview();
  }, [invoice?.id, invoice?.status, previewUrl]);

  if (!invoice || !draft)
    return (
      <main className="mx-auto max-w-6xl p-5">
        {error || "Loading invoice…"}
      </main>
    );
  const rows = [
    ...invoice.allocations.map((entry) => ({
      entry,
      available: false,
      hours: entry.sourceHours,
      charge: entry.sourceChargeCents,
    })),
    ...available
      .filter(
        (entry) =>
          !invoice.allocations.some((item) => item.entryId === entry.entryId),
      )
      .map((entry) => ({
        entry,
        available: true,
        hours: entry.hours,
        charge: entry.chargeCents,
      })),
  ].sort(
    (a, b) =>
      a.entry.entryDate.localeCompare(b.entry.entryDate) ||
      (a.entry.employeeName || "").localeCompare(b.entry.employeeName || "") ||
      (a.entry.taskName || "").localeCompare(b.entry.taskName || ""),
  );
  const decisionEntry = decisionEditor
    ? invoice.allocations.find(
        (entry) => entry.entryId === decisionEditor.entryId,
      )
    : null;
  const currentRevenue = preview?.total ?? invoice.totalCents,
    priorRevenue =
      analysis?.rows.reduce((sum, row) => sum + row.priorInvoicedCents, 0) || 0,
    cost =
      analysis?.rows.reduce(
        (sum, row) => sum + (row.approvedCostCents || 0),
        0,
      ) || 0;

  function dateDisplay(date: string) {
    const d = new Date(date);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  }

  /** Returns the appropriate CSS class based on the billing, held, and write-off amounts for background colors */
  function colorDecision(billed: number, held: number, writeOff: number) {
    if (billed > 0 && held > 0) return "bg-green-200"; // green to orange background
    if (billed > 0 && writeOff > 0) return "bg-red-200"; // green to red background
    if (billed > 0) return "bg-green-400";
    if (held > 0) return "bg-orange-300";
    if (writeOff > 0) return "bg-red-500";
    return "bg-transparent";
  }

  /** Returns the appropriate CSS class based on the billing, held, and write-off amounts for background colors */
  function textColorDecision(billed: number, held: number, writeOff: number) {
    if (billed > 0 && held > 0) return "font-semibold text-black"; // green to orange background
    if (billed > 0 && writeOff > 0) return "font-semibold text-black"; // green to red background
    if (billed > 0) return "font-semibold text-black";
    if (held > 0) return "font-semibold text-black";
    if (writeOff > 0) return "font-semibold text-white";
    return "font-semibold text-slate-900";
  }

  return (
    <main className="mx-auto max-w-[1800px] space-y-4 px-4 pb-10 pt-4 text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <h1 className="text-2xl font-bold items-center flex">
            <Link to="/invoices" className="text-sm cursor-pointer">
              <ArrowLeft className="inline-block mr-1 hover:text-sky-800" />
            </Link>
            Invoice {invoice.invoiceNumber}
          </h1>
          <p className="text-sm text-slate-600">
            {invoice.projectReference} ·{" "}
            <span className="capitalize">{invoice.status}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {invoice.canEdit && (
            <button
              disabled={busy}
              onClick={() => void deleteDraft()}
              className="rounded bg-red-600 px-3 py-2 text-white disabled:opacity-50"
            >
              Delete Invoice
            </button>
          )}
          {invoice.canVoid && (
            <button
              disabled={busy}
              onClick={() => void voidInvoice()}
              className="rounded bg-red-600 px-3 py-2 text-white disabled:opacity-50"
            >
              Void Invoice
            </button>
          )}
          {invoice.canEdit && (
            <button
              disabled={busy}
              onClick={() => void saveClose()}
              className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-50"
            >
              Save and Close
            </button>
          )}
          {invoice.canSend && (
            <button
              disabled={busy}
              onClick={() => void issue("/mark-sent")}
              className="rounded bg-sky-600 px-3 py-2 text-white disabled:opacity-50"
            >
              Mark as Sent
            </button>
          )}
          {(invoice.canSend ||
            (invoice.status === "sent" &&
              (invoice.emailStatus !== "accepted" ||
                (invoice.copyPm && invoice.pmCopyStatus !== "accepted")))) && (
            <button
              disabled={busy}
              onClick={() => void issue("/send")}
              className="rounded bg-green-700 px-3 py-2 text-white disabled:opacity-50"
            >
              Send Invoice
            </button>
          )}
          {invoice.status === "sent" &&
            invoice.emailStatus === "accepted" &&
            (!invoice.copyPm || invoice.pmCopyStatus === "accepted") && (
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Resend invoice ${invoice.invoiceNumber} to all selected recipients?`,
                    )
                  )
                    void issue("/resend");
                }}
                className="rounded bg-green-700 px-3 py-2 text-white disabled:opacity-50"
              >
                Resend Invoice Email
              </button>
            )}
        </div>
      </header>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          {/* Invoice Information */}
          <section className={card}>
            <h2 className="mb-4 text-lg font-semibold">
              Invoice information and project history
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Textbox
                label="Issue date"
                type="date"
                disabled={!invoice.canEdit}
                value={draft.issueDate}
                onChange={(event) => {
                  const issueDate = event.target.value;
                  updateDraft({
                    ...draft,
                    issueDate,
                    dueDate: issueDate
                      ? invoiceDueDate(issueDate, draft.paymentTerm)
                      : "",
                  });
                }}
              />
              <Dropdown
                label="Payment terms"
                disabled={!invoice.canEdit}
                value={draft.paymentTerm}
                onChange={(event) => {
                  const paymentTerm = event as Draft["paymentTerm"];
                  updateDraft({
                    ...draft,
                    paymentTerm,
                    dueDate: draft.issueDate
                      ? invoiceDueDate(draft.issueDate, paymentTerm)
                      : "",
                  });
                }}
                options={termOptions.map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
              <Textbox
                label="Due date"
                disabled={!invoice.canEdit}
                type="date"
                readOnly
                value={draft.dueDate}
              />
            </div>
            {draft.lines.some((line) => line.kind === "time") && (
              <div className="mt-4 space-y-2">
                <Toggle
                  label="Include billed time and materials hours breakdown in the PDF packet"
                  disabled={!invoice.canEdit}
                  checked={draft.includeHoursBreakdown}
                  onChange={(event) =>
                    updateDraft({
                      ...draft,
                      includeHoursBreakdown: event,
                      includeLineItemNotes: event
                        ? draft.includeLineItemNotes
                        : false, // Disable line item notes if hours breakdown is not included
                    })
                  }
                />
                <Toggle
                  label="Include line item notes in the hours breakdown"
                  disabled={!invoice.canEdit || !draft.includeHoursBreakdown}
                  checked={draft.includeLineItemNotes}
                  onChange={(event) =>
                    updateDraft({
                      ...draft,
                      includeLineItemNotes: event,
                    })
                  }
                />
              </div>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Textarea
                label="Client Note"
                disabled={!invoice.canEdit}
                value={draft.notes}
                onChange={(e) =>
                  updateDraft({ ...draft, notes: e.target.value })
                }
              />
              <Textarea
                label="Internal Note"
                disabled={!invoice.canEdit}
                value={draft.internalNote}
                onChange={(e) =>
                  updateDraft({ ...draft, internalNote: e.target.value })
                }
              />
            </div>
            <div className="mt-4 border-t pt-4">
              <h3 className="mb-2 font-semibold">Project invoice history</h3>
              <div className="max-h-40 overflow-auto text-sm">
                {projectHistory.map((item) => (
                  <Link
                    key={item.id}
                    to={`/invoices/${item.id}`}
                    className="grid grid-cols-5 gap-1 border-b border-neutral-400 py-1 text-sky-800"
                  >
                    <span>{item.invoiceNumber}</span>
                    <span className="">Issued {item.issueDate}</span>
                    <span className="capitalize col-start-4 text-center">
                      {item.status === "paid"
                        ? "Paid"
                        : item.status === "sent"
                          ? "Unpaid"
                          : item.status}
                    </span>
                    <span className="text-right col-start-5">
                      {money(item.balanceCents)}
                    </span>
                  </Link>
                ))}
                {!projectHistory.length && (
                  <p className="text-slate-500">
                    No other invoices for this project.
                  </p>
                )}
              </div>
            </div>
          </section>
          {/* Contacts and Recipients */}
          <section className={card}>
            <h2 className="mb-2 text-lg font-semibold">
              Contacts and Recipients
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 mb-2">
              {invoice.recipients.map((recipient) => (
                <div
                  key={recipient.contactId}
                  className={`group rounded border p-2 text-sm cursor-pointer transition-colors ${
                    draft.recipientIds.includes(recipient.contactId)
                      ? "border-blue-500 outline outline-2 outline-blue-500"
                      : "border-neutral-200 border-dashed"
                  }`}
                  onClick={() => {
                    if (invoice.canEdit) {
                      updateDraft({
                        ...draft,
                        recipientIds: draft.recipientIds.includes(
                          recipient.contactId,
                        )
                          ? draft.recipientIds.filter(
                              (id) => id !== recipient.contactId,
                            )
                          : [...draft.recipientIds, recipient.contactId],
                      });
                    }
                  }}
                >
                  <strong>{recipient.name}</strong>
                  {recipient.isPrimary && " · Project contact"}
                  {recipient.isBillingPoc && " · Billing POC"}
                  <span className="block text-slate-600">
                    {recipient.email || "No email on record"}
                  </span>
                  {recipient.deliveryStatus !== "none" && (
                    <span className="block text-xs">
                      Delivery: {recipient.deliveryStatus}
                      {recipient.deliveryError &&
                        ` — ${recipient.deliveryError}`}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <Toggle
              label={`Copy project manager (${invoice.projectManager?.name || "none"})`}
              disabled={!invoice.canEdit || !invoice.projectManager}
              checked={draft.copyPm}
              onChange={(event) => updateDraft({ ...draft, copyPm: event })}
            />
          </section>

          {/* Task analysis */}
          <section className={card}>
            <h2 className="mb-3 text-lg font-semibold">
              Project task costs and write-off analysis
            </h2>
            <div className="mb-3 grid gap-2 text-sm sm:grid-cols-3">
              <TaskAnalysisCard
                title="Billed"
                hours={sumMap(preview?.byTaskHours)}
                cost={currentRevenue}
                cardClasses="rounded-lg bg-sky-50 p-2"
              />
              <TaskAnalysisCard
                title="Held"
                hours={sumMap(preview?.byTaskHeldHours)}
                cost={sumMap(preview?.byTaskHeldCharge)}
                cardClasses="rounded-lg bg-amber-50 p-2"
              />
              <TaskAnalysisCard
                title="Written off"
                hours={sumMap(preview?.byTaskWriteoffHours)}
                cost={sumMap(preview?.byTaskWriteoffCharge)}
                cardClasses="rounded-lg bg-rose-50 p-2"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      "Task",
                      "Billed",
                      "Held",
                      "Written off",
                      "Approved labor",
                      "Invoiced margin",
                      "Projected margin",
                    ].map((label) => (
                      <th
                        key={label}
                        className="p-2 text-right first:text-left"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis?.rows.map((row) => {
                    const key = row.taskId || "",
                      billed =
                        (preview?.byTaskAmount.get(key) || 0) +
                        (row.taskId ? 0 : preview?.otherTotal || 0),
                      invoiced = row.priorInvoicedCents + billed;
                    return (
                      <tr key={key || "general"} className="border-t">
                        <td className="p-2">{row.taskName}</td>
                        <td className="p-2 text-right">
                          {(preview?.byTaskHours.get(key) || 0).toFixed(2)} h
                          <br />
                          {money(billed)}
                        </td>
                        <td className="p-2 text-right">
                          {(preview?.byTaskHeldHours.get(key) || 0).toFixed(2)}{" "}
                          h<br />
                          {money(preview?.byTaskHeldCharge.get(key) || 0)}
                        </td>
                        <td className="p-2 text-right">
                          {(preview?.byTaskWriteoffHours.get(key) || 0).toFixed(
                            2,
                          )}{" "}
                          h<br />
                          {money(preview?.byTaskWriteoffCharge.get(key) || 0)}
                        </td>
                        <td className="p-2 text-right">
                          {row.approvedCostCents === null
                            ? "Restricted"
                            : money(row.approvedCostCents)}
                        </td>
                        <td className="p-2 text-right">
                          {row.approvedCostCents === null
                            ? "Restricted"
                            : money(invoiced - row.approvedCostCents)}
                        </td>
                        <td className="p-2 text-right">
                          {row.contractCents
                            ? money(
                                row.contractCents -
                                  (row.approvedCostCents || 0),
                              )
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 grid gap-2 border-t pt-3 text-sm sm:grid-cols-2">
              <p>
                Invoiced labor margin:{" "}
                <strong>
                  {analysis?.rows.some((row) => row.approvedCostCents === null)
                    ? "Restricted"
                    : money(priorRevenue + currentRevenue - cost)}
                </strong>
              </p>
              <p>
                Projected contract labor margin:{" "}
                <strong>
                  {analysis?.projectContractCents === null ||
                  analysis?.rows.some(
                    (row) =>
                      row.approvedCostCents === null ||
                      row.approvedCostCents === 0,
                  )
                    ? "Contract value not provided"
                    : money((analysis?.projectContractCents || 0) - cost)}
                </strong>
              </p>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Labor margin uses approved labor costs. It excludes expenses and
              overhead.
            </p>
          </section>
        </div>
        <section className={`${card} xl:sticky xl:top-4`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">
                Invoice PDF and attached POs
              </h2>
              <p className="text-xs text-slate-600">
                {invoice.poDocuments.length} project PO{" "}
                {invoice.poDocuments.length === 1 ? "document" : "documents"}
                {previewStale ? " · Refresh to include current edits" : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                disabled={previewBusy || !preview}
                className="rounded border px-3 py-2 text-sm disabled:opacity-50"
                onClick={() => void refreshPreview()}
              >
                {previewBusy ? "Generating…" : "Refresh"}
              </button>
              {previewUrl && (
                <a
                  className="rounded border px-3 py-2 text-sm"
                  href={previewUrl}
                  download={`${invoice.invoiceNumber}.pdf`}
                >
                  Download
                </a>
              )}
            </div>
          </div>
          {previewUrl ? (
            <iframe
              title="Invoice PDF preview"
              src={previewUrl}
              className="h-[75vh] min-h-[600px] w-full rounded border bg-slate-100"
            />
          ) : (
            <div className="flex h-[60vh] items-center justify-center rounded border bg-slate-50 text-sm text-slate-500">
              {previewBusy
                ? "Generating preview…"
                : "Refresh to preview this invoice."}
            </div>
          )}
          {invoice.poDocuments.length > 0 && (
            <div className="mt-3 space-y-1 text-sm">
              <p className="font-medium text-slate-700">Purchase orders</p>
              {invoice.poDocuments.map((document) => (
                <button
                  key={document.id}
                  type="button"
                  className="block text-sky-800 underline"
                  onClick={() => void downloadPo(document.id, document.name)}
                >
                  Download {document.name}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      {/* Time Review */}
      <section className={card}>
        <h2 className="mb-2 text-lg font-semibold">Time Review</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50">
              <tr className="">
                <th className="max-w-[150px] py-1 px-1">Task</th>
                <th className="max-w-[75px] py-1 px-1 border-l border-slate-400">
                  Employee
                </th>
                <th className="max-w-[50px] py-1 px-1 border-l border-slate-400">
                  Date
                </th>
                <th className="max-w-[100px] py-1 px-1 border-l border-slate-400">
                  Hours
                </th>
                <th className="max-w-[50px] py-1 px-1 border-l border-slate-400">
                  Client charge
                </th>
                <th className="max-w-[200px] py-1 px-1 border-l border-slate-400">
                  Notes
                </th>
                <th className="max-w-[50px] py-1 px-1 border-l border-slate-400">
                  Action
                </th>
                <th className="max-w-[180px] py-1 px-1 border-l border-slate-400">
                  Decision
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(
                ({ entry, available: isAvailable, hours, charge }, index) => {
                  const choice = isAvailable
                      ? null
                      : draft.choices.find(
                          (item) => item.entryId === entry.entryId,
                        ),
                    decision = choice
                      ? preview?.byEntry.get(entry.entryId)
                      : null;
                  return (
                    <tr key={index} className="border-t align-top">
                      <td className="max-w-[150px] py-1 px-1">
                        {entry.taskName || "General project"}
                      </td>
                      <td className="max-w-[75px] py-1 px-1 border-l border-slate-400">
                        {entry.employeeName}
                      </td>
                      <td className="max-w-[50px] py-1 px-1 border-l border-slate-400">
                        {dateDisplay(entry.entryDate)}
                      </td>
                      <td className="max-w-[100px] py-1 px-1 border-l border-slate-400">
                        {hours.toFixed(2)}
                      </td>
                      <td className="max-w-[50px] py-1 px-1 border-l border-slate-400">
                        {money(charge)}
                      </td>
                      <td className="max-w-[200px] py-1 px-1 border-l border-slate-400 truncate text-ellipsis">
                        {
                          <button
                            onClick={() =>
                              setOpenNote({
                                task: entry.taskName || "General project",
                                employee: entry.employeeName,
                                date: entry.entryDate,
                                note: entry.note,
                                hours,
                                charge,
                              })
                            }
                            className="text-xs text-sky-800 underline cursor-pointer truncate"
                          >
                            {entry.note}
                          </button>
                        }
                      </td>
                      <td className="max-w-[50px] border-l border-slate-400">
                        {isAvailable ? (
                          <div className="">
                            <span className="block text-xs text-slate-600">
                              Available
                            </span>
                            <button
                              disabled={busy || !invoice.canEdit}
                              className="text-xs text-sky-800 underline disabled:opacity-50"
                              onClick={() => void addTime(entry.entryId)}
                            >
                              Add to draft
                            </button>
                          </div>
                        ) : (
                          choice && (
                            <div className="min-w-[50px]">
                              <div className="flex items-center">
                                <select
                                  aria-label={`Decision for ${entry.taskName || "General project"} time on ${entry.entryDate}`}
                                  className="w-full bg-white p-1 text-xs disabled:bg-slate-50"
                                  disabled={busy || !invoice.canEdit}
                                  value={choice.disposition}
                                  onChange={(event) => {
                                    const disposition = event.target
                                      .value as Choice["disposition"];
                                    if (
                                      disposition === "split" ||
                                      disposition === "write-off"
                                    ) {
                                      openDecisionEditor(
                                        entry.entryId,
                                        disposition,
                                      );
                                    } else {
                                      changeChoice(entry.entryId, {
                                        disposition,
                                      });
                                    }
                                  }}
                                >
                                  <option value="billed">Bill</option>
                                  <option value="hold">Hold</option>
                                  <option value="write-off">Write off</option>
                                  <option value="split">Split</option>
                                </select>
                                {(choice.disposition === "write-off" ||
                                  choice.disposition === "split") && (
                                  <button
                                    type="button"
                                    aria-label={`Edit ${choice.disposition} decision for ${entry.taskName || "General project"} time on ${entry.entryDate}`}
                                    disabled={busy || !invoice.canEdit}
                                    className="text-xs text-sky-800 underline disabled:opacity-50 px-1"
                                    onClick={() =>
                                      openDecisionEditor(entry.entryId)
                                    }
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        )}
                      </td>
                      <td
                        className={`${colorDecision(decision?.billedChargeCents ?? 0, decision?.heldChargeCents ?? 0, decision?.writeoffChargeCents ?? 0)} max-w-[75px] py-1 px-1 border-l border-slate-400 align-middle`}
                      >
                        {decision && (
                          <p
                            className={`${textColorDecision(decision?.billedChargeCents ?? 0, decision?.heldChargeCents ?? 0, decision?.writeoffChargeCents ?? 0)} text-[11px] leading-4 divide-x divide-slate-300`}
                          >
                            {decision.billedChargeCents > 0 && (
                              <span className="px-1">
                                Billing $
                                {(decision.billedChargeCents / 100).toFixed(2)}
                              </span>
                            )}
                            {decision.heldChargeCents > 0 && (
                              <span className="px-1">
                                Holding $
                                {(decision.heldChargeCents / 100).toFixed(2)}
                              </span>
                            )}
                            {decision.writeoffChargeCents > 0 && (
                              <span className="px-1">
                                Write off $
                                {(decision.writeoffChargeCents / 100).toFixed(
                                  2,
                                )}
                              </span>
                            )}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                },
              )}
              {/* Summery Row */}
              <tr className="bg-slate-100 font-semibold">
                <td colSpan={3} className="py-1 px-1 border-t border-slate-400">
                  Total
                </td>
                <td className="py-1 px-1 border-t border-slate-400 text-sm">
                  {rows
                    .reduce((sum, row) => sum + (row.hours ?? 0), 0)
                    .toFixed(2)}
                </td>
                <td className="py-1 px-1 border-t border-slate-400 text-sm">
                  $
                  {(
                    rows.reduce((sum, row) => sum + (row.charge ?? 0), 0) / 100
                  ).toFixed(2)}
                </td>
                <td
                  colSpan={3}
                  className="py-1 px-1 border-t border-slate-400"
                ></td>
              </tr>
            </tbody>
          </table>
          {!rows.length && (
            <p className="p-3 text-sm text-slate-500">
              No approved time is available.
            </p>
          )}
        </div>
      </section>
      {/* Invoice lines section */}
      <section className={card}>
        <div className="mb-3 flex justify-between">
          <h2 className="text-lg font-semibold">Invoice lines</h2>
          {invoice.canEdit && (
            <button
              className="text-sm text-sky-800 underline"
              onClick={() =>
                updateDraft({
                  ...draft,
                  lines: [
                    ...draft.lines,
                    {
                      id: crypto.randomUUID(),
                      projectTaskId: null,
                      kind: "manual",
                      description: "",
                      amountCents: 0,
                      sortOrder: draft.lines.length,
                    },
                  ],
                })
              }
            >
              Add charge
            </button>
          )}
        </div>
        {draft.lines.map((line, index) => (
          <div
            key={line.id}
            className="mb-2 grid gap-2 sm:grid-cols-[1fr_10rem_0fr]"
          >
            <Textbox
              aria-label="Line description"
              disabled={!invoice.canEdit || line.kind === "time"}
              value={line.description}
              onChange={(e) =>
                changeLine(index, { description: e.target.value })
              }
            />
            <div className={`${line.kind !== "manual" ? "sm:col-span-2" : ""}`}>
              <CurrencyField
                aria-label="Line amount in dollars"
                disabled={!invoice.canEdit || line.kind === "time"}
                valueCents={(
                  (line.kind === "time"
                    ? (preview?.byTask.get(line.projectTaskId || "") ??
                      line.amountCents)
                    : line.kind === "fixed-fee"
                      ? (preview?.byTaskAmount.get(line.projectTaskId || "") ??
                        line.amountCents)
                      : line.amountCents)
                )}
                onCentsChange={(e) =>
                  changeLine(index, {
                    amountCents: e as number | undefined,
                  })
                }
              />
            </div>
            {line.kind === "manual" && invoice.canEdit && (
              <button
                aria-label="Remove line"
                onClick={() =>
                  updateDraft({
                    ...draft,
                    lines: draft.lines.filter((_, i) => i !== index),
                  })
                }
                className="p-1 rounded hover:text-red-500 hover:bg-gray-50 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        <p className="mt-3 text-right font-semibold">
          Invoice total: {money(preview?.total || 0)}
        </p>
      </section>
      <section className={card}>
        <h2 className="mb-2 text-lg font-semibold">Delivery and accounting</h2>
        <p className="text-sm">
          Manager notice: {invoice.managerEmailStatus} · Client email:{" "}
          {invoice.emailStatus} · QuickBooks: {invoice.qboSyncStatus}
        </p>
        {invoice.copyPm && (
          <p className="text-sm">
            PM copy: {invoice.pmCopyStatus}
            {invoice.pmCopyEmail && ` · ${invoice.pmCopyEmail}`}
            {invoice.pmCopyError && ` · ${invoice.pmCopyError}`}
          </p>
        )}
        {invoice.emailError && (
          <p className="text-sm text-red-700">{invoice.emailError}</p>
        )}
        {invoice.qboSyncError && (
          <p className="text-sm text-red-700">
            {invoice.qboSyncError}{" "}
            {invoice.canRetryQbo && (
              <button
                className="underline"
                onClick={() => void act("/qbo/retry", "POST")}
              >
                Retry
              </button>
            )}
          </p>
        )}
      </section>
      {invoice.canRecordPayment && (
        <section className={card}>
          <h2 className="mb-3 text-lg font-semibold">Record offline payment</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              Amount ($)
              <input
                className={field}
                type="number"
                min="0.01"
                max={(invoice.balanceCents / 100).toFixed(2)}
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Method
              <select
                className={field}
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {["Check", "ACH", "Cash", "Credit Card", "Other"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Reference
              <input
                className={field}
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
              />
            </label>
          </div>
          <button
            disabled={busy}
            className="mt-3 rounded bg-sky-800 px-3 py-2 text-sm text-white"
            onClick={() => void recordPayment()}
          >
            Record payment
          </button>
        </section>
      )}
      {!!invoice.payments.length && (
        <section className={card}>
          <h2 className="mb-2 text-lg font-semibold">Payments</h2>
          {invoice.payments.map((payment) => (
            <div key={payment.id} className="border-t py-2 text-sm">
              <p>
                {payment.paidAt || "Pending"} · {payment.method} ·{" "}
                {money(payment.amountCents)} · {payment.status}
              </p>
              {payment.source === "stripe" && (
                <p className="text-slate-600">
                  Credited{" "}
                  {money(
                    Math.max(
                      0,
                      payment.amountCents -
                        payment.refundedCents -
                        payment.disputedCents,
                    ),
                  )}{" "}
                  · Stripe fee {money(payment.stripeFeeCents)} · Payout{" "}
                  {payment.stripePayoutStatus || "pending"} · QBO{" "}
                  {payment.payoutQboStatus || "awaiting payout"}
                </p>
              )}
              {payment.reviewError && (
                <p className="text-amber-800">{payment.reviewError}</p>
              )}
              {invoice.canRetryQbo &&
                payment.qboPostedAmountCents !== null &&
                Math.max(
                  0,
                  payment.amountCents -
                    payment.refundedCents -
                    payment.disputedCents,
                ) < payment.qboPostedAmountCents &&
                !payment.hasOpenDispute && (
                  <button
                    disabled={busy}
                    className="text-sky-800 underline"
                    onClick={() =>
                      void correctPayment(
                        payment.id,
                        Math.max(
                          0,
                          payment.amountCents -
                            payment.refundedCents -
                            payment.disputedCents,
                        ),
                      )
                    }
                  >
                    Review and post QBO correction
                  </button>
                )}
            </div>
          ))}
        </section>
      )}
      <Dialog
        open={Boolean(decisionEditor)}
        onClose={() => setDecisionEditor(null)}
        className="relative z-50"
      >
        <DialogBackdrop className="fixed inset-0 bg-slate-950/40 transition-opacity" />
        {decisionEditor && (
          <div className="fixed inset-0 overflow-y-auto p-3 sm:p-6">
            <div className="flex min-h-full items-center justify-center">
              <DialogPanel className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-900/10 sm:p-6">
                <header className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <DialogTitle className="text-lg font-semibold text-slate-950">
                      {decisionEditor.choice.disposition === "split"
                        ? "Edit split decision"
                        : "Edit write-off decision"}
                    </DialogTitle>
                    {decisionEntry && (
                      <p className="mt-1 text-sm text-slate-600">
                        {decisionEntry.taskName || "General project"} ·{" "}
                        {decisionEntry.employeeName} ·{" "}
                        {dateDisplay(decisionEntry.entryDate)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Close decision editor"
                    className="rounded px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100"
                    onClick={() => setDecisionEditor(null)}
                  >
                    ×
                  </button>
                </header>
                {decisionEditorError && (
                  <p
                    role="alert"
                    className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800"
                  >
                    {decisionEditorError}
                  </p>
                )}
                <div className="space-y-3">
                  {decisionEditor.choice.disposition === "split" && (
                    <>
                      <label className="block text-sm">
                        Split basis
                        <select
                          className={field}
                          disabled={busy || !invoice.canEdit}
                          value={decisionEditor.choice.splitBasis}
                          onChange={(event) => {
                            const splitBasis = event.target
                                .value as Choice["splitBasis"],
                              source = invoice.allocations.find(
                                (entry) =>
                                  entry.entryId === decisionEditor.entryId,
                              );
                            setDecisionEditorError("");
                            setDecisionEditor({
                              ...decisionEditor,
                              choice: {
                                ...decisionEditor.choice,
                                splitBasis,
                                splitValue: source
                                  ? defaultSplitValue(source, splitBasis)
                                  : "",
                              },
                            });
                          }}
                        >
                          <option value="hours">Split by hours</option>
                          <option value="charge">Split by client charge</option>
                        </select>
                      </label>
                      <label className="block text-sm">
                        Billed{" "}
                        {decisionEditor.choice.splitBasis === "hours"
                          ? "hours"
                          : "amount ($)"}
                        <input
                          className={field}
                          type="number"
                          min="0.01"
                          step="0.01"
                          disabled={busy || !invoice.canEdit}
                          value={decisionEditor.choice.splitValue}
                          onChange={(event) => {
                            setDecisionEditorError("");
                            setDecisionEditor({
                              ...decisionEditor,
                              choice: {
                                ...decisionEditor.choice,
                                splitValue: event.target.value,
                              },
                            });
                          }}
                        />
                      </label>
                      <label className="block text-sm">
                        Remaining time
                        <select
                          className={field}
                          disabled={busy || !invoice.canEdit}
                          value={
                            decisionEditor.choice.splitRemainder || "write-off"
                          }
                          onChange={(event) => {
                            setDecisionEditorError("");
                            setDecisionEditor({
                              ...decisionEditor,
                              choice: {
                                ...decisionEditor.choice,
                                splitRemainder: event.target
                                  .value as Choice["splitRemainder"],
                              },
                            });
                          }}
                        >
                          <option value="hold">Hold remainder</option>
                          <option value="write-off">Write off remainder</option>
                        </select>
                      </label>
                    </>
                  )}
                  {(decisionEditor.choice.disposition === "write-off" ||
                    (decisionEditor.choice.disposition === "split" &&
                      decisionEditor.choice.splitRemainder !== "hold")) && (
                    <>
                      <label className="block text-sm">
                        Write-off reason
                        <select
                          className={field}
                          disabled={busy || !invoice.canEdit}
                          value={decisionEditor.choice.writeoffReason || ""}
                          onChange={(event) => {
                            setDecisionEditorError("");
                            setDecisionEditor({
                              ...decisionEditor,
                              choice: {
                                ...decisionEditor.choice,
                                writeoffReason: event.target
                                  .value as Choice["writeoffReason"],
                              },
                            });
                          }}
                        >
                          <option value="">Select reason</option>
                          <option value="advance">Advance</option>
                          <option value="over-budget">Over budget</option>
                        </select>
                      </label>
                      <label className="block text-sm">
                        Explanation
                        <textarea
                          className={field}
                          rows={3}
                          placeholder="Explain the write-off"
                          disabled={busy || !invoice.canEdit}
                          value={
                            decisionEditor.choice.writeoffExplanation || ""
                          }
                          onChange={(event) => {
                            setDecisionEditorError("");
                            setDecisionEditor({
                              ...decisionEditor,
                              choice: {
                                ...decisionEditor.choice,
                                writeoffExplanation: event.target.value,
                              },
                            });
                          }}
                        />
                      </label>
                    </>
                  )}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Saving this decision updates the invoice draft. Save the
                  invoice to persist all draft changes.
                </p>
                <footer className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
                    onClick={() => setDecisionEditor(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy || !invoice.canEdit}
                    className="rounded-lg bg-sky-800 px-3 py-2 text-sm text-white disabled:opacity-50"
                    onClick={saveDecisionEditor}
                  >
                    Save decision
                  </button>
                </footer>
              </DialogPanel>
            </div>
          </div>
        )}
      </Dialog>
      {openNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => setOpenNote(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Timesheet entry"
            className="max-h-[85vh] w-full max-w-xl overflow-auto rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between">
              <h2 className="text-lg font-semibold">{openNote.task}</h2>
              <button onClick={() => setOpenNote(null)} aria-label="Close">
                ×
              </button>
            </div>
            <p className="mb-3 text-sm text-slate-600">
              {openNote.employee} · {openNote.date}
            </p>
            <p className="mb-3 text-sm">
              {openNote.hours.toFixed(2)} hours ? {money(openNote.charge)} saved
              client charge
            </p>
            <p className="whitespace-pre-wrap text-sm">{openNote.note}</p>
          </div>
        </div>
      )}
    </main>
  );
}

function TaskAnalysisCard({
  title,
  hours,
  cost,
  cardClasses,
}: {
  title: string;
  hours: number;
  cost: number;
  cardClasses?: string;
}) {
  return (
    <div className={`${cardClasses ?? ""}`}>
      <h3 className="text-sm">{title}</h3>
      <div className="flex justify-between">
        <p className="text-base font-medium">{hours.toFixed(2)} hours</p>
        <p className="text-base font-medium">{money(cost)}</p>
      </div>
    </div>
  );
}
