// Limits are durable and claimed atomically in D1, never in isolate memory.
export const TAYORI_DAILY_ADMISSIONS = 30;
export const EMAIL_DAILY_LIMIT = 90;
export const ONBOARDING_EMAIL_LIMIT = 60;

export function admissionWindow(now = Date.now()) {
  const date = new Date(now);
  const day = date.toISOString().slice(0, 10);
  const reset = Date.parse(`${day}T00:00:00Z`) + 86400000;
  return { day, reset_at: new Date(reset).toISOString(), retry_after: Math.max(1, Math.ceil((reset - now) / 1000)) };
}

function limited(code, window) {
  return Object.assign(new Error(code), { status: 429, retryAfter: window.retry_after, resetAt: window.reset_at });
}

export function weekendAdmissionWindow(now = Date.now()) {
  const local = new Date(now + 9 * 3600000);
  const weekday = local.getUTCDay();
  const midnight = Date.parse(`${local.toISOString().slice(0, 10)}T00:00:00+09:00`);
  const saturday = midnight + (weekday === 0 ? -1 : 6 - weekday) * 86400000;
  const start = saturday + 6.5 * 3600000;
  const end = saturday + 2 * 86400000;
  const open = now >= start && now < end - 30 * 60000;
  const next = now < start ? start : start + 7 * 86400000;
  const nextDay = weekday === 6 ? midnight + 86400000 : next;
  return {
    day: local.toISOString().slice(0, 10), open,
    opens_at: new Date(open ? start : next).toISOString(),
    closes_at: new Date(end).toISOString(),
    accepting_closes_at: new Date(end - 30 * 60000).toISOString(),
    reset_at: new Date(open ? nextDay : next).toISOString(),
    retry_after: Math.max(1, Math.ceil(((open ? nextDay : next) - now) / 1000)),
  };
}

export function requireWeekendAdmission(env, now = Date.now()) {
  if (env.TAYORI_WEEKEND_ONLY !== "true") return null;
  const window = weekendAdmissionWindow(now);
  if (!window.open) throw limited("tayori_weekend_closed", window);
  return window;
}

export function tayoriCheckoutExpiry(env, now = Date.now()) {
  const window = requireWeekendAdmission(env, now);
  return window ? Math.floor(Math.min(now + 3600000, Date.parse(window.closes_at)) / 1000) : null;
}

export async function reserveTayoriAdmission(env, emailHash, now = Date.now()) {
  if (env.TAYORI_DAILY_LIMIT_ENABLED !== "true") return;
  const window = requireWeekendAdmission(env, now) || admissionWindow(now);
  // Existing claims remain usable even at capacity. A failed/abandoned signup keeps
  // its slot for the day because its verification email already used the budget.
  const row = await env.DB.prepare(`
    INSERT INTO tayori_daily_admissions (day, email_hash)
    SELECT ?, ? WHERE
      EXISTS (SELECT 1 FROM tayori_daily_admissions WHERE day = ? AND email_hash = ?)
      OR (SELECT COUNT(*) FROM tayori_daily_admissions WHERE day = ?) < ?
    ON CONFLICT(day, email_hash) DO UPDATE SET email_hash = excluded.email_hash
    RETURNING email_hash
  `).bind(window.day, emailHash, window.day, emailHash, window.day, TAYORI_DAILY_ADMISSIONS).first();
  if (!row) throw limited("tayori_daily_limit_reached", window);
}

export async function reserveEmailBudget(env, { id, recipientHash, category }, now = Date.now()) {
  if (env.CUSTOMER_EMAIL_BUDGET_ENABLED !== "true") return;
  const window = admissionWindow(now);
  // No refund on provider failure/timeout: delivery might have succeeded upstream.
  // All app senders share this budget; external senders/inbound email are not counted.
  const row = await env.DB.prepare(`
    INSERT INTO customer_email_budget (id, day, recipient_hash, category, created_at)
    SELECT ?, ?, ?, ?, ? WHERE
      (SELECT COUNT(*) FROM customer_email_budget WHERE day = ?) < ?
      AND (? != 'onboarding' OR
        (SELECT COUNT(*) FROM customer_email_budget WHERE day = ? AND category = 'onboarding') < ?)
      AND (SELECT COUNT(*) FROM customer_email_budget WHERE day = ? AND recipient_hash = ?) < 5
      AND NOT EXISTS (SELECT 1 FROM customer_email_budget
        WHERE recipient_hash = ? AND datetime(created_at) > datetime(?, '-60 seconds'))
    ON CONFLICT(id) DO NOTHING RETURNING id
  `).bind(id, window.day, recipientHash, category, new Date(now).toISOString(),
    window.day, EMAIL_DAILY_LIMIT, category, window.day, ONBOARDING_EMAIL_LIMIT,
    window.day, recipientHash, recipientHash, new Date(now).toISOString()).first();
  if (!row) {
    const recent = await env.DB.prepare(`SELECT 1 FROM customer_email_budget
      WHERE recipient_hash = ? AND datetime(created_at) > datetime(?, '-60 seconds') LIMIT 1`)
      .bind(recipientHash, new Date(now).toISOString()).first();
    if (recent) throw Object.assign(new Error("auth_email_cooldown"), { status: 429, retryAfter: 60 });
    throw limited("auth_email_daily_limit_reached", window);
  }
}
