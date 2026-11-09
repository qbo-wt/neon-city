/**
 * Flow field: walking distance (in tiles) from every tile to one target, computed once and
 * shared by every enemy. An enemy just steps to the neighbour with the smallest distance,
 * so it walks around walls, crates and props instead of pushing into them.
 */
export const UNREACHABLE = 0x7fff;

type Passable = (x: number, y: number) => boolean;

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** A diagonal move is only allowed when both orthogonal tiles are free (no corner cutting). */
function canStep(passable: Passable, x: number, y: number, dx: number, dy: number) {
  if (!passable(x + dx, y + dy)) return false;
  return dx === 0 || dy === 0 || (passable(x + dx, y) && passable(x, y + dy));
}

export function buildFlowField(passable: Passable, w: number, h: number, target: { x: number; y: number }): Int16Array {
  const field = new Int16Array(w * h).fill(UNREACHABLE);
  if (!passable(target.x, target.y)) return field;
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  field[target.y * w + target.x] = 0;
  queue[tail++] = target.y * w + target.x;
  while (head < tail) {
    const i = queue[head++], x = i % w, y = (i - x) / w, d = field[i] + 1;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !canStep(passable, x, y, dx, dy)) continue;
      const j = ny * w + nx;
      if (field[j] <= d) continue;
      field[j] = d;
      queue[tail++] = j;
    }
  }
  return field;
}

/** The neighbouring tile that gets closer to the target, or null if none does (target reached or unreachable). */
export function nextStep(field: Int16Array, w: number, h: number, from: { x: number; y: number }, passable: Passable): { x: number; y: number } | null {
  if (from.x < 0 || from.y < 0 || from.x >= w || from.y >= h) return null;
  let best: { x: number; y: number } | null = null;
  let bestD = field[from.y * w + from.x];
  for (const [dx, dy] of DIRS) {
    const nx = from.x + dx, ny = from.y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h || !canStep(passable, from.x, from.y, dx, dy)) continue;
    const d = field[ny * w + nx];
    if (d < bestD) { bestD = d; best = { x: nx, y: ny }; }
  }
  return best;
}

/** How many tiles can be walked to from `start`. Used to make sure props never wall off part of a map. */
export function reachableCount(passable: Passable, w: number, h: number, start: { x: number; y: number }): number {
  const field = buildFlowField(passable, w, h, start);
  let n = 0;
  for (let i = 0; i < field.length; i++) if (field[i] < UNREACHABLE) n++;
  return n;
}
