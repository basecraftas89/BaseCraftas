PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS weekly_materials (
  id TEXT PRIMARY KEY,
  drive_file_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  web_view_link TEXT NOT NULL,
  web_content_link TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  drive_created_time TEXT NOT NULL DEFAULT '',
  drive_modified_time TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'missing', 'archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_weekly_materials_status_published
  ON weekly_materials(status, published_at DESC);

CREATE TABLE IF NOT EXISTS weekly_material_events (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'download')),
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id),
  FOREIGN KEY (material_id) REFERENCES weekly_materials(id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_material_events_customer_time
  ON weekly_material_events(customer_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS weekly_material_sync_state (
  id TEXT PRIMARY KEY,
  last_checked_at TEXT,
  last_success_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  file_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0
);
