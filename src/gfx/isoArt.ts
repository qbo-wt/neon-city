import Phaser from 'phaser';
import { createRng, pick, type Rng } from '../core/rng';
import type { Board, Pt } from '../tactics/types';

/**
 * Isometric street art, all drawn by code: the ground of a board (one texture per sector), the
 * facades behind it, the props standing on blocked cells and the breakable objects.
 * Cells are 32x16 diamonds; every shape is rasterised pixel by pixel so edges stay crisp.
 */
export const TW = 32, TH = 16;
/** Height of the facades drawn behind the back edges. */
const BACK_H = 76;
/** Thickness of the board's front sides. */
const SIDE = 10;

type Ctx = CanvasRenderingContext2D;
const px = (c: Ctx, col: string, x: number, y: number, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };

/** Pixel spans of a 32x16 diamond whose top tip is at (tx, ty); rows 0-14. `inset` shrinks it. */
function diamondRows(tx: number, ty: number, inset = 0): [number, number, number][] {
  const rows: [number, number, number][] = [];
  for (let r = 0; r < 15; r++) {
    const half = r < 8 ? 2 * r + 2 : 30 - 2 * r;
    const h = half - inset * 2;
    if (h > 0 && r >= inset && r < 15 - inset) rows.push([tx - h, ty + r, 2 * h]);
  }
  return rows;
}
function diamond(c: Ctx, col: string, tx: number, ty: number, inset = 0) {
  c.fillStyle = col;
  for (const [x, y, w] of diamondRows(tx, ty, inset)) c.fillRect(x, y, w, 1);
}
/** Is (x, y) inside the diamond with top tip (tx, ty)? */
const inDiamond = (x: number, y: number, tx: number, ty: number) => Math.abs(x + 0.5 - tx) / 16 + Math.abs(y + 0.5 - (ty + 7.5)) / 7.5 <= 1;

/** Crisp polygon fill (pixel centres). */
function poly(c: Ctx, col: string, pts: [number, number][]) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  c.fillStyle = col;
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      let inside = false;
      const qx = x + 0.5, qy = y + 0.5;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > qy) !== (yj > qy) && qx < ((xj - xi) * (qy - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) c.fillRect(x, y, 1, 1);
    }
  }
}

/** An isometric box: footprint centred at (cx, cy) with half sizes hw x hh, height h. */
function box(c: Ctx, cx: number, cy: number, hw: number, hh: number, h: number, top: string, left: string, right: string, edge = '#05030f') {
  const L: [number, number] = [cx - hw, cy], B: [number, number] = [cx, cy + hh], R: [number, number] = [cx + hw, cy], T: [number, number] = [cx, cy - hh];
  const up = (p: [number, number]): [number, number] => [p[0], p[1] - h];
  poly(c, edge, [[L[0] - 1, L[1] - h], [T[0], T[1] - h - 1], [R[0] + 1, R[1] - h], [R[0] + 1, R[1]], [B[0], B[1] + 1], [L[0] - 1, L[1]]]);
  poly(c, left, [up(L), up(B), B, L]);
  poly(c, right, [up(B), up(R), R, B]);
  poly(c, top, [up(L), up(T), up(R), up(B)]);
}

// ---------------------------------------------------------------------------------------------
// Board ground

export interface BoardArt { key: string; width: number; height: number; /** texture position of cell (0,0)'s top tip */ ox: number; oy: number }

interface Pal { base: string[]; line: string; detail: string; side: string; sideDark: string; trim: string }
const PALS: Record<string, Pal> = {
  avenue: { base: ['#15102b', '#17122f', '#140f29'], line: '#f5e663', detail: '#221a40', side: '#1c1636', sideDark: '#0e0a1f', trim: '#00f0ff' },
  alley: { base: ['#18132a', '#1a142d', '#161127'], line: '#3a3058', detail: '#241c3a', side: '#1a1430', sideDark: '#0d0a1c', trim: '#ff2a6d' },
  market: { base: ['#211a36', '#1d1731', '#241c3a'], line: '#ff8c2a', detail: '#2c2348', side: '#211a3a', sideDark: '#100b22', trim: '#ff8c2a' },
  crossroad: { base: ['#15102b', '#17122f', '#140f29'], line: '#e8e8ff', detail: '#221a40', side: '#1c1636', sideDark: '#0e0a1f', trim: '#00f0ff' },
  parking: { base: ['#1d1b2e', '#1b192b', '#201d33'], line: '#e8e8ff', detail: '#28253d', side: '#1e1b33', sideDark: '#0f0d1e', trim: '#f5e663' },
  plaza: { base: ['#251e3c', '#221b37', '#282041'], line: '#00f0ff', detail: '#30274d', side: '#241d3d', sideDark: '#120d24', trim: '#00f0ff' },
  docks: { base: ['#1a2032', '#1c2236', '#181d2e'], line: '#f5e663', detail: '#26304a', side: '#1a2034', sideDark: '#0c1020', trim: '#f5e663' },
  checkpoint: { base: ['#1d1a2a', '#1f1c2d', '#1b1827'], line: '#ff3b3b', detail: '#2a2640', side: '#1e1a2e', sideDark: '#0e0c1a', trim: '#ff2a6d' },
};

const SIGNS = ['RAMEN', 'BAR', 'HÔTEL', '24/7', 'CLUB', 'PHARMA', 'ARCADE', 'SUSHI', 'MOTEL', 'KARAOKÉ', 'NOODLES', 'TATOUAGE'];
const NEON = ['#00f0ff', '#ff2a6d', '#f5e663', '#39ff88', '#b84dff', '#ff8c2a'];

export function boardArt(b: Board): Omit<BoardArt, 'key'> {
  return { width: (b.w + b.h) * 16 + 8, height: BACK_H + (b.w + b.h) * 8 + SIDE + 8, ox: b.h * 16 + 4, oy: BACK_H + 2 };
}

/** Paints a board's ground, sides and back facades into texture `key` (replaced if it exists). */
export function paintBoard(scene: Phaser.Scene, key: string, b: Board, seed: number): BoardArt {
  const art = { key, ...boardArt(b) };
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, art.width, art.height)!;
  const c = tex.getContext();
  const rng = createRng(seed);
  const pal = PALS[b.style] ?? PALS.avenue;
  const cell = (x: number, y: number) => (x < 0 || y < 0 || x >= b.w || y >= b.h ? 'void' : b.cells[y * b.w + x]);
  const top = (x: number, y: number): Pt => ({ x: art.ox + (x - y) * 16, y: art.oy + (x + y) * 8 });

  drawFacades(c, b, art, rng, cell, top);

  // Front sides of the slab: wherever the cell in front is off the board.
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    if (cell(x, y) === 'void') continue;
    const t = top(x, y);
    if (cell(x, y + 1) === 'void') {
      poly(c, pal.side, [[t.x - 16, t.y + 7.5], [t.x, t.y + 15], [t.x, t.y + 15 + SIDE], [t.x - 16, t.y + 7.5 + SIDE]]);
      for (let i = 0; i < 16; i += 4) px(c, pal.sideDark, t.x - 16 + i, t.y + 8 + i / 2 + 3, 2, SIDE - 4);
      px(c, pal.trim + '88', t.x - 16, t.y + 7 + SIDE, 16, 1);
    }
    if (cell(x + 1, y) === 'void') {
      poly(c, pal.sideDark, [[t.x, t.y + 15], [t.x + 16, t.y + 7.5], [t.x + 16, t.y + 7.5 + SIDE], [t.x, t.y + 15 + SIDE]]);
      px(c, pal.trim + '55', t.x, t.y + 14 + SIDE, 16, 1);
    }
  }

  // Ground cells.
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const k = cell(x, y);
    if (k === 'void') continue;
    const t = top(x, y);
    diamond(c, pick(rng, pal.base), t.x, t.y);
    groundDetail(c, b, x, y, t, pal, rng);
    if (k === 'hole') holeArt(c, b.props[y * b.w + x], t, rng);
    // Faint cell outline: the tactical grid.
    for (const [rx, ry, w] of diamondRows(t.x, t.y)) {
      c.fillStyle = 'rgba(160,150,255,0.07)';
      c.fillRect(rx, ry, 1, 1); c.fillRect(rx + w - 1, ry, 1, 1);
    }
  }
  tex.refresh();
  return art;
}

/** Style-specific marks on one floor cell. */
function groundDetail(c: Ctx, b: Board, x: number, y: number, t: Pt, pal: Pal, rng: Rng) {
  const s = b.style;
  const speck = (col: string, n: number) => { for (let i = 0; i < n; i++) { const qx = t.x - 12 + Math.floor(rng() * 24), qy = t.y + 3 + Math.floor(rng() * 9); if (inDiamond(qx, qy, t.x, t.y)) px(c, col, qx, qy); } };
  speck(pal.detail, 5);
  if (s === 'avenue' || s === 'crossroad') {
    // Sidewalks along the long edges, a dashed lane line in the middle.
    if (y === 0 || y === b.h - 1) { diamond(c, '#241d40', t.x, t.y, 1); px(c, '#30285a', t.x - 1, t.y + 3, 2, 1); }
    if (s === 'avenue' && y === Math.floor(b.h / 2) && x % 2 === 0) for (let i = 0; i < 6; i++) px(c, pal.line, t.x - 6 + i * 2, t.y + 4 + i, 2, 1);
    if (s === 'crossroad' && (x === 5 || x === 7) && y > 2 && y < 10) for (let i = 0; i < 4; i++) px(c, '#c8c8e0', t.x - 10 + i * 5, t.y + 6 - i * 2 + 1, 3, 2);
  }
  if (s === 'parking' && x % 4 === 1) for (let i = 0; i < 7; i++) px(c, '#8a88a8', t.x - 14 + i * 2, t.y + 7 - i, 1, 1);
  if (s === 'market' && (x + y) % 2 === 0) diamond(c, '#271f42', t.x, t.y, 2);
  if (s === 'plaza' && (x + y) % 3 === 0) diamond(c, '#2d2548', t.x, t.y, 3);
  if (s === 'docks') { px(c, '#34405e', t.x - 8, t.y + 7); px(c, '#34405e', t.x + 7, t.y + 7); if (y === b.h - 2) for (let i = 0; i < 8; i++) px(c, i % 2 ? '#05030f' : pal.line, t.x - 8 + i * 2, t.y + 10 - i / 2, 2, 1); }
  if (s === 'checkpoint' && Math.abs(x - 6) + Math.abs(y - 6) === 4) for (let i = 0; i < 6; i++) px(c, i % 2 ? '#f5e663' : '#05030f', t.x - 6 + i * 2, t.y + 7, 2, 2);
  // Neon puddles reflecting the signs.
  if (rng() < 0.09) {
    const col = pick(rng, NEON);
    for (const [rx, ry, w] of diamondRows(t.x, t.y, 4)) { c.fillStyle = '#0d1430'; c.fillRect(rx, ry, w, 1); }
    px(c, col + '66', t.x - 4, t.y + 6, 6, 1); px(c, col + '33', t.x - 1, t.y + 8, 5, 1);
  }
  if (rng() < 0.05) for (let i = 0; i < 5; i++) px(c, '#0b0820', t.x - 6 + i * 3, t.y + 5 + ((i * 7) % 5), 2, 1); // cracks
}

function holeArt(c: Ctx, prop: string | undefined, t: Pt, rng: Rng) {
  if (prop === 'water') {
    diamond(c, '#06142a', t.x, t.y);
    for (let i = 0; i < 3; i++) px(c, pick(rng, ['#00f0ff55', '#ff2a6d44', '#1d3a6a']), t.x - 8 + Math.floor(rng() * 14), t.y + 4 + Math.floor(rng() * 7), 4, 1);
  } else if (prop === 'fountain') {
    diamond(c, '#3a3058', t.x, t.y, 1); diamond(c, '#0a2a4a', t.x, t.y, 3);
    px(c, '#00f0ff', t.x - 3, t.y + 6, 6, 1); px(c, '#e8e8ff', t.x - 1, t.y + 5, 2, 1);
  } else if (prop === 'grate') {
    diamond(c, '#05030f', t.x, t.y, 2);
    for (let i = -8; i <= 8; i += 4) px(c, '#3a3058', t.x + i, t.y + 4, 1, 7);
    px(c, '#39ff8844', t.x - 6, t.y + 7, 12, 1);
  } else {
    diamond(c, '#2a2445', t.x, t.y, 2); diamond(c, '#05030f', t.x, t.y, 4);
    px(c, '#ff8c2a55', t.x - 3, t.y + 7, 6, 1);
  }
}

/** Facades on the back edges, where nothing on the board stands in front of them. */
function drawFacades(c: Ctx, b: Board, art: Omit<BoardArt, 'key'>, rng: Rng, cell: (x: number, y: number) => string, top: (x: number, y: number) => Pt) {
  type Seg = { a: Pt; z: Pt; sum: number; side: 'l' | 'r' };
  const segs: Seg[] = [];
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    if (cell(x, y) === 'void') continue;
    const t = top(x, y);
    if (cell(x, y - 1) === 'void') segs.push({ a: t, z: { x: t.x + 16, y: t.y + 7.5 }, sum: x + y, side: 'r' });
    if (cell(x - 1, y) === 'void') segs.push({ a: { x: t.x - 16, y: t.y + 7.5 }, z: t, sum: x + y, side: 'l' });
  }
  // A facade would hide any floor cell drawn under it on screen: those edges get a low fence instead.
  const floorCentres: { p: Pt; sum: number }[] = [];
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (cell(x, y) !== 'void') { const t = top(x, y); floorCentres.push({ p: { x: t.x, y: t.y + 7 }, sum: x + y }); }
  const blocked = (s: Seg) => floorCentres.some(f => f.sum < s.sum && f.p.x > Math.min(s.a.x, s.z.x) - 10 && f.p.x < Math.max(s.a.x, s.z.x) + 10 && f.p.y > Math.min(s.a.y, s.z.y) - BACK_H);
  segs.sort((p, q) => p.sum - q.sum);
  let sign = 0;
  for (const s of segs) {
    const tall = !blocked(s);
    const h = tall ? BACK_H - 6 - Math.floor(rng() * 14) : 10;
    const face = s.side === 'l' ? '#1a1430' : '#140f28';
    poly(c, face, [[s.a.x, s.a.y - h], [s.z.x, s.z.y - h], [s.z.x, s.z.y], [s.a.x, s.a.y]]);
    const slope = (s.z.y - s.a.y) / 16;
    if (!tall) {
      for (let i = 0; i < 16; i += 3) px(c, '#3a3058', s.a.x + i, s.a.y - h + i * slope, 1, h);
      px(c, '#ff2a6d88', s.a.x, s.a.y - h, 16, 1);
      continue;
    }
    // Windows in rows, some lit, some flickering neon.
    for (let wy = 8; wy < h - 10; wy += 9) for (let wx = 2; wx < 14; wx += 6) {
      const r = rng();
      const col = r < 0.22 ? '#f5e663' : r < 0.3 ? '#ff2a6d' : r < 0.36 ? '#00f0ff' : '#0b0820';
      px(c, col, s.a.x + wx, s.a.y - h + wy + wx * slope, 3, 4);
    }
    // Shop front at street level: a lit doorway or a shutter.
    const shop = rng();
    px(c, shop < 0.5 ? '#2a2245' : '#05030f', s.a.x + 3, s.a.y - 12 + 3 * slope, 10, 10);
    if (shop < 0.5) px(c, pick(rng, NEON) + '99', s.a.x + 3, s.a.y - 12 + 3 * slope, 10, 1);
    // A neon sign every few segments.
    if (++sign % 3 === 0) {
      const col = pick(rng, NEON), word = pick(rng, SIGNS);
      px(c, '#05030f', s.a.x + 1, s.a.y - h + 3 + slope, 14, 7);
      for (let i = 0; i < Math.min(5, word.length); i++) px(c, col, s.a.x + 2 + i * 3, s.a.y - h + 5 + slope + (i % 2), 2, 3);
      px(c, col + '55', s.a.x, s.a.y - h + 2 + slope, 16, 1);
    }
    px(c, '#241c40', s.a.x, s.a.y - h, 16, 2); // roof line
  }
}

/** Distant skyline behind everything. */
export function paintSkyline(scene: Phaser.Scene, key: string, w: number, h: number, seed: number) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const c = tex.getContext(), rng = createRng(seed);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#05030f'); g.addColorStop(0.6, '#130a2a'); g.addColorStop(1, '#2a0f3a');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  for (let layer = 0; layer < 2; layer++) {
    let x = 0;
    while (x < w) {
      const bw = 14 + Math.floor(rng() * 26), bh = (layer ? 50 : 80) + Math.floor(rng() * (layer ? 60 : 90));
      px(c, layer ? '#0d0820' : '#0a0618', x, h - bh, bw, bh);
      for (let wy = h - bh + 4; wy < h - 4; wy += 6) for (let wx = x + 2; wx < x + bw - 2; wx += 4) if (rng() < 0.12) px(c, pick(rng, ['#f5e66388', '#ff2a6d66', '#00f0ff66']), wx, wy, 2, 2);
      x += bw + Math.floor(rng() * 4);
    }
  }
  tex.refresh();
}

// ---------------------------------------------------------------------------------------------
// Props and breakables: each is a texture anchored at its bottom centre (put it at the cell's
// bottom tip). Footprints are drawn on a 32 px wide canvas.

const PROP_H = 72;
function propTex(scene: Phaser.Scene, key: string, draw: (c: Ctx, cx: number, cy: number) => void, h = PROP_H) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, 34, h)!;
  const c = tex.getContext();
  draw(c, 17, h - 8);
  tex.refresh();
}

export function generateIsoArt(scene: Phaser.Scene) {
  const car = (body: string, dark: string, light: string) => (c: Ctx, cx: number, cy: number) => {
    box(c, cx, cy, 14, 7, 7, light, body, dark);
    box(c, cx + 1, cy - 1, 8, 4, 6, '#0d1a2a', '#16304a', '#0d1a2a');
    px(c, '#3a5a7a', cx - 4, cy - 15, 4, 1);
    px(c, '#f5e663', cx + 11, cy - 6, 2, 2); px(c, '#ff3b3b', cx - 13, cy - 5, 2, 1);
    px(c, '#05030f', cx - 9, cy + 1, 3, 2); px(c, '#05030f', cx + 6, cy + 3, 3, 2);
  };
  propTex(scene, 'iso-car-0', car('#3a3058', '#2a2245', '#4a4070'));
  propTex(scene, 'iso-car-1', car('#8a1038', '#5a0a24', '#a8204a'));
  propTex(scene, 'iso-car-2', car('#a89a2a', '#6a6018', '#c8b840'));
  propTex(scene, 'iso-crate', (c, cx, cy) => {
    box(c, cx, cy, 11, 5.5, 13, '#a8845a', '#8a6a4a', '#6a4e36');
    px(c, '#5a4030', cx - 11, cy - 10, 11, 1); px(c, '#4a3424', cx, cy - 5, 11, 1);
    px(c, '#f5e663', cx - 9, cy - 4, 7, 1);
  });
  propTex(scene, 'iso-barrel', (c, cx, cy) => {
    box(c, cx, cy, 7, 3.5, 15, '#4ac86a', '#39a85a', '#1d6a3a');
    px(c, '#1d6a3a', cx - 7, cy - 11, 7, 1); px(c, '#0e4a2a', cx, cy - 11, 7, 1);
    px(c, '#f5e663', cx - 5, cy - 8, 3, 3);
  });
  propTex(scene, 'iso-dumpster', (c, cx, cy) => {
    box(c, cx, cy, 14, 7, 12, '#2a6a4a', '#1d5a3a', '#123e28');
    px(c, '#0b2a1a', cx - 13, cy - 13, 13, 1);
    px(c, '#f5e663', cx + 3, cy - 7, 6, 1);
  });
  propTex(scene, 'iso-pillar', (c, cx, cy) => {
    box(c, cx, cy, 8, 4, 40, '#5a5878', '#44425e', '#302e48');
    for (let y = 12; y < 38; y += 13) { px(c, '#f5e663', cx - 8, cy - y, 8, 2); px(c, '#05030f', cx - 6, cy - y, 2, 2); px(c, '#05030f', cx - 2, cy - y, 2, 2); }
    px(c, '#00f0ff', cx + 2, cy - 26, 4, 6);
  });
  propTex(scene, 'iso-stall', (c, cx, cy) => {
    box(c, cx, cy, 13, 6.5, 10, '#6a4a3a', '#5a3a2a', '#3a2418');
    box(c, cx, cy - 18, 15, 7.5, 3, '#ff2a6d', '#c01848', '#8a1038');
    px(c, '#3a2418', cx - 12, cy - 18, 1, 9); px(c, '#3a2418', cx + 12, cy - 18, 1, 9);
    for (let i = 0; i < 4; i++) px(c, pick(createRng(i + 5), ['#f5e663', '#39ff88', '#ff8c2a']), cx - 9 + i * 5, cy - 13 + (i % 2), 3, 2);
  });
  propTex(scene, 'iso-container', (c, cx, cy) => {
    box(c, cx, cy, 15, 7.5, 24, '#2a6aa8', '#1d5a8a', '#123e60');
    for (let i = 1; i < 15; i += 3) { px(c, '#123e60', cx - 15 + i, cy - 22 + i / 2, 1, 20); px(c, '#0a2840', cx + i, cy - 22 + (15 - i) / 2 + 1, 1, 20); }
    px(c, '#e8e8ff', cx - 11, cy - 15, 6, 2);
  });
  propTex(scene, 'iso-barrier', (c, cx, cy) => {
    box(c, cx, cy, 13, 6.5, 7, '#c8c8e0', '#a8a8c8', '#7a7a98');
    for (let i = 0; i < 13; i += 5) { px(c, '#ff3b3b', cx - 13 + i, cy - 8 + i / 2, 3, 6); px(c, '#c01818', cx + i, cy - 1 - i / 2, 3, 6); }
  });
  propTex(scene, 'iso-planter', (c, cx, cy) => {
    box(c, cx, cy, 12, 6, 7, '#3a3058', '#2a2245', '#1d1838');
    for (let i = 0; i < 9; i++) px(c, pick(createRng(i), ['#39a85a', '#1d6a3a', '#4ac86a']), cx - 9 + i * 2, cy - 12 - (i % 3) * 2, 2, 4);
    px(c, '#ff2a6d', cx - 1, cy - 17, 2, 2);
  });
  propTex(scene, 'iso-vending', (c, cx, cy) => {
    box(c, cx, cy, 9, 4.5, 26, '#ff8c2a', '#d86a18', '#8a3e08');
    poly(c, '#05030f', [[cx - 8, cy - 22], [cx - 1, cy - 19], [cx - 1, cy - 6], [cx - 8, cy - 9]]);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 2; x++) px(c, (x + y) % 2 ? '#39ff88' : '#00f0ff', cx - 7 + x * 3, cy - 19 + y * 4 + x, 2, 2);
  });
  propTex(scene, 'iso-lamp', (c, cx, cy) => {
    box(c, cx, cy, 4, 2, 4, '#3a3058', '#2a2245', '#1d1838');
    px(c, '#2a2245', cx - 1, cy - 50, 2, 47);
    px(c, '#3a3058', cx - 1, cy - 50, 9, 2);
    px(c, '#f5e663', cx + 4, cy - 48, 4, 2);
  });
  propTex(scene, 'iso-totem', (c, cx, cy) => {
    box(c, cx, cy, 10, 5, 8, '#3a3058', '#2a2245', '#1d1838');
    box(c, cx, cy - 8, 5, 2.5, 44, '#00f0ff', '#0a6a7a', '#064a58');
    for (let y = 14; y < 50; y += 6) px(c, '#e8e8ff', cx - 4, cy - y, 3, 1);
    px(c, '#ff2a6d', cx - 6, cy - 54, 12, 2);
  });
  propTex(scene, 'iso-generator', (c, cx, cy) => {
    box(c, cx, cy, 12, 6, 13, '#5a5878', '#44425e', '#302e48');
    for (let i = 0; i < 11; i += 4) px(c, '#f5e663', cx - 11 + i, cy - 7 + i / 2, 2, 4);
    px(c, '#39ff88', cx + 4, cy - 10, 3, 2);
  });
  // The player's turret: a tripod and a gun head.
  propTex(scene, 'iso-turret', (c, cx, cy) => {
    px(c, '#3a3058', cx - 6, cy - 4, 1, 4); px(c, '#3a3058', cx + 5, cy - 4, 1, 4); px(c, '#3a3058', cx, cy - 2, 1, 3);
    box(c, cx, cy - 4, 5, 2.5, 6, '#5a5878', '#44425e', '#302e48');
    px(c, '#05030f', cx + 2, cy - 12, 8, 2); px(c, '#00f0ff', cx - 2, cy - 11, 2, 2);
  }, 40);
  // Breakables (units with HP): same anchor rule.
  propTex(scene, 'iso-br-crate', (c, cx, cy) => {
    box(c, cx, cy, 9, 4.5, 11, '#c8a06a', '#a8845a', '#7a5a3a');
    px(c, '#5a4030', cx - 9, cy - 7, 9, 1); px(c, '#f5e663', cx - 7, cy - 4, 5, 1); px(c, '#f5e663', cx + 2, cy - 4, 5, 1);
  });
  propTex(scene, 'iso-br-barrel', (c, cx, cy) => {
    box(c, cx, cy, 6, 3, 14, '#5ad87a', '#39a85a', '#1d6a3a');
    px(c, '#f5e663', cx - 4, cy - 9, 3, 3); px(c, '#05030f', cx - 3, cy - 8, 1, 1);
  });
  propTex(scene, 'iso-br-trash', (c, cx, cy) => {
    box(c, cx, cy, 6, 3, 9, '#7a9aba', '#5a7a9a', '#3a5a7a');
    px(c, '#e8e8ff', cx - 4, cy - 5, 3, 1);
  });
  propTex(scene, 'iso-br-vending', (c, cx, cy) => {
    box(c, cx, cy, 9, 4.5, 24, '#ffa84a', '#ff8c2a', '#a85a10');
    poly(c, '#05030f', [[cx - 8, cy - 20], [cx - 1, cy - 17], [cx - 1, cy - 6], [cx - 8, cy - 9]]);
    px(c, '#39ff88', cx - 6, cy - 16, 2, 2); px(c, '#00f0ff', cx - 4, cy - 12, 2, 2);
  });

  // Tactical markers.
  const mark = (key: string, fill: string, edge: string) => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, 32, 16)!;
    const c = tex.getContext();
    diamond(c, edge, 16, 0); diamond(c, fill, 16, 0, 1);
    tex.refresh();
  };
  mark('iso-start-player', '#00f0ff44', '#00f0ffcc');
  mark('iso-start-enemy', '#ff2a6d33', '#ff2a6daa');
  mark('iso-exit', '#39ff8844', '#39ff88cc');

  // Relics (shown when found).
  const tex = (key: string, w: number, h: number, draw: (c: Ctx) => void) => {
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, w, h)!; draw(t.getContext()); t.refresh();
  };
  tex('relic-katana', 26, 26, c => {
    for (let i = 0; i < 20; i++) { px(c, '#e8e8ff', 4 + i, 21 - i, 2, 2); px(c, '#ff2a6d', 5 + i, 22 - i, 1, 1); }
    px(c, '#f5e663', 3, 19, 5, 5); px(c, '#05030f', 4, 20, 3, 3); px(c, '#8a1038', 0, 23, 4, 3);
  });
  tex('relic-pistols', 26, 18, c => {
    const gun = (x: number, y: number) => { px(c, '#05030f', x, y, 12, 6); px(c, '#f5e663', x + 1, y + 1, 10, 3); px(c, '#a89a2a', x + 2, y + 4, 3, 5); px(c, '#05030f', x + 2, y + 8, 3, 1); };
    gun(1, 2); gun(13, 6);
  });
}

/** Screen position of a cell's centre, given the board art placed at (bx, by). */
export const cellCentre = (art: Omit<BoardArt, 'key'>, bx: number, by: number, p: Pt): Pt => ({ x: bx + art.ox + (p.x - p.y) * 16, y: by + art.oy + (p.x + p.y) * 8 + 7.5 });

/** Cell under a screen point (may be off the board). */
export function cellFromScreen(art: Omit<BoardArt, 'key'>, bx: number, by: number, sx: number, sy: number): Pt {
  const u = (sx - bx - art.ox) / 16, v = (sy - by - art.oy - 7.5) / 8;
  return { x: Math.round((u + v) / 2), y: Math.round((v - u) / 2) };
}
