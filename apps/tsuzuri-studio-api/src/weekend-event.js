const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const EVENT_END_MS = (6 * 60 + 30) * 60 * 1000;

export function latestSaturdayEventEnd(nowMs = Date.now()) {
  const jst = new Date(nowMs + JST_OFFSET_MS);
  const startOfTodayJst = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - JST_OFFSET_MS;
  const daysSinceSaturday = (jst.getUTCDay() + 1) % 7;
  let boundary = startOfTodayJst - daysSinceSaturday * DAY_MS + EVENT_END_MS;
  if (nowMs < boundary) boundary -= 7 * DAY_MS;
  return boundary;
}

export function isCurrentWeekendThumbnail(updatedAt, nowMs = Date.now()) {
  const normalized = String(updatedAt || '').trim().replace(' ', 'T');
  const timestamp = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? normalized : normalized + 'Z');
  return Number.isFinite(timestamp) && timestamp >= latestSaturdayEventEnd(nowMs);
}
