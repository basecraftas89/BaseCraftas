PRAGMA foreign_keys = ON;

ALTER TABLE weekly_priority_questions ADD COLUMN sheet_row INTEGER;
ALTER TABLE weekly_priority_questions ADD COLUMN sheet_synced_at TEXT;
ALTER TABLE weekly_priority_questions ADD COLUMN sheet_last_error TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_weekly_priority_questions_sheet_sync
  ON weekly_priority_questions(sheet_synced_at, updated_at);

CREATE TABLE IF NOT EXISTS weekly_answer_video_events (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'play' CHECK (event_type IN ('play')),
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id),
  FOREIGN KEY (video_id) REFERENCES weekly_answer_videos(id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_answer_video_events_customer_time
  ON weekly_answer_video_events(customer_id, occurred_at DESC);
