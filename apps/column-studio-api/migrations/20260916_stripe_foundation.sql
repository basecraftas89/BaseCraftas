PRAGMA foreign_keys = ON;

-- Store only the minimum event metadata needed for idempotency and operations.
-- Do not retain the full Stripe payload because it can contain customer PII.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  livemode INTEGER NOT NULL CHECK (livemode IN (0, 1)),
  api_version TEXT NOT NULL DEFAULT '',
  object_id TEXT NOT NULL DEFAULT '',
  stripe_created_at INTEGER,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'ignored', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  last_error TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status_time
  ON stripe_webhook_events(status, received_at);

CREATE TABLE IF NOT EXISTS stripe_checkout_attempts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  plan_code TEXT NOT NULL CHECK (plan_code IN ('weekly_monthly', 'curriculum_monthly', 'curriculum_annual')),
  audience_type TEXT NOT NULL CHECK (audience_type IN ('general', 'therapist')),
  fee_type TEXT NOT NULL CHECK (fee_type IN ('first', 'rejoin', 'none')),
  recurring_amount_yen INTEGER NOT NULL CHECK (recurring_amount_yen >= 0),
  entry_fee_yen INTEGER NOT NULL DEFAULT 0 CHECK (entry_fee_yen >= 0),
  livemode INTEGER NOT NULL DEFAULT 0 CHECK (livemode IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pending', 'completed', 'expired', 'failed')),
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_stripe_checkout_attempts_customer_time
  ON stripe_checkout_attempts(customer_id, created_at DESC);
