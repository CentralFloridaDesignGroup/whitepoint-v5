-- Clean V5 baseline for first-run identity, client/contact, project, search, and QBO workflows.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  user_type TEXT NOT NULL DEFAULT 'internal' CHECK (user_type IN ('internal', 'external')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  archived_at TEXT,
  archived_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_active ON users(active, archived_at);

INSERT INTO users(id, email, display_name, user_type, active) VALUES
  ('1', 'nwhite@whitepointsurvey.com', 'Nathan White', 'internal', 1);

CREATE TABLE user_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  password_hash TEXT,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0 CHECK(totp_enabled IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE user_passkeys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '[]',
  name TEXT NOT NULL DEFAULT 'Passkey',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);
CREATE INDEX idx_user_passkeys_user ON user_passkeys(user_id);
CREATE TABLE user_recovery_codes (
  user_id TEXT NOT NULL REFERENCES users(id),
  code_hash TEXT NOT NULL,
  used_at TEXT,
  PRIMARY KEY(user_id,code_hash)
);
CREATE TABLE user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  csrf_token TEXT NOT NULL,
  pending_mfa INTEGER NOT NULL DEFAULT 0 CHECK(pending_mfa IN (0,1)),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
CREATE TABLE user_auth_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL CHECK(purpose IN ('invite','reset')),
  payload TEXT,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE TABLE request_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE user_favorites (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  paths_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(paths_json)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  permissions TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(permissions)),
  built_in INTEGER NOT NULL DEFAULT 0 CHECK (built_in IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE user_roles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  role_id TEXT NOT NULL REFERENCES roles(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT REFERENCES users(id)
);
CREATE TABLE user_audit (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_user_audit_user ON user_audit(user_id, created_at);
CREATE TABLE setup_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  initialized INTEGER NOT NULL DEFAULT 0 CHECK (initialized IN (0, 1)),
  initialized_by TEXT,
  bootstrap_email TEXT NOT NULL DEFAULT 'nwhite@whitepointsurvey.com'
);
INSERT INTO setup_state(id, initialized) VALUES (1, 0);

INSERT INTO roles(id, name, permissions, built_in) VALUES
  ('super-administrator', 'super-administrator', '["*"]', 1),
  ('employee', 'employee', '["dashboard.view"]', 1);

INSERT INTO user_roles(user_id, role_id, updated_by)
SELECT '1', 'super-administrator', '1'
WHERE EXISTS (SELECT 1 FROM users WHERE id='1')
  AND EXISTS (SELECT 1 FROM roles WHERE id='super-administrator');

INSERT INTO user_audit(id, user_id, actor_id, action, after_json)
SELECT 'seed-initial-admin-1', '1', '1', 'initial-administrator-seeded',
  '{"email":"nwhite@whitepointsurvey.com","roleId":"super-administrator"}'
WHERE EXISTS (SELECT 1 FROM user_roles WHERE user_id='1' AND role_id='super-administrator');

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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_clients_active_name ON clients(archived_at, status, name COLLATE NOCASE);
CREATE INDEX idx_clients_qbo ON clients(qbo_customer_id);
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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_contacts_client_name ON contacts(client_id, archived_at, name COLLATE NOCASE);
CREATE INDEX idx_contacts_email ON contacts(email COLLATE NOCASE);

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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_projects_client ON projects(client_id, archived_at);
CREATE INDEX idx_projects_manager ON projects(manager_user_id, archived_at);
CREATE INDEX idx_projects_number ON projects(project_number DESC);
CREATE INDEX idx_projects_name ON projects(name COLLATE NOCASE);
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_record ON audit_log(record_type, record_id, created_at);

CREATE TABLE qbo_connection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  realm_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TEXT NOT NULL,
  refresh_expires_at TEXT,
  connected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE qbo_oauth_states (
  state TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_qbo_oauth_states_created ON qbo_oauth_states(created_at);
