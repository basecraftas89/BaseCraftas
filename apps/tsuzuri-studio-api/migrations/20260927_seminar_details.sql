ALTER TABLE articles ADD COLUMN seminar_details TEXT NOT NULL DEFAULT '{}';
ALTER TABLE article_versions ADD COLUMN seminar_details TEXT NOT NULL DEFAULT '{}';
