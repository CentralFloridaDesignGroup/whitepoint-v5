-- Fresh V5 project init schema.
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  project_number TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  manager_user_id TEXT REFERENCES users(id),
  start_date TEXT,
  due_date TEXT,
  qbo_customer_id TEXT UNIQUE,
  qbo_sync_token TEXT,
  qbo_sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (qbo_sync_status IN ('pending', 'synced', 'failed', 'not_configured')),
  qbo_sync_error TEXT,
  archived_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  stage TEXT NOT NULL DEFAULT 'opportunity' CHECK (stage IN ('opportunity','proposal','shortlisted','negotiating','withdrawn','active','completed','holdExternal','holdInternal','cancelled')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  contact_id TEXT REFERENCES contacts(id),
  address_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(address_json)),
  contract_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (contract_price_cents >= 0),
  budget_cents INTEGER NOT NULL DEFAULT 0 CHECK (budget_cents >= 0),
  pay_table_id TEXT REFERENCES pay_tables(id),
  po_number TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_projects_client ON projects(client_id, archived_at);
CREATE INDEX idx_projects_manager ON projects(manager_user_id, archived_at);
CREATE INDEX idx_projects_number ON projects(project_number DESC);
CREATE INDEX idx_projects_name ON projects(name COLLATE NOCASE);
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

CREATE TABLE project_po_documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_project_po_documents_project ON project_po_documents(project_id,archived_at);
