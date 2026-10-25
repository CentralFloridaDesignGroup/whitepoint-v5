-- Fresh V5 invoice init schema.
CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  invoice_number TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL CHECK(source IN ('monthly','manual')),
  billing_month TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','paid','void')),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  payment_term TEXT NOT NULL DEFAULT 'net-30' CHECK(payment_term IN ('due-on-receipt','net-15','net-30','net-45','net-60')),
  include_hours_breakdown INTEGER NOT NULL DEFAULT 0 CHECK(include_hours_breakdown IN (0,1)),
  include_line_item_notes INTEGER NOT NULL DEFAULT 0 CHECK(include_line_item_notes IN (0,1)),
  notes TEXT NOT NULL DEFAULT '',
  internal_note TEXT NOT NULL DEFAULT '',
  billing_name TEXT NOT NULL,
  billing_email TEXT NOT NULL DEFAULT '',
  billing_address_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(billing_address_json)),
  project_reference TEXT NOT NULL,
  po_number TEXT NOT NULL DEFAULT '',
  project_address_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(project_address_json)),
  public_token TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL DEFAULT 1,
  sent_at TEXT,
  paid_at TEXT,
  voided_at TEXT,
  email_status TEXT NOT NULL DEFAULT 'none' CHECK(email_status IN ('none','pending','accepted','failed')),
  email_error TEXT,
  qbo_invoice_id TEXT,
  qbo_sync_token TEXT,
  qbo_sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(qbo_sync_status IN ('pending','synced','failed','not_configured')),
  qbo_sync_error TEXT,
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_invoices_monthly ON invoices(project_id,billing_month) WHERE source='monthly';
CREATE INDEX idx_invoices_project ON invoices(project_id,created_at DESC);
CREATE INDEX idx_invoices_client ON invoices(client_id,created_at DESC);

CREATE TABLE invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  project_task_id TEXT REFERENCES project_tasks(id),
  kind TEXT NOT NULL CHECK(kind IN ('time','fixed-fee','manual')),
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(amount_cents>=0),
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id,sort_order);

CREATE TABLE invoice_recipients (
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  email_snapshot TEXT NOT NULL,
  name_snapshot TEXT NOT NULL,
  selected INTEGER NOT NULL DEFAULT 1 CHECK(selected IN (0,1)),
  PRIMARY KEY(invoice_id,contact_id)
);
CREATE INDEX idx_invoice_recipients_invoice ON invoice_recipients(invoice_id,selected);

CREATE TABLE invoice_entry_allocations (
  entry_id TEXT NOT NULL REFERENCES user_timesheet_entries(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  disposition TEXT NOT NULL CHECK(disposition IN ('billed','hold','write-off','split')),
  split_basis TEXT CHECK(split_basis IN ('hours','charge')),
  source_hours_hundredths INTEGER NOT NULL CHECK(source_hours_hundredths>0),
  billed_hours_hundredths INTEGER NOT NULL CHECK(billed_hours_hundredths>=0),
  writeoff_hours_hundredths INTEGER NOT NULL CHECK(writeoff_hours_hundredths>=0),
  held_hours_hundredths INTEGER NOT NULL DEFAULT 0 CHECK(held_hours_hundredths>=0),
  source_charge_cents INTEGER NOT NULL CHECK(source_charge_cents>=0),
  billed_charge_cents INTEGER NOT NULL CHECK(billed_charge_cents>=0),
  writeoff_charge_cents INTEGER NOT NULL CHECK(writeoff_charge_cents>=0),
  held_charge_cents INTEGER NOT NULL DEFAULT 0 CHECK(held_charge_cents>=0),
  writeoff_reason TEXT CHECK(writeoff_reason IN ('advance','over-budget')),
  writeoff_explanation TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(invoice_id,entry_id),
  CHECK(source_hours_hundredths=billed_hours_hundredths+writeoff_hours_hundredths+held_hours_hundredths),
  CHECK(source_charge_cents=billed_charge_cents+writeoff_charge_cents+held_charge_cents)
);
CREATE INDEX idx_invoice_allocations_invoice ON invoice_entry_allocations(invoice_id);
CREATE INDEX idx_invoice_allocations_entry ON invoice_entry_allocations(entry_id);
CREATE TRIGGER invoice_allocation_capacity_insert BEFORE INSERT ON invoice_entry_allocations BEGIN
  SELECT CASE WHEN
    (SELECT COALESCE(SUM(billed_hours_hundredths+writeoff_hours_hundredths),0) FROM invoice_entry_allocations WHERE entry_id=NEW.entry_id)+NEW.billed_hours_hundredths+NEW.writeoff_hours_hundredths > (SELECT ROUND(hours*100) FROM user_timesheet_entries WHERE id=NEW.entry_id)
    OR (SELECT COALESCE(SUM(billed_charge_cents+writeoff_charge_cents),0) FROM invoice_entry_allocations WHERE entry_id=NEW.entry_id)+NEW.billed_charge_cents+NEW.writeoff_charge_cents > (SELECT charge_cents FROM user_timesheet_entries WHERE id=NEW.entry_id)
    THEN RAISE(ABORT,'Time entry has already been allocated') END;
END;
CREATE TRIGGER invoice_allocation_capacity_update BEFORE UPDATE ON invoice_entry_allocations BEGIN
  SELECT CASE WHEN
    (SELECT COALESCE(SUM(billed_hours_hundredths+writeoff_hours_hundredths),0) FROM invoice_entry_allocations WHERE entry_id=NEW.entry_id AND invoice_id<>OLD.invoice_id)+NEW.billed_hours_hundredths+NEW.writeoff_hours_hundredths > (SELECT ROUND(hours*100) FROM user_timesheet_entries WHERE id=NEW.entry_id)
    OR (SELECT COALESCE(SUM(billed_charge_cents+writeoff_charge_cents),0) FROM invoice_entry_allocations WHERE entry_id=NEW.entry_id AND invoice_id<>OLD.invoice_id)+NEW.billed_charge_cents+NEW.writeoff_charge_cents > (SELECT charge_cents FROM user_timesheet_entries WHERE id=NEW.entry_id)
    THEN RAISE(ABORT,'Time entry has already been allocated') END;
END;

CREATE TABLE invoice_po_documents (
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  project_document_id TEXT NOT NULL REFERENCES project_po_documents(id),
  name_snapshot TEXT NOT NULL,
  r2_key_snapshot TEXT NOT NULL,
  PRIMARY KEY(invoice_id,project_document_id)
);

CREATE TABLE invoice_payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  source TEXT NOT NULL CHECK(source IN ('manual','stripe')),
  status TEXT NOT NULL CHECK(status IN ('pending','succeeded','failed','void')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
  method TEXT NOT NULL,
  reference_number TEXT,
  paid_at TEXT,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  qbo_payment_id TEXT,
  qbo_sync_status TEXT NOT NULL DEFAULT 'pending',
  qbo_sync_error TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  stripe_charge_id TEXT,
  stripe_balance_transaction_id TEXT,
  stripe_fee_cents INTEGER NOT NULL DEFAULT 0,
  stripe_net_cents INTEGER,
  stripe_last_four TEXT,
  stripe_payout_id TEXT,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  disputed_cents INTEGER NOT NULL DEFAULT 0,
  qbo_posted_amount_cents INTEGER,
  qbo_fee_purchase_id TEXT,
  review_error TEXT
);
CREATE INDEX idx_invoice_payments_invoice ON invoice_payments(invoice_id);
CREATE UNIQUE INDEX idx_invoice_payments_stripe_charge ON invoice_payments(stripe_charge_id);
CREATE UNIQUE INDEX idx_invoice_payments_stripe_balance ON invoice_payments(stripe_balance_transaction_id);

CREATE TABLE invoice_webhook_events (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE invoice_notifications (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  kind TEXT NOT NULL CHECK(kind IN ('manager','client')),
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','failed')),
  recipient_email TEXT NOT NULL,
  contact_id TEXT REFERENCES contacts(id),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(invoice_id,kind,recipient_email)
);

CREATE TABLE invoice_events (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_invoice_events_invoice ON invoice_events(invoice_id,created_at);

CREATE TABLE stripe_checkout_sessions (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','complete','expired')),
  expires_at INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_stripe_checkout_invoice ON stripe_checkout_sessions(invoice_id,status);
CREATE UNIQUE INDEX idx_stripe_checkout_one_open ON stripe_checkout_sessions(invoice_id) WHERE status='open';

CREATE TABLE stripe_payment_adjustments (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES invoice_payments(id),
  kind TEXT NOT NULL CHECK(kind IN ('refund','dispute')),
  status TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
  balance_transaction_id TEXT UNIQUE,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_stripe_adjustments_payment ON stripe_payment_adjustments(payment_id);

CREATE TABLE stripe_adjustment_transactions (
  balance_transaction_id TEXT PRIMARY KEY,
  adjustment_id TEXT NOT NULL REFERENCES stripe_payment_adjustments(id)
);

CREATE TABLE stripe_payouts (
  id TEXT PRIMARY KEY,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0 CHECK(paid IN (0,1)),
  reconciled INTEGER NOT NULL DEFAULT 0 CHECK(reconciled IN (0,1)),
  status TEXT NOT NULL,
  review_error TEXT,
  qbo_transfer_id TEXT,
  qbo_sync_status TEXT NOT NULL DEFAULT 'pending',
  qbo_sync_error TEXT,
  arrival_date TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  qbo_posting_started_at TEXT
);

CREATE TABLE stripe_payout_transactions (
  balance_transaction_id TEXT PRIMARY KEY,
  payout_id TEXT NOT NULL REFERENCES stripe_payouts(id),
  amount_cents INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL,
  net_cents INTEGER NOT NULL,
  type TEXT NOT NULL,
  source_id TEXT,
  payment_id TEXT REFERENCES invoice_payments(id),
  adjustment_id TEXT REFERENCES stripe_payment_adjustments(id),
  qbo_fee_purchase_id TEXT
);
CREATE INDEX idx_stripe_payout_transactions_payout ON stripe_payout_transactions(payout_id);

CREATE TABLE client_payment_holds (
  client_id TEXT PRIMARY KEY REFERENCES clients(id),
  reason TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TEXT,
  released_by TEXT REFERENCES users(id)
);

CREATE TABLE payment_notice_deliveries (
  id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','failed')),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_key,recipient_email)
);
