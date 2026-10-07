PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS analytics_initiatives (
  id TEXT PRIMARY KEY,
  occurred_on TEXT NOT NULL,
  title TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('x', 'instagram', 'youtube', 'email', 'event', 'website', 'ai', 'other')),
  initiative_type TEXT NOT NULL CHECK (initiative_type IN ('social_post', 'article', 'video', 'email', 'event', 'site_update', 'advertising', 'other')),
  destination_path TEXT NOT NULL DEFAULT '',
  objective TEXT NOT NULL DEFAULT '',
  hypothesis TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  primary_owner_id TEXT NOT NULL DEFAULT '',
  collaborator_ids TEXT NOT NULL DEFAULT '[]',
  reference_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  result_status TEXT NOT NULL DEFAULT 'pending' CHECK (result_status IN ('pending', 'success', 'partial', 'hold', 'improve')),
  learning TEXT NOT NULL DEFAULT '',
  next_action TEXT NOT NULL DEFAULT '',
  review_on TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_initiatives_occurred_on
  ON analytics_initiatives(occurred_on DESC, updated_at DESC);
