import { CONFIG } from '../config';
import { ROOM_TEMPLATES, BOSS_ROOM, type RoomTemplate } from '../data/rooms';
import type { EnemyId } from '../data/enemies';
import { createRng, pick, randInt, shuffle, type Rng } from './rng';
import type { Family } from './types';

export const TILE = 32;

/** What a door gives: an instant reward, or a different next sector (street event, elite squad). */
export type Reward = 'implant' | 'credits' | 'heal' | 'chest' | 'event' | 'elite';
export type EliteMod = 'shield' | 'explosive' | 'cloak' | 'frenzy';
export const ELITE_MODS: EliteMod[] = ['shield', 'explosive', 'cloak', 'frenzy'];

export interface RoomPlan {
  index: number;
  template: RoomTemplate;
  waves: EnemyId[][];
  isBoss: boolean;
  /** 'event': a non-combat encounter, chosen by taking an event door */
  kind?: 'event';
  /** set when the previous door was an elite one */
  elite?: EliteMod;
  doorRewards: Reward[];
  /** implant doors show which family their clinic stocks */
  doorFamilies: Family[];
}

const FAMILIES: Family[] = ['chrome', 'neural', 'blood', 'optic'];
const families = (rng: Rng, n: number) => Array.from({ length: n }, () => pick(rng, FAMILIES));

const REWARDS: Reward[] = ['implant', 'credits', 'heal', 'chest'];

/** Doors before a regular sector can also lead to a street event or an elite squad. */
function doorRewards(rng: Rng, index: number): Reward[] {
  const nextIsBoss = (index + 2) % CONFIG.BOSS_EVERY === 0;
  const pool: Reward[] = [...REWARDS];
  if (!nextIsBoss && index >= 1 && index < CONFIG.ROOMS_PER_RUN - 2) pool.push('event', 'elite');
  return shuffle(rng, pool).slice(0, randInt(rng, 2, 3));
}

/** An elite squad: one more enemy per wave and a modifier on all of them. */
export function makeElite(room: RoomPlan, rng: Rng): RoomPlan {
  return { ...room, elite: pick(rng, ELITE_MODS), waves: room.waves.map(w => [...w, pick(rng, w)]) };
}

export function makeEvent(room: RoomPlan): RoomPlan {
  return { ...room, kind: 'event', waves: [] };
}

/** Enemy pool widens with depth: drones from sector 2, bombers from 3, hackers from 4. */
function poolFor(index: number): EnemyId[] {
  const pool: EnemyId[] = ['runner', 'runner', 'gunner'];
  if (index >= 1) pool.push('gunner', 'brute', 'drone');
  if (index >= 2) pool.push('bomber');
  if (index >= 3) pool.push('hacker', 'drone');
  if (index >= 5) pool.push('brute', 'hacker', 'bomber');
  return pool;
}

function makeWave(rng: Rng, index: number): EnemyId[] {
  const size = Math.min(7, 3 + Math.floor(index / 2) + randInt(rng, 0, 1));
  const pool = poolFor(index);
  return Array.from({ length: size }, () => pick(rng, pool));
}

export function generateRun(seed: number): RoomPlan[] {
  const rng = createRng(seed);
  const rooms: RoomPlan[] = [];
  const last = CONFIG.ROOMS_PER_RUN - 1;
  for (let index = 0; index < CONFIG.ROOMS_PER_RUN; index++) {
    if ((index + 1) % CONFIG.BOSS_EVERY === 0) {
      // Boss alone. A mid-run boss opens doors like any sector; the last one ends the run.
      const final = index === last;
      rooms.push({
        index, template: BOSS_ROOM, waves: [[final ? 'boss' : 'warden']], isBoss: true,
        doorRewards: final ? [] : shuffle(rng, REWARDS).slice(0, randInt(rng, 2, 3)),
        doorFamilies: families(rng, 3),
      });
      continue;
    }
    const waveCount = index === 0 ? 1 : index < 3 ? randInt(rng, 1, 2) : index < 5 ? 2 : randInt(rng, 2, 3);
    rooms.push({
      index,
      template: pick(rng, ROOM_TEMPLATES),
      waves: Array.from({ length: waveCount }, () => makeWave(rng, index)),
      isBoss: false,
      doorRewards: doorRewards(rng, index),
      doorFamilies: families(rng, 3),
    });
  }
  return rooms;
}

export function findTile(template: RoomTemplate, ch: string): { x: number; y: number } {
  for (let y = 0; y < template.grid.length; y++) {
    const x = template.grid[y].indexOf(ch);
    if (x >= 0) return { x, y };
  }
  throw new Error(`Tile "${ch}" not found in ${template.id}`);
}

/** Pixel centres of free floor tiles at least MIN_SPAWN_DIST from the player tile. */
export function spawnPoints(template: RoomTemplate, count: number, playerTile: { x: number; y: number }, rng: Rng, blocked: ReadonlySet<string> = new Set()): { x: number; y: number }[] {
  const px = (playerTile.x + 0.5) * TILE, py = (playerTile.y + 0.5) * TILE;
  const free: { x: number; y: number }[] = [];
  template.grid.forEach((row, y) => [...row].forEach((ch, x) => {
    const cx = (x + 0.5) * TILE, cy = (y + 0.5) * TILE;
    if ((ch === '.' || ch === 'P') && !blocked.has(`${x},${y}`) && Math.hypot(cx - px, cy - py) >= CONFIG.MIN_SPAWN_DIST) free.push({ x: cx, y: cy });
  }));
  const chosen = shuffle(rng, free);
  // Rooms are small: if more enemies than tiles, reuse tiles with jitter.
  return Array.from({ length: count }, (_, i) => {
    const p = chosen[i % chosen.length];
    const j = i < chosen.length ? 0 : 6;
    return { x: p.x + (rng() - 0.5) * j, y: p.y + (rng() - 0.5) * j };
  });
}
