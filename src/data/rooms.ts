export interface RoomTemplate {
  id: string;
  /**
   * Tiles of 32px. '#' wall, '.' floor, 'o' obstacle, 'P' player entry,
   * 'D' exit door slot (in a wall, floor below), ' ' void (outside the map).
   */
  grid: string[];
}

type Pt = [x: number, y: number];

/**
 * Builds a closed map from a floor shape: every void cell touching the floor becomes a wall,
 * so maps of any shape are always sealed. Doors go in the wall right above the topmost floor
 * of the given columns.
 */
function makeRoom(id: string, w: number, h: number, isFloor: (x: number, y: number) => boolean,
  o: { doors: [number, number, number]; obstacles: Pt[]; player: Pt }): RoomTemplate {
  const g: string[][] = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) =>
    x > 0 && y > 0 && x < w - 1 && y < h - 1 && isFloor(x, y) ? '.' : ' '));
  const floor = (x: number, y: number) => g[y]?.[x] === '.';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (g[y][x] !== ' ') continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (floor(x + dx, y + dy)) g[y][x] = '#';
  }
  for (const [x, y] of o.obstacles) if (floor(x, y)) g[y][x] = 'o';
  g[o.player[1]][o.player[0]] = 'P';
  for (const x of o.doors) {
    const top = g.findIndex(row => row[x] === '.' || row[x] === 'o');
    g[top - 1][x] = 'D';
  }
  return { id, grid: g.map(r => r.join('')) };
}

const rect = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const or = (...fs: ((x: number, y: number) => boolean)[]) => (x: number, y: number) => fs.some(f => f(x, y));
const minus = (a: (x: number, y: number) => boolean, ...b: ((x: number, y: number) => boolean)[]) =>
  (x: number, y: number) => a(x, y) && !b.some(f => f(x, y));

export const ROOM_TEMPLATES: RoomTemplate[] = [
  // Long avenue: cars parked along both sidewalks.
  makeRoom('avenue', 26, 12, rect(1, 1, 24, 10), {
    doors: [5, 13, 21], player: [13, 9],
    obstacles: [[4, 2], [8, 2], [16, 2], [20, 2], [6, 9], [10, 9], [18, 9], [22, 9], [13, 5]],
  }),
  // Crossroad: two streets crossing.
  makeRoom('crossroad', 28, 18, or(rect(1, 6, 26, 11), rect(10, 1, 17, 16)), {
    doors: [11, 13, 16], player: [13, 15],
    obstacles: [[4, 7], [23, 10], [11, 3], [16, 3], [12, 13], [6, 10], [21, 7]],
  }),
  // Back alley: an L that turns a corner.
  makeRoom('alley', 24, 18, or(rect(1, 1, 8, 16), rect(1, 11, 22, 16)), {
    doors: [2, 4, 7], player: [20, 14],
    obstacles: [[3, 4], [6, 7], [2, 10], [12, 12], [16, 15], [19, 12], [7, 15]],
  }),
  // Night market: stalls in rows around two blocks.
  makeRoom('market', 26, 14, minus(rect(1, 1, 24, 12), rect(6, 4, 9, 7), rect(16, 4, 19, 7)), {
    doors: [3, 13, 22], player: [13, 11],
    obstacles: [[3, 5], [12, 4], [13, 7], [22, 5], [5, 10], [21, 10], [12, 2]],
  }),
  // Underground parking: a U around a central concrete core.
  makeRoom('parking', 26, 14, minus(rect(1, 1, 24, 12), rect(9, 1, 16, 6)), {
    doors: [3, 6, 21], player: [13, 11],
    obstacles: [[3, 4], [6, 4], [19, 4], [22, 4], [4, 9], [8, 9], [17, 9], [21, 9]],
  }),
  // Plaza: an oval esplanade.
  makeRoom('plaza', 26, 16, (x, y) => ((x - 12.5) / 11.5) ** 2 + ((y - 7.5) / 6.6) ** 2 <= 1, {
    doors: [9, 12, 16], player: [12, 13],
    obstacles: [[7, 5], [18, 5], [12, 7], [7, 10], [18, 10]],
  }),
  // Docks: a wide quay with a pier going down.
  makeRoom('warehouse', 26, 16, or(rect(1, 1, 24, 6), rect(9, 7, 16, 14)), {
    doors: [4, 12, 21], player: [12, 13],
    obstacles: [[4, 3], [8, 4], [17, 2], [21, 4], [10, 9], [15, 11], [13, 3]],
  }),
];

/** Octagonal checkpoint arena for the bosses. */
export const BOSS_ROOM: RoomTemplate = makeRoom('boss-arena', 24, 16,
  (x, y) => Math.abs(x - 11.5) + Math.abs(y - 7.5) <= 13 && rect(1, 1, 22, 14)(x, y), {
    doors: [7, 11, 16], player: [11, 13],
    obstacles: [[5, 5], [18, 5], [5, 10], [18, 10]],
  });
