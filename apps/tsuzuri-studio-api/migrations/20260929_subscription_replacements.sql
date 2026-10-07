-- Durable cancellation intent: IROHA includes TAYORI; never restart the old contract.
CREATE TABLE IF NOT EXISTS subscription_replacements (
  source_subscription_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  replacement_subscription_id TEXT NOT NULL,
  livemode INTEGER NOT NULL CHECK (livemode IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_subscription_replacements_pending
  ON subscription_replacements(status, livemode, updated_at);
