CREATE TABLE IF NOT EXISTS tayori_waitlist_invitations (
  id TEXT PRIMARY KEY,
  waitlist_entry_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  provider_message_id TEXT,
  sent_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (waitlist_entry_id) REFERENCES waitlist_entries(id)
);
