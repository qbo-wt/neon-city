/**
 * The friends' leaderboard, shared by the game and by the serverless function (api/scores.ts).
 * No imports on purpose: the function is deployed on its own and this file must stand alone.
 *
 * RANKING ORDER (the single place it is defined, see `compareScores`):
 *   1. a victory beats any death,
 *   2. then the deepest sector reached,
 *   3. then notoriety (only CyberHard runs have any; it is 0 elsewhere),
 *   4. then the shortest run time,
 *   5. then the player's name, so the order is stable.
 * One entry per player and per board: their best run in that mode (for the daily run, that day).
 */
export type RankMode = 'normal' | 'cyberhard' | 'daily';
export const RANK_MODES: readonly RankMode[] = ['normal', 'cyberhard', 'daily'];
export const RANK_MODE_LABEL: Record<RankMode, string> = { normal: 'NORMALE', cyberhard: 'CYBERHARD', daily: 'DU JOUR' };
export const isRankMode = (v: unknown): v is RankMode => typeof v === 'string' && (RANK_MODES as readonly string[]).includes(v);

/** Sectors in a run. Same number as CONFIG.ROOMS_PER_RUN (a test keeps them equal). */
export const MAX_SECTOR = 10;
export const MAX_HEAT_POINTS = 30;
export const MAX_TIME_MS = 24 * 3600 * 1000;
export const MAX_CREDITS = 1_000_000;
export const BOARD_SIZE = 50;
export const NAME_MIN = 2;
export const NAME_MAX = 16;

export interface Score {
  victory: boolean;
  sector: number;
  /** notoriety points, 0 outside CyberHard */
  heat: number;
  timeMs: number;
  credits: number;
  weapon: string;
}
export interface BoardEntry extends Score { player: string }

/** Negative when `a` ranks above `b`. */
export function compareScores(a: BoardEntry, b: BoardEntry): number {
  return Number(b.victory) - Number(a.victory)
    || b.sector - a.sector
    || b.heat - a.heat
    || a.timeMs - b.timeMs
    || a.player.localeCompare(b.player);
}

/** True when `a` is strictly better than `b` (names ignored: it compares two runs of one player). */
export const beats = (a: Score, b: Score) => compareScores({ ...a, player: '' }, { ...b, player: '' }) < 0;

export const sortBoard = (entries: readonly BoardEntry[]): BoardEntry[] => [...entries].sort(compareScores);

/** Case-insensitive identity of a player: "Neo" and "neo " are the same runner. */
export const playerKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
export const sameRunner = (a: string, b: string) => playerKey(a) === playerKey(b);

const NAME_RE = /^[A-Za-z0-9À-ÖØ-öø-ÿ _-]+$/;

/** The cleaned name (trimmed, inner spaces collapsed), or null if it is not acceptable. */
export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const n = v.trim().replace(/\s+/g, ' ');
  // "__proto__" would be a field name that some JS deserialisers treat specially.
  return n.length >= NAME_MIN && n.length <= NAME_MAX && NAME_RE.test(n) && !/__proto__/i.test(n) ? n : null;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isDayKey(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
}

export interface ScorePost extends BoardEntry { mode: RankMode; day?: string }
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const int = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Strict check of a POST body. Anything unexpected is an error (the function answers 400). */
export function parseScorePost(body: unknown): Parsed<ScorePost> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'bad-body' };
  const o = body as Record<string, unknown>;
  const player = cleanName(o.player);
  if (!player) return { ok: false, error: 'bad-player' };
  if (!isRankMode(o.mode)) return { ok: false, error: 'bad-mode' };
  if (typeof o.victory !== 'boolean') return { ok: false, error: 'bad-victory' };
  if (!int(o.sector, 1, MAX_SECTOR)) return { ok: false, error: 'bad-sector' };
  if (!int(o.heat, 0, MAX_HEAT_POINTS)) return { ok: false, error: 'bad-heat' };
  if (!int(o.timeMs, 0, MAX_TIME_MS)) return { ok: false, error: 'bad-time' };
  if (!int(o.credits, 0, MAX_CREDITS)) return { ok: false, error: 'bad-credits' };
  if (typeof o.weapon !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(o.weapon)) return { ok: false, error: 'bad-weapon' };
  if (o.victory && o.sector !== MAX_SECTOR) return { ok: false, error: 'bad-sector' };
  let day: string | undefined;
  if (o.mode === 'daily') {
    if (!isDayKey(o.day)) return { ok: false, error: 'bad-day' };
    day = o.day;
  } else if (o.day !== undefined) return { ok: false, error: 'bad-day' };
  return {
    ok: true,
    value: {
      player, mode: o.mode, day, victory: o.victory, sector: o.sector,
      // Only CyberHard runs carry notoriety.
      heat: o.mode === 'cyberhard' ? o.heat : 0, timeMs: o.timeMs, credits: o.credits, weapon: o.weapon,
    },
  };
}

/** Cleans a stored entry (a hand-edited or old value never reaches the screen malformed). */
export function toEntry(v: unknown): BoardEntry | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const player = cleanName(o.player);
  if (!player || typeof o.victory !== 'boolean' || !int(o.sector, 1, MAX_SECTOR) || !int(o.heat, 0, MAX_HEAT_POINTS)
    || !int(o.timeMs, 0, MAX_TIME_MS) || !int(o.credits, 0, MAX_CREDITS) || typeof o.weapon !== 'string') return null;
  return { player, victory: o.victory, sector: o.sector, heat: o.heat, timeMs: o.timeMs, credits: o.credits, weapon: o.weapon.slice(0, 24) };
}

/** 1-based rank of `player` on a board, with the board size; 0 if absent. */
export function rankOf(entries: readonly BoardEntry[], player: string): { rank: number; total: number } {
  const sorted = sortBoard(entries);
  const i = sorted.findIndex(e => sameRunner(e.player, player));
  return { rank: i + 1, total: sorted.length };
}

/** Storage key of a board. */
export const boardKey = (mode: RankMode, day?: string) => (mode === 'daily' ? `neon:scores:daily:${day}` : `neon:scores:${mode}`);

/** "1ᵉʳ", "3ᵉ" */
export const ordinal = (n: number) => (n === 1 ? '1ᵉʳ' : `${n}ᵉ`);
