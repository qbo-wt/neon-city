import { RANK_MODE_LABEL, ordinal, type BoardEntry, type RankMode, type Score } from './ranking';

/** Client side of /api/scores. Nothing here throws: a failure is a status the UI shows quietly. */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const ENDPOINT = '/api/scores';
const TIMEOUT_MS = 6000;

export interface SubmitResult {
  /** this run beat (or created) the player's best on that board */
  record: boolean;
  first: boolean;
  rank: number;
  total: number;
}
export type Board =
  | { status: 'ok'; entries: BoardEntry[]; total: number }
  | { status: 'offline' }
  | { status: 'unconfigured' };

async function call(f: Fetcher, url: string, init?: RequestInit): Promise<Response | null> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer = setTimeout(() => ctl?.abort(), TIMEOUT_MS);
  try {
    return await f(url, { ...init, signal: ctl?.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const defaultFetch: Fetcher = (u, i) => fetch(u, i);

/** Sends a finished run. Resolves to null when offline, unconfigured, rejected: the game just goes on. */
export async function submitScore(
  run: Score & { player: string; mode: RankMode; day?: string }, f: Fetcher = defaultFetch,
): Promise<SubmitResult | null> {
  const res = await call(f, ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(run) });
  if (!res || !res.ok) return null;
  try {
    const d = await res.json() as Partial<SubmitResult>;
    if (typeof d.rank !== 'number' || typeof d.total !== 'number' || d.rank < 1) return null;
    return { record: d.record === true, first: d.first === true, rank: d.rank, total: d.total };
  } catch { return null; }
}

export async function fetchBoard(mode: RankMode, day?: string, f: Fetcher = defaultFetch): Promise<Board> {
  const q = new URLSearchParams({ mode });
  if (mode === 'daily' && day) q.set('day', day);
  const res = await call(f, `${ENDPOINT}?${q}`);
  if (!res) return { status: 'offline' };
  if (res.status === 503) return { status: 'unconfigured' };
  if (!res.ok) return { status: 'offline' };
  try {
    const d = await res.json() as { entries?: unknown; total?: unknown };
    if (!Array.isArray(d.entries)) return { status: 'offline' };
    return { status: 'ok', entries: d.entries as BoardEntry[], total: typeof d.total === 'number' ? d.total : d.entries.length };
  } catch { return { status: 'offline' }; }
}

/** The line of the end screen: "3ᵉ sur 7 en CYBERHARD", plus the personal-record note. */
export function rankLine(r: SubmitResult, mode: RankMode): string {
  const where = mode === 'daily' ? 'à la run du jour' : `en ${RANK_MODE_LABEL[mode]}`;
  const pos = r.total <= 1 ? `Seul au classement ${where}` : `${ordinal(r.rank)} sur ${r.total} ${where}`;
  if (r.first) return `${pos} — premier score envoyé`;
  return r.record ? `${pos} — nouveau record perso` : `${pos} (ton record tient)`;
}
