ALTER TABLE articles ADD COLUMN content_type TEXT NOT NULL DEFAULT 'column';
ALTER TABLE articles ADD COLUMN speaker_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE articles ADD COLUMN media_url TEXT NOT NULL DEFAULT '';
ALTER TABLE article_versions ADD COLUMN content_type TEXT NOT NULL DEFAULT 'column';
ALTER TABLE article_versions ADD COLUMN speaker_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE article_versions ADD COLUMN media_url TEXT NOT NULL DEFAULT '';
