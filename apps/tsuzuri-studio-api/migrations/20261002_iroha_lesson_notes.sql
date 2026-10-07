CREATE TABLE IF NOT EXISTS iroha_lesson_notes (
  customer_id TEXT NOT NULL REFERENCES customer_accounts(id),
  lesson_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  takeaway TEXT NOT NULL DEFAULT '',
  doubts TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  last_mutation_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (customer_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS iroha_notes_owner_date ON iroha_lesson_notes(customer_id, updated_at DESC, lesson_id);
CREATE TABLE IF NOT EXISTS iroha_lesson_note_revisions (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customer_accounts(id),
  lesson_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  takeaway TEXT NOT NULL DEFAULT '',
  doubts TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  save_kind TEXT NOT NULL CHECK(save_kind IN ('manual','autosave')),
  revision INTEGER NOT NULL,
  mutation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sheet_synced_at TEXT,
  UNIQUE(customer_id, mutation_id),
  UNIQUE(customer_id, lesson_id, revision)
);
CREATE INDEX IF NOT EXISTS iroha_notes_pending_sheet ON iroha_lesson_note_revisions(sheet_synced_at, sequence);
