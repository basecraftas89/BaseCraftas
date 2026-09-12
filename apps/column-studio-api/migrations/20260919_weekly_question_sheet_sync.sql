PRAGMA foreign_keys = ON;

ALTER TABLE weekly_priority_questions ADD COLUMN sheet_syncing_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE weekly_priority_questions ADD COLUMN sheet_operations_synced_at TEXT;
ALTER TABLE weekly_priority_questions ADD COLUMN privacy_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (privacy_confirmed IN (0, 1));
ALTER TABLE weekly_priority_questions ADD COLUMN video_consent INTEGER NOT NULL DEFAULT 0 CHECK (video_consent IN (0, 1));
ALTER TABLE weekly_priority_questions ADD COLUMN question_group TEXT NOT NULL DEFAULT '';
ALTER TABLE weekly_priority_questions ADD COLUMN operations_status TEXT NOT NULL DEFAULT '';
ALTER TABLE weekly_priority_questions ADD COLUMN answer_video_title TEXT NOT NULL DEFAULT '';
ALTER TABLE weekly_priority_questions ADD COLUMN answer_video_url TEXT NOT NULL DEFAULT '';
ALTER TABLE weekly_priority_questions ADD COLUMN operations_notes TEXT NOT NULL DEFAULT '';

-- 既存行は、APIが両方の同意を必須にしていた期間に受け付けたものだけを保存している。
UPDATE weekly_priority_questions
   SET privacy_confirmed = 1,
       video_consent = 1;

CREATE INDEX IF NOT EXISTS idx_weekly_priority_questions_sheet_lock
  ON weekly_priority_questions(sheet_syncing_until);
