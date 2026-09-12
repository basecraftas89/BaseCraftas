-- Keep empty until each article is safely republished. No draft-asset backfill.
CREATE TABLE IF NOT EXISTS article_public_assets (
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL REFERENCES article_assets(r2_key) ON DELETE CASCADE,
  PRIMARY KEY (article_id, r2_key)
);
CREATE INDEX IF NOT EXISTS idx_public_assets_key ON article_public_assets(r2_key);

CREATE TABLE IF NOT EXISTS api_write_limits (
  actor_email TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (actor_email, bucket)
);
