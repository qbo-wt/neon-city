import type Phaser from 'phaser';
import { generateRun, makeElite, type RoomPlan } from '../core/runMap';
import { createRng } from '../core/rng';
import { heatEffects, heatPoints, type HeatRanks } from '../data/heat';
import { computeStats } from '../core/stats';
import type { Implant, Relic, RelicRarity } from '../core/types';
import type { Contract } from '../core/contract';
import type { WeaponId } from '../data/weapons';
import { hasPsychosis, type RunMode } from '../core/mode';

/** Everything that survives between rooms of one run. Lives in the game registry. */
export interface RunState {
  seed: number;
  /** run tier (core/mode.ts): psychosis and notoriety only exist in CyberHard */
  mode: RunMode;
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
  /** sector challenges taken and held this run (core/challenges.ts) */
  challenges?: { won: number; tried: number };
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
  /** the player's first run with the fight tutorial: its first sector is an easier fight */
  gentle?: boolean;
  /** street vending machines broken (Capsule's quest, core/vending) */
  vending?: number;
  /** credits Capsule slips into each street machine you break, from the city network (its `net` ending) */
  capsuleTip?: number;
  /** Capsule's drinks applied at the start of the run, by name: shown once on the first sector */
  gifts?: string[];
}

/** Live values the HUD draws each frame. */
export interface HudData {
  hp: number; maxHp: number; psy: number; credits: number; blockers: number;
  /** false in a normal run: no PSY gauge, no neuro-blockers, no psychosis screen effects */
  psychosis: boolean;
  room: number; rooms: number; implants: string[]; implantIds: string[];
  /** carried relics, with their effect for the hover list */
  relics: { id: string; name: string; desc: string; rarity: RelicRarity }[];
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

/**
 * A fresh run. `mode` defaults to the normal run; notoriety only applies to CyberHard (the daily run
 * passes none), and neuro-blockers only exist there.
 */
export function newRun(seed: number, ownedNodes: string[], weapon: WeaponId = 'blade',
  opts: { mode?: RunMode; heat?: HeatRanks; daily?: string; aspect?: string; aspectRank?: number } = {}): RunState {
  const mode = opts.mode ?? 'normal', psy = hasPsychosis(mode);
  const base = computeStats([], ownedNodes, [], psy);
  const heat = mode === 'cyberhard' ? opts.heat ?? {} : {};
  let rooms = generateRun(seed);
  // Notoriety "Escouades": one sector in three is an elite squad.
  if (heatEffects(heat).squads) rooms = rooms.map((r, i) => (!r.isBoss && i % 3 === 2 ? makeElite(r, createRng(seed + i * 53)) : r));
  return {
    seed, mode, rooms, roomIndex: 0, implants: [], relics: [], ownedNodes,
    heat, heatPoints: heatPoints(heat), daily: opts.daily, killsByType: {},
    aspect: opts.aspect, aspectRank: opts.aspectRank ?? 0,
    psy: 0, hp: base.maxHp, creditsEarned: 0, blockers: psy ? base.startBlockers : 0,
    kills: 0, damageDealt: 0, hpHealed: 0, timeMs: 0, weapon,
  };
}

export const getRun = (reg: Phaser.Data.DataManager) => reg.get(KEY) as RunState;
export const setRun = (reg: Phaser.Data.DataManager, r: RunState) => reg.set(KEY, r);
