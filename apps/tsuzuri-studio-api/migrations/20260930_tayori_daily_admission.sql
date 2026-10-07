-- UTC days match Resend's reset (09:00 Japan time). No customer email is stored here.
CREATE TABLE IF NOT EXISTS tayori_daily_admissions (
  day TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (day, email_hash)
);

CREATE TABLE IF NOT EXISTS customer_email_budget (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('onboarding', 'member', 'other')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS customer_email_budget_day ON customer_email_budget(day, category);
CREATE INDEX IF NOT EXISTS customer_email_budget_recipient ON customer_email_budget(recipient_hash, day, created_at);

-- Preserve today's usage when enabling the limiter. IDs are internal references,
-- not raw email addresses. Re-running the migration does not double count.
INSERT OR IGNORE INTO customer_email_budget (id, day, recipient_hash, category, created_at)
SELECT 'legacy-otp:' || id, substr(created_at, 1, 10), 'legacy', 'onboarding', created_at
FROM customer_auth_challenges
WHERE date(created_at) = date('now') AND COALESCE(resend_message_id, '') != 'local-development';

INSERT OR IGNORE INTO tayori_daily_admissions (day, email_hash)
SELECT date('now'), 'legacy-customer:' || customer_id
FROM stripe_checkout_attempts
WHERE plan_code = 'weekly_monthly' AND livemode = 1 AND date(created_at) = date('now')
GROUP BY customer_id;
