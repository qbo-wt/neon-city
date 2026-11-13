import type Phaser from 'phaser';
import { generateRun, makeElite, type RoomPlan } from '../core/runMap';
import { createRng } from '../core/rng';
import { heatEffects, heatPoints, type HeatRanks } from '../data/heat';
import { computeStats } from '../core/stats';
import type { Implant, Relic, RelicRarity } from '../core/types';
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
  /** equipped aspect of the weapon and its rank */
  aspect?: string;
  aspectRank: number;
  heat: HeatRanks;
  heatPoints: number;
  /** date key when this is the daily run */
  daily?: string;
  /** kills per enemy id, for the bestiary */
  killsByType: Record<string, number>;
  /** what landed the last blow on you (enemy id), or 'psychosis' */
  killer?: string;
}

/** Live values the HUD draws each frame. */
export interface HudData {
  hp: number; maxHp: number; psy: number; credits: number; blockers: number;
  room: number; rooms: number; implants: string[];
  /** carried relics, with their effect for the hover list */
  relics: { name: string; desc: string; rarity: RelicRarity }[];
  synergies: string[];
  /** what the current psychosis tier gives, e.g. "+25 % DÉG" */
  psyBonus: string;
  /** contract progress, elite or event tag */
  notice?: string;
  boss?: { hp: number; max: number; name: string };
  /** daily / notoriety marker in the top bar */
  tag: string;
  weapon: string;
}

const KEY = 'run';

export function newRun(seed: number, ownedNodes: string[], weapon: WeaponId = 'blade', opts: { heat?: HeatRanks; daily?: string; aspect?: string; aspectRank?: number } = {}): RunState {
  const base = computeStats([], ownedNodes);
  const heat = opts.heat ?? {};
  let rooms = generateRun(seed);
  // Notoriety "Escouades": one sector in three is an elite squad.
  if (heatEffects(heat).squads) rooms = rooms.map((r, i) => (!r.isBoss && i % 3 === 2 ? makeElite(r, createRng(seed + i * 53)) : r));
  return {
    seed, rooms, roomIndex: 0, implants: [], relics: [], ownedNodes,
    heat, heatPoints: heatPoints(heat), daily: opts.daily, killsByType: {},
    aspect: opts.aspect, aspectRank: opts.aspectRank ?? 0,
    psy: 0, hp: base.maxHp, creditsEarned: 0, blockers: base.startBlockers,
    kills: 0, damageDealt: 0, hpHealed: 0, timeMs: 0, weapon,
  };
}

export const getRun = (reg: Phaser.Data.DataManager) => reg.get(KEY) as RunState;
export const setRun = (reg: Phaser.Data.DataManager, r: RunState) => reg.set(KEY, r);
