PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS plan_capacity (
  plan_code TEXT PRIMARY KEY CHECK (plan_code IN ('weekly_monthly')),
  capacity INTEGER NOT NULL DEFAULT 10 CHECK (capacity > 0 AND capacity % 10 = 0),
  increment_size INTEGER NOT NULL DEFAULT 10 CHECK (increment_size = 10),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO plan_capacity(plan_code, capacity, increment_size)
VALUES ('weekly_monthly', 10, 10);

CREATE TABLE IF NOT EXISTS plan_capacity_reservations (
  id TEXT PRIMARY KEY,
  plan_code TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  checkout_attempt_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'converted', 'released')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_code) REFERENCES plan_capacity(plan_code),
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id),
  FOREIGN KEY (checkout_attempt_id) REFERENCES stripe_checkout_attempts(id)
);

CREATE INDEX IF NOT EXISTS idx_plan_capacity_reservations_active
  ON plan_capacity_reservations(plan_code, status, expires_at);

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  interest TEXT NOT NULL CHECK (interest IN ('tayori_personal', 'iroha_personal', 'iroha_corporate')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'invited', 'joined', 'declined')),
  source TEXT NOT NULL DEFAULT 'website',
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(email, interest)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_entries_interest_status
  ON waitlist_entries(interest, status, created_at);
