CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS articles (
  revision INTEGER NOT NULL DEFAULT 1,
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'brand',
  destination TEXT NOT NULL DEFAULT 'totonoe',
  content_type TEXT NOT NULL DEFAULT 'column',
  tags TEXT NOT NULL DEFAULT '[]',
  main_actor_id TEXT NOT NULL DEFAULT 'shindo-toshiki',
  speaker_ids TEXT NOT NULL DEFAULT '[]',
  media_url TEXT NOT NULL DEFAULT '',
  episode_no INTEGER,
  source_published_at TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT '',
  source_id TEXT NOT NULL DEFAULT '',
  hero_url TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  author_email TEXT NOT NULL DEFAULT '',
  editor_email TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS article_versions (
  revision INTEGER NOT NULL DEFAULT 1,
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'brand',
  destination TEXT NOT NULL DEFAULT 'totonoe',
  content_type TEXT NOT NULL DEFAULT 'column',
  tags TEXT NOT NULL DEFAULT '[]',
  main_actor_id TEXT NOT NULL DEFAULT 'shindo-toshiki',
  speaker_ids TEXT NOT NULL DEFAULT '[]',
  media_url TEXT NOT NULL DEFAULT '',
  episode_no INTEGER,
  source_published_at TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT '',
  source_id TEXT NOT NULL DEFAULT '',
  hero_url TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (article_id) REFERENCES articles(id)
);

CREATE TABLE IF NOT EXISTS article_assets (
  id TEXT PRIMARY KEY,
  article_id TEXT,
  r2_key TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  filename TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  actor_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (article_id) REFERENCES articles(id)
);

CREATE TABLE IF NOT EXISTS publish_jobs (
  article_revision INTEGER,
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'published', 'failed')),
  commit_sha TEXT NOT NULL DEFAULT '',
  live_url TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (article_id) REFERENCES articles(id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_updated_at ON articles(updated_at);
CREATE INDEX IF NOT EXISTS idx_articles_deleted_at ON articles(deleted_at);
CREATE INDEX IF NOT EXISTS idx_article_versions_article ON article_versions(article_id, created_at);
CREATE INDEX IF NOT EXISTS idx_article_assets_article ON article_assets(article_id, created_at);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_article ON publish_jobs(article_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_archive_candidates_status ON archive_candidates(status, detected_at);

CREATE TABLE IF NOT EXISTS article_publish_locks (article_id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
-- Keep empty until each article is safely republished. No draft-asset backfill.
CREATE TABLE IF NOT EXISTS article_public_assets (
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL REFERENCES article_assets(r2_key) ON DELETE CASCADE,
  PRIMARY KEY (article_id, r2_key)
);
CREATE INDEX IF NOT EXISTS idx_public_assets_key ON article_public_assets(r2_key);

CREATE TABLE IF NOT EXISTS weekly_materials (
  id TEXT PRIMARY KEY,
  drive_file_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  web_view_link TEXT NOT NULL,
  web_content_link TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  drive_created_time TEXT NOT NULL DEFAULT '',
  drive_modified_time TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'missing', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_weekly_materials_status_published
  ON weekly_materials(status, published_at DESC);

CREATE TABLE IF NOT EXISTS weekly_material_events (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'download')),
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id),
  FOREIGN KEY (material_id) REFERENCES weekly_materials(id)
);
CREATE INDEX IF NOT EXISTS idx_weekly_material_events_customer_time
  ON weekly_material_events(customer_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS weekly_material_sync_state (
  id TEXT PRIMARY KEY,
  last_checked_at TEXT,
  last_success_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  file_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customer_profiles (
  customer_id TEXT PRIMARY KEY,
  profession TEXT NOT NULL DEFAULT '',
  workplace_type TEXT NOT NULL DEFAULT '',
  role_title TEXT NOT NULL DEFAULT '',
  organization_size TEXT NOT NULL DEFAULT '',
  ai_usage_level TEXT NOT NULL DEFAULT '',
  interest_topics TEXT NOT NULL DEFAULT '[]',
  current_challenges TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id)
);

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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  answered_at TEXT,
  sheet_row INTEGER,
  sheet_synced_at TEXT,
  sheet_last_error TEXT NOT NULL DEFAULT '',
  UNIQUE (customer_id, week_start),
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_weekly_priority_questions_week_status ON weekly_priority_questions(week_start, status, created_at);
CREATE INDEX IF NOT EXISTS idx_weekly_priority_questions_sheet_sync ON weekly_priority_questions(sheet_synced_at, updated_at);

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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_weekly_answer_videos_status_published ON weekly_answer_videos(status, published_at DESC);

CREATE TABLE IF NOT EXISTS weekly_answer_video_events (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'play' CHECK (event_type IN ('play')),
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id),
  FOREIGN KEY (video_id) REFERENCES weekly_answer_videos(id)
);
CREATE INDEX IF NOT EXISTS idx_weekly_answer_video_events_customer_time
  ON weekly_answer_video_events(customer_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS weekly_answer_video_sync_state (
  id TEXT PRIMARY KEY,
  last_checked_at TEXT,
  last_success_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  file_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS api_write_limits (
  actor_email TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (actor_email, bucket)
);

-- Unauthenticated email requests use a separate, privacy-preserving rate-limit key.
CREATE TABLE IF NOT EXISTS customer_auth_rate_limits (
  scope_key TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1 CHECK (count > 0),
  PRIMARY KEY (scope_key, bucket)
);

-- Stripe foundation: idempotent event receipt and checkout attempt audit.
-- Full Stripe event payloads are intentionally not retained to minimize PII.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  livemode INTEGER NOT NULL CHECK (livemode IN (0, 1)),
  api_version TEXT NOT NULL DEFAULT '',
  object_id TEXT NOT NULL DEFAULT '',
  stripe_created_at INTEGER,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'ignored', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  last_error TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status_time ON stripe_webhook_events(status, received_at);

CREATE TABLE IF NOT EXISTS stripe_checkout_attempts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  plan_code TEXT NOT NULL CHECK (plan_code IN ('weekly_monthly', 'curriculum_monthly', 'curriculum_annual')),
  audience_type TEXT NOT NULL CHECK (audience_type IN ('general', 'therapist')),
  fee_type TEXT NOT NULL CHECK (fee_type IN ('first', 'rejoin', 'none')),
  campaign_code TEXT NOT NULL DEFAULT 'none',
  trial_days INTEGER NOT NULL DEFAULT 0 CHECK (trial_days >= 0 AND trial_days <= 730),
  recurring_amount_yen INTEGER NOT NULL CHECK (recurring_amount_yen >= 0),
  entry_fee_yen INTEGER NOT NULL DEFAULT 0 CHECK (entry_fee_yen >= 0),
  livemode INTEGER NOT NULL DEFAULT 0 CHECK (livemode IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pending', 'completed', 'expired', 'failed')),
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_stripe_checkout_attempts_customer_time ON stripe_checkout_attempts(customer_id, created_at DESC);
