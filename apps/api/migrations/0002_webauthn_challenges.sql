-- WebAuthn sign-in can begin before an account is selected. Keep short-lived
-- challenges separate from invitation and reset tokens so user_id may be null.
CREATE TABLE user_webauthn_challenges (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  purpose TEXT NOT NULL CHECK(purpose IN ('register','login')),
  origin TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX idx_user_webauthn_challenges_expiry ON user_webauthn_challenges(expires_at);
