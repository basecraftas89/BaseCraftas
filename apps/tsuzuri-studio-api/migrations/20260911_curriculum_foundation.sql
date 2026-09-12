PRAGMA foreign_keys = ON;

-- Paid customers are intentionally separate from the existing staff/editor members table.
CREATE TABLE IF NOT EXISTS customer_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleted')),
  email_verified_at TEXT,
  therapist_status TEXT NOT NULL DEFAULT 'none' CHECK (therapist_status IN ('none', 'pending', 'verified', 'rejected')),
  therapist_verified_at TEXT,
  stripe_customer_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  product_code TEXT NOT NULL CHECK (product_code IN ('weekly', 'curriculum')),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
  audience_type TEXT NOT NULL DEFAULT 'general' CHECK (audience_type IN ('general', 'therapist')),
  status TEXT NOT NULL CHECK (status IN ('incomplete', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid')),
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_subscription_id TEXT UNIQUE,
  provider_price_id TEXT,
  recurring_amount_yen INTEGER NOT NULL CHECK (recurring_amount_yen >= 0),
  entry_fee_yen INTEGER NOT NULL DEFAULT 0 CHECK (entry_fee_yen >= 0),
  fee_type TEXT NOT NULL DEFAULT 'first' CHECK (fee_type IN ('first', 'rejoin', 'none')),
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  canceled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_customer_status
  ON customer_subscriptions(customer_id, status);

CREATE TABLE IF NOT EXISTS customer_entitlements (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  entitlement_code TEXT NOT NULL CHECK (entitlement_code IN ('weekly_access', 'curriculum_all_access')),
  source_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (customer_id, entitlement_code, source_subscription_id),
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id),
  FOREIGN KEY (source_subscription_id) REFERENCES customer_subscriptions(id)
);

CREATE INDEX IF NOT EXISTS idx_customer_entitlements_lookup
  ON customer_entitlements(customer_id, entitlement_code, status);

-- private_r2_object_key must never be returned by a public API.
CREATE TABLE IF NOT EXISTS qualification_submissions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  profession TEXT,
  private_r2_object_key TEXT NOT NULL,
  original_file_name TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'deleted')),
  reviewer_member_id TEXT,
  review_note TEXT,
  reviewed_at TEXT,
  purge_after TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_qualification_submissions_review
  ON qualification_submissions(status, created_at);

CREATE TABLE IF NOT EXISTS curriculum_tools (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  summary TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'updating', 'retired')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS curricula (
  id TEXT PRIMARY KEY,
  tool_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT,
  level TEXT NOT NULL DEFAULT 'beginner' CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tool_id) REFERENCES curriculum_tools(id)
);

CREATE TABLE IF NOT EXISTS curriculum_modules (
  id TEXT PRIMARY KEY,
  curriculum_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (curriculum_id) REFERENCES curricula(id)
);

CREATE TABLE IF NOT EXISTS curriculum_lessons (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  lesson_type TEXT NOT NULL DEFAULT 'video' CHECK (lesson_type IN ('video', 'article', 'exercise', 'quiz')),
  content_url TEXT,
  body_json TEXT,
  estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (module_id) REFERENCES curriculum_modules(id)
);

CREATE TABLE IF NOT EXISTS customer_enrollments (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  curriculum_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (customer_id, curriculum_id),
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id),
  FOREIGN KEY (curriculum_id) REFERENCES curricula(id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  started_at TEXT,
  completed_at TEXT,
  last_viewed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (enrollment_id, lesson_id),
  FOREIGN KEY (enrollment_id) REFERENCES customer_enrollments(id),
  FOREIGN KEY (lesson_id) REFERENCES curriculum_lessons(id)
);

CREATE TABLE IF NOT EXISTS weekly_learning_plans (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  week_start_date TEXT NOT NULL,
  weekly_target_minutes INTEGER NOT NULL DEFAULT 60 CHECK (weekly_target_minutes > 0),
  daily_target_minutes INTEGER NOT NULL DEFAULT 20 CHECK (daily_target_minutes > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (customer_id, week_start_date),
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id)
);

CREATE TABLE IF NOT EXISTS weekly_learning_sessions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  lesson_id TEXT,
  occurred_on TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id),
  FOREIGN KEY (lesson_id) REFERENCES curriculum_lessons(id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_learning_sessions_customer_date
  ON weekly_learning_sessions(customer_id, occurred_on);

CREATE TABLE IF NOT EXISTS weekly_reviews (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  week_start_date TEXT NOT NULL,
  achievement_text TEXT NOT NULL,
  learning_text TEXT NOT NULL,
  obstacle_text TEXT NOT NULL,
  next_goal_text TEXT NOT NULL,
  desired_outcome_text TEXT NOT NULL,
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 1 AND 5),
  if_cue_text TEXT NOT NULL,
  then_action_text TEXT NOT NULL,
  completed_minutes_snapshot INTEGER NOT NULL DEFAULT 0 CHECK (completed_minutes_snapshot >= 0),
  target_minutes_snapshot INTEGER NOT NULL DEFAULT 0 CHECK (target_minutes_snapshot >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (customer_id, week_start_date),
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id)
);

CREATE TABLE IF NOT EXISTS weekly_learning_plan_items (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  lesson_id TEXT,
  day_index INTEGER NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  planned_minutes INTEGER NOT NULL DEFAULT 1 CHECK (planned_minutes > 0),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'moved', 'skipped')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (plan_id, day_index, lesson_id),
  FOREIGN KEY (plan_id) REFERENCES weekly_learning_plans(id),
  FOREIGN KEY (lesson_id) REFERENCES curriculum_lessons(id)
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  score_percent INTEGER CHECK (score_percent IS NULL OR score_percent BETWEEN 0 AND 100),
  answers_json TEXT,
  passed INTEGER NOT NULL DEFAULT 0 CHECK (passed IN (0, 1)),
  attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id),
  FOREIGN KEY (lesson_id) REFERENCES curriculum_lessons(id)
);

CREATE TABLE IF NOT EXISTS consultation_credits (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  source_code TEXT NOT NULL DEFAULT 'curriculum_completion',
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'available', 'reserved', 'used', 'expired', 'revoked')),
  availability_gate TEXT NOT NULL DEFAULT 'corporate_training_launch',
  assigned_member_id TEXT,
  earned_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  reservation_url TEXT,
  appointment_start_at TEXT,
  appointment_end_at TEXT,
  used_at TEXT,
  FOREIGN KEY (customer_id) REFERENCES customer_accounts(id),
  FOREIGN KEY (assigned_member_id) REFERENCES members(id)
);

CREATE INDEX IF NOT EXISTS idx_consultation_credits_customer_status
  ON consultation_credits(customer_id, status);
