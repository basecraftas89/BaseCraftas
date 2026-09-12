PRAGMA foreign_keys = ON;

-- Google Drive is the initial delivery provider. Only provider asset IDs are stored;
-- service-account credentials belong in Worker secrets, never in D1 or browser code.
ALTER TABLE curriculum_lessons ADD COLUMN video_provider TEXT NOT NULL DEFAULT 'google_drive'
  CHECK (video_provider IN ('google_drive', 'cloudflare_stream', 'youtube', 'none'));
ALTER TABLE curriculum_lessons ADD COLUMN provider_asset_id TEXT;
ALTER TABLE curriculum_lessons ADD COLUMN transcript_provider_asset_id TEXT;
ALTER TABLE curriculum_lessons ADD COLUMN worksheet_provider_asset_id TEXT;
ALTER TABLE curriculum_lessons ADD COLUMN access_tier TEXT NOT NULL DEFAULT 'curriculum_all_access'
  CHECK (access_tier IN ('curriculum_all_access', 'free_preview'));
ALTER TABLE curriculum_lessons ADD COLUMN folder_stage TEXT NOT NULL DEFAULT 'working'
  CHECK (folder_stage IN ('working', 'delivery', 'free_preview', 'previous', 'trash'));
ALTER TABLE curriculum_lessons ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'draft'
  CHECK (workflow_status IN ('draft', 'review', 'published', 'archived'));
ALTER TABLE curriculum_lessons ADD COLUMN version_number INTEGER NOT NULL DEFAULT 1 CHECK (version_number > 0);
ALTER TABLE curriculum_lessons ADD COLUMN drive_modified_time TEXT;

CREATE INDEX IF NOT EXISTS idx_curriculum_lessons_delivery
  ON curriculum_lessons(workflow_status, access_tier, folder_stage, sort_order);

CREATE TABLE IF NOT EXISTS curriculum_drive_settings (
  id TEXT PRIMARY KEY,
  root_folder_id TEXT NOT NULL,
  management_folder_id TEXT,
  delivery_folder_id TEXT,
  free_preview_folder_id TEXT,
  working_folder_id TEXT,
  previous_folder_id TEXT,
  trash_folder_id TEXT,
  member_group_email TEXT,
  access_mode TEXT NOT NULL DEFAULT 'restricted' CHECK (access_mode = 'restricted'),
  sync_enabled INTEGER NOT NULL DEFAULT 0 CHECK (sync_enabled IN (0, 1)),
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS curriculum_folder_mappings (
  id TEXT PRIMARY KEY,
  tool_id TEXT,
  stage TEXT NOT NULL CHECK (stage IN ('management', 'delivery', 'free_preview', 'working', 'previous', 'trash')),
  drive_folder_id TEXT NOT NULL,
  folder_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tool_id, stage),
  FOREIGN KEY (tool_id) REFERENCES curriculum_tools(id)
);

-- Future Drive API scans write candidates here first. Publication remains an explicit review action.
CREATE TABLE IF NOT EXISTS curriculum_drive_candidates (
  id TEXT PRIMARY KEY,
  drive_file_id TEXT NOT NULL UNIQUE,
  parent_folder_id TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  modified_time TEXT,
  detected_tool_slug TEXT,
  detected_lesson_code TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'ignored', 'error')),
  error_message TEXT,
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewed_by_member_id TEXT,
  FOREIGN KEY (reviewed_by_member_id) REFERENCES members(id)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_drive_candidates_review
  ON curriculum_drive_candidates(review_status, detected_at);

-- Tracks the Google identity to which a Restricted Drive permission was granted.
-- google_permission_id is returned by Drive API and is required for clean revocation.
CREATE TABLE IF NOT EXISTS curriculum_drive_access_members (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE,
  google_account_email TEXT NOT NULL COLLATE NOCASE,
  google_permission_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revoked', 'error')),
  granted_at TEXT,
  revoked_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_drive_access_status
  ON curriculum_drive_access_members(status, google_account_email);
