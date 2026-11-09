import { pick, shuffle, type Rng } from '../core/rng';
import { DIRS, walkable } from './board';
import type { Board, Cell, Pt } from './types';

/** Street styles; each one is a board shape and a set of props. */
export type ArenaStyle = 'avenue' | 'alley' | 'market' | 'crossroad' | 'parking' | 'plaza' | 'docks' | 'checkpoint';

type Shape = { w: number; h: number; on: (x: number, y: number) => boolean };

const SHAPES: Record<ArenaStyle, Shape> = {
  avenue: { w: 14, h: 11, on: () => true },
  alley: { w: 13, h: 13, on: (x, y) => !(x >= 7 && y <= 5) },
  market: { w: 13, h: 12, on: () => true },
  crossroad: { w: 13, h: 13, on: (x, y) => !((x < 3 || x > 9) && (y < 3 || y > 9)) },
  parking: { w: 14, h: 12, on: () => true },
  plaza: { w: 13, h: 13, on: (x, y) => (x - 6) ** 2 + (y - 6) ** 2 <= 46 },
  docks: { w: 14, h: 12, on: () => true },
  checkpoint: { w: 13, h: 13, on: (x, y) => Math.abs(x - 6) + Math.abs(y - 6) <= 9 },
};

/** Fixed props of a style: [x, y, cell, prop]. Random clutter is added on top. */
function layout(style: ArenaStyle, rng: Rng): [number, number, Cell, string][] {
  const out: [number, number, Cell, string][] = [];
  const car = () => pick(rng, ['car-0', 'car-1', 'car-2']);
  switch (style) {
    case 'avenue':
      for (const x of [1, 4, 9, 12]) out.push([x, 2, 'block', car()]);
      for (const x of [2, 6, 11]) out.push([x, 8, 'block', car()]);
      out.push([7, 5, 'hole', 'manhole'], [0, 5, 'block', 'lamp'], [13, 5, 'block', 'lamp']);
      break;
    case 'alley':
      out.push([2, 2, 'block', 'dumpster'], [4, 4, 'block', 'crate'], [1, 8, 'block', 'dumpster'], [5, 9, 'hole', 'grate'], [9, 8, 'block', 'crate'], [11, 11, 'block', 'dumpster'], [8, 11, 'block', 'barrel']);
      break;
    case 'market':
      for (const [x, y] of [[2, 3], [3, 3], [6, 3], [9, 3], [10, 3], [2, 8], [5, 8], [6, 8], [9, 8], [10, 8]]) out.push([x, y, 'block', 'stall']);
      out.push([6, 6, 'block', 'lamp']);
      break;
    case 'crossroad':
      out.push([6, 6, 'block', 'totem'], [4, 4, 'block', 'barrier'], [8, 8, 'block', 'barrier'], [8, 4, 'hole', 'manhole'], [4, 8, 'block', 'barrier']);
      break;
    case 'parking':
      for (const [x, y] of [[3, 3], [7, 3], [11, 3], [3, 8], [7, 8], [11, 8]]) out.push([x, y, 'block', 'pillar']);
      for (const [x, y] of [[1, 1], [5, 1], [9, 5], [12, 10], [5, 10]]) out.push([x, y, 'block', car()]);
      break;
    case 'plaza':
      out.push([6, 6, 'block', 'totem'], [3, 3, 'block', 'planter'], [9, 3, 'block', 'planter'], [3, 9, 'block', 'planter'], [9, 9, 'block', 'planter'], [6, 2, 'hole', 'fountain']);
      break;
    case 'docks':
      for (const [x, y] of [[2, 2], [3, 2], [8, 2], [9, 2], [5, 6], [6, 6], [11, 7], [11, 8]]) out.push([x, y, 'block', 'container']);
      for (let x = 0; x < 14; x++) if (x % 5 !== 2) out.push([x, 11, 'hole', 'water']);
      break;
    case 'checkpoint':
      out.push([3, 6, 'block', 'barrier'], [9, 6, 'block', 'barrier'], [6, 3, 'block', 'barrier'], [6, 9, 'hole', 'grate'], [2, 3, 'block', 'generator'], [10, 9, 'block', 'generator']);
      break;
  }
  return out;
}

const CLUTTER: Record<ArenaStyle, string[]> = {
  avenue: ['barrier', 'vending', 'crate'], alley: ['crate', 'barrel', 'dumpster'], market: ['crate', 'crate', 'stall'],
  crossroad: ['barrier', 'crate'], parking: ['barrel', 'crate'], plaza: ['planter', 'vending'],
  docks: ['crate', 'barrel', 'container'], checkpoint: ['barrier', 'crate'],
};

/** Breakable objects: neutral units with HP that hide loot. */
export const BREAKABLE_KINDS = { crate: 14, barrel: 18, trash: 8, vending: 26 } as const;
export type BreakableKind = keyof typeof BREAKABLE_KINDS;
const BREAK_BY_STYLE: Record<ArenaStyle, BreakableKind[]> = {
  avenue: ['trash', 'vending', 'crate'], alley: ['trash', 'trash', 'crate', 'barrel'], market: ['crate', 'crate', 'vending'],
  crossroad: ['trash', 'vending', 'barrel'], parking: ['barrel', 'trash', 'crate'], plaza: ['vending', 'trash'],
  docks: ['crate', 'barrel', 'barrel'], checkpoint: ['barrel', 'crate'],
};

/** Floor cells reachable from p (4-neighbour). */
function flood(b: Board, from: Pt): Set<string> {
  const seen = new Set([`${from.x},${from.y}`]), q = [from];
  while (q.length) {
    const p = q.shift()!;
    for (const d of DIRS) {
      const n = { x: p.x + d.x, y: p.y + d.y }, k = `${n.x},${n.y}`;
      if (!seen.has(k) && walkable(b, n)) { seen.add(k); q.push(n); }
    }
  }
  return seen;
}

const floorCells = (b: Board) => {
  const out: Pt[] = [];
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.cells[y * b.w + x] === 'floor') out.push({ x, y });
  return out;
};

export interface Arena { board: Board; breakables: { at: Pt; kind: BreakableKind }[] }

/**
 * A sector's board: the style's shape and fixed props, random clutter that never cuts the map in
 * two, player start cells at the front (bottom of the screen), enemy cells at the back, and exits
 * on the back edges.
 */
export function generateArena(style: ArenaStyle, rng: Rng, exits: number, boss = false): Arena {
  const sh = SHAPES[style];
  const b: Board = { w: sh.w, h: sh.h, cells: [], props: [], playerStarts: [], enemyStarts: [], exits: [], style };
  for (let y = 0; y < sh.h; y++) for (let x = 0; x < sh.w; x++) { b.cells.push(sh.on(x, y) ? 'floor' : 'void'); b.props.push(undefined); }
  const set = (x: number, y: number, c: Cell, prop?: string) => {
    if (x < 0 || y < 0 || x >= b.w || y >= b.h || b.cells[y * b.w + x] === 'void') return;
    b.cells[y * b.w + x] = c; b.props[y * b.w + x] = prop;
  };
  for (const [x, y, c, p] of layout(style, rng)) set(x, y, c, p);

  // Starts: the front rows (high x + y) for the player, the back rows for the enemies.
  const floor = floorCells(b);
  const hi = Math.max(...floor.map(p => p.x + p.y)), lo = Math.min(...floor.map(p => p.x + p.y));
  const front = shuffle(rng, floor.filter(p => p.x + p.y >= hi - 3));
  const back = shuffle(rng, floor.filter(p => p.x + p.y <= lo + 5 && p.x + p.y >= lo + 1));
  const spaced = (list: Pt[], n: number) => {
    const out: Pt[] = [];
    for (const p of list) if (out.length < n && out.every(o => Math.abs(o.x - p.x) + Math.abs(o.y - p.y) >= 2)) out.push(p);
    for (const p of list) if (out.length < n && !out.includes(p)) out.push(p);
    return out;
  };
  b.playerStarts = spaced(front, 4);
  b.enemyStarts = spaced(back, boss ? 6 : 9);
  // Exits: free cells on the two back edges (x = 0 or y = 0 side of the floor).
  const edge = floor.filter(p => !b.playerStarts.some(s => s.x === p.x && s.y === p.y)
    && (p.y === 0 || p.x === 0 || b.cells[(p.y - 1) * b.w + p.x] === 'void' || b.cells[p.y * b.w + p.x - 1] === 'void'));
  const edgeSorted = edge.sort((a, c) => (a.x - a.y) - (c.x - c.y));
  for (let i = 0; i < exits && edgeSorted.length; i++) b.exits.push(edgeSorted[Math.round(((i + 0.5) / exits) * (edgeSorted.length - 1))]);

  const reserved = new Set([...b.playerStarts, ...b.enemyStarts, ...b.exits].map(p => `${p.x},${p.y}`));
  const freeOf = () => floorCells(b).filter(p => !reserved.has(`${p.x},${p.y}`));
  const connected = () => flood(b, b.playerStarts[0]).size === floorCells(b).length;

  // Clutter: more cover, never sealing a part of the board.
  let clutter = boss ? 2 : 3 + Math.floor(rng() * 3);
  for (const p of shuffle(rng, freeOf())) {
    if (clutter <= 0) break;
    set(p.x, p.y, 'block', pick(rng, CLUTTER[style]));
    if (!connected()) { set(p.x, p.y, 'floor', undefined); continue; }
    reserved.add(`${p.x},${p.y}`);
    clutter--;
  }

  // Breakables stand on floor cells but block like props until destroyed: same no-sealing rule.
  const breakables: { at: Pt; kind: BreakableKind }[] = [];
  let left = boss ? 2 : 3 + Math.floor(rng() * 2);
  for (const at of shuffle(rng, freeOf())) {
    if (left <= 0) break;
    for (const o of breakables) set(o.at.x, o.at.y, 'block');
    set(at.x, at.y, 'block');
    const ok = connected();
    for (const o of [...breakables, { at }]) set(o.at.x, o.at.y, 'floor');
    if (!ok) continue;
    breakables.push({ at, kind: pick(rng, BREAK_BY_STYLE[style]) });
    left--;
  }
  return { board: b, breakables };
}
