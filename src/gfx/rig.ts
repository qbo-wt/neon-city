import Phaser from 'phaser';
import { PALETTE } from './sprites';

/**
 * Generic character rig: a body made of parts (legs, torso, coat, arms, head, held item) whose
 * placement depends only on a Build (proportions) and a Pose (offsets). Every NPC and enemy is a
 * Look (build + colours + head art + clothing + item) rendered through the same poses, so all of
 * them walk, breathe, wind up, strike, get stunned and fall with the same care as the player.
 *
 * Drawing uses slot letters resolved through the look's palette (see Pal); any other letter is a
 * PALETTE colour used as is. The silhouette is outlined automatically.
 * Each look becomes one sheet texture with frames named `${facing}-${frame}`.
 */
export type Facing = 'd' | 'u' | 's';
export const FACINGS: Facing[] = ['d', 'u', 's'];

export interface Build {
  S: number; headW: number; headH: number; torsoW: number; torsoH: number; sideW: number;
  armW: number; armLen: number; legW: number; legGap: number; legLen: number; shoeW: number;
}
export const BUILDS = {
  normal: { S: 24, headW: 6, headH: 8, torsoW: 8, torsoH: 6, sideW: 6, armW: 2, armLen: 4, legW: 2, legGap: 2, legLen: 5, shoeW: 3 },
  slim: { S: 24, headW: 6, headH: 8, torsoW: 6, torsoH: 6, sideW: 5, armW: 2, armLen: 4, legW: 2, legGap: 2, legLen: 6, shoeW: 3 },
  wide: { S: 24, headW: 6, headH: 8, torsoW: 10, torsoH: 6, sideW: 7, armW: 2, armLen: 4, legW: 2, legGap: 2, legLen: 5, shoeW: 3 },
  short: { S: 24, headW: 6, headH: 8, torsoW: 8, torsoH: 5, sideW: 6, armW: 2, armLen: 3, legW: 2, legGap: 2, legLen: 4, shoeW: 3 },
  heavy: { S: 32, headW: 6, headH: 7, torsoW: 14, torsoH: 9, sideW: 9, armW: 4, armLen: 7, legW: 4, legGap: 2, legLen: 6, shoeW: 5 },
  big: { S: 36, headW: 8, headH: 9, torsoW: 14, torsoH: 10, sideW: 9, armW: 4, armLen: 7, legW: 3, legGap: 4, legLen: 7, shoeW: 4 },
  giant: { S: 40, headW: 8, headH: 10, torsoW: 16, torsoH: 11, sideW: 10, armW: 4, armLen: 8, legW: 4, legGap: 4, legLen: 8, shoeW: 5 },
} satisfies Record<string, Build>;

/**
 * Slots: H hair, F hair shade, K skin, Q skin shade, E eyes, V visor / glow, A accent,
 * T top, U top shade, L top light, I shirt, N pants, O pants shade, B shoes, X metal, Z metal shade, R second glow.
 */
export interface Pal { H: string; F: string; K: string; Q: string; E: string; V: string; A: string; T: string; U: string; L: string; I: string; N: string; O: string; B: string; X: string; Z: string; R: string }

export type TorsoStyle = 'jacket' | 'coat' | 'hoodie' | 'tank' | 'vest' | 'armor' | 'labcoat' | 'apron';
export type ArmStyle = 'cloth' | 'skin' | 'chrome' | 'heavy' | 'heavyCloth';

export interface Leg { dx: number; lift: number; knee?: number }
export interface Hand { dx: number; dy: number }
export interface Pose {
  bob: number; lean: number;
  legs: [Leg, Leg];
  hands: [Hand, Hand]; // [screen-left / far, screen-right / near], relative to each shoulder
  tail: number;
  head?: { dx: number; dy: number };
  blink?: boolean;
  item?: string; // what the held item is doing: 'hold', 'aim', 'raise', 'slash0', 'slash1', 'cast', 'flash'…
  fx?: string; // look-specific extras: 'glow', 'shake'…
  /** The item hand is in front of the face (smoking, phone, eating): drawn after the head. */
  handUp?: boolean;
}

export interface DrawCtx {
  g: Grid; b: Build; f: Facing; p: Pose; look: Look;
  cx: number; feet: number; hip: number; top: number; headTop: number;
  torso: { x: number; y: number; w: number; h: number };
  shoulders: [{ x: number; y: number }, { x: number; y: number }];
  hands: [{ x: number; y: number }, { x: number; y: number }];
  /** Index in `hands` of the hand that holds the item (the right hand). */
  itemHand: 0 | 1;
  layer: 'behind' | 'front';
}

export interface Look {
  build: Build;
  pal: Pal;
  head: Record<Facing, string[]>;
  torso: TorsoStyle;
  arms: [ArmStyle, ArmStyle];
  tail?: number; // coat length in rows below the hips
  skirt?: number;
  emblem?: string[]; // stamped on the back
  /** Extra details drawn on top of the body (chest plates, belts, glows…). */
  decorate?: (c: DrawCtx) => void;
  /** Held item, drawn behind the body ('behind') and in front of it ('front'). */
  item?: (c: DrawCtx) => void;
}

export type Grid = string[][];

// ---- Low-level painting -----------------------------------------------------------------
export function put(g: Grid, c: string, x: number, y: number) {
  if (c === '.' || y < 0 || y >= g.length || x < 0 || x >= g[0].length) return;
  g[y][x] = c;
}
export function rect(g: Grid, c: string, x: number, y: number, w = 1, h = 1) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, c, x + i, y + j);
}
export function stamp(g: Grid, rows: string[], x: number, y: number) {
  rows.forEach((r, j) => [...r].forEach((c, i) => put(g, c, x + i, y + j)));
}
/** Straight line of single pixels, inclusive. */
export function line(g: Grid, c: string, x0: number, y0: number, x1: number, y1: number) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) put(g, c, Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n));
}
/** Blade: a core line plus a glowing edge on one side. */
export function blade(g: Grid, core: string, edge: string, x0: number, y0: number, x1: number, y1: number) {
  line(g, core, x0, y0, x1, y1);
  const horiz = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  line(g, edge, x0 + (horiz ? 0 : 1), y0 + (horiz ? 1 : 0), x1 + (horiz ? 0 : 1), y1 + (horiz ? 1 : 0));
  put(g, 'w', x1, y1);
}

function outline(g: Grid) {
  const h = g.length, w = g[0].length;
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && g[y][x] !== '.' && g[y][x] !== '#';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (g[y][x] === '.' && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) g[y][x] = '#';
  }
}

// ---- Parts ------------------------------------------------------------------------------
const OPEN: TorsoStyle[] = ['jacket', 'coat', 'labcoat'];

function torsoFront(c: DrawCtx, back: boolean) {
  const { g, look } = c, { x, y, w, h } = c.torso, mid = x + Math.floor(w / 2);
  rect(g, 'T', x, y, w, h);
  rect(g, 'U', x, y + 1, 1, h - 1); rect(g, 'U', x + w - 1, y + 1, 1, h - 1);
  rect(g, 'L', x + 1, y, w - 2, 1);
  const s = look.torso;
  if (!back) {
    if (OPEN.includes(s)) {
      rect(g, 'I', mid - 1, y, 2, h - 2);
      put(g, 'A', mid - 2, y); put(g, 'A', mid + 1, y);
      put(g, 'U', mid - 2, y + 1); put(g, 'U', mid + 1, y + 1);
    } else if (s === 'hoodie') {
      rect(g, 'U', mid - 2, y, 4, 1); put(g, 'w', mid - 1, y + 1); put(g, 'w', mid, y + 1); put(g, 'w', mid - 1, y + 2);
      rect(g, 'U', mid - 2, y + h - 3, 4, 1);
    } else if (s === 'tank') {
      rect(g, 'K', x + 1, y, w - 2, 1); rect(g, 'Q', mid - 1, y, 2, 1);
      put(g, 'T', x + 1, y); put(g, 'T', x + w - 2, y);
    } else if (s === 'vest') {
      rect(g, 'A', x + 1, y, 1, h - 2); rect(g, 'A', x + w - 2, y, 1, h - 2);
      rect(g, 'U', mid - 1, y + 1, 2, h - 3);
      if (w >= 8) { rect(g, 'O', x + 2, y + h - 3, 2, 1); rect(g, 'O', x + w - 4, y + h - 3, 2, 1); }
    } else if (s === 'armor') {
      for (let r = y + 2; r < y + h - 2; r += 2) rect(g, 'U', x + 1, r, w - 2, 1);
      rect(g, 'A', x, y, 2, 1); rect(g, 'A', x + w - 2, y, 2, 1);
    } else if (s === 'apron') {
      rect(g, 'w', mid - 2, y + 1, 4, 2); rect(g, 'w', x + 1, y + 3, w - 2, h - 3);
      put(g, 'v', mid - 2, y + 2); put(g, 'A', mid - 3, y + 1); put(g, 'A', mid + 2, y + 1);
    }
  } else {
    if (s === 'hoodie') { rect(g, 'U', mid - 2, y, 4, 2); rect(g, 'T', mid - 1, y, 2, 1); }
    if (look.emblem) stamp(g, look.emblem, mid - Math.floor(look.emblem[0].length / 2), y + 1);
    if (s === 'apron') { put(g, 'w', mid - 1, y + h - 3); put(g, 'w', mid, y + h - 3); }
  }
  if (s !== 'apron' && !(back && (s === 'coat' || s === 'labcoat'))) {
    rect(g, 'k', x, y + h - 2, w, 1);
    if (!back) put(g, 'A', mid - 1, y + h - 2);
  }
  if (!back && OPEN.includes(s)) rect(g, 'N', mid - 1, y + h - 1, 2, 1);
  // Big bodies narrow at the waist: a V silhouette instead of a box.
  if (w >= 12) for (let r = y + h - 3; r < y + h; r++) { g[r][x] = '.'; g[r][x + w - 1] = '.'; }
}

function torsoSide(c: DrawCtx) {
  const { g, look } = c, { x, y, w, h } = c.torso, front = x + w - 1, s = look.torso;
  rect(g, 'T', x, y, w, h);
  rect(g, 'U', x, y, 1, h);
  rect(g, 'L', x + 1, y, w - 2, 1);
  if (OPEN.includes(s)) { rect(g, 'I', front, y + 1, 1, h - 3); put(g, 'A', front, y); }
  else if (s === 'hoodie') { rect(g, 'U', x, y, 2, 2); rect(g, 'U', front - 2, y + h - 3, 2, 1); }
  else if (s === 'tank') { rect(g, 'K', x + 1, y, w - 2, 1); put(g, 'T', front - 1, y); }
  else if (s === 'vest') { rect(g, 'A', front - 1, y, 1, h - 2); rect(g, 'O', front - 2, y + h - 3, 2, 1); }
  else if (s === 'armor') { for (let r = y + 2; r < y + h - 2; r += 2) rect(g, 'U', x + 1, r, w - 2, 1); rect(g, 'A', x, y, 2, 1); }
  else if (s === 'apron') rect(g, 'w', front - 1, y + 1, 2, h - 1);
  if (s !== 'apron') { rect(g, 'k', x, y + h - 2, w, 1); put(g, 'A', front, y + h - 2); }
  if (OPEN.includes(s)) put(g, 'N', front, y + h - 1);
}

/** Long coats: flaps beside the legs (front), a back panel (back), or a tail flaring behind (profile). */
function coatTail(c: DrawCtx) {
  const n = c.look.tail ?? 0;
  if (!n) return;
  const { g, p } = c, { x, w } = c.torso, y = c.hip + p.bob, sway = p.tail > 0 ? 1 : 0;
  if (c.f === 'd') {
    for (let j = 0; j < n; j++) {
      const out = j === n - 1 ? sway : 0;
      put(g, 'U', x - out, y + j); put(g, 'U', x + w - 1 + out, y + j);
      if (w >= 12) { put(g, 'T', x + 1 - out, y + j); put(g, 'T', x + w - 2 + out, y + j); }
    }
  } else if (c.f === 'u') {
    rect(g, 'T', x, y, w, 1);
    for (let j = 1; j < n; j++) {
      const out = j === n - 1 ? sway : 0, half = Math.floor(w / 2) - 1;
      rect(g, j === n - 1 ? 'U' : 'T', x - out, y + j, half, 1);
      rect(g, j === n - 1 ? 'U' : 'T', x + w - half + out, y + j, half, 1);
    }
  } else {
    rect(g, 'U', x, y, 2, 1);
    for (let j = 1; j < n; j++) rect(g, j === n - 1 ? 'U' : 'T', x - p.tail * j, y + j - (p.tail > 2 ? j : 0), 2 + p.tail * j, 1);
  }
}

function skirt(c: DrawCtx) {
  const n = c.look.skirt ?? 0;
  if (!n) return;
  const { g } = c, { x, w } = c.torso, y = c.hip + c.p.bob;
  const x0 = c.f === 's' ? x - 1 : x, w0 = c.f === 's' ? w + 1 : w;
  rect(g, 'T', x0, y, w0, n);
  rect(g, 'U', x0, y, 1, n); rect(g, 'U', x0 + w0 - 1, y, 1, n);
  rect(g, 'A', x0, y + n - 1, w0, 1);
}

function legsFront(c: DrawCtx) {
  const { g, b, p, cx } = c;
  const xs = [cx - Math.floor(b.legGap / 2) - b.legW, cx + Math.ceil(b.legGap / 2)];
  xs.forEach((lx0, i) => {
    const l = p.legs[i], lx = lx0 + l.dx, len = b.legLen - l.lift;
    rect(g, 'N', lx, c.hip, b.legW, len);
    rect(g, 'O', i === 0 ? lx + b.legW - 1 : lx, c.hip, 1, len);
    const sx = i === 0 ? lx - (b.shoeW - b.legW) : lx;
    rect(g, 'B', sx, c.feet - l.lift, b.shoeW, b.S >= 32 ? 2 : 1);
    if (b.S >= 32) rect(g, 'k', sx, c.feet - l.lift + 1, b.shoeW, 1);
  });
}

function legSide(c: DrawCtx, l: Leg, col: string) {
  const { g, b } = c, hx = c.cx - Math.floor(b.legW / 2), end = c.feet - 1 - l.lift;
  let fx = hx + l.dx;
  if (l.knee) {
    // Seated: thigh forward, shin down.
    rect(g, col, hx, c.hip, l.knee + b.legW, b.legW);
    fx = hx + l.knee;
    rect(g, col, fx, c.hip + b.legW, b.legW, Math.max(0, end - c.hip - b.legW + 1));
  } else {
    for (let y = c.hip; y <= end; y++) rect(g, col, hx + Math.round(l.dx * (y - c.hip) / Math.max(1, b.legLen - 1)), y, b.legW, 1);
  }
  rect(g, 'B', fx, end + 1, b.shoeW, b.S >= 32 ? 2 : 1);
}

const ARM_COLORS: Record<ArmStyle, [string, string, string]> = {
  cloth: ['T', 'U', 'K'], skin: ['K', 'Q', 'K'], chrome: ['X', 'Z', 'Z'], heavy: ['X', 'Z', 'X'], heavyCloth: ['T', 'U', 'X'],
};

/** Arm from a shoulder to a hand position, with a shaded side, a glow line on chrome arms and a fist. */
function arm(c: DrawCtx, style: ArmStyle, s: { x: number; y: number }, h: { x: number; y: number }, far: boolean, shadeLeft = false) {
  const { g, b } = c;
  let [main, shade, handCol] = ARM_COLORS[style];
  if (far && style === 'cloth') { main = 'U'; }
  const dx = h.x - s.x, dy = h.y - s.y, n = Math.max(Math.abs(dx), Math.abs(dy), 1), vertical = Math.abs(dy) >= Math.abs(dx);
  for (let i = 0; i < n; i++) {
    const x = Math.round(s.x + dx * i / n), y = Math.round(s.y + dy * i / n);
    // The shaded side faces the torso, which keeps arms readable against the body.
    if (vertical) { rect(g, main, x, y, b.armW, 1); put(g, shade, shadeLeft ? x : x + b.armW - 1, y); }
    else { rect(g, main, x, y, 1, b.armW); put(g, shade, x, y + b.armW - 1); }
    if ((style === 'chrome' || style === 'heavy') && i === Math.floor(n / 2)) put(g, 'V', x, y);
  }
  if (style === 'heavy' || style === 'heavyCloth') {
    // Big chrome fist with knuckles.
    rect(g, handCol, h.x, h.y, b.armW, Math.ceil(b.armW / 2) + 1);
    rect(g, 'Z', h.x, h.y + Math.ceil(b.armW / 2), b.armW, 1);
    put(g, 'w', h.x, h.y);
  } else rect(g, handCol, h.x, h.y, b.armW, Math.max(1, Math.ceil(b.armW / 2)));
}

function headPart(c: DrawCtx) {
  const { g, look, p, f } = c;
  let rows = look.head[f];
  if (p.blink && f !== 'u') rows = rows.map(r => r.replace(/E/g, 'Q'));
  const x = c.cx - Math.floor(c.b.headW / 2) + (f === 's' ? p.lean : 0) + (p.head?.dx ?? 0);
  stamp(g, rows, x, c.headTop + p.bob + (p.head?.dy ?? 0));
}

function draw(look: Look, f: Facing, p: Pose): Grid {
  const b = look.build, S = b.S;
  const g: Grid = Array.from({ length: S }, () => Array(S).fill('.'));
  const cx = S / 2, feet = S - 3, hip = feet - b.legLen, top = hip - b.torsoH, headTop = top - b.headH;
  const side = f === 's';
  const tw = side ? b.sideW : b.torsoW;
  const torso = { x: side ? cx - Math.ceil(tw / 2) + p.lean : cx - tw / 2, y: top + p.bob, w: tw, h: b.torsoH };
  const shoulders: DrawCtx['shoulders'] = side
    ? [{ x: cx - 1 + p.lean, y: top + 1 + p.bob }, { x: cx - 1 + p.lean, y: top + 1 + p.bob }]
    : [{ x: torso.x - b.armW, y: top + p.bob }, { x: torso.x + tw, y: top + p.bob }];
  const hands = shoulders.map((s, i) => ({ x: s.x + p.hands[i].dx, y: s.y + p.hands[i].dy })) as DrawCtx['hands'];
  const c: DrawCtx = { g, b, f, p, look, cx, feet, hip, top, headTop, torso, shoulders, hands, itemHand: f === 'u' ? 0 : 1, layer: 'behind' };
  const arms: [ArmStyle, ArmStyle] = f === 'u' ? [look.arms[1], look.arms[0]] : look.arms;

  look.item?.(c);
  if (side) {
    arm(c, arms[0], shoulders[0], hands[0], true);
    legSide(c, p.legs[0], 'O');
    coatTail(c);
    legSide(c, p.legs[1], 'N');
    skirt(c);
    torsoSide(c);
    look.decorate?.(c);
    if (!p.handUp) arm(c, arms[1], shoulders[1], hands[1], false);
  } else {
    legsFront(c);
    coatTail(c);
    skirt(c);
    torsoFront(c, f === 'u');
    look.decorate?.(c);
    if (!(p.handUp && c.itemHand === 0)) arm(c, arms[0], shoulders[0], hands[0], false);
    if (!(p.handUp && c.itemHand === 1)) arm(c, arms[1], shoulders[1], hands[1], false, true);
  }
  headPart(c);
  if (p.handUp) arm(c, arms[c.itemHand], shoulders[c.itemHand], hands[c.itemHand], false, !side && c.itemHand === 1);
  c.layer = 'front';
  look.item?.(c);
  return g;
}

// ---- Poses ------------------------------------------------------------------------------
const still: Leg = { dx: 0, lift: 0 };

/** Default pose for a build: standing, arms hanging. Override any field. */
export function pose(b: Build, f: Facing, o: Partial<Pose> = {}): Pose {
  const hang: Hand = { dx: 0, dy: b.armLen };
  return { bob: 0, lean: 0, legs: [still, still], hands: [hang, hang], tail: 0, ...o };
}

/** Four breathing frames (the last one blinks). */
export function idleCycle(b: Build, f: Facing, item?: string): Pose[] {
  return [0, 0, 1, 1].map((bob, i) => pose(b, f, { bob, blink: i === 3, item }));
}

/** Six-frame walk, scaled to the build: legs lift (front/back) or stride (profile), arms swing opposite. */
export function walkCycle(b: Build, f: Facing, item?: string, armsFixed = false): Pose[] {
  const k = b.legLen / 5;
  if (f === 's') {
    const dx = [3, 1, -1, -3, -1, 1].map(v => Math.round(v * k)), lift = [0, 0, 0, 0, 2, 1];
    return dx.map((_, i) => {
      const j = (i + 3) % 6;
      const sw = (v: number) => armsFixed ? 0 : Math.round(v / 2);
      return pose(b, f, {
        bob: i % 3 === 0 ? 1 : 0, item, tail: i % 3 === 0 ? 0 : 1,
        legs: [{ dx: dx[j], lift: lift[j] }, { dx: dx[i], lift: lift[i] }],
        hands: [{ dx: sw(dx[i]), dy: b.armLen }, { dx: sw(dx[j]), dy: b.armLen }],
      });
    });
  }
  const lifts: [number, number][] = [[0, 2], [0, 1], [0, 0], [2, 0], [1, 0], [0, 0]];
  return lifts.map(([l, r], i) => {
    const s = armsFixed ? 0 : i < 3 ? 1 : -1;
    return pose(b, f, {
      bob: i % 3 === 2 ? 0 : i % 3, item, tail: i % 3 === 1 ? 1 : 0,
      legs: [{ dx: 0, lift: l }, { dx: 0, lift: r }],
      hands: [{ dx: 0, dy: b.armLen + s }, { dx: 0, dy: b.armLen - s }],
    });
  });
}

// ---- Sheets -----------------------------------------------------------------------------
export type FrameSet = Record<string, (f: Facing) => Pose>;
export interface AnimDef { frames: string[]; rate: number; repeat?: number }

const RGBA: Record<string, [number, number, number, number]> = {};
function rgba(hex: string): [number, number, number, number] {
  if (!RGBA[hex]) {
    const n = parseInt(hex.slice(1, 7), 16);
    RGBA[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255, hex.length > 7 ? parseInt(hex.slice(7, 9), 16) : 255];
  }
  return RGBA[hex];
}

/**
 * Renders every frame of a look into one sheet texture `key` (frames `${f}-${name}`) and creates
 * the animations `${key}-${anim}-${f}`.
 */
export function buildSheet(scene: Phaser.Scene, key: string, look: Look, frames: FrameSet, anims: Record<string, AnimDef>) {
  if (scene.textures.exists(key)) return;
  const S = look.build.S, names = Object.keys(frames);
  const tex = scene.textures.createCanvas(key, names.length * S, FACINGS.length * S)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(names.length * S, FACINGS.length * S);
  const resolve = (ch: string) => (look.pal as unknown as Record<string, string>)[ch] ?? ch;
  FACINGS.forEach((f, row) => names.forEach((name, col) => {
    const g = draw(look, f, frames[name](f));
    outline(g);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const ch = g[y][x] === '#' ? 'k' : resolve(g[y][x]);
      const hex = PALETTE[ch];
      if (!hex) continue;
      const [r, gg, bb, a] = rgba(hex), i = ((row * S + y) * names.length * S + col * S + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = bb; img.data[i + 3] = a;
    }
    tex.add(`${f}-${name}`, 0, col * S, row * S, S, S);
  }));
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  for (const [name, a] of Object.entries(anims)) for (const f of FACINGS) {
    const k = `${key}-${name}-${f}`;
    if (!scene.anims.exists(k)) scene.anims.create({ key: k, frames: a.frames.map(n => ({ key, frame: `${f}-${n}` })), frameRate: a.rate, repeat: a.repeat ?? -1 });
  }
}

/** Standard frame set: idle0-3 and walk0-5 for every look. */
export function baseFrames(b: Build, item?: string, armsFixed = false): FrameSet {
  const set: FrameSet = {};
  for (let i = 0; i < 4; i++) set[`idle${i}`] = f => idleCycle(b, f, item)[i];
  for (let i = 0; i < 6; i++) set[`walk${i}`] = f => walkCycle(b, f, item, armsFixed)[i];
  return set;
}
export const BASE_ANIMS: Record<string, AnimDef> = {
  idle: { frames: ['idle0', 'idle1', 'idle2', 'idle3'], rate: 4 },
  walk: { frames: ['walk0', 'walk1', 'walk2', 'walk3', 'walk4', 'walk5'], rate: 11 },
};

/** Facing from a direction, the same rule the player uses. */
export function facingOf(x: number, y: number): Facing {
  return y < -0.6 ? 'u' : Math.abs(x) > 0.55 ? 's' : 'd';
}
