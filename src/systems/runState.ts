import type Phaser from 'phaser';
import { generateRun, type RoomPlan } from '../core/runMap';
import { computeStats } from '../core/stats';
import type { Implant } from '../core/types';

/** Everything that survives between rooms of one run. Lives in the game registry. */
export interface RunState {
  seed: number;
  rooms: RoomPlan[];
  roomIndex: number;
  implants: Implant[];
  ownedNodes: string[];
  psy: number;
  hp: number;
  creditsEarned: number;
  blockers: number;
}

/** Live values the HUD draws each frame. */
export interface HudData {
  hp: number; maxHp: number; psy: number; credits: number;
  dash: number; dashMax: number; blockers: number;
  room: number; rooms: number; implants: string[];
  boss?: { hp: number; max: number; name: string };
}

const KEY = 'run';

export function newRun(seed: number, ownedNodes: string[]): RunState {
  return {
    seed, rooms: generateRun(seed), roomIndex: 0, implants: [], ownedNodes,
    psy: 0, hp: computeStats([], ownedNodes).maxHp, creditsEarned: 0, blockers: 0,
  };
}

export const getRun = (reg: Phaser.Data.DataManager) => reg.get(KEY) as RunState;
export const setRun = (reg: Phaser.Data.DataManager, r: RunState) => reg.set(KEY, r);
