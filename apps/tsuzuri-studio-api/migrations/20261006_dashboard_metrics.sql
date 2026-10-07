-- Minimal, private measurement history; no profile text or Stripe payloads.
CREATE TABLE IF NOT EXISTS dashboard_discount_observations (
 subscription_id TEXT NOT NULL, category TEXT NOT NULL,
 free_until TEXT NOT NULL DEFAULT '', observed_at TEXT NOT NULL,
 livemode INTEGER NOT NULL CHECK(livemode IN (0,1)),
 PRIMARY KEY(subscription_id, category, free_until, livemode)
);
CREATE TABLE IF NOT EXISTS service_usage_events (
 customer_id TEXT NOT NULL, product_code TEXT NOT NULL,
 kind TEXT NOT NULL, resource_id TEXT NOT NULL DEFAULT '', occurred_at TEXT NOT NULL,
 PRIMARY KEY(customer_id,product_code,kind,resource_id,occurred_at)
);
CREATE INDEX IF NOT EXISTS service_usage_time ON service_usage_events(occurred_at,product_code);

CREATE TABLE IF NOT EXISTS service_measurement_config (id INTEGER PRIMARY KEY CHECK(id=1),started_at TEXT NOT NULL);
INSERT OR IGNORE INTO service_measurement_config VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
