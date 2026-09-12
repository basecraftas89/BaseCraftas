PRAGMA foreign_keys = ON;

ALTER TABLE stripe_checkout_attempts ADD COLUMN campaign_code TEXT NOT NULL DEFAULT 'none';
ALTER TABLE stripe_checkout_attempts ADD COLUMN trial_days INTEGER NOT NULL DEFAULT 0 CHECK (trial_days >= 0 AND trial_days <= 730);
