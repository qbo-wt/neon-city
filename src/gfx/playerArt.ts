import Phaser from 'phaser';
import { PALETTE } from './sprites';

/**
 * The player is drawn from parts (head, torso, arms, legs, coat tail, blade) on a 24×24 frame, then
 * outlined automatically. Every pose is just different offsets for those parts, which gives three
 * views (d = front, u = back, s = profile facing right; left is the profile flipped) with full
 * walk / idle / combat animations without hand-drawing each frame.
 *
 * Feet sit on row 21, so the sprite uses origin (0.5, 0.625) and its body circle stays where the old
 * 16×16 sprite had it.
 */
export const PLAYER_FRAME = 24;
export const PLAYER_ORIGIN_Y = 15 / 24;
export type Facing = 'd' | 'u' | 's';

type Grid = string[][];
interface Leg { dx: number; lift: number }
interface Pose {
  bob: number; lean: number;
  legs: [Leg, Leg]; // [far/left, near/right]
  arms: [number, number]; // swing of [far/left, near/right] arm, -2..2 (positive = forward)
  tail: number; // coat tail flare, 0..3
  scan: number; // visor highlight position, -1 for none
  special?: 'atk0' | 'atk1' | 'guard' | 'hurt';
  red?: boolean; // katana blade
}

const blank = (): Grid => Array.from({ length: PLAYER_FRAME }, () => Array(PLAYER_FRAME).fill('.'));
const put = (g: Grid, c: string, x: number, y: number) => { if (x >= 0 && y >= 0 && x < PLAYER_FRAME && y < PLAYER_FRAME && c !== '.') g[y][x] = c; };
const rect = (g: Grid, c: string, x: number, y: number, w = 1, h = 1) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, c, x + i, y + j); };
const stamp = (g: Grid, rows: string[], x: number, y: number) => rows.forEach((r, j) => [...r].forEach((c, i) => put(g, c, x + i, y + j)));

/** Dark outline around the silhouette (4-neighbourhood), like every other sprite in the game. */
function outline(g: Grid) {
  const filled = (x: number, y: number) => g[y]?.[x] !== undefined && g[y][x] !== '.' && g[y][x] !== '#';
  for (let y = 0; y < PLAYER_FRAME; y++) for (let x = 0; x < PLAYER_FRAME; x++) {
    if (g[y][x] === '.' && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) g[y][x] = '#';
  }
  for (const row of g) for (let x = 0; x < row.length; x++) if (row[x] === '#') row[x] = 'k';
}

// ---- Parts -------------------------------------------------------------------------------
const HEAD: Record<Facing, string[]> = {
  d: ['.ww.w.', 'wwwwww', 'wvwwvw', 'wssssw', 'cccccc', 'vssssv', '.ssss.', '..ss..'],
  u: ['.ww.w.', 'wwwwww', 'wvwwvw', 'wvwwvw', 'cvwwvc', 'vwwwwv', '.vwwv.', '..ss..'],
  s: ['ww.w..', 'wwwwww', 'wwwwss', 'wvwsss', 'wwccccc', 'wwsssS', '.vsss.', '..ss..'],
};
const TORSO: Record<Facing, string[]> = {
  d: ['CcCkkCcC', 'CCCkyCCC', 'nCCkkCCn', 'nCCkkCCn', 'kkkykkkk', 'nCCGGCCn'],
  u: ['CcCCCCcC', 'CCCyyCCC', 'nCcCCcCn', 'nCCccCCn', 'kkkkkkkk', 'nCCCCCCn'],
  s: ['nCCCCc', 'nCCCky', 'nCCCCk', 'nCCCCk', 'kkkkyk', 'nCCCCG'],
};

function blade(g: Grid, red: boolean | undefined, pts: [number, number][]) {
  const [edge, core] = red ? ['m', 'r'] : ['c', 'w'];
  pts.forEach(([x, y], i) => put(g, i === pts.length - 1 ? edge : core, x, y));
  // Glow edge one pixel off the core, so the blade reads at this size.
  pts.slice(0, -1).forEach(([x, y]) => { if (g[y + 1]?.[x] === '.') put(g, edge, x, y + 1); });
}

/** Straight 2-px limb from (x0,y0) toward (x1,y1), one row at a time. */
function limb(g: Grid, c: string, x0: number, y0: number, x1: number, y1: number, w = 2) {
  const n = Math.max(1, y1 - y0);
  for (let j = 0; j <= y1 - y0; j++) rect(g, c, Math.round(x0 + (x1 - x0) * j / n), y0 + j, w, 1);
}

function drawFront(g: Grid, p: Pose, back: boolean) {
  const b = p.bob;
  // Legs (pants + sneakers). Lifted legs are shorter and the shoe rises.
  [[9, p.legs[0]], [13, p.legs[1]]].forEach(([x, l]) => {
    const leg = l as Leg, lx = (x as number) + leg.dx;
    rect(g, 'g', lx, 16, 2, 5 - leg.lift);
    rect(g, 'G', lx + (x === 9 ? 1 : 0), 16, 1, 5 - leg.lift);
    rect(g, 'w', lx + (x === 9 ? -1 : 0), 21 - leg.lift, 3, 1);
  });
  // Long coat: flaps beside the legs (front) or a full back panel.
  const sway = p.tail > 0 ? 1 : 0;
  if (back) {
    rect(g, 'C', 8, 16 + b, 8, 1);
    rect(g, 'n', 8, 17 + b, 2, 1); rect(g, 'n', 14, 17 + b, 2, 1);
    put(g, 'n', 8 - sway, 18 + b); put(g, 'n', 15 + sway, 18 + b);
  } else {
    for (let j = 0; j < 3; j++) { put(g, 'n', 8 - (j === 2 ? sway : 0), 16 + b + j); put(g, 'n', 15 + (j === 2 ? sway : 0), 16 + b + j); }
  }
  stamp(g, TORSO[back ? 'u' : 'd'], 8, 10 + b);

  // Arms: cloth arm and chrome arm (the chrome one is on the right when seen from the front).
  const cloth = (x: number, swing: number) => { rect(g, 'C', x, 10 + b, 1, 4 + swing); rect(g, 'n', x + 1, 10 + b, 1, 4 + swing); rect(g, 's', x, 14 + b + swing, 2, 1); };
  const chrome = (x: number, swing: number) => {
    rect(g, 'C', x, 10 + b, 2, 1);
    for (let j = 0; j < 3 + swing; j++) { put(g, j === 1 ? 'c' : 'w', x, 11 + b + j); put(g, 'v', x + 1, 11 + b + j); }
    rect(g, 'v', x, 14 + b + swing, 2, 1);
  };
  const [cx, mx] = back ? [16, 6] : [6, 16];
  if (p.special === 'guard') {
    // Forearms crossed in front of the chest, blade held flat.
    rect(g, 'C', 7, 11 + b, 4, 1); rect(g, 'w', 13, 11 + b, 4, 1); rect(g, 'v', 13, 12 + b, 4, 1);
    if (!back) blade(g, p.red, Array.from({ length: 15 }, (_, i) => [4 + i, 9 + b] as [number, number]));
    else blade(g, p.red, Array.from({ length: 15 }, (_, i) => [4 + i, 8 + b] as [number, number]));
  } else if (p.special === 'hurt') {
    limb(g, 'C', cx === 6 ? 5 : 17, 8 + b, cx === 6 ? 6 : 16, 11 + b, 1); limb(g, 'w', mx === 16 ? 17 : 5, 8 + b, mx === 16 ? 16 : 6, 11 + b, 1);
    put(g, 's', cx === 6 ? 5 : 17, 7 + b); put(g, 'v', mx === 16 ? 17 : 5, 7 + b);
  } else if (p.special === 'atk0' || p.special === 'atk1') {
    cloth(cx, -1);
    if (!back) {
      // Striking downward: the chrome arm thrusts forward, blade toward the camera.
      rect(g, 'C', mx, 10 + b, 2, 1); limb(g, 'w', mx, 11 + b, p.special === 'atk0' ? mx : mx - 3, 15 + b);
      const hx = p.special === 'atk0' ? mx : mx - 3;
      rect(g, 'v', hx, 16 + b, 2, 1);
      blade(g, p.red, p.special === 'atk0'
        ? [[hx, 17 + b], [hx, 18 + b], [hx, 19 + b], [hx, 20 + b], [hx, 21 + b], [hx, 22 + b]]
        : [[hx - 1, 17 + b], [hx - 2, 18 + b], [hx - 3, 19 + b], [hx - 4, 20 + b], [hx - 5, 21 + b]]);
    } else {
      // Striking upward: the arm goes over the shoulder, blade above the head.
      rect(g, 'C', mx, 10 + b, 2, 1); limb(g, 'w', mx, 6 + b, mx, 9 + b);
      blade(g, p.red, p.special === 'atk0'
        ? [[mx, 5 + b], [mx, 4 + b], [mx, 3 + b], [mx, 2 + b], [mx, 1 + b], [mx, 0]]
        : [[mx + 1, 5 + b], [mx + 2, 4 + b], [mx + 3, 3 + b], [mx + 4, 2 + b], [mx + 5, 1 + b]]);
    }
  } else {
    cloth(cx, p.arms[0]);
    chrome(mx, p.arms[1]);
  }

  const head = [...HEAD[back ? 'u' : 'd']];
  if (!back && p.scan >= 0) head[4] = [...head[4]].map((c, i) => (i === p.scan ? 'w' : c)).join('');
  stamp(g, head, 9, 2 + b + (p.special === 'hurt' ? -1 : 0));
}

function drawSide(g: Grid, p: Pose) {
  const b = p.bob, lean = p.lean;
  const arm = (c: string, shade: string, swing: number) => {
    const sx = 11 + lean;
    for (let j = 0; j < 4; j++) {
      const x = sx + Math.round(swing * j / 3);
      put(g, c, x, 11 + b + j); put(g, shade, x + 1, 11 + b + j);
    }
    rect(g, c === 'C' ? 's' : 'w', sx + swing, 15 + b, 2, 1);
  };
  const leg = (c: string, l: Leg) => {
    const end = 20 - l.lift;
    for (let y = 16; y <= end; y++) rect(g, c, 11 + Math.round(l.dx * (y - 16) / 4), y, 2, 1);
    rect(g, 'w', 11 + l.dx, end + 1, 3, 1);
  };

  // Far side first: arm and leg behind the body.
  if (!p.special) arm('C', 'n', -p.arms[0]);
  leg('G', p.legs[0]);
  // Coat tail flares backwards with speed.
  rect(g, 'n', 9 + lean, 16 + b, 2, 1);
  for (let j = 1; j <= 2; j++) rect(g, j === 2 ? 'n' : 'C', 9 + lean - p.tail * j, 16 + b + j - (p.tail > 2 ? j : 0), 2 + p.tail * j, 1);
  leg('g', p.legs[1]);
  stamp(g, TORSO.s, 9 + lean, 10 + b);

  const hx = 11 + lean;
  if (p.special === 'atk0') {
    rect(g, 'w', hx + 2, 12 + b, 4, 1); rect(g, 'v', hx + 2, 13 + b, 4, 1); put(g, 'v', hx + 6, 12 + b);
    blade(g, p.red, Array.from({ length: 6 }, (_, i) => [hx + 7 + i, 12 + b] as [number, number]));
  } else if (p.special === 'atk1') {
    limb(g, 'w', hx + 2, 12 + b, hx + 4, 15 + b); put(g, 'v', hx + 5, 16 + b);
    blade(g, p.red, [[hx + 6, 17 + b], [hx + 7, 18 + b], [hx + 8, 19 + b], [hx + 9, 20 + b], [hx + 10, 21 + b]]);
  } else if (p.special === 'guard') {
    rect(g, 'w', hx + 2, 11 + b, 3, 1); rect(g, 'v', hx + 2, 12 + b, 3, 1);
    blade(g, p.red, Array.from({ length: 12 }, (_, i) => [hx + 5, 5 + b + i] as [number, number]));
  } else if (p.special === 'hurt') {
    limb(g, 'w', hx - 1, 8 + b, hx, 11 + b, 1); limb(g, 'C', hx + 3, 8 + b, hx + 2, 11 + b, 1);
  } else {
    // Near arm is the chrome one, with a cyan line along it.
    arm('v', 'g', p.arms[1]);
    put(g, 'c', hx + Math.round(p.arms[1] / 3), 12 + b);
  }

  const head = [...HEAD.s];
  if (p.scan >= 0) head[4] = [...head[4]].map((c, i) => (i - 2 === p.scan ? 'w' : c)).join('');
  stamp(g, head, 9 + lean + (p.special === 'hurt' ? -1 : 0), 2 + b);
}

function render(scene: Phaser.Scene, key: string, facing: Facing, pose: Pose) {
  if (scene.textures.exists(key)) return;
  const g = blank();
  if (facing === 's') drawSide(g, pose); else drawFront(g, pose, facing === 'u');
  outline(g);
  const tex = scene.textures.createCanvas(key, PLAYER_FRAME, PLAYER_FRAME)!;
  const ctx = tex.getContext();
  g.forEach((row, y) => row.forEach((ch, x) => {
    const col = PALETTE[ch];
    if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
  }));
  tex.refresh();
}

// ---- Poses -------------------------------------------------------------------------------
const still: Leg = { dx: 0, lift: 0 };
const base = (o: Partial<Pose> = {}): Pose => ({ bob: 0, lean: 0, legs: [still, still], arms: [0, 0], tail: 0, scan: -1, ...o });

/** Breathing (shoulders drop a pixel) while a light scans across the visor. */
const IDLE: Pose[] = [0, 0, 0, 1, 1, 1, 1, 0].map((bob, i) => base({ bob, scan: i < 6 ? i : -1 }));

/** Six-frame walk. Front/back: legs lift in turn, arms swing; profile: full stride with the coat tail flapping. */
function walk(facing: Facing): Pose[] {
  if (facing === 's') {
    const dx = [3, 1, -1, -3, -1, 1], lift = [0, 0, 0, 0, 2, 1];
    return dx.map((_, i) => {
      const j = (i + 3) % 6;
      return base({ bob: i % 3 === 0 ? 1 : 0, legs: [{ dx: dx[j], lift: lift[j] }, { dx: dx[i], lift: lift[i] }], arms: [Math.round(dx[i] / 2), Math.round(dx[j] / 2)], tail: i % 3 === 0 ? 0 : 1 });
    });
  }
  const lifts: [number, number][] = [[0, 2], [0, 1], [0, 0], [2, 0], [1, 0], [0, 0]];
  return lifts.map(([l, r], i) => base({ bob: i % 3 === 2 ? 0 : i % 3, legs: [{ dx: 0, lift: l }, { dx: 0, lift: r }], arms: i < 3 ? [1, -1] : [-1, 1], tail: i % 3 === 1 ? 1 : 0 }));
}

const COMBAT: Record<string, (red: boolean, f: Facing) => Pose> = {
  atk0: (red, f) => base({ special: 'atk0', red, lean: 1, legs: f === 's' ? [{ dx: -2, lift: 0 }, { dx: 3, lift: 0 }] : [still, still], bob: f === 's' ? 1 : 0 }),
  atk1: (red, f) => base({ special: 'atk1', red, lean: 1, legs: f === 's' ? [{ dx: -2, lift: 0 }, { dx: 3, lift: 0 }] : [still, still], bob: 1 }),
  guard: (red, f) => base({ special: 'guard', red, bob: 1, legs: f === 's' ? [{ dx: -2, lift: 0 }, { dx: 1, lift: 0 }] : [still, still] }),
};

export const playerKey = (f: Facing, frame: string) => `pl-${f}-${frame}`;

/** Draws every player frame and registers `pl-idle-{f}` and `pl-walk-{f}`. */
export function generatePlayerArt(scene: Phaser.Scene) {
  for (const f of ['d', 'u', 's'] as Facing[]) {
    IDLE.forEach((p, i) => render(scene, playerKey(f, `idle${i}`), f, p));
    walk(f).forEach((p, i) => render(scene, playerKey(f, `walk${i}`), f, p));
    for (const [name, make] of Object.entries(COMBAT)) {
      render(scene, playerKey(f, name), f, make(false, f));
      render(scene, playerKey(f, `${name}-r`), f, make(true, f));
    }
    render(scene, playerKey(f, 'hurt'), f, base({ special: 'hurt', legs: [still, { dx: f === 's' ? 2 : 0, lift: 1 }], lean: f === 's' ? -1 : 0 }));
    render(scene, playerKey(f, 'dash'), f, f === 's'
      ? base({ lean: 2, bob: 1, legs: [{ dx: -3, lift: 1 }, { dx: -1, lift: 0 }], arms: [-2, -2], tail: 3 })
      : base({ bob: 1, legs: [{ dx: 0, lift: 1 }, { dx: 0, lift: 1 }], arms: [-1, -1], tail: 1 }));
    render(scene, playerKey(f, 'down'), f, base({ bob: 3, legs: [{ dx: f === 's' ? -2 : 0, lift: 3 }, { dx: f === 's' ? 2 : 0, lift: 2 }], arms: [1, 1] }));

    const anim = (name: string, frames: number, frameRate: number) => {
      const key = `pl-${name}-${f}`;
      if (!scene.anims.exists(key)) scene.anims.create({ key, frames: Array.from({ length: frames }, (_, i) => ({ key: playerKey(f, `${name}${i}`) })), frameRate, repeat: -1 });
    };
    anim('idle', IDLE.length, 6);
    anim('walk', 6, 12);
  }
}
