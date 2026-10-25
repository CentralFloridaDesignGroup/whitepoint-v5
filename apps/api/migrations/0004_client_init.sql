-- Fresh V5 client init schema.
CREATE TABLE client_number_sequences (
  period TEXT PRIMARY KEY,
  last_value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  billing_address_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(billing_address_json)),
  qbo_customer_id TEXT UNIQUE,
  qbo_sync_token TEXT,
  qbo_sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (qbo_sync_status IN ('pending', 'synced', 'failed', 'not_configured')),
  qbo_sync_error TEXT,
  archived_at TEXT,
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  client_number TEXT,
  parent_client_id TEXT REFERENCES clients(id),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
);
CREATE INDEX idx_clients_active_name ON clients(archived_at, status, name COLLATE NOCASE);
CREATE INDEX idx_clients_qbo ON clients(qbo_customer_id);
CREATE UNIQUE INDEX idx_clients_number ON clients(client_number);

CREATE TABLE client_addresses (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  label TEXT NOT NULL DEFAULT '',
  is_primary_mailing_address INTEGER NOT NULL DEFAULT 0 CHECK (is_primary_mailing_address IN (0,1)),
  line1 TEXT NOT NULL,
  line2 TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_client_addresses_client ON client_addresses(client_id,archived_at);
CREATE UNIQUE INDEX idx_client_addresses_primary ON client_addresses(client_id) WHERE is_primary_mailing_address=1 AND archived_at IS NULL;

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  invoice_recipient INTEGER NOT NULL DEFAULT 0 CHECK (invoice_recipient IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  prefix TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL DEFAULT '',
  middle_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  suffix TEXT NOT NULL DEFAULT '',
  client_address_id TEXT REFERENCES client_addresses(id),
  is_poc INTEGER NOT NULL DEFAULT 0 CHECK (is_poc IN (0,1)),
  is_billing_poc INTEGER NOT NULL DEFAULT 0 CHECK (is_billing_poc IN (0,1)),
  is_executive_poc INTEGER NOT NULL DEFAULT 0 CHECK (is_executive_poc IN (0,1)),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json))
);
CREATE INDEX idx_contacts_client_name ON contacts(client_id, archived_at, name COLLATE NOCASE);
CREATE INDEX idx_contacts_email ON contacts(email COLLATE NOCASE);
CREATE INDEX idx_contacts_poc ON contacts(client_id,is_poc,archived_at);

CREATE TABLE client_documents (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  expires_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_client_documents_client ON client_documents(client_id,archived_at);
