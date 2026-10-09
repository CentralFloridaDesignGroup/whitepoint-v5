CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  company_name TEXT NOT NULL DEFAULT 'White Point Surveying & Mapping LLC',
  company_short_name TEXT NOT NULL DEFAULT 'White Point Survey',
  invoice_number_template TEXT NOT NULL DEFAULT 'INV-{YY}-{####}',
  default_invoice_note TEXT NOT NULL DEFAULT '',
  project_number_template TEXT NOT NULL DEFAULT '{YY}-{####}',
  invoice_reset_yearly INTEGER NOT NULL DEFAULT 0 CHECK (invoice_reset_yearly IN (0, 1)),
  project_reset_yearly INTEGER NOT NULL DEFAULT 1 CHECK (project_reset_yearly IN (0, 1)),
  rectangular_logo_key TEXT,
  square_logo_key TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO app_settings(id) VALUES (1);
CREATE TABLE number_sequences (
  kind TEXT NOT NULL CHECK (kind IN ('invoice', 'project')),
  period TEXT NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, period)
);
ALTER TABLE qbo_connection ADD COLUMN default_service_item_id TEXT;
ALTER TABLE qbo_connection ADD COLUMN default_service_item_name TEXT;
ALTER TABLE qbo_connection ADD COLUMN default_deposit_account_id TEXT;
ALTER TABLE qbo_connection ADD COLUMN default_deposit_account_name TEXT;
ALTER TABLE qbo_connection ADD COLUMN stripe_fee_expense_account_id TEXT;
ALTER TABLE qbo_connection ADD COLUMN stripe_fee_expense_account_name TEXT;
