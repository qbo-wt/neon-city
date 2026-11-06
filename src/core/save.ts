import { SKILL_NODES } from '../data/skillNodes';

export interface SaveData {
  version: 1;
  credits: number;
  ownedNodes: string[];
  runs: number;
  bestRoom: number;
}

export const SAVE_KEY = 'neon-city-save';

export function defaultSave(): SaveData {
  return { version: 1, credits: 0, ownedNodes: [], runs: 0, bestRoom: 0 };
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Never throws: any missing, corrupt or outdated save yields a fresh default. */
export function loadSave(storage: Pick<Storage, 'getItem'>): SaveData {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object' || d.version !== 1) return defaultSave();
    if (!isCount(d.credits) || !isCount(d.runs) || !isCount(d.bestRoom) || !Array.isArray(d.ownedNodes)) return defaultSave();
    const known = new Set(SKILL_NODES.map(n => n.id));
    return {
      version: 1,
      credits: Math.floor(d.credits),
      ownedNodes: d.ownedNodes.filter((id: unknown): id is string => typeof id === 'string' && known.has(id)),
      runs: Math.floor(d.runs),
      bestRoom: Math.floor(d.bestRoom),
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
