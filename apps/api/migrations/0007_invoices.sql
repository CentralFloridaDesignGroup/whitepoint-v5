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
  notes TEXT NOT NULL DEFAULT '',
  internal_note TEXT NOT NULL DEFAULT '',
  billing_name TEXT NOT NULL,
  billing_email TEXT NOT NULL DEFAULT '',
  billing_address_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(billing_address_json)),
  project_reference TEXT NOT NULL,
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
CREATE TABLE invoice_entry_allocations (
  entry_id TEXT PRIMARY KEY REFERENCES user_timesheet_entries(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  disposition TEXT NOT NULL CHECK(disposition IN ('billed','write-off','split')),
  split_basis TEXT CHECK(split_basis IN ('hours','charge')),
  source_hours_hundredths INTEGER NOT NULL CHECK(source_hours_hundredths>0),
  billed_hours_hundredths INTEGER NOT NULL CHECK(billed_hours_hundredths>=0),
  writeoff_hours_hundredths INTEGER NOT NULL CHECK(writeoff_hours_hundredths>=0),
  source_charge_cents INTEGER NOT NULL CHECK(source_charge_cents>=0),
  billed_charge_cents INTEGER NOT NULL CHECK(billed_charge_cents>=0),
  writeoff_charge_cents INTEGER NOT NULL CHECK(writeoff_charge_cents>=0),
  CHECK(source_hours_hundredths=billed_hours_hundredths+writeoff_hours_hundredths),
  CHECK(source_charge_cents=billed_charge_cents+writeoff_charge_cents)
);
CREATE INDEX idx_invoice_allocations_invoice ON invoice_entry_allocations(invoice_id);
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_invoice_payments_invoice ON invoice_payments(invoice_id);
CREATE TABLE invoice_webhook_events (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE invoice_notifications (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  kind TEXT NOT NULL CHECK(kind IN ('manager','client')),
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','failed')),
  recipient_email TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(invoice_id,kind)
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
