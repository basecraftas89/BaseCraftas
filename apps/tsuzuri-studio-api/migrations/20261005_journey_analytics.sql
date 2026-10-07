-- New measurement period; no existing analytics, initiatives or billing rows are deleted.
CREATE TABLE IF NOT EXISTS journey_config (id INTEGER PRIMARY KEY CHECK(id=1), started_at TEXT NOT NULL);
INSERT OR IGNORE INTO journey_config VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE IF NOT EXISTS journey_sessions (
 id TEXT PRIMARY KEY, source TEXT NOT NULL, owner TEXT NOT NULL DEFAULT '', link_key TEXT NOT NULL DEFAULT '',
 landing_path TEXT NOT NULL, started_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS journey_events (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES journey_sessions(id), kind TEXT NOT NULL,
 path TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS journey_events_time ON journey_events(occurred_at, session_id);
CREATE TABLE IF NOT EXISTS journey_checkouts (
 attempt_id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES journey_sessions(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS journey_rate (key TEXT NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(key,bucket));
