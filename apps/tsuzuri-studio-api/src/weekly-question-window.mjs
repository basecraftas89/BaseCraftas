export function weeklyQuestionWindow(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 3600000);
  const sunday = new Date(jst); sunday.setUTCDate(jst.getUTCDate() - jst.getUTCDay()); sunday.setUTCHours(0,0,0,0);
  const opens = new Date(sunday.getTime() - 9 * 3600000);
  const closes = new Date(opens.getTime() + 7 * 86400000);
  return { submission_open: true, opens_at: opens.toISOString(), closes_at: closes.toISOString(), next_opens_at: closes.toISOString(), timezone: 'Asia/Tokyo' };
}
