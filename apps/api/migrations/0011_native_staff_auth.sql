CREATE TABLE native_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_id TEXT NOT NULL CHECK(client_id = 'northstar-desktop'),
  installation_label TEXT NOT NULL,
  refresh_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  inactive_expires_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX idx_native_grants_user ON native_grants(user_id, revoked_at);

CREATE TABLE native_auth_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  installation_label TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX idx_native_auth_codes_expiry ON native_auth_codes(expires_at);

CREATE TABLE native_access_tokens (
  token_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES native_grants(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_native_access_tokens_grant ON native_access_tokens(grant_id);

CREATE TABLE native_refresh_history (
  token_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES native_grants(id),
  rotated_at INTEGER NOT NULL
);
CREATE INDEX idx_native_refresh_history_grant ON native_refresh_history(grant_id);
