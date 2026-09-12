PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS weekly_priority_questions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  situation TEXT NOT NULL,
  goal TEXT NOT NULL,
  attempts TEXT NOT NULL,
  blocker TEXT NOT NULL,
  question TEXT NOT NULL,
  use_by TEXT NOT NULL DEFAULT '',
  answer_format TEXT NOT NULL DEFAULT 'demonstration',
  profile_snapshot TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'answered', 'closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  answered_at TEXT,
  UNIQUE (customer_id, week_start),
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_priority_questions_week_status
  ON weekly_priority_questions(week_start, status, created_at);

CREATE TABLE IF NOT EXISTS weekly_answer_videos (
  id TEXT PRIMARY KEY,
  drive_file_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  published_at TEXT NOT NULL,
  drive_created_time TEXT NOT NULL DEFAULT '',
  drive_modified_time TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'missing', 'archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_weekly_answer_videos_status_published
  ON weekly_answer_videos(status, published_at DESC);

CREATE TABLE IF NOT EXISTS weekly_answer_video_sync_state (
  id TEXT PRIMARY KEY,
  last_checked_at TEXT,
  last_success_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  file_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0
);
