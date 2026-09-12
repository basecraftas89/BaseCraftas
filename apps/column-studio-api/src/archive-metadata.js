// Prefer the event date in the filename to the upload timestamp (stored in UTC).
export function archiveMetadata(name, createdTime) {
  const title = String(name || '').normalize('NFKC').replace(/\.(mp4|mov|m4v|webm|mkv|mp3|m4a|wav)$/i, '').trim();
  const episode = title.match(/(?:第|\bEP\s*|#)\s*(\d+)\s*(?:回)?/i);
  const created = new Date(createdTime);
  const localDate = Number.isNaN(created.getTime()) ? '' : new Date(created.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const date = title.match(/(?:^|\s)(?:(\d{4})[\/.-])?(\d{1,2})[\/:.-](\d{1,2})(?=\s|$)/);
  let sourceDate = localDate;
  if (date && (date[1] || localDate)) {
    let year = Number(date[1] || localDate.slice(0, 4));
    if (!date[1] && Number(date[2]) - Number(localDate.slice(5, 7)) > 6) year--;
    const candidate = `${year}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}`;
    const parsed = new Date(candidate + 'T00:00:00Z');
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate) sourceDate = candidate;
  }
  return { title, episodeNo: episode ? Number(episode[1]) : null, sourceDate };
}
