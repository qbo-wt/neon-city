import { DAILY_CAP, type DailyRecord } from './save';

/** Local calendar date as YYYY-MM-DD: the key of the daily run. */
export function dateKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Same date, same run for everyone: FNV-1a hash of the date key. */
export function dailySeed(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Victory first, then the deepest sector, then the fastest. */
export function betterDaily(a: DailyRecord, b: DailyRecord): boolean {
  if (a.victory !== b.victory) return a.victory;
  if (a.sector !== b.sector) return a.sector > b.sector;
  return a.timeMs < b.timeMs;
}

/** Keeps the best attempt per date; returns the new list and whether this attempt is the day's best. */
export function recordDaily(list: readonly DailyRecord[], r: DailyRecord): { list: DailyRecord[]; best: boolean } {
  const prev = list.find(d => d.date === r.date);
  if (prev && !betterDaily(r, prev)) return { list: [...list], best: false };
  const rest = list.filter(d => d.date !== r.date);
  return { list: [...rest, r].sort((a, b) => a.date.localeCompare(b.date)).slice(-DAILY_CAP), best: true };
}
