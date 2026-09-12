CREATE TABLE IF NOT EXISTS archive_candidates (
  id TEXT PRIMARY KEY,
  drive_file_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT '',
  web_view_link TEXT NOT NULL DEFAULT '',
  thumbnail_link TEXT NOT NULL DEFAULT '',
  created_time TEXT NOT NULL DEFAULT '',
  modified_time TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'imported', 'ignored')),
  article_id TEXT,
  detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  imported_at TEXT,
  FOREIGN KEY (article_id) REFERENCES articles(id)
);

CREATE TABLE IF NOT EXISTS archive_sync_state (
  id TEXT PRIMARY KEY,
  last_checked_at TEXT,
  last_success_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  file_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_archive_candidates_status ON archive_candidates(status, detected_at);
