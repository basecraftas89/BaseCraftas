ALTER TABLE articles ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE article_versions ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS article_publish_locks (article_id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);

ALTER TABLE publish_jobs ADD COLUMN article_revision INTEGER;

