import type { RunState } from '../systems/runState';
import { IMPLANT_BY_ID } from '../data/implants';
import { RELIC_BY_ID } from '../data/relics';
import { isRunMode } from './mode';
import { getStorage } from './storage';

/**
 * The unfinished run, kept under its own storage key (scenes write the progress save back whole, so
 * a run stored in it would be overwritten by a stale copy: same reasoning as settings.ts).
 *
 * What is stored is the run as it stood when the current sector began, never mid-fight: quitting
 * and resuming restarts that sector from its start, so nothing earned in it (credits, loot, a chest
 * roll) can be kept by quitting. Implants and relics hold functions, so they go by id.
 */
export const RUN_SAVE_KEY = 'neon-city-run';
export const RUN_SAVE_VERSION = 1;

type KV = Pick<Storage, 'getItem' | 'setItem'>;

type Stored = Omit<RunState, 'implants' | 'relics'> & {
  implants: { id: string; level?: number }[];
  relics: string[];
};

interface Envelope { version: number; run: Stored }

/** Writes the run (sector `run.roomIndex` about to be played). */
export function saveRun(storage: KV, run: RunState): void {
  const stored: Stored = {
    ...run,
    implants: run.implants.map(i => ({ id: i.id, level: i.level })),
    relics: run.relics.map(r => r.id),
  };
  try { storage.setItem(RUN_SAVE_KEY, JSON.stringify({ version: RUN_SAVE_VERSION, run: stored } satisfies Envelope)); } catch { /* storage full or blocked */ }
}

/** The saved run, or undefined when there is none, it is from another version, or it does not hold together. */
export function loadRunSave(storage: KV): RunState | undefined {
  let raw: string | null = null;
  try { raw = storage.getItem(RUN_SAVE_KEY); } catch { return undefined; }
  if (!raw) return undefined;
  try {
    const env = JSON.parse(raw) as Partial<Envelope>;
    if (!env || env.version !== RUN_SAVE_VERSION || !env.run) return undefined;
    const s = env.run;
    if (!isRunMode(s.mode) || !Array.isArray(s.rooms) || !Array.isArray(s.implants) || !Array.isArray(s.relics)) return undefined;
    if (!Number.isInteger(s.roomIndex) || s.roomIndex < 0 || s.roomIndex >= s.rooms.length) return undefined;
    if (typeof s.seed !== 'number' || typeof s.hp !== 'number' || typeof s.creditsEarned !== 'number') return undefined;
    const implants = s.implants.map(i => {
      const base = IMPLANT_BY_ID.get(i.id);
      return base ? { ...base, level: i.level } : undefined;
    });
    const relics = s.relics.map(id => RELIC_BY_ID.get(id));
    if (implants.some(i => !i) || relics.some(r => !r)) return undefined;
    return { ...s, implants: implants as RunState['implants'], relics: relics as RunState['relics'] };
  } catch { return undefined; }
}

/** Forgets the saved run (victory, death, abandon). The storage may have no removeItem: an empty value reads as none. */
export function clearRunSave(storage: KV): void {
  try { storage.setItem(RUN_SAVE_KEY, ''); } catch { /* blocked */ }
}

export const hasRunSave = (storage: KV = getStorage()) => !!loadRunSave(storage);
