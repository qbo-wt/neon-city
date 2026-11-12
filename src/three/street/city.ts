import * as THREE from 'three';
import { pick, type Rng } from '../../core/rng';
import type { Board } from '../../tactics/types';
import type { KitLibrary } from './kit';
import { fitObject } from './kit';
import type { StreetLife } from './life';
import { bladeTexture, corrugated, css, facadeTexture, glowTexture, holoTexture, shade, signTexture, stripeTexture, tickerTexture, type FacadeLayout, type SignLook } from './paint';
import { REFLECT_LAYER } from './reflect';
import type { Theme } from './styles';

/**
 * The city around a board. Every cell off the board gets a height limit: how tall something
 * standing there may be without hiding any board cell from the (fixed-angle) camera. Buildings are
 * then packed into the cells behind the board, as tall as that limit allows; low ground in front
 * gets low things only. Near buildings are custom, fully dressed facades (shops, signs, windows,
 * awnings, AC units, fire escapes); farther ones are Kenney blocks with lit windows, in the fog.
 */

/** Camera slope: height gained per metre travelled along (1, 0, 1) toward the camera (32 deg). */
export const CAM_SLOPE = Math.SQRT2 * Math.tan(THREE.MathUtils.degToRad(32));
export const RANGE = 11;

export interface Lot { x0: number; y0: number; x1: number; y1: number; h: number; dist: number; streetX: boolean; streetZ: boolean }

export interface CityPlan {
  lots: Lot[];
  /** height limit of an off-board cell (metres) */
  allowed(x: number, y: number): number;
  /** Chebyshev distance to the board (0 on it) */
  dist(x: number, y: number): number;
  occupied(x: number, y: number): boolean;
  on(x: number, y: number): boolean;
  /** behind the board (buildings may stand there) */
  back(x: number, y: number): boolean;
}

export function planCity(b: Board, rng: Rng, theme: Theme, CELL: number): CityPlan {
  const E = RANGE;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < b.w && y < b.h && b.cells[y * b.w + x] !== 'void';
  const W = b.w + 2 * E, H = b.h + 2 * E;
  const idx = (x: number, y: number) => (y + E) * W + (x + E);
  const inRange = (x: number, y: number) => x >= -E && y >= -E && x < b.w + E && y < b.h + E;
  // Samples on the board: cell centres and their left/right screen corners, on the ground.
  const samples: [number, number][] = [];
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (on(x, y)) {
    const cx = (x + 0.5) * CELL, cz = (y + 0.5) * CELL, o = 0.42 * CELL;
    samples.push([cx, cz], [cx + o, cz - o], [cx - o, cz + o]);
  }
  const allowed = new Float32Array(W * H).fill(999);
  const dist = new Int16Array(W * H).fill(99);
  for (let y = -E; y < b.h + E; y++) for (let x = -E; x < b.w + E; x++) {
    if (on(x, y)) { allowed[idx(x, y)] = 0; dist[idx(x, y)] = 0; continue; }
    const x0 = x * CELL, x1 = x0 + CELL, z0 = y * CELL, z1 = z0 + CELL;
    let lim = 999;
    for (const [px, pz] of samples) {
      // Ray (px + t, s t, pz + t): where does it enter this cell's column?
      const tin = Math.max(x0 - px, z0 - pz), tout = Math.min(x1 - px, z1 - pz);
      if (tout <= 0 || tin >= tout) continue;
      lim = Math.min(lim, CAM_SLOPE * Math.max(0, tin));
    }
    allowed[idx(x, y)] = lim;
    let d = 99;
    for (let r = 1; r <= 6 && d === 99; r++) for (let dy = -r; dy <= r && d === 99; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && on(x + dx, y + dy)) { d = r; break; }
    dist[idx(x, y)] = d;
  }
  const A = (x: number, y: number) => (inRange(x, y) ? allowed[idx(x, y)] : 0);
  const D = (x: number, y: number) => (inRange(x, y) ? dist[idx(x, y)] : 99);
  const occ = new Uint8Array(W * H);
  const minH = theme.facade === 'parking' ? 4 : 6;
  // Buildings only behind the board: no board cell may lie behind-left of them (x' <= x, y' <= y), and
  // never past its front edges (they would wall off the bottom of the screen).
  const back = new Uint8Array(W * H);
  for (let y = -E; y < b.h + E; y++) for (let x = -E; x < b.w + E; x++) {
    let dominated = false;
    for (let j = 0; j < b.h && !dominated; j++) for (let i = 0; i < b.w; i++) if (i <= x && j <= y && on(i, j)) { dominated = true; break; }
    back[idx(x, y)] = !dominated && x <= b.w && y <= b.h ? 1 : 0;
  }
  const free = (x: number, y: number) => inRange(x, y) && !on(x, y) && !occ[idx(x, y)] && back[idx(x, y)] === 1 && A(x, y) >= minH;

  // Seeds: near cells first (the frontage), then outward.
  const cells: [number, number, number][] = [];
  for (let y = -E; y < b.h + E; y++) for (let x = -E; x < b.w + E; x++) if (free(x, y)) cells.push([x, y, D(x, y) + rng() * 0.5]);
  cells.sort((a, c) => a[2] - c[2]);
  const lots: Lot[] = [];
  for (const [x, y] of cells) {
    if (!free(x, y)) continue;
    const d = D(x, y);
    const wantA = d <= 2 ? 2 + Math.floor(rng() * 3) : 3 + Math.floor(rng() * 3);
    const wantB = d <= 2 ? 3 + Math.floor(rng() * 3) : 3 + Math.floor(rng() * 3);
    let best: Lot | undefined, bestArea = 0;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (const [a, c] of [[wantA, wantB], [wantB, wantA]]) {
      // Grow a rect from (x, y) toward (sx, sy), shrinking until every cell is free.
      let w = a, h = c;
      const ok = (w: number, h: number) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!free(x + i * sx, y + j * sy)) return false; return true; };
      while (w > 0 && h > 0 && !ok(w, h)) { if (w >= h) w--; else h--; }
      if (w * h > bestArea) {
        bestArea = w * h;
        const xa = Math.min(x, x + (w - 1) * sx), ya = Math.min(y, y + (h - 1) * sy);
        best = { x0: xa, y0: ya, x1: xa + w, y1: ya + h, h: 0, dist: d, streetX: false, streetZ: false };
      }
    }
    if (!best) continue;
    let lim = 999;
    for (let j = best.y0; j < best.y1; j++) for (let i = best.x0; i < best.x1; i++) { occ[idx(i, j)] = 1; lim = Math.min(lim, A(i, j)); }
    const [lo, hi] = theme.height;
    const target = theme.facade === 'parking' ? lo : d <= 2 ? lo + rng() * (hi - lo) : hi + (d - 2) * (2 + rng() * 3) + rng() * 8;
    best.h = Math.max(minH, Math.min(lim - 0.2, target));
    if (best.h - Math.floor(best.h / 3) * 3 < 0.8) best.h = Math.floor(best.h / 3) * 3 + 0.8;
    best.h = Math.min(best.h, lim - 0.05);
    for (let j = best.y0; j < best.y1; j++) if (on(best.x1, j)) best.streetX = true;
    for (let i = best.x0; i < best.x1; i++) if (on(i, best.y1)) best.streetZ = true;
    lots.push(best);
  }
  return { lots, allowed: A, dist: D, occupied: (x, y) => inRange(x, y) && occ[idx(x, y)] === 1, on, back: (x, y) => inRange(x, y) && back[idx(x, y)] === 1 };
}

/** What the builders share. */
export interface StreetCtx {
  group: THREE.Group;
  theme: Theme;
  rng: Rng;
  kit: KitLibrary;
  life: StreetLife;
  CELL: number;
  /** candidate coloured lights (strongest become real point lights) */
  glows: { p: THREE.Vector3; color: number; power: number }[];
  /** ground light pools (additive decals) */
  pools: { x: number; z: number; r: number; color: number; a: number }[];
}

/** Puts an object in both the main view and the wet-ground reflection. */
export const reflective = (o: THREE.Object3D) => { o.traverse(c => c.layers.enable(REFLECT_LAYER)); return o; };

/** A face of a lot in local coordinates: x along the face (left to right seen from outside), y up, z outward. */
function faceFrame(lot: Lot, face: 'x' | 'z', CELL: number) {
  const f = new THREE.Group();
  if (face === 'z') f.position.set(lot.x0 * CELL, 0, lot.y1 * CELL);
  else { f.position.set(lot.x1 * CELL, 0, lot.y1 * CELL); f.rotation.y = Math.PI / 2; }
  return f;
}

const basic = (map: THREE.Texture | null, color = 0xffffff, k = 1, opts: THREE.MeshBasicMaterialParameters = {}) => {
  const m = new THREE.MeshBasicMaterial({ map, color, toneMapped: false, ...opts });
  m.color.multiplyScalar(k);
  return m;
};

const mats = new Map<string, THREE.MeshStandardMaterial>();
/** Shared plain materials (lit, cel-shaded). */
export function plain(color: number, key = '') {
  const k = `${color}:${key}`;
  let m = mats.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 1 }); m.userData.keepColor = true; mats.set(k, m); }
  return m;
}

function box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** A neon sign board: a dark box with the drawn face; it glows and lights its surroundings. */
export function signBoard(ctx: StreetCtx, word: string, color: number, look: SignLook, w: number, h: number, sub?: string) {
  const g = new THREE.Group();
  const face = basic(signTexture(word, color, look, sub), 0xffffff, look === 'box' ? 1.15 : 1.55);
  const body = box(w + 0.08, h + 0.08, 0.16, plain(0x15102a));
  body.position.z = 0.08;
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), face);
  front.position.z = 0.165;
  g.add(body, front);
  if (ctx.rng() < 0.25) ctx.life.flicker(face, 0.6 + ctx.rng());
  reflective(g);
  return g;
}

/** A vertical sign sticking out of a wall (both sides drawn). */
function bladeSign(ctx: StreetCtx, word: string, color: number, look: 'tube' | 'box', height: number) {
  const { texture, aspect } = bladeTexture(word, color, look);
  const w = Math.max(0.7, height * aspect);
  const g = new THREE.Group();
  const mat = basic(texture, 0xffffff, look === 'box' ? 1.1 : 1.6);
  const body = box(0.14, height + 0.1, w + 0.1, plain(0x15102a));
  const a = new THREE.Mesh(new THREE.PlaneGeometry(w, height), mat);
  a.rotation.y = Math.PI / 2; a.position.x = 0.075;
  const b2 = new THREE.Mesh(new THREE.PlaneGeometry(w, height), mat);
  b2.rotation.y = -Math.PI / 2; b2.position.x = -0.075;
  // Brackets to the wall.
  const br = plain(0x2a2440);
  g.add(body, a, b2, box(0.06, 0.06, 0.5, br, 0, height / 2 - 0.2, -w / 2 - 0.25), box(0.06, 0.06, 0.5, br, 0, -height / 2 + 0.2, -w / 2 - 0.25));
  if (ctx.rng() < 0.3) ctx.life.flicker(mat, 0.5 + ctx.rng());
  reflective(g);
  return { g, w };
}

/** An awning over a shop: a slanted striped sheet on two arms. */
function awning(ctx: StreetCtx, w: number, color: number) {
  const g = new THREE.Group();
  const t = stripeTexture(color, shade(color, 0.55), 8);
  t.repeat.set(w / 1.2, 1);
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 1.25), [plain(shade(color, 0.5)), plain(shade(color, 0.5)), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }), plain(shade(color, 0.35)), plain(shade(color, 0.5)), plain(shade(color, 0.5))]);
  sheet.rotation.x = 0.38;
  sheet.position.set(0, 0, 0.6);
  sheet.castShadow = true;
  // Valance: a short hanging band at the front.
  const val = box(w, 0.28, 0.04, new THREE.MeshStandardMaterial({ map: t, roughness: 1 }), 0, -0.34, 1.18);
  g.add(sheet, val);
  void ctx;
  return g;
}

/** A window air-conditioner: box, grille, a fan that turns. */
let acMat: THREE.MeshStandardMaterial | undefined;
function acUnit(ctx: StreetCtx) {
  const g = new THREE.Group();
  acMat ??= plain(0x8a86a8, 'ac');
  const body = box(0.8, 0.55, 0.45, acMat, 0, 0, 0.22);
  const grille = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), plain(0x2a2440));
  grille.position.set(0.12, 0, 0.452);
  const fan = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.01), plain(0x5a5678));
  fan.position.set(0.12, 0, 0.46);
  ctx.life.spin(fan, 'z', 6 + ctx.rng() * 6);
  g.add(body, grille, fan, box(0.06, 0.04, 0.5, plain(0x2a2440), -0.3, -0.3, 0.2), box(0.06, 0.04, 0.5, plain(0x2a2440), 0.3, -0.3, 0.2));
  return g;
}

/** Fire escape: a platform under some windows of each floor, rails, ladders between. */
function fireEscape(ctx: StreetCtx, x: number, w: number, floors: number[]) {
  const g = new THREE.Group();
  const m = plain(0x1e1a34, 'iron');
  for (const y of floors) {
    g.add(box(w, 0.06, 0.9, m, x + w / 2, y, 0.45));
    g.add(box(w, 0.04, 0.04, m, x + w / 2, y + 0.9, 0.9));
    for (let k = 0; k <= w; k += 0.45) g.add(box(0.03, 0.9, 0.03, m, x + k, y + 0.45, 0.9));
  }
  for (let i = 0; i + 1 < floors.length; i++) {
    const s = box(0.5, 0.05, Math.hypot(floors[i + 1] - floors[i], w * 0.7), m);
    const len = w * 0.7, dy = floors[i + 1] - floors[i];
    s.geometry = new THREE.BoxGeometry(0.5, 0.05, Math.hypot(len, dy));
    s.rotation.y = Math.PI / 2;
    s.rotation.z = Math.atan2(dy, len) * (i % 2 ? 1 : -1);
    s.position.set(x + w / 2, (floors[i] + floors[i + 1]) / 2, 0.55);
    g.add(s);
  }
  void ctx;
  return g;
}

/** A holographic advert floating in front of a wall (scanlines scroll, it wavers). */
export function holoAd(ctx: StreetCtx, w: number) {
  const t = holoTexture(Math.floor(ctx.rng() * 6), pick(ctx.rng, ctx.theme.neon), pick(ctx.rng, ctx.theme.neon));
  const mat = basic(t, 0xffffff, 1.5, { transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.75), mat);
  m.renderOrder = 4;
  ctx.life.holo(mat);
  reflective(m);
  return m;
}

/** Facade + details of one lot face that the camera sees. */
function dressFace(ctx: StreetCtx, lot: Lot, face: 'x' | 'z', layout: FacadeLayout, faceW: number, wall: number, ground: number, street: boolean) {
  const { rng, theme, CELL } = ctx;
  const f = faceFrame(lot, face, CELL);
  const H = lot.h;
  const neon = () => (rng() < 0.55 ? theme.neon[0] : pick(rng, theme.neon));
  // Cornices at each floor line and a parapet: the ink outline turns them into strong lines.
  const corn = plain(shade(wall, 0.8), 'corn');
  const floorH = theme.facade === 'warehouse' ? 4.5 : 3;
  if (theme.facade !== 'parking') for (let y = ground; y < H - 1; y += floorH) f.add(box(faceW, 0.14, 0.16, corn, faceW / 2, y, 0.08));
  f.add(box(faceW + 0.1, 0.35, 0.3, corn, faceW / 2, H - 0.17, 0.1));
  const worldAt = (x: number, y: number, z: number) => f.localToWorld(new THREE.Vector3(x, y, z));
  f.updateMatrixWorld(true);

  if (street && theme.facade !== 'parking') {
    // Shop signs and awnings.
    for (const s of layout.shops) {
      if (!s.open && rng() < 0.6) continue;
      const col = neon(), word = pick(rng, theme.signs);
      const look: SignLook = rng() < 0.5 ? 'tube' : rng() < 0.7 ? 'box' : 'led';
      const sw = Math.min(s.w, 4.2), sh = Math.min(1.05, sw / 3.4);
      const sg = signBoard(ctx, word, col, look, sw, sh, rng() < 0.35 ? pick(rng, theme.subs) : undefined);
      sg.position.set(s.x + s.w / 2, ground - 0.05 + sh / 2 + 0.1, 0.05);
      f.add(sg);
      ctx.glows.push({ p: worldAt(s.x + s.w / 2, ground - 0.4, 1.6), color: col, power: sw * (look === 'box' ? 1.3 : 1) });
      ctx.pools.push({ ...xz(worldAt(s.x + s.w / 2, 0, 1.4)), r: 1.6 + s.w * 0.35, color: col, a: 0.2 });
      if (s.open) ctx.pools.push({ ...xz(worldAt(s.x + s.w / 2, 0, 0.8)), r: 1.2 + s.w * 0.3, color: 0xffc890, a: 0.1 });
      if (s.open && rng() < 0.65) {
        const aw = awning(ctx, s.w + 0.2, rng() < 0.5 ? col : pick(rng, [0xd04a6a, 0x3a8ab0, 0x8a4ac0, 0xd08a3a]));
        aw.position.set(s.x + s.w / 2, ground - 0.62, 0);
        f.add(aw);
      }
    }
    // Neon strip over the street level.
    if (rng() < 0.55) {
      const col = neon();
      const m = basic(null, col, 1.8);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(faceW - 0.4, 0.07, 0.07), m);
      strip.position.set(faceW / 2, ground + 0.18, 0.18);
      f.add(reflective(strip));
      if (rng() < 0.3) ctx.life.flicker(m, 0.4);
    }
  }
  if (street && theme.facade === 'alley' && H > 7) {
    const floors: number[] = [];
    for (let y = ground; y < H - 2; y += 3) floors.push(y);
    const x = 0.4 + rng() * Math.max(0.1, faceW - 3.4);
    if (floors.length >= 2) f.add(fireEscape(ctx, x, Math.min(3, faceW - 0.8), floors));
  }
  // Blade signs high on street faces.
  if (street && H > 8 && theme.facade !== 'parking' && faceW > 2.4) {
    const n = faceW > 6 && rng() < 0.5 ? 2 : rng() < 0.85 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const word = pick(rng, theme.blades), col = neon();
      const hgt = Math.min(H - ground - 1.2, 2.6 + word.length * 0.55);
      if (hgt < 2) continue;
      const { g, w } = bladeSign(ctx, word, col, rng() < 0.65 ? 'tube' : 'box', hgt);
      const x = i === 0 ? 0.35 + rng() * 0.4 : faceW - 0.5 - rng() * 0.4;
      g.position.set(x, ground + 0.6 + hgt / 2 + rng() * Math.max(0, H - ground - hgt - 2), 0.3 + w / 2);
      f.add(g);
      ctx.glows.push({ p: worldAt(x, g.position.y, 1 + w), color: col, power: hgt * 0.6 });
    }
  }
  // AC units under dark windows, pipes, a ticker screen.
  for (const w of layout.windows) {
    if (rng() < (theme.facade === 'alley' ? 0.24 : 0.12)) {
      const ac = acUnit(ctx);
      ac.position.set(w.x + w.w * (0.25 + rng() * 0.5), w.y - 0.36, 0);
      f.add(ac);
      if (rng() < 0.15) ctx.life.vent(worldAt(ac.position.x, ac.position.y + 0.3, 0.5), 0.6, 1.5);
    }
  }
  if (rng() < 0.6) {
    const px = rng() < 0.5 ? 0.25 : faceW - 0.25;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, H - 0.5, 8), plain(0x3a3656, 'pipe'));
    pipe.position.set(px, (H - 0.5) / 2, 0.12); pipe.castShadow = true;
    f.add(pipe);
  }
  if (street && theme.shops && rng() < 0.35 && faceW > 4) {
    const t = tickerTexture(theme.signs.slice(0, 4), neon());
    t.repeat.set(faceW / 10, 1);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(faceW - 0.6, 0.45), basic(t, 0xffffff, 1.4));
    scr.position.set(faceW / 2, ground + 0.55, 0.12);
    f.add(reflective(scr));
    ctx.life.scroll(t, 0.05 + rng() * 0.05);
  }
  // Holographic ads on big faces.
  if (theme.holos > 0 && H > 11 && faceW > 4.5 && rng() < 0.22 * theme.holos) {
    const w = Math.min(faceW - 1, 6.5);
    const ad = holoAd(ctx, w);
    ad.position.set(faceW / 2, Math.min(H - w * 0.4 - 0.5, ground + 3 + rng() * (H - ground - 6)), 0.6);
    f.add(ad);
    const col = theme.neon[0];
    ctx.glows.push({ p: worldAt(faceW / 2, ad.position.y, 2.5), color: col, power: w * 0.7 });
  }
  return f;
}

const xz = (v: THREE.Vector3) => ({ x: v.x, z: v.z });

/** A near building: box with painted faces, dressed street faces, roof clutter. */
function nearBuilding(ctx: StreetCtx, lot: Lot) {
  const { rng, theme, CELL } = ctx;
  const W = (lot.x1 - lot.x0) * CELL, D = (lot.y1 - lot.y0) * CELL, H = lot.h;
  const wall = pick(rng, theme.walls);
  const g = new THREE.Group();
  const ground = theme.facade === 'parking' ? 0 : theme.facade === 'warehouse' ? 5 : 4;
  const kindOf = (street: boolean) => (street ? theme.facade : theme.facade === 'parking' ? 'parking' : 'plain');
  const fz = facadeTexture({ w: W, h: H, wall, kind: kindOf(lot.streetZ), street: lot.streetZ, ground: lot.streetZ || theme.facade !== 'parking' ? ground : 0, lit: theme.lit }, rng);
  const fx = facadeTexture({ w: D, h: H, wall: shade(wall, 0.9), kind: kindOf(lot.streetX), street: lot.streetX, ground: lot.streetX || theme.facade !== 'parking' ? ground : 0, lit: theme.lit }, rng);
  const faceMat = (t: { map: THREE.Texture; emissive: THREE.Texture }) => new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 1.05, roughness: 1 });
  const side = plain(shade(wall, 0.7));
  const roof = plain(theme.facade === 'parking' ? 0x0e0a1e : 0x2a2444, 'roof');
  const body = box(W, H, D, [faceMat(fx), side, roof, side, faceMat(fz), side], lot.x0 * CELL + W / 2, H / 2, lot.y0 * CELL + D / 2);
  g.add(reflective(body));
  const zFace = dressFace(ctx, lot, 'z', fz.layout, W, wall, ground, lot.streetZ);
  const xFace = dressFace(ctx, lot, 'x', fx.layout, D, shade(wall, 0.9), ground, lot.streetX);
  g.add(zFace, xFace);
  // Roof clutter (not on the parking ceiling).
  if (theme.facade !== 'parking') {
    const top = new THREE.Group();
    top.position.set(lot.x0 * CELL, H, lot.y0 * CELL);
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const x = 0.8 + rng() * Math.max(0.2, W - 1.6), z = 0.8 + rng() * Math.max(0.2, D - 1.6);
      const r = rng();
      if (r < 0.35) { const ac = box(1.2, 0.8, 1.0, plain(0x7a7698, 'ac'), x, 0.4, z); top.add(ac); if (rng() < 0.5) ctx.life.vent(new THREE.Vector3(lot.x0 * CELL + x, H + 0.9, lot.y0 * CELL + z), 0.8, 2); }
      else if (r < 0.6) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.4, 10), plain(0x5a4a6a, 'tank'));
        tank.position.set(x, 1.6, z); tank.castShadow = true;
        top.add(tank);
        for (const [a, b2] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) top.add(box(0.07, 0.9, 0.07, plain(0x1e1a34, 'iron'), x + a, 0.45, z + b2));
      } else if (r < 0.8) {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 3 + rng() * 3, 5), plain(0x2a2440, 'iron'));
        ant.position.set(x, ant.geometry.parameters.height / 2, z);
        top.add(ant);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), basic(null, 0xff2a6d, 2));
        tip.position.set(x, ant.geometry.parameters.height, z);
        top.add(tip);
        ctx.life.flicker(tip.material as THREE.MeshBasicMaterial, 2);
      } else {
        void ctx.kit.clone(pick(rng, ['kenney/industrial/chimney-small', 'kenney/industrial/detail-tank'])).then(o => { fitObject(o, 1.6, 1.6, 2); o.position.x += x; o.position.z += z; top.add(o); });
      }
    }
    g.add(top);
    // A rooftop billboard on some street buildings, facing the street.
    if ((lot.streetX || lot.streetZ) && rng() < 0.3) {
      const face = lot.streetZ ? 'z' : 'x';
      const fw = face === 'z' ? W : D;
      const bw = Math.min(fw - 0.5, 5.5), bh = bw / 3.4;
      const fr = faceFrame(lot, face, CELL);
      const sign = signBoard(ctx, pick(rng, theme.signs), pick(rng, theme.neon), rng() < 0.5 ? 'box' : 'tube', bw, bh);
      sign.position.set(fw / 2, H + 0.7 + bh / 2, -0.6);
      fr.add(sign);
      for (const sx of [-bw / 3, bw / 3]) fr.add(box(0.08, 0.8, 0.08, plain(0x1e1a34, 'iron'), fw / 2 + sx, H + 0.4, -0.7));
      g.add(fr);
    }
  }
  return g;
}

/** A far building: a Kenney block stretched to the lot, windows lit in one colour. */
async function farBuilding(ctx: StreetCtx, lot: Lot) {
  const { rng, theme, CELL, kit } = ctx;
  const W = (lot.x1 - lot.x0) * CELL, D = (lot.y1 - lot.y0) * CELL;
  const industrial = theme.facade === 'warehouse' || theme.facade === 'bunker';
  const tall = lot.h > 22;
  const name = industrial && !tall ? `kenney/industrial/building-${pick(rng, 'abcdeglmnr'.split(''))}`
    : tall ? `kenney/commercial/building-skyscraper-${pick(rng, 'abcde'.split(''))}` : `kenney/commercial/building-${pick(rng, 'abdfghijlmn'.split(''))}`;
  const o = await kit.clone(name);
  kit.glowing(o, pick(rng, [0xffc46b, 0xffc46b, 0x7ad8ff, 0xff7ab8, 0xb88aff]), 0.9 + rng() * 0.8);
  o.updateMatrixWorld(true);
  const s = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
  // Footprint to the lot (a little inset), height to the lot height.
  o.scale.set((W * 0.92) / s.x, lot.h / s.y, (D * 0.92) / s.z);
  o.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(o), c = bb.getCenter(new THREE.Vector3());
  o.position.add(new THREE.Vector3(lot.x0 * CELL + W / 2 - c.x, -bb.min.y, lot.y0 * CELL + D / 2 - c.z));
  const g = new THREE.Group();
  g.add(o);
  // Some carry a giant sign or a hologram near the top.
  if (rng() < 0.35 && lot.h > 12) {
    const sw = Math.min(W, 6), sh = sw / 3.4;
    const sign = signBoard(ctx, pick(rng, theme.signs), pick(rng, theme.neon), rng() < 0.5 ? 'box' : 'tube', sw, sh);
    sign.position.set(lot.x0 * CELL + W / 2, lot.h - sh - 1 - rng() * 4, lot.y1 * CELL + 0.1);
    g.add(sign);
  } else if (rng() < 0.3 && lot.h > 14 && theme.holos) {
    const ad = holoAd(ctx, Math.min(D, 7));
    ad.rotation.y = Math.PI / 2;
    ad.position.set(lot.x1 * CELL + 0.5, lot.h * 0.7, lot.y0 * CELL + D / 2);
    g.add(ad);
  }
  return reflective(g);
}

/** Every building of the plan. */
export async function buildCity(ctx: StreetCtx, plan: CityPlan) {
  const jobs: Promise<unknown>[] = [];
  for (const lot of plan.lots) {
    if (lot.dist <= 3 || ctx.theme.facade === 'parking') ctx.group.add(nearBuilding(ctx, lot));
    else jobs.push(farBuilding(ctx, lot).then(g => ctx.group.add(g)));
  }
  await Promise.all(jobs);
}

/** Sagging cables between facades over the back of the street; some carry lanterns or bulbs. */
export function buildCables(ctx: StreetCtx, plan: CityPlan, b: Board) {
  const { rng, CELL, theme } = ctx;
  const anchors: THREE.Vector3[] = [];
  for (const lot of plan.lots) {
    if (lot.dist > 1 || lot.h < 7) continue;
    if (lot.streetZ) for (let i = 0; i < 2; i++) anchors.push(new THREE.Vector3((lot.x0 + rng() * (lot.x1 - lot.x0)) * CELL, 5.5 + rng() * Math.min(5, lot.h - 6.5), lot.y1 * CELL + 0.1));
    if (lot.streetX) for (let i = 0; i < 2; i++) anchors.push(new THREE.Vector3(lot.x1 * CELL + 0.1, 5.5 + rng() * Math.min(5, lot.h - 6.5), (lot.y0 + rng() * (lot.y1 - lot.y0)) * CELL));
  }
  const mat = plain(0x0e0a1c, 'cable');
  const bw = b.w * CELL, bh = b.h * CELL;
  let n = 0;
  const lanternMats = theme.neon.map(c => basic(null, c, 1.6));
  const used = new Set<number>();
  for (let i = 0; i < anchors.length && n < (theme.lanterns ? 9 : 7); i++) {
    for (let j = 0; j < anchors.length; j++) {
      if (i === j || used.has(i * 1000 + j)) continue;
      const a = anchors[i], c = anchors[j], d = a.distanceTo(c);
      const mid = a.clone().add(c).multiplyScalar(0.5);
      // Back half of the board only, unless they are lantern strings over a market.
      const back = mid.x / bw + mid.z / bh < (theme.lanterns ? 1.1 : 0.55);
      if (d < 4 || d > (theme.lanterns ? 22 : 15) || !back || Math.abs(a.x - c.x) < 1 && Math.abs(a.z - c.z) < 1) continue;
      if (rng() < 0.55) continue;
      used.add(i * 1000 + j); used.add(j * 1000 + i);
      const sag = 0.6 + d * 0.08 + rng() * 0.8;
      const curve = new THREE.QuadraticBezierCurve3(a, mid.clone().setY(Math.min(a.y, c.y) - sag), c);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.022, 4, false), mat);
      const holder = new THREE.Group();
      holder.add(tube);
      if (theme.lanterns || rng() < 0.3) {
        const lantern = theme.lanterns;
        const k = Math.max(4, Math.floor(d / (lantern ? 1.4 : 0.8)));
        for (let q = 1; q < k; q++) {
          const p = curve.getPoint(q / k);
          const m = lantern ? new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), lanternMats[q % lanternMats.length]) : new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), basic(null, 0xffd890, 2));
          if (lantern) m.scale.y = 1.35;
          m.position.copy(p);
          if (lantern) m.position.y -= 0.22;
          holder.add(m);
        }
        if (lantern) ctx.glows.push({ p: mid.clone().setY(mid.y - sag), color: theme.neon[0], power: 3 });
      }
      ctx.group.add(reflective(holder));
      n++;
      break;
    }
  }
}

/** Dock water: a dark surface that reflects (its own wet ground material is set by World3D). */
export function containerBox(color: number, w: number, h: number, d: number) {
  const t = corrugated(color);
  t.repeat.set(w * 1.4, 1);
  const t2 = corrugated(color); t2.repeat.set(d * 1.4, 1);
  const side = new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  const end = new THREE.MeshStandardMaterial({ map: t2, roughness: 1 });
  const top = plain(shade(color, 0.8));
  return box(w, h, d, [end, end, top, top, side, side]);
}

/** Additive coloured light pools on the ground. */
export function buildPools(ctx: StreetCtx) {
  const tex = glowTexture();
  const mats = new Map<number, THREE.MeshBasicMaterial>();
  for (const p of ctx.pools) {
    let m = mats.get(p.color);
    if (!m) { m = new THREE.MeshBasicMaterial({ map: tex, color: p.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 1 }); mats.set(p.color, m); }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.r * 2, p.r * 2), m.clone());
    (mesh.material as THREE.MeshBasicMaterial).opacity = p.a;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p.x, 0.07, p.z);
    mesh.renderOrder = 1;
    ctx.group.add(mesh);
  }
}

export { css, box, basic };
