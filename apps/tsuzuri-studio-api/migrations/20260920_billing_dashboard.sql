PRAGMA foreign_keys = ON;

-- Keep test and live subscriptions separate in operational aggregates.
ALTER TABLE customer_subscriptions ADD COLUMN livemode INTEGER NOT NULL DEFAULT 0 CHECK (livemode IN (0, 1));

-- Minimal payment ledger for aggregate reporting. Never store card details or raw Stripe payloads.
CREATE TABLE IF NOT EXISTS billing_transactions (
  id TEXT PRIMARY KEY,
  provider_transaction_id TEXT NOT NULL UNIQUE,
  stripe_invoice_id TEXT NOT NULL DEFAULT '',
  stripe_event_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  subscription_id TEXT,
  product_code TEXT NOT NULL CHECK (product_code IN ('weekly', 'curriculum')),
  audience_type TEXT NOT NULL CHECK (audience_type IN ('general', 'therapist')),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('recurring', 'entry_fee', 'adjustment', 'refund')),
  amount_yen INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paid', 'failed', 'refunded')),
  occurred_at TEXT NOT NULL,
  livemode INTEGER NOT NULL DEFAULT 0 CHECK (livemode IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id),
  FOREIGN KEY (subscription_id) REFERENCES customer_subscriptions(id)
);

CREATE INDEX IF NOT EXISTS idx_billing_transactions_time_status
  ON billing_transactions(occurred_at, status);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_product_audience
  ON billing_transactions(product_code, audience_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_invoice
  ON billing_transactions(stripe_invoice_id);

-- Event history is needed to reconstruct month-end unique subscriber counts.
CREATE TABLE IF NOT EXISTS subscription_status_events (
  id TEXT PRIMARY KEY,
  stripe_event_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  product_code TEXT NOT NULL CHECK (product_code IN ('weekly', 'curriculum')),
  audience_type TEXT NOT NULL CHECK (audience_type IN ('general', 'therapist')),
  status TEXT NOT NULL CHECK (status IN ('incomplete', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid')),
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  effective_at TEXT NOT NULL,
  livemode INTEGER NOT NULL DEFAULT 0 CHECK (livemode IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (stripe_event_id, subscription_id),
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id),
  FOREIGN KEY (subscription_id) REFERENCES customer_subscriptions(id)
);

CREATE INDEX IF NOT EXISTS idx_subscription_status_events_effective
  ON subscription_status_events(effective_at, subscription_id);
