import { SKILL_NODES } from '../data/skillNodes';
import { WEAPON_IDS, isWeaponId, type WeaponId } from '../data/weapons';
import { HEAT_PACTS, type HeatRanks } from '../data/heat';
import { HISTORY_CAP, isRunRecord, type RunRecord } from './history';

/** Best result of the daily run for one date (YYYY-MM-DD). */
export interface DailyRecord { date: string; sector: number; victory: boolean; timeMs: number; kills: number }

/** What the building remembers about you: the last run, and how often you talked to whom. */
export interface StoryState {
  lastRun?: { victory: boolean; sector: number; killer?: string; weapon: string; heat: number };
  /** conversations per NPC key, drives their story lines */
  talks: Record<string, number>;
  /** one-off events already seen (gifts, milestones) */
  flags: string[];
}

export interface SaveData {
  version: 1;
  credits: number;
  ownedNodes: string[];
  runs: number;
  bestRoom: number;
  /** oldest first, capped at HISTORY_CAP */
  history: RunRecord[];
  weapons: WeaponId[];
  weapon: WeaponId;
  /** kills per enemy id: the bestiary */
  codex: Record<string, number>;
  /** deaths per killer (enemy id or 'psychosis') */
  deaths: Record<string, number>;
  heat: HeatRanks;
  bestHeat: number;
  /** most recent last, capped at DAILY_CAP */
  daily: DailyRecord[];
  story: StoryState;
}

export const SAVE_KEY = 'neon-city-save';
export const DAILY_CAP = 14;

export function defaultSave(): SaveData {
  return {
    version: 1, credits: 0, ownedNodes: [], runs: 0, bestRoom: 0, history: [],
    weapons: ['blade'], weapon: 'blade', codex: {}, deaths: {}, heat: {}, bestHeat: 0, daily: [],
    story: { talks: {}, flags: [] },
  };
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A { key: count } map, keeping only valid counts (and known keys when given). */
function counts(v: unknown, known?: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [k, n] of Object.entries(v)) if (isCount(n) && (!known || known.includes(k))) out[k] = Math.floor(n);
  return out;
}

function isDaily(v: unknown): v is DailyRecord {
  return isObj(v) && typeof v.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.date) && typeof v.victory === 'boolean'
    && isCount(v.sector) && isCount(v.timeMs) && isCount(v.kills);
}

function story(v: unknown): StoryState {
  const s: StoryState = { talks: {}, flags: [] };
  if (!isObj(v)) return s;
  s.talks = counts(v.talks);
  s.flags = Array.isArray(v.flags) ? v.flags.filter((f): f is string => typeof f === 'string').slice(0, 200) : [];
  const l = v.lastRun;
  if (isObj(l) && typeof l.victory === 'boolean' && isCount(l.sector) && typeof l.weapon === 'string' && isCount(l.heat)) {
    s.lastRun = { victory: l.victory, sector: l.sector, weapon: l.weapon, heat: l.heat, killer: typeof l.killer === 'string' ? l.killer : undefined };
  }
  return s;
}

/** Never throws: any missing, corrupt or outdated save yields a fresh default. Missing new fields get defaults. */
export function loadSave(storage: Pick<Storage, 'getItem'>): SaveData {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object' || d.version !== 1) return defaultSave();
    if (!isCount(d.credits) || !isCount(d.runs) || !isCount(d.bestRoom) || !Array.isArray(d.ownedNodes)) return defaultSave();
    const known = new Set(SKILL_NODES.map(n => n.id));
    const weapons = Array.isArray(d.weapons) ? d.weapons.filter(isWeaponId) : [];
    if (!weapons.includes('blade')) weapons.unshift('blade');
    const heat: HeatRanks = {};
    for (const p of HEAT_PACTS) { const n = isObj(d.heat) ? d.heat[p.id] : undefined; if (isCount(n) && n > 0) heat[p.id] = Math.min(p.max, Math.floor(n)); }
    return {
      version: 1,
      credits: Math.floor(d.credits),
      ownedNodes: d.ownedNodes.filter((id: unknown): id is string => typeof id === 'string' && known.has(id)),
      runs: Math.floor(d.runs),
      bestRoom: Math.floor(d.bestRoom),
      // Optional: saves from before the history existed simply start with an empty one.
      history: Array.isArray(d.history) ? d.history.filter(isRunRecord).slice(-HISTORY_CAP) : [],
      weapons: [...new Set(weapons)] as WeaponId[],
      weapon: isWeaponId(d.weapon) && weapons.includes(d.weapon) ? d.weapon : 'blade',
      codex: counts(d.codex),
      deaths: counts(d.deaths),
      heat,
      bestHeat: isCount(d.bestHeat) ? Math.floor(d.bestHeat) : 0,
      daily: Array.isArray(d.daily) ? d.daily.filter(isDaily).slice(-DAILY_CAP) : [],
      story: story(d.story),
    };
  } catch {
    return defaultSave();
  }
}

export function writeSave(storage: Pick<Storage, 'setItem'>, data: SaveData): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage blocked or full: progress for this session stays in memory.
  }
}

export { WEAPON_IDS };
