ALTER TABLE articles ADD COLUMN episode_no INTEGER;
ALTER TABLE articles ADD COLUMN source_published_at TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN source_type TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN source_id TEXT NOT NULL DEFAULT '';
ALTER TABLE article_versions ADD COLUMN episode_no INTEGER;
ALTER TABLE article_versions ADD COLUMN source_published_at TEXT NOT NULL DEFAULT '';
ALTER TABLE article_versions ADD COLUMN source_type TEXT NOT NULL DEFAULT '';
ALTER TABLE article_versions ADD COLUMN source_id TEXT NOT NULL DEFAULT '';
