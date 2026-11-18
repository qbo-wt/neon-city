// Not a function itself (the leading underscore keeps Vercel from routing it): the logic of /api/scores,
// with the storage passed in so tests can use an in-memory one.
import {
  BOARD_SIZE, beats, boardKey, isDayKey, isRankMode, parseScorePost, playerKey, rankOf, sortBoard, toEntry,
  type BoardEntry, type RankMode,
} from '../src/core/ranking.js';

/** The slice of the Redis client the board uses (Upstash's `Redis` fits it). */
export interface Store {
  hget(key: string, field: string): Promise<unknown>;
  hset(key: string, values: Record<string, unknown>): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, unknown> | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

export const MAX_BODY = 1024;
export const POSTS_PER_MINUTE = 20;
const DAILY_TTL = 45 * 24 * 3600;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/** Daily boards are keyed by the player's local date: accept today +/- 2 days in UTC, no more. */
const dayInWindow = (day: string, now: Date) => Math.abs(Date.parse(`${day}T00:00:00Z`) - Date.parse(`${utcDay(now)}T00:00:00Z`)) <= 2 * 86400_000;

async function readBoard(store: Store, key: string): Promise<BoardEntry[]> {
  const all = (await store.hgetall(key)) ?? {};
  const out: BoardEntry[] = [];
  for (const raw of Object.values(all)) {
    let v = raw;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { continue; } }
    const e = toEntry(v);
    if (e) out.push(e);
  }
  return out;
}

export async function handleScores(req: Request, store: Store | null, now: Date = new Date()): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'POST') return json(405, { error: 'method-not-allowed' });
  if (!store) return json(503, { error: 'storage-not-configured' });
  try {
    return req.method === 'GET' ? await get(req, store, now) : await post(req, store, now);
  } catch {
    return json(502, { error: 'storage-error' });
  }
}

async function get(req: Request, store: Store, now: Date): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const mode = q.get('mode');
  if (!isRankMode(mode)) return json(400, { error: 'bad-mode' });
  let day: string | undefined;
  if (mode === 'daily') {
    day = q.get('day') ?? utcDay(now);
    if (!isDayKey(day)) return json(400, { error: 'bad-day' });
  } else if (q.has('day')) return json(400, { error: 'bad-day' });
  const all = sortBoard(await readBoard(store, boardKey(mode, day)));
  return json(200, { mode, day, total: all.length, entries: all.slice(0, BOARD_SIZE) });
}

async function post(req: Request, store: Store, now: Date): Promise<Response> {
  const text = await req.text();
  if (text.length > MAX_BODY) return json(400, { error: 'body-too-large' });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json(400, { error: 'bad-json' }); }
  const parsed = parseScorePost(body);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const { mode, day, ...entry } = parsed.value;
  if (mode === 'daily' && !dayInWindow(day!, now)) return json(400, { error: 'bad-day' });

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const rl = `neon:rl:${ip}:${Math.floor(now.getTime() / 60000)}`;
  const n = await store.incr(rl);
  if (n === 1) await store.expire(rl, 90);
  if (n > POSTS_PER_MINUTE) return json(429, { error: 'rate-limited' });

  const key = boardKey(mode, day), field = playerKey(entry.player);
  const prev = toEntry(await store.hget(key, field));
  const better = !prev || beats(entry, prev);
  if (better) {
    await store.hset(key, { [field]: entry });
    if (mode === 'daily') await store.expire(key, DAILY_TTL);
  }
  const board = await readBoard(store, key);
  return json(200, { kept: better, record: better, first: !prev, ...rankOf(board, entry.player), mode: mode as RankMode, day });
}
