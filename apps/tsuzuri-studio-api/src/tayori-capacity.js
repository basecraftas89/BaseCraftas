import { requireWeekendAdmission } from './enrollment-limits.js';
import { createStripeCheckoutSession, retrieveStripeCheckoutSession } from './customer-auth.js';

export const completionLimitEnabled = env => env.TAYORI_COMPLETION_LIMIT_ENABLED === 'true';
const live = env => env.STRIPE_MODE === 'live' ? 1 : 0;
const japanDay = ms => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
export const TAYORI_WEEKEND_LIMIT = 10;
// Keep the existing date ledger intact. Saturday and Sunday share one weekly
// bucket; keep it through Friday so a full weekend remains closed until next Saturday.
export function tayoriCapacityWindow(now = Date.now()) {
  const local = new Date(now + 9 * 3600000);
  const midnight = Date.parse(`${japanDay(now)}T00:00:00+09:00`);
  const start = midnight - ((local.getUTCDay() + 1) % 7) * 86400000;
  const next = start + 7 * 86400000 + 6.5 * 3600000;
  return { start: japanDay(start), end: japanDay(start + 6 * 86400000),
    reset_at: new Date(next).toISOString(), retry_after: Math.max(1, Math.ceil((next - now) / 1000)) };
}
const occupancy = `SELECT COUNT(DISTINCT customer_id) FROM tayori_checkout_capacity
  WHERE livemode=? AND ((status='completed' AND completion_day BETWEEN ? AND ?)
    OR (status='held' AND (reserved_day BETWEEN ? AND ? OR overflow_day BETWEEN ? AND ?)))`;
const occupancyArgs = (env, window) => [live(env), window.start, window.end, window.start, window.end, window.start, window.end];

function capacityError(code, now = Date.now()) {
  const window = tayoriCapacityWindow(now);
  return Object.assign(new Error(code), { status: 429, retryAfter: code === 'tayori_capacity_pending' ? 60 : window.retry_after, resetAt: window.reset_at });
}

export async function tayoriCapacityStatus(env, now = Date.now()) {
  const window = tayoriCapacityWindow(now);
  const completed = await env.DB.prepare(`SELECT COUNT(DISTINCT customer_id) n FROM tayori_checkout_capacity
    WHERE livemode=? AND status='completed' AND completion_day BETWEEN ? AND ?`).bind(live(env), window.start, window.end).first();
  const occupied = await env.DB.prepare(`SELECT (${occupancy}) n`).bind(...occupancyArgs(env, window)).first();
  return { count_basis: 'completed_contracts', count_period: 'weekend', weekend_limit: TAYORI_WEEKEND_LIMIT,
    period_start: window.start, reset_at: window.reset_at, completed_weekend: Number(completed.n),
    remaining: Math.max(0, TAYORI_WEEKEND_LIMIT - Number(occupied.n)),
    capacity_state: Number(completed.n) >= TAYORI_WEEKEND_LIMIT ? 'full'
      : Number(occupied.n) >= TAYORI_WEEKEND_LIMIT ? 'pending' : 'available' };
}

// Email requests only check completed admissions; they never claim a seat.
export async function checkTayoriCompletedCapacity(env, now = Date.now()) {
  requireWeekendAdmission(env, now);
  const state = await tayoriCapacityStatus(env, now);
  if (state.capacity_state === 'full') throw capacityError('tayori_daily_limit_reached', now);
}

export async function claimTayoriCheckout(env, { attemptId, customerId, expiresAt, params }, now = Date.now()) {
  requireWeekendAdmission(env, now);
  const day = japanDay(now);
  const window = tayoriCapacityWindow(now);
  // Preserve real dates for auditing; both dates consume the same weekend quota.
  const overflow = japanDay(expiresAt * 1000 - 1);
  const row = await env.DB.prepare(`INSERT INTO tayori_checkout_capacity
    (attempt_id,customer_id,livemode,reserved_day,overflow_day,expires_at,status,checkout_params,created_at)
    SELECT ?,?,?,?,?,?,'held',?,? WHERE (${occupancy}) < ?
    ON CONFLICT DO NOTHING RETURNING attempt_id`)
    .bind(attemptId, customerId, live(env), day, overflow, expiresAt, params.toString(), Math.floor(now / 1000),
      ...occupancyArgs(env, window), TAYORI_WEEKEND_LIMIT).first();
  if (row) return;
  const existing = await heldTayoriCheckout(env, customerId);
  if (existing) throw capacityError('tayori_checkout_pending', now);
  const state = await tayoriCapacityStatus(env, now);
  throw capacityError(state.capacity_state === 'full' ? 'tayori_daily_limit_reached' : 'tayori_capacity_pending', now);
}

export async function heldTayoriCheckout(env, customerId) {
  return env.DB.prepare(`SELECT c.*,a.idempotency_key,a.stripe_checkout_session_id,a.checkout_url
    FROM tayori_checkout_capacity c JOIN stripe_checkout_attempts a ON a.id=c.attempt_id
    WHERE c.customer_id=? AND c.livemode=? AND c.status='held' LIMIT 1`).bind(customerId, live(env)).first();
}

export async function recordTayoriCapacityEvent(env, event, attempt) {
  if (!completionLimitEnabled(env) || attempt.plan_code !== 'weekly_monthly') return;
  const object = event.data.object;
  if (object.metadata?.attempt_id !== attempt.id || object.metadata?.customer_id !== attempt.customer_id
    || object.metadata?.plan_code !== attempt.plan_code || Number(event.livemode) !== Number(attempt.livemode)
    || !new RegExp(`^cs_${env.STRIPE_MODE}_[A-Za-z0-9_]+$`).test(String(object.id))
    || (attempt.stripe_checkout_session_id && attempt.stripe_checkout_session_id !== object.id)) {
    throw new Error('checkout_capacity_metadata_mismatch');
  }
  if (event.type === 'checkout.session.completed' && object.status === 'complete') {
    if (!Number.isSafeInteger(event.created) || event.created <= 0) throw new Error('checkout_event_time_missing');
    // The event timestamp, not webhook delivery time, determines the JST day.
    await env.DB.prepare(`UPDATE tayori_checkout_capacity SET status='completed',completion_day=?,checkout_params=''
      WHERE attempt_id=? AND status!='completed'`).bind(japanDay(event.created * 1000), attempt.id).run();
  } else if (event.type === 'checkout.session.expired' && object.status === 'expired') {
    await env.DB.prepare(`UPDATE tayori_checkout_capacity SET status='released',checkout_params=''
      WHERE attempt_id=? AND status='held'`).bind(attempt.id).run();
  }
}

export async function recoverTayoriSession(env, hold) {
  // Replay only the exact persisted parameters/key, within Stripe's retention
  // window. A timeout must never create a second session or refund a seat.
  if (hold.stripe_checkout_session_id) return hold;
  if (!hold.checkout_params || Date.now() / 1000 - hold.created_at >= 23 * 3600) return hold;
  let session;
  try {
    session = await createStripeCheckoutSession(env, new URLSearchParams(hold.checkout_params), hold.idempotency_key);
  } catch (error) {
    if (error.checkoutNotCreated) await releaseUncreatedTayoriCheckout(env, hold.attempt_id);
    throw error;
  }
  await env.DB.prepare(`UPDATE stripe_checkout_attempts SET stripe_checkout_session_id=?,checkout_url=?,stripe_customer_id=?,
    status=CASE WHEN status='completed' THEN status ELSE 'pending' END,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(session.id, session.url, session.customerId, hold.attempt_id).run();
  return { ...hold, stripe_checkout_session_id: session.id, checkout_url: session.url };
}

export async function releaseUncreatedTayoriCheckout(env, attemptId) {
  await env.DB.prepare(`UPDATE tayori_checkout_capacity SET status='released',checkout_params=''
    WHERE attempt_id=? AND status='held'`).bind(attemptId).run();
}

export async function reconcileTayoriCapacity(env, limit = 4, now = Date.now()) {
  if (!completionLimitEnabled(env)) return;
  const seconds = Math.floor(now / 1000);
  const rows = await env.DB.prepare(`SELECT c.*,a.idempotency_key,a.stripe_checkout_session_id,a.checkout_url
    FROM tayori_checkout_capacity c JOIN stripe_checkout_attempts a ON a.id=c.attempt_id
    WHERE c.status='held' AND c.livemode=? AND c.expires_at<=? AND c.checked_at<?
    ORDER BY c.checked_at,c.expires_at LIMIT ?`).bind(live(env), seconds, seconds - 60, limit).all();
  for (const original of rows.results || []) {
    // Atomic lease prevents concurrent requests from repeatedly querying Stripe.
    const lease = await env.DB.prepare(`UPDATE tayori_checkout_capacity SET checked_at=?
      WHERE attempt_id=? AND status='held' AND checked_at<? RETURNING attempt_id`)
      .bind(seconds, original.attempt_id, seconds - 60).first();
    if (!lease) continue;
    try {
      const hold = await recoverTayoriSession(env, original);
      if (!hold.stripe_checkout_session_id) continue;
      const session = await retrieveStripeCheckoutSession(env, hold.stripe_checkout_session_id);
      if (session.metadata?.attempt_id !== hold.attempt_id || session.metadata?.customer_id !== hold.customer_id
        || session.metadata?.plan_code !== 'weekly_monthly') throw new Error('checkout_capacity_metadata_mismatch');
      if (session.status === 'expired') {
        await env.DB.prepare(`UPDATE tayori_checkout_capacity SET status='released',checkout_params=''
          WHERE attempt_id=? AND status='held'`).bind(hold.attempt_id).run();
        await env.DB.prepare(`UPDATE stripe_checkout_attempts SET status='expired',updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND status!='completed'`).bind(hold.attempt_id).run();
      }
      // Complete sessions remain held until their signed event supplies the date.
      // Unknown/network failure remains held, never guessed to be abandoned.
    } catch {
      console.warn(JSON.stringify({ event: 'tayori.capacity_reconciliation_pending', attempt_id: original.attempt_id }));
    }
  }
}
