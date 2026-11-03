import { guard, unguard } from "./writeGuard.ts";
import type { InvoiceRecipient } from "@whitepoint/types";
import { randomToken } from "../auth/session.ts";
import { businessDate, nextNumber } from "./numbering.ts";
import { allocateEntry } from "./invoiceCore.ts";
import {
  invoiceDueDate,
  type InvoiceTerm,
} from "@whitepoint/utils/invoice-terms";

type Row = Record<string, unknown>;
const id = () => crypto.randomUUID();
const s = (value: unknown) => String(value ?? "");
const n = (value: unknown) => Number(value ?? 0);
export const event = (
  db: D1Database,
  invoiceId: string,
  actor: string | null,
  action: string,
  details: unknown = {},
) =>
  db
    .prepare(
      "INSERT INTO invoice_events(id,invoice_id,actor_id,action,details_json) VALUES(?,?,?,?,?)",
    )
    .bind(id(), invoiceId, actor, action, JSON.stringify(details));

export async function projectInvoiceContacts(
  db: D1Database,
  projectId: string,
): Promise<InvoiceRecipient[]> {
  const rows =
    (
      await db
        .prepare(
          `SELECT DISTINCT c.id,c.name,c.email,c.is_billing_poc,
    CASE WHEN p.contact_id=c.id THEN 1 ELSE 0 END AS is_primary,
    CASE WHEN EXISTS(SELECT 1 FROM project_contacts pc WHERE pc.project_id=p.id AND pc.contact_id=c.id AND pc.role='clientBillingPoc') THEN 1 ELSE 0 END AS project_billing
    FROM projects p JOIN contacts c ON c.client_id=p.client_id AND c.archived_at IS NULL
    WHERE p.id=? AND (c.id=p.contact_id OR EXISTS(SELECT 1 FROM project_contacts pc WHERE pc.project_id=p.id AND pc.contact_id=c.id))
    ORDER BY is_primary DESC,c.name COLLATE NOCASE`,
        )
        .bind(projectId)
        .all<Row>()
    ).results || [];
  return rows.map((x) => ({
    contactId: s(x.id),
    name: s(x.name),
    email: s(x.email),
    selected: Boolean(x.is_primary || x.is_billing_poc || x.project_billing),
    isPrimary: Boolean(x.is_primary),
    isBillingPoc: Boolean(x.is_billing_poc || x.project_billing),
    deliveryStatus: "none",
    deliveryError: null,
  }));
}

export async function eligibleEntries(
  db: D1Database,
  projectId: string,
  cutoff?: string,
) {
  const result = await db
    .prepare(
      `SELECT e.id,e.project_task_id,e.entry_date,
    (ROUND(e.hours*100)-COALESCE(a.claimed_hours,0))/100.0 AS hours,e.note,
    e.charge_cents-COALESCE(a.claimed_charge,0) AS charge_cents,e.billing_type,t.task_name,t.contract_amount_cents,u.display_name AS employee_name
    FROM user_timesheet_entries e JOIN user_timesheets w ON w.id=e.timesheet_id
    JOIN users_named u ON u.id=w.user_id
    JOIN project_tasks t ON t.id=e.project_task_id
    LEFT JOIN invoice_entry_claims a ON a.entry_id=e.id
    WHERE e.project_id=? AND w.status='approved' AND ROUND(e.hours*100)>COALESCE(a.claimed_hours,0)
      AND e.billing_type IN ('fixed-fee','time-and-materials','time-and-materials-nte')
      AND (? IS NULL OR e.entry_date<?)
    ORDER BY t.task_name COLLATE NOCASE,u.display_name COLLATE NOCASE,e.entry_date,e.id`,
    )
    .bind(projectId, cutoff || null, cutoff || null)
    .all<Row>();
  return result.results || [];
}

export async function createInvoiceDraft(
  db: D1Database,
  projectId: string,
  actor: string | null,
  options: {
    source: "monthly" | "manual";
    billingMonth?: string;
    entryIds?: string[];
    issueDate?: string;
    paymentTerm?: InvoiceTerm;
  },
) {
  const project = await db
    .prepare(
      `SELECT p.*,c.name AS client_name,c.email AS client_email,c.billing_address_json
    FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.id=? AND p.archived_at IS NULL`,
    )
    .bind(projectId)
    .first<Row>();
  if (!project) throw new Error("Project not found.");
  if (options.source === "monthly" && options.billingMonth) {
    const existing = await db
      .prepare(
        "SELECT id FROM invoices WHERE project_id=? AND billing_month=? AND source='monthly' AND status<>'void'",
      )
      .bind(projectId, options.billingMonth)
      .first<{ id: string }>();
    if (existing) return existing.id;
  }
  const all = await eligibleEntries(
    db,
    projectId,
    options.source === "monthly" ? `${options.billingMonth}-01` : undefined,
  );
  const selected =
    options.source === "manual"
      ? all.filter((row) => options.entryIds?.includes(s(row.id)))
      : all;
  if (
    options.source === "manual" &&
    selected.length !== new Set(options.entryIds || []).size
  )
    throw new Error("One or more time entries are no longer available.");
  if (options.source === "monthly" && !selected.length) return null;
  const now = businessDate(),
    issueDate =
      options.issueDate ||
      `${now.year}-${now.month}-${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", day: "2-digit" }).format(new Date())}`;
  const paymentTerm = options.paymentTerm || "net-30",
    dueDate = invoiceDueDate(issueDate, paymentTerm);
  const setting = await db
    .prepare(
      "SELECT invoice_number_template,invoice_reset_yearly,default_invoice_note FROM app_settings WHERE id=1",
    )
    .first<Row>();
  if (!setting) throw new Error("Invoice settings are missing.");
  const number = await nextNumber(db, "invoice", {
    invoiceNumberTemplate: s(setting.invoice_number_template),
    invoiceResetYearly: n(setting.invoice_reset_yearly) === 1,
    projectNumberTemplate: "",
    projectResetYearly: false,
    clientNumberTemplate: "",
    clientResetYearly: false,
  });
  const recipients = await projectInvoiceContacts(db, projectId);
  const contact =
    recipients.find((x) => x.isPrimary && x.email) ||
    recipients.find((x) => x.selected && x.email);
  const invoiceId = id(),
    statements: D1PreparedStatement[] = [];
  statements.push(
    db
      .prepare(
        `INSERT INTO invoices(id,project_id,client_id,invoice_number,source,billing_month,issue_date,due_date,payment_term,notes,billing_name,billing_email,billing_address_json,project_reference,po_number,project_address_json,public_token,created_by,updated_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        invoiceId,
        projectId,
        project.client_id,
        number,
        options.source,
        options.billingMonth || null,
        issueDate,
        dueDate,
        paymentTerm,
        s(setting.default_invoice_note),
        s(project.client_name),
        s(contact?.email || ""),
        s(project.billing_address_json || "{}"),
        `${s(project.project_number)} - ${s(project.name)}`,
        s(project.po_number),
        s(project.address_json || "{}"),
        randomToken(32),
        actor,
        actor,
      ),
  );
  for (const recipient of recipients)
    statements.push(
      db
        .prepare(
          "INSERT INTO invoice_recipients(invoice_id,contact_id,email_snapshot,name_snapshot,selected) VALUES(?,?,?,?,?)",
        )
        .bind(
          invoiceId,
          recipient.contactId,
          recipient.email,
          recipient.name,
          Number(recipient.selected),
        ),
    );
  const reserved = await reserveInvoiceEntries(db, invoiceId, selected);
  statements.push(...reserved.statements);
  let order = 0;
  for (const line of reserved.grouped.values())
    statements.push(
      db
        .prepare(
          "INSERT INTO invoice_lines(id,invoice_id,project_task_id,kind,description,amount_cents,sort_order) VALUES(?,?,?,?,?,?,?)",
        )
        .bind(
          id(),
          invoiceId,
          line.taskId,
          line.kind,
          line.name,
          line.amount,
          order++,
        ),
    );
  statements.push(
    event(db, invoiceId, actor, "draft-created", {
      source: options.source,
      entryCount: selected.length,
      billingMonth: options.billingMonth || null,
    }),
  );
  await db.batch(statements);
  return invoiceId;
}

export async function reserveInvoiceEntries(
  db: D1Database,
  invoiceId: string,
  selected: Row[],
) {
  const statements: D1PreparedStatement[] = [],
    caps = new Map<string, number>(),
    grouped = new Map<
      string,
      {
        taskId: string;
        name: string;
        kind: "time" | "fixed-fee";
        amount: number;
      }
    >();
  for (const entry of selected) {
    const taskId = s(entry.project_task_id),
      kind =
        entry.billing_type === "fixed-fee"
          ? ("fixed-fee" as const)
          : ("time" as const);
    let allocation = allocateEntry(
      n(entry.hours),
      n(entry.charge_cents),
      "billed",
    );
    if (entry.billing_type === "time-and-materials-nte") {
      let remaining = caps.get(taskId);
      if (remaining === undefined) {
        const previous = await db
          .prepare(
            `SELECT COALESCE(SUM(l.amount_cents),0) AS amount FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE l.project_task_id=? AND i.status<>'void'`,
          )
          .bind(taskId)
          .first<{ amount: number }>();
        remaining = Math.max(
          0,
          n(entry.contract_amount_cents) - n(previous?.amount),
        );
      }
      const charge = n(entry.charge_cents);
      if (remaining <= 0)
        allocation = allocateEntry(n(entry.hours), charge, "write-off");
      else if (remaining < charge) {
        try {
          allocation = allocateEntry(
            n(entry.hours),
            charge,
            "split",
            "charge",
            remaining,
          );
        } catch {
          allocation = allocateEntry(n(entry.hours), charge, "write-off");
        }
      }
      caps.set(taskId, Math.max(0, remaining - allocation.billedChargeCents));
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO invoice_entry_allocations(entry_id,invoice_id,disposition,split_basis,source_hours_hundredths,billed_hours_hundredths,writeoff_hours_hundredths,held_hours_hundredths,source_charge_cents,billed_charge_cents,writeoff_charge_cents,held_charge_cents,writeoff_reason,writeoff_explanation) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          entry.id,
          invoiceId,
          allocation.disposition,
          allocation.splitBasis,
          allocation.sourceHoursHundredths,
          allocation.billedHoursHundredths,
          allocation.writeoffHoursHundredths,
          0,
          allocation.sourceChargeCents,
          allocation.billedChargeCents,
          allocation.writeoffChargeCents,
          0,
          allocation.writeoffHoursHundredths ? "over-budget" : null,
          allocation.writeoffHoursHundredths ? "Automatic contract cap" : "",
        ),
    );
    const key = `${taskId}:${kind}`,
      group = grouped.get(key) || {
        taskId,
        name: s(entry.task_name),
        kind,
        amount: 0,
      };
    if (kind === "time") group.amount += allocation.billedChargeCents;
    else {
      let remaining = caps.get(taskId);
      if (remaining === undefined) {
        const previous = await db
          .prepare(
            `SELECT COALESCE(SUM(l.amount_cents),0) AS amount FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE l.project_task_id=? AND i.status<>'void'`,
          )
          .bind(taskId)
          .first<{ amount: number }>();
        remaining = Math.max(
          0,
          n(entry.contract_amount_cents) - n(previous?.amount),
        );
      }
      const amount = Math.min(remaining, allocation.billedChargeCents);
      group.amount += amount;
      caps.set(taskId, remaining - amount);
    }
    grouped.set(key, group);
  }
  return { statements, grouped };
}

export {
  invoiceList,
  invoiceDetail,
  publicInvoice,
  refreshPaid,
} from "./invoiceRead.ts";

export { guard, unguard };
