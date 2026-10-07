PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customer_password_credentials (
  customer_id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 100000,
  password_algorithm TEXT NOT NULL DEFAULT 'PBKDF2-SHA-256',
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_password_locked_until
  ON customer_password_credentials(locked_until);
