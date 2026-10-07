-- Approved delivery registry. Folder creation alone never publishes a lesson.
CREATE TABLE IF NOT EXISTS iroha_delivery_lessons (
  id TEXT PRIMARY KEY,
  curriculum_key TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  parent_folder_id TEXT NOT NULL,
  duration_seconds REAL NOT NULL CHECK(duration_seconds > 0),
  sort_order INTEGER NOT NULL,
  published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
  staff_preview INTEGER NOT NULL DEFAULT 0 CHECK(staff_preview IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS iroha_delivery_order ON iroha_delivery_lessons(curriculum_key,published,sort_order,id);
CREATE TABLE IF NOT EXISTS iroha_lesson_progress (
  customer_id TEXT NOT NULL REFERENCES customer_accounts(id),
  lesson_id TEXT NOT NULL REFERENCES iroha_delivery_lessons(id),
  watched_until_seconds REAL NOT NULL DEFAULT 0,
  video_completed_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(customer_id,lesson_id)
);
CREATE TABLE IF NOT EXISTS iroha_playback_sessions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer_accounts(id),
  lesson_id TEXT NOT NULL REFERENCES iroha_delivery_lessons(id),
  position_seconds REAL NOT NULL DEFAULT 0,
  watched_until_seconds REAL NOT NULL DEFAULT 0,
  sequence INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS iroha_playback_expiry ON iroha_playback_sessions(expires_at);
