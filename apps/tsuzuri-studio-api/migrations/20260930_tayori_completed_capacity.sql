-- New ledger: email verification does not consume admission capacity.
-- Never release a hold just because local time passed: Stripe must confirm expiry.
CREATE TABLE IF NOT EXISTS tayori_checkout_capacity (
  attempt_id TEXT PRIMARY KEY REFERENCES stripe_checkout_attempts(id),
  customer_id TEXT NOT NULL,
  livemode INTEGER NOT NULL,
  reserved_day TEXT NOT NULL,
  overflow_day TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('held','completed','released')),
  completion_day TEXT,
  checkout_params TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  checked_at INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS tayori_one_customer_hold
  ON tayori_checkout_capacity(customer_id,livemode) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS tayori_capacity_days
  ON tayori_checkout_capacity(livemode,status,reserved_day,overflow_day,completion_day);
CREATE INDEX IF NOT EXISTS tayori_capacity_expiry
  ON tayori_checkout_capacity(status,expires_at,checked_at);

-- Preserve completed admissions when deploying; old verification-only claims are
-- intentionally retained in their original ledger but are no longer counted.
INSERT OR IGNORE INTO tayori_checkout_capacity
  (attempt_id,customer_id,livemode,reserved_day,overflow_day,expires_at,status,completion_day,created_at)
SELECT id,customer_id,livemode,date(completed_at,'+9 hours'),date(completed_at,'+9 hours'),
  unixepoch(completed_at),'completed',date(completed_at,'+9 hours'),unixepoch(created_at)
FROM stripe_checkout_attempts WHERE plan_code='weekly_monthly' AND status='completed' AND completed_at IS NOT NULL;
