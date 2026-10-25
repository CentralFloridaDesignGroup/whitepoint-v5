-- Fresh V5 company initialization schema.
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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  client_number_template TEXT NOT NULL DEFAULT 'C-{####}',
  client_reset_yearly INTEGER NOT NULL DEFAULT 0 CHECK (client_reset_yearly IN (0,1))
);

CREATE TABLE number_sequences (
  kind TEXT NOT NULL CHECK (kind IN ('invoice', 'project')),
  period TEXT NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, period)
);

CREATE TABLE record_write_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK (valid=1));

CREATE TABLE qbo_connection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  realm_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TEXT NOT NULL,
  refresh_expires_at TEXT,
  connected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  default_service_item_id TEXT,
  default_service_item_name TEXT,
  default_deposit_account_id TEXT,
  default_deposit_account_name TEXT,
  stripe_fee_expense_account_id TEXT,
  stripe_fee_expense_account_name TEXT,
  stripe_clearing_account_id TEXT,
  stripe_clearing_account_name TEXT,
  stripe_payout_bank_account_id TEXT,
  stripe_payout_bank_account_name TEXT
);

CREATE TABLE qbo_oauth_states (
  state TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_qbo_oauth_states_created ON qbo_oauth_states(created_at);

INSERT INTO app_settings(id) VALUES (1);
