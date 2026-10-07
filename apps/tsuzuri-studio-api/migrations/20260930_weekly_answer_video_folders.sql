-- Keep one primary Drive folder category per TAYORI answer video.
ALTER TABLE weekly_answer_videos ADD COLUMN category TEXT NOT NULL DEFAULT 'その他';
ALTER TABLE weekly_answer_videos ADD COLUMN parent_folder_id TEXT NOT NULL DEFAULT '';
ALTER TABLE weekly_answer_videos ADD COLUMN last_seen_scan_id TEXT NOT NULL DEFAULT '';
