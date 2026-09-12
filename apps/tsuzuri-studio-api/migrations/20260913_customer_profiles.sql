PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customer_profiles (
  customer_id TEXT PRIMARY KEY,
  profession TEXT NOT NULL DEFAULT '',
  workplace_type TEXT NOT NULL DEFAULT '',
  role_title TEXT NOT NULL DEFAULT '',
  organization_size TEXT NOT NULL DEFAULT '',
  ai_usage_level TEXT NOT NULL DEFAULT '',
  interest_topics TEXT NOT NULL DEFAULT '[]',
  current_challenges TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id)
);
