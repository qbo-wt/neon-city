import { isRunMode, type RunMode } from './mode';

export interface RunRecord {
  /** epoch ms when the run ended */
  date: number;
  victory: boolean;
  sector: number;
  kills: number;
  damageDealt: number;
  hpHealed: number;
  credits: number;
  timeMs: number;
  weapon?: string;
  /** notoriety points of the run */
  heat?: number;
  /** date key if it was the daily run */
  daily?: string;
  /** run tier (core/mode.ts); records from before the tiers have none and were CyberHard */
  mode?: RunMode;
  /** sector challenges held / taken */
  challengesWon?: number;
  challengesTried?: number;
  /** relic and implant ids carried at the end; absent on older records */
  relics?: string[];
  implants?: string[];
  /** synergy tiers active at the end */
  synergies?: number;
}

export const HISTORY_CAP = 50;

/** How the terminal names the run of a record. */
export function recordModeLabel(r: RunRecord): string {
  if (r.daily) return 'DU JOUR';
  return (isRunMode(r.mode) ? r.mode : 'cyberhard') === 'normal' ? 'NORMALE' : 'CYBERHARD';
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function isRunRecord(r: unknown): r is RunRecord {
  if (!r || typeof r !== 'object') return false;
  const o = r as Record<string, unknown>;
  return typeof o.victory === 'boolean'
    && ['date', 'sector', 'kills', 'damageDealt', 'hpHealed', 'credits', 'timeMs'].every(k => isCount(o[k]));
}

/**
 * The run shown as "meilleure combinaison": the most synergy tiers active at the end, ties broken by the
 * deeper sector then the victory. Older records without the field do not compete; null if none has any.
 */
export function bestCombo(h: readonly RunRecord[]): RunRecord | null {
  let best: RunRecord | null = null;
  for (const r of h) {
    if (!r.synergies || !r.implants?.length) continue;
    if (!best || r.synergies > best.synergies!
      || (r.synergies === best.synergies && (r.sector > best.sector || (r.sector === best.sector && r.victory && !best.victory)))) best = r;
  }
  return best;
}

export function recentFirst(h: readonly RunRecord[]): RunRecord[] {
  return [...h].sort((a, b) => b.date - a.date);
}

/** Victories first, then the deepest sector, then the fastest time. */
export function bestFirst(h: readonly RunRecord[]): RunRecord[] {
  return [...h].sort((a, b) =>
    Number(b.victory) - Number(a.victory) || b.sector - a.sector || a.timeMs - b.timeMs);
}

export function addRecord(h: readonly RunRecord[], r: RunRecord, cap = HISTORY_CAP): RunRecord[] {
  return [...h, r].slice(-cap);
}

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
