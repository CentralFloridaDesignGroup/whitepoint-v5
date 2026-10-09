ALTER TABLE app_settings ADD COLUMN client_number_template TEXT NOT NULL DEFAULT 'C-{####}';
ALTER TABLE app_settings ADD COLUMN client_reset_yearly INTEGER NOT NULL DEFAULT 0 CHECK (client_reset_yearly IN (0,1));
CREATE TABLE record_write_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK (valid=1));

CREATE TABLE client_number_sequences (
  period TEXT PRIMARY KEY,
  last_value INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE clients ADD COLUMN client_number TEXT;
ALTER TABLE clients ADD COLUMN parent_client_id TEXT REFERENCES clients(id);
ALTER TABLE clients ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json));
ALTER TABLE clients ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);
UPDATE clients SET client_number = 'C-' || substr('0000' || rowid, -4) WHERE client_number IS NULL;
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

ALTER TABLE contacts ADD COLUMN prefix TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN middle_name TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN last_name TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN suffix TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN client_address_id TEXT REFERENCES client_addresses(id);
ALTER TABLE contacts ADD COLUMN is_poc INTEGER NOT NULL DEFAULT 0 CHECK (is_poc IN (0,1));
ALTER TABLE contacts ADD COLUMN is_billing_poc INTEGER NOT NULL DEFAULT 0 CHECK (is_billing_poc IN (0,1));
ALTER TABLE contacts ADD COLUMN is_executive_poc INTEGER NOT NULL DEFAULT 0 CHECK (is_executive_poc IN (0,1));
ALTER TABLE contacts ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json));
UPDATE contacts SET first_name=CASE WHEN instr(name,' ')=0 THEN name ELSE substr(name,1,instr(name,' ')-1) END,
  last_name=CASE WHEN instr(name,' ')=0 THEN '' ELSE substr(name,instr(name,' ')+1) END,
  is_poc=1 WHERE archived_at IS NULL;
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

ALTER TABLE projects ADD COLUMN stage TEXT NOT NULL DEFAULT 'opportunity' CHECK (stage IN ('opportunity','proposal','shortlisted','negotiating','withdrawn','active','completed','holdExternal','holdInternal','cancelled'));
ALTER TABLE projects ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1));
ALTER TABLE projects ADD COLUMN contact_id TEXT REFERENCES contacts(id);
ALTER TABLE projects ADD COLUMN address_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(address_json));
ALTER TABLE projects ADD COLUMN contract_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (contract_price_cents >= 0);
ALTER TABLE projects ADD COLUMN budget_cents INTEGER NOT NULL DEFAULT 0 CHECK (budget_cents >= 0);
CREATE INDEX idx_projects_stage ON projects(stage,archived_at);
CREATE INDEX idx_projects_contact ON projects(contact_id);

CREATE TABLE project_contacts (
  project_id TEXT NOT NULL REFERENCES projects(id),
  role TEXT NOT NULL CHECK (role IN ('projectManager','busDevManager','clientPoc','clientBillingPoc','clientStakeholder','externalStakeholder')),
  user_id TEXT REFERENCES users(id),
  contact_id TEXT REFERENCES contacts(id),
  CHECK ((user_id IS NOT NULL AND contact_id IS NULL AND role IN ('projectManager','busDevManager')) OR
    (user_id IS NULL AND contact_id IS NOT NULL AND role IN ('clientPoc','clientBillingPoc','clientStakeholder','externalStakeholder'))),
  PRIMARY KEY(project_id,role,user_id,contact_id)
);
CREATE UNIQUE INDEX idx_project_one_pm ON project_contacts(project_id) WHERE role='projectManager';
CREATE UNIQUE INDEX idx_project_contact_user ON project_contacts(project_id,role,user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_project_contact_client ON project_contacts(project_id,role,contact_id) WHERE contact_id IS NOT NULL;

CREATE TABLE project_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  task_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  task_name TEXT NOT NULL,
  short_description TEXT NOT NULL DEFAULT '',
  long_description_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(long_description_json)),
  task_manager_id TEXT REFERENCES users(id),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  is_under_contract INTEGER NOT NULL DEFAULT 0 CHECK (is_under_contract IN (0,1)),
  is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0,1)),
  contract_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (contract_amount_cents >= 0),
  bill_type TEXT NOT NULL DEFAULT 'fixed-fee' CHECK (bill_type IN ('fixed-fee','time-and-materials','time-and-materials-nte','direct-expense','non-billable')),
  bill_notes TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_project_tasks_project ON project_tasks(project_id,archived_at,sequence);
CREATE UNIQUE INDEX idx_project_tasks_id_active ON project_tasks(project_id,task_id) WHERE archived_at IS NULL;

CREATE TABLE project_qbo_history (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  qbo_customer_id TEXT NOT NULL,
  qbo_sync_token TEXT,
  moved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  moved_by TEXT REFERENCES users(id)
);
CREATE INDEX idx_project_qbo_history_project ON project_qbo_history(project_id,moved_at);
