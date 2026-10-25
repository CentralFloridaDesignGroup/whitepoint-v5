import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  InvoiceAnalysis,
  InvoiceLine,
  InvoiceListItem,
  InvoicePoolEntry,
  InvoiceRecord,
} from "@whitepoint/types";
import { createInvoicePacket, invoiceHoursBreakdownRows } from "@whitepoint/utils/invoice-pdf";
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
        const next = { ...choice, ...patch },
          source = invoice.allocations.find(
            (entry) => entry.entryId === entryId,
          );
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
      }),
    });
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
  async function issue(path: "/send" | "/mark-sent") {
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
        const poPdfs = await Promise.all(
          invoice.poDocuments.map(
            async (document) =>
              new Uint8Array(
                await (
                  await requestBlob(
                    `/invoices/${encodeURIComponent(id)}/po-documents/${encodeURIComponent(document.id)}`,
                    { authMode: "session" },
                  )
                ).arrayBuffer(),
              ),
          ),
        );
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
          poPdfs,
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
      (a.entry.taskName || "").localeCompare(b.entry.taskName || "") ||
      (a.entry.employeeName || "").localeCompare(b.entry.employeeName || "") ||
      a.entry.entryDate.localeCompare(b.entry.entryDate),
  );
  const currentRevenue = preview?.total ?? invoice.totalCents,
    priorRevenue =
      analysis?.rows.reduce((sum, row) => sum + row.priorInvoicedCents, 0) || 0,
    cost =
      analysis?.rows.reduce(
        (sum, row) => sum + (row.approvedCostCents || 0),
        0,
      ) || 0;
  return (
    <main className="mx-auto max-w-[1800px] space-y-4 px-4 pb-10 pt-4 text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <Link to="/invoices" className="text-sm text-sky-800">
            ← Invoices
          </Link>
          <h1 className="text-2xl font-bold">
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
              invoice.emailStatus !== "accepted")) && (
            <button
              disabled={busy}
              onClick={() => void issue("/send")}
              className="rounded bg-green-700 px-3 py-2 text-white disabled:opacity-50"
            >
              Send Invoice
            </button>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(470px,1.25fr)]">
        <div className="space-y-4">
          <section className={card}>
            <h2 className="mb-4 text-lg font-semibold">
              Invoice information and project history
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                Issue date
                <input
                  className={field}
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
              </label>
              <label className="text-sm">
                Payment terms
                <select
                  className={field}
                  disabled={!invoice.canEdit}
                  value={draft.paymentTerm}
                  onChange={(event) => {
                    const paymentTerm = event.target
                      .value as Draft["paymentTerm"];
                    updateDraft({
                      ...draft,
                      paymentTerm,
                      dueDate: draft.issueDate
                        ? invoiceDueDate(draft.issueDate, paymentTerm)
                        : "",
                    });
                  }}
                >
                  {termOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Due date
                <input
                  className={field}
                  type="date"
                  readOnly
                  value={draft.dueDate}
                />
              </label>
            </div>
            {draft.lines.some((line) => line.kind === "time") && (
              <div className="mt-4 space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={!invoice.canEdit}
                    checked={draft.includeHoursBreakdown}
                    onChange={(event) =>
                      updateDraft({
                        ...draft,
                        includeHoursBreakdown: event.target.checked,
                      })
                    }
                  />
                  Include billed time and materials hours breakdown in the PDF
                  packet
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={!invoice.canEdit || !draft.includeHoursBreakdown}
                    checked={draft.includeLineItemNotes}
                    onChange={(event) =>
                      updateDraft({
                        ...draft,
                        includeLineItemNotes: event.target.checked,
                      })
                    }
                  />
                  Include line item notes in the hours breakdown
                </label>
              </div>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Client note
                <textarea
                  className={field}
                  rows={3}
                  disabled={!invoice.canEdit}
                  value={draft.notes}
                  onChange={(e) =>
                    updateDraft({ ...draft, notes: e.target.value })
                  }
                />
              </label>
              <label className="text-sm">
                Internal note
                <textarea
                  className={field}
                  rows={3}
                  disabled={!invoice.canEdit}
                  value={draft.internalNote}
                  onChange={(e) =>
                    updateDraft({ ...draft, internalNote: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="mt-4 border-t pt-4">
              <h3 className="mb-2 font-semibold">Invoice recipients</h3>
              <p className="mb-2 text-xs text-slate-600">
                Only contacts assigned to this project can receive the invoice.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {invoice.recipients.map((recipient) => (
                  <label
                    key={recipient.contactId}
                    className="flex gap-2 rounded border p-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      disabled={!invoice.canEdit}
                      checked={draft.recipientIds.includes(recipient.contactId)}
                      onChange={(event) =>
                        updateDraft({
                          ...draft,
                          recipientIds: event.target.checked
                            ? [...draft.recipientIds, recipient.contactId]
                            : draft.recipientIds.filter(
                                (id) => id !== recipient.contactId,
                              ),
                        })
                      }
                    />
                    <span>
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
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-4 border-t pt-4">
              <h3 className="mb-2 font-semibold">Project invoice history</h3>
              <div className="max-h-40 overflow-auto text-sm">
                {projectHistory.map((item) => (
                  <Link
                    key={item.id}
                    to={`/invoices/${item.id}`}
                    className="grid grid-cols-[1fr_auto_auto] gap-3 border-b py-2 text-sky-800"
                  >
                    <span>{item.invoiceNumber}</span>
                    <span className="capitalize">
                      {item.status === "paid"
                        ? "Paid"
                        : item.status === "sent"
                          ? "Unpaid"
                          : item.status}
                    </span>
                    <span>{money(item.balanceCents)}</span>
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
          <section className={card}>
            <h2 className="mb-2 text-lg font-semibold">
              Uncommitted time and decisions
            </h2>
            <p className="mb-3 text-xs text-slate-600">
              Approved time is sorted by task, then user. Held balances return
              to the project pool.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2">Task / user / date</th>
                    <th className="p-2">Hours</th>
                    <th className="p-2">Client charge</th>
                    <th className="p-2">Notes</th>
                    <th className="p-2">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(
                    ({ entry, available: isAvailable, hours, charge }) => {
                      const choice = !isAvailable
                        ? draft.choices.find((x) => x.entryId === entry.entryId)
                        : null;
                      const current = choice
                        ? preview?.byEntry.get(entry.entryId)
                        : null;
                      return (
                        <tr key={entry.entryId} className="border-t align-top">
                          <td className="p-2">
                            <strong>
                              {entry.taskName || "General project"}
                            </strong>
                            <span className="block text-xs text-slate-600">
                              {entry.employeeName} · {entry.entryDate}
                            </span>
                          </td>
                          <td className="p-2">{hours.toFixed(2)}</td>
                          <td className="p-2">{money(charge)}</td>
                          <td className="max-w-48 p-2">
                            <p className="line-clamp-2">{entry.note}</p>
                            <button
                              className="text-xs text-sky-800 underline"
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
                            >
                              View entry
                            </button>
                          </td>
                          <td className="min-w-44 p-2">
                            {isAvailable ? (
                              <button
                                disabled={busy || !invoice.canEdit}
                                className="rounded border px-2 py-1 text-sky-800 disabled:opacity-50"
                                onClick={() => void addTime(entry.entryId)}
                              >
                                Add to draft
                              </button>
                            ) : (
                              choice && (
                                <div className="space-y-2">
                                  <select
                                    className={field}
                                    disabled={!invoice.canEdit}
                                    value={choice.disposition}
                                    onChange={(e) =>
                                      changeChoice(entry.entryId, {
                                        disposition: e.target
                                          .value as Choice["disposition"],
                                      })
                                    }
                                  >
                                    <option value="billed">Bill</option>
                                    <option value="hold">Hold</option>
                                    <option value="write-off">Write off</option>
                                    <option value="split">Split</option>
                                  </select>
                                  {choice.disposition === "split" && (
                                    <>
                                      <select
                                        className={field}
                                        disabled={!invoice.canEdit}
                                        value={choice.splitBasis}
                                        onChange={(e) =>
                                          changeChoice(entry.entryId, {
                                            splitBasis: e.target
                                              .value as Choice["splitBasis"],
                                          })
                                        }
                                      >
                                        <option value="hours">
                                          Split by hours
                                        </option>
                                        <option value="charge">
                                          Split by charge
                                        </option>
                                      </select>
                                      <input
                                        className={field}
                                        aria-label="Billed split amount"
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        disabled={!invoice.canEdit}
                                        value={choice.splitValue}
                                        onChange={(e) =>
                                          changeChoice(entry.entryId, {
                                            splitValue: e.target.value,
                                          })
                                        }
                                      />
                                      <select
                                        className={field}
                                        disabled={!invoice.canEdit}
                                        value={
                                          choice.splitRemainder || "write-off"
                                        }
                                        onChange={(e) =>
                                          changeChoice(entry.entryId, {
                                            splitRemainder: e.target
                                              .value as Choice["splitRemainder"],
                                          })
                                        }
                                      >
                                        <option value="hold">
                                          Hold remainder
                                        </option>
                                        <option value="write-off">
                                          Write off remainder
                                        </option>
                                      </select>
                                    </>
                                  )}
                                  {(choice.disposition === "write-off" ||
                                    (choice.disposition === "split" &&
                                      choice.splitRemainder !== "hold")) && (
                                    <>
                                      <select
                                        className={field}
                                        disabled={!invoice.canEdit}
                                        value={choice.writeoffReason || ""}
                                        onChange={(e) =>
                                          changeChoice(entry.entryId, {
                                            writeoffReason: e.target
                                              .value as Choice["writeoffReason"],
                                          })
                                        }
                                      >
                                        <option value="">Select reason</option>
                                        <option value="advance">Advance</option>
                                        <option value="over-budget">
                                          Over budget
                                        </option>
                                      </select>
                                      <textarea
                                        className={field}
                                        rows={2}
                                        placeholder="Explain write-off"
                                        disabled={!invoice.canEdit}
                                        value={choice.writeoffExplanation || ""}
                                        onChange={(e) =>
                                          changeChoice(entry.entryId, {
                                            writeoffExplanation: e.target.value,
                                          })
                                        }
                                      />
                                    </>
                                  )}
                                  {current && (
                                    <p className="text-xs text-slate-600">
                                      Bill{" "}
                                      {(
                                        current.billedHoursHundredths / 100
                                      ).toFixed(2)}{" "}
                                      h · Hold{" "}
                                      {(
                                        current.heldHoursHundredths / 100
                                      ).toFixed(2)}{" "}
                                      h · Write off{" "}
                                      {(
                                        current.writeoffHoursHundredths / 100
                                      ).toFixed(2)}{" "}
                                      h
                                    </p>
                                  )}
                                </div>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
              {!rows.length && (
                <p className="p-3 text-sm text-slate-500">
                  No approved time is available.
                </p>
              )}
            </div>
          </section>
          <section className={card}>
            <h2 className="mb-3 text-lg font-semibold">
              Project task costs and write-off analysis
            </h2>
            <div className="mb-3 grid gap-2 text-sm sm:grid-cols-3">
              <p className="rounded bg-sky-50 p-2">
                Billed: {sumMap(preview?.byTaskHours).toFixed(2)} h ?{" "}
                {money(currentRevenue)}
              </p>
              <p className="rounded bg-amber-50 p-2">
                Held: {sumMap(preview?.byTaskHeldHours).toFixed(2)} h ?{" "}
                {money(sumMap(preview?.byTaskHeldCharge))}
              </p>
              <p className="rounded bg-rose-50 p-2">
                Written off: {sumMap(preview?.byTaskWriteoffHours).toFixed(2)} h
                ? {money(sumMap(preview?.byTaskWriteoffCharge))}
              </p>
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
                  analysis?.rows.some((row) => row.approvedCostCents === null)
                    ? "Restricted"
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
            <p className="mt-3 text-xs text-slate-600">
              Attached:{" "}
              {invoice.poDocuments.map((document) => document.name).join(", ")}
            </p>
          )}
        </section>
      </div>
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
            className="mb-2 grid gap-2 sm:grid-cols-[7rem_1fr_10rem_3rem]"
          >
            <span className="self-center text-xs uppercase text-slate-500">
              {line.kind}
            </span>
            <input
              className={field}
              aria-label="Line description"
              disabled={!invoice.canEdit || line.kind === "time"}
              value={line.description}
              onChange={(e) =>
                changeLine(index, { description: e.target.value })
              }
            />
            <input
              className={field}
              aria-label="Line amount in dollars"
              type="number"
              min="0"
              step="0.01"
              disabled={!invoice.canEdit || line.kind === "time"}
              value={(
                (line.kind === "time"
                  ? (preview?.byTask.get(line.projectTaskId || "") ??
                    line.amountCents)
                  : line.kind === "fixed-fee"
                    ? (preview?.byTaskAmount.get(line.projectTaskId || "") ??
                      line.amountCents)
                    : line.amountCents) / 100
              ).toFixed(2)}
              onChange={(e) =>
                changeLine(index, {
                  amountCents: Math.round(Number(e.target.value) * 100),
                })
              }
            />
            {line.kind === "manual" && invoice.canEdit && (
              <button
                aria-label="Remove line"
                onClick={() =>
                  updateDraft({
                    ...draft,
                    lines: draft.lines.filter((_, i) => i !== index),
                  })
                }
              >
                ×
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
