import type Phaser from 'phaser';
import { generateRun, type RoomPlan } from '../core/runMap';
import { computeStats } from '../core/stats';
import type { Implant, Relic } from '../core/types';
import type { Contract } from '../core/contract';
import type { WeaponId } from '../data/weapons';

/** Everything that survives between rooms of one run. Lives in the game registry. */
export interface RunState {
  seed: number;
  rooms: RoomPlan[];
  roomIndex: number;
  implants: Implant[];
  relics: Relic[];
  ownedNodes: string[];
  psy: number;
  hp: number;
  creditsEarned: number;
  blockers: number;
  // Tracked for the run history shown on the apartment terminal.
  kills: number;
  damageDealt: number;
  hpHealed: number;
  timeMs: number;
  /** a fixer contract waiting for (or running in) the next combat sector */
  contract?: Contract & { room?: number };
  weapon: WeaponId;
}

/** Live values the HUD draws each frame. */
export interface HudData {
  hp: number; maxHp: number; psy: number; credits: number;
  dash: number; dashMax: number; blockers: number;
  room: number; rooms: number; implants: string[]; relics: string[];
  synergies: string[];
  /** what the current psychosis tier gives, e.g. "+25 % DÉG" */
  psyBonus: string;
  /** contract progress, elite or event tag */
  notice?: string;
  boss?: { hp: number; max: number; name: string };
  special: { name: string; charge: number };
  weapon: string;
}

const KEY = 'run';

export function newRun(seed: number, ownedNodes: string[], weapon: WeaponId = 'blade'): RunState {
  const base = computeStats([], ownedNodes);
  return {
    seed, rooms: generateRun(seed), roomIndex: 0, implants: [], relics: [], ownedNodes,
    psy: 0, hp: base.maxHp, creditsEarned: 0, blockers: base.startBlockers,
    kills: 0, damageDealt: 0, hpHealed: 0, timeMs: 0, weapon,
  };
}

export const getRun = (reg: Phaser.Data.DataManager) => reg.get(KEY) as RunState;
export const setRun = (reg: Phaser.Data.DataManager, r: RunState) => reg.set(KEY, r);
