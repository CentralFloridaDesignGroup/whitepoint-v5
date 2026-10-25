-- Fresh V5 user init auth seed schema.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  first_name TEXT NOT NULL,
  middle_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL,
  suffix TEXT NOT NULL DEFAULT '',
  user_type TEXT NOT NULL DEFAULT 'internal' CHECK (user_type IN ('internal', 'external')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  archived_at TEXT,
  archived_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  manager_user_id TEXT REFERENCES users(id),
  pay_basis TEXT CHECK(pay_basis IN ('hourly','salary')),
  pay_amount_cents INTEGER CHECK(pay_amount_cents >= 0),
  weekly_hours INTEGER DEFAULT 0 CHECK(weekly_hours >= -1)
);
CREATE INDEX idx_users_active ON users(active, archived_at);

CREATE VIEW users_named AS
SELECT u.*,
  TRIM(u.first_name || CASE WHEN u.middle_name<>'' THEN ' '||u.middle_name ELSE '' END || ' '||u.last_name || CASE WHEN u.suffix<>'' THEN ' '||u.suffix ELSE '' END) AS display_name
FROM users u;

CREATE TABLE user_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  password_hash TEXT,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0 CHECK(totp_enabled IN (0,1)),
  totp_pending_secret TEXT,
  totp_pending_expires_at INTEGER,
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

CREATE TABLE user_webauthn_challenges (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  purpose TEXT NOT NULL CHECK(purpose IN ('register','login')),
  origin TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX idx_user_webauthn_challenges_expiry ON user_webauthn_challenges(expires_at);

CREATE TABLE request_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_request_limits_expiry ON request_limits(expires_at);

CREATE TABLE user_favorites (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  paths_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(paths_json)),
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

INSERT INTO users(id, email, first_name, last_name, user_type, active) VALUES
  ('1', 'nwhite@whitepointsurvey.com', 'Nathan', 'White', 'internal', 1);

INSERT INTO user_roles(user_id, role_id, updated_by)
SELECT '1', 'super-administrator', '1'
WHERE EXISTS (SELECT 1 FROM users WHERE id='1')
  AND EXISTS (SELECT 1 FROM roles WHERE id='super-administrator');

INSERT INTO user_audit(id, user_id, actor_id, action, after_json)
SELECT 'seed-initial-admin-1', '1', '1', 'initial-administrator-seeded',
  '{"email":"nwhite@whitepointsurvey.com","roleId":"super-administrator"}'
WHERE EXISTS (SELECT 1 FROM user_roles WHERE user_id='1' AND role_id='super-administrator');

INSERT INTO setup_state(id, initialized) VALUES (1, 0);
