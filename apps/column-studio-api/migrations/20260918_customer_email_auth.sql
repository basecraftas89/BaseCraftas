PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customer_auth_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  request_key TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'login' CHECK (purpose IN ('login')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'consumed', 'failed', 'expired')),
  attempts_remaining INTEGER NOT NULL DEFAULT 5 CHECK (attempts_remaining BETWEEN 0 AND 5),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  resend_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_auth_challenges_email_time
  ON customer_auth_challenges(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_auth_challenges_request_time
  ON customer_auth_challenges(request_key, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_auth_rate_limits (
  scope_key TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1 CHECK (count > 0),
  PRIMARY KEY (scope_key, bucket)
);

CREATE TABLE IF NOT EXISTS customer_sessions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer_expiry
  ON customer_sessions(customer_id, expires_at DESC);

ALTER TABLE stripe_checkout_attempts ADD COLUMN checkout_url TEXT NOT NULL DEFAULT '';
