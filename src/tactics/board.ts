import type { Board, Cell, Pt } from './types';

export const DIRS: Pt[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

export const inside = (b: Board, p: Pt) => p.x >= 0 && p.y >= 0 && p.x < b.w && p.y < b.h;
export const cellAt = (b: Board, p: Pt): Cell => (inside(b, p) ? b.cells[p.y * b.w + p.x] : 'void');
export const walkable = (b: Board, p: Pt) => cellAt(b, p) === 'floor';
export const seeThrough = (b: Board, p: Pt) => { const c = cellAt(b, p); return c === 'floor' || c === 'hole'; };
export const dist = (a: Pt, b: Pt) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const same = (a: Pt, b: Pt) => a.x === b.x && a.y === b.y;
export const keyOf = (p: Pt) => `${p.x},${p.y}`;
export const inLine = (a: Pt, b: Pt) => a.x === b.x || a.y === b.y;

/**
 * Cells strictly between a and b that the segment between their centres passes through. A cell the
 * segment only grazes at a corner does not count, so lines of sight are symmetric and forgiving.
 */
export function cellsBetween(a: Pt, b: Pt): Pt[] {
  const out: Pt[] = [];
  const x0 = a.x + 0.5, y0 = a.y + 0.5, x1 = b.x + 0.5, y1 = b.y + 0.5;
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x), minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
  const eps = 1e-6;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if ((x === a.x && y === a.y) || (x === b.x && y === b.y)) continue;
    if (segmentHitsBox(x0, y0, x1, y1, x + eps, y + eps, x + 1 - eps, y + 1 - eps)) out.push({ x, y });
  }
  return out;
}

/** Liang–Barsky: does the segment cross the open box? */
function segmentHitsBox(x0: number, y0: number, x1: number, y1: number, bx0: number, by0: number, bx1: number, by1: number) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const edges: [number, number][] = [[-dx, x0 - bx0], [dx, bx1 - x0], [-dy, y0 - by0], [dy, by1 - y0]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 < t1;
}

/** Clear line of sight from a to b: no block cell and no occupied cell in between. */
export function lineOfSight(b: Board, a: Pt, to: Pt, occupied: (p: Pt) => boolean): boolean {
  return cellsBetween(a, to).every(p => seeThrough(b, p) && !occupied(p));
}

/** Unit step from a toward b along each axis (-1, 0 or 1). */
export const stepToward = (a: Pt, b: Pt): Pt => ({ x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) });

export interface Reach { cost: number; prev?: string }

/**
 * Every cell reachable with `pm` movement points: Dijkstra on the 4-neighbour grid. Leaving a cell
 * costs 1 plus `exitTax(cell)` (the tackle of the enemies around it). Occupied cells cannot be crossed.
 */
export function reachable(b: Board, from: Pt, pm: number, blocked: (p: Pt) => boolean, exitTax: (p: Pt) => number): Map<string, Reach> {
  const out = new Map<string, Reach>([[keyOf(from), { cost: 0 }]]);
  const open: { p: Pt; cost: number }[] = [{ p: from, cost: 0 }];
  while (open.length) {
    open.sort((a, c) => a.cost - c.cost);
    const { p, cost } = open.shift()!;
    if (cost > (out.get(keyOf(p))?.cost ?? Infinity)) continue;
    const step = 1 + exitTax(p);
    for (const d of DIRS) {
      const n = { x: p.x + d.x, y: p.y + d.y }, c = cost + step;
      if (c > pm || !walkable(b, n) || blocked(n)) continue;
      const k = keyOf(n);
      if (c < (out.get(k)?.cost ?? Infinity)) { out.set(k, { cost: c, prev: keyOf(p) }); open.push({ p: n, cost: c }); }
    }
  }
  return out;
}

/** The path (excluding the start) to `to` from a reachable map, or null. */
export function pathTo(map: Map<string, Reach>, to: Pt): Pt[] | null {
  let k: string | undefined = keyOf(to);
  if (!map.has(k)) return null;
  const path: Pt[] = [];
  while (k && map.get(k)!.prev !== undefined) {
    const [x, y] = k.split(',').map(Number);
    path.unshift({ x, y });
    k = map.get(k)!.prev;
  }
  return path;
}

/** Shortest walking distance ignoring PM (BFS), used by the AI to approach from far away. */
export function walkDistances(b: Board, from: Pt, blocked: (p: Pt) => boolean): Int16Array {
  const d = new Int16Array(b.w * b.h).fill(-1);
  d[from.y * b.w + from.x] = 0;
  const q: Pt[] = [from];
  while (q.length) {
    const p = q.shift()!;
    for (const dir of DIRS) {
      const n = { x: p.x + dir.x, y: p.y + dir.y };
      if (!walkable(b, n) || d[n.y * b.w + n.x] >= 0) continue;
      d[n.y * b.w + n.x] = d[p.y * b.w + p.x] + 1;
      if (!blocked(n)) q.push(n);
    }
  }
  return d;
}
