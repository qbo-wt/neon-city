import Phaser from 'phaser';
import { COLORS } from '../config';
import { pick, type Rng } from '../core/rng';
import { TILE } from '../core/runMap';
import type { RoomTemplate } from '../data/rooms';
import type { CanvasTex, Px } from './generateTextures';
import type { StreetStyle } from './streetArt';

/** Street furniture sprites. */
export function generatePropTextures(scene: Phaser.Scene, tex: CanvasTex, px: Px) {
  tex(scene, 'hydrant', 10, 12, ctx => {
    px(ctx, '#05030f', 1, 1, 8, 11); px(ctx, '#d8282a', 2, 2, 6, 9); px(ctx, '#ff5a5a', 2, 2, 6, 2);
    px(ctx, '#05030f', 0, 5, 10, 2); px(ctx, '#a81a1c', 0, 5, 1, 2); px(ctx, '#a81a1c', 9, 5, 1, 2);
  });
  tex(scene, 'lamp-base', 8, 8, ctx => { px(ctx, '#05030f', 1, 1, 6, 6); px(ctx, '#5a5578', 2, 2, 4, 4); px(ctx, '#8a86b0', 3, 3, 2, 2); });
  tex(scene, 'lamp-head', 18, 8, ctx => {
    px(ctx, '#05030f', 0, 2, 12, 3); px(ctx, '#3a3550', 1, 3, 10, 1); // arm
    px(ctx, '#05030f', 10, 0, 8, 7); px(ctx, '#5a5578', 11, 1, 6, 3); px(ctx, '#fff2b0', 11, 4, 6, 2);
  });
  tex(scene, 'busstop', 46, 22, ctx => {
    px(ctx, '#05030f', 0, 0, 46, 10); px(ctx, '#9ae8ff55', 1, 1, 44, 8); px(ctx, '#e8e8ff88', 1, 1, 44, 1); // glass roof
    px(ctx, '#05030f', 2, 10, 2, 12); px(ctx, '#05030f', 42, 10, 2, 12);
    px(ctx, '#05030f', 6, 14, 26, 6); px(ctx, '#5a4a3a', 7, 15, 24, 3); // bench
    px(ctx, '#05030f', 34, 10, 8, 12); px(ctx, '#ff2a6d', 35, 11, 6, 10); px(ctx, '#ffffff66', 35, 11, 6, 2); // lit ad panel
  });
  tex(scene, 'newsbox', 12, 14, ctx => {
    px(ctx, '#05030f', 0, 0, 12, 14); px(ctx, '#1a5aaa', 1, 1, 10, 12); px(ctx, '#f5e663', 2, 3, 8, 4); px(ctx, '#05030f', 3, 4, 6, 1);
  });
  tex(scene, 'tree-pit', 16, 16, ctx => { px(ctx, '#05030f', 0, 0, 16, 16); px(ctx, '#2a2238', 1, 1, 14, 14); for (let k = 3; k < 14; k += 3) px(ctx, '#05030f', k, 2, 1, 12); px(ctx, '#3a2f25', 6, 6, 4, 4); });
  tex(scene, 'tree', 34, 32, ctx => {
    const blob = (x: number, y: number, r: number, c: string) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
    blob(17, 17, 15, '#05030f'); blob(17, 16, 14, '#0f3a2a'); blob(11, 12, 8, '#1d5a3a'); blob(23, 13, 7, '#1d5a3a'); blob(16, 21, 8, '#185034');
    blob(10, 10, 3, '#39ff8855'); blob(22, 10, 3, '#ff2a6d33'); // neon catching the leaves
  });
  tex(scene, 'bollard', 6, 8, ctx => { px(ctx, '#05030f', 0, 0, 6, 8); px(ctx, '#8a86b0', 1, 1, 4, 6); px(ctx, '#f5e663', 1, 2, 4, 2); });
  tex(scene, 'trashbags', 24, 16, ctx => {
    [[2, 5, 9], [10, 3, 10], [14, 8, 9], [5, 9, 8]].forEach(([x, y, r]) => {
      ctx.fillStyle = '#05030f'; ctx.beginPath(); ctx.ellipse(x + r / 2, y + r / 2, r / 2 + 1, r / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1a24'; ctx.beginPath(); ctx.ellipse(x + r / 2, y + r / 2, r / 2, r / 2 - 1, 0, 0, Math.PI * 2); ctx.fill();
      px(ctx, '#3a3a4e', x + 2, y + 1, 3, 1);
    });
  });
  tex(scene, 'bench-street', 36, 12, ctx => {
    px(ctx, '#05030f', 0, 0, 36, 12); px(ctx, '#3a3550', 1, 1, 34, 4); px(ctx, '#5a4a3a', 1, 6, 34, 5);
    for (let x = 4; x < 34; x += 6) px(ctx, '#3a2f25', x, 6, 1, 5);
  });
  tex(scene, 'traffic-light', 10, 10, ctx => { px(ctx, '#05030f', 0, 0, 10, 10); px(ctx, '#3a3550', 1, 1, 8, 8); px(ctx, '#05030f', 3, 3, 4, 4); });
  tex(scene, 'scooter', 22, 12, ctx => {
    ctx.fillStyle = '#05030f'; [[4, 9], [18, 9]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });
    px(ctx, '#05030f', 3, 3, 17, 5); px(ctx, '#ff2a6d', 4, 4, 15, 3); px(ctx, '#e8e8ff', 16, 1, 2, 3); px(ctx, '#f5e663', 19, 4, 2, 2);
  });
  tex(scene, 'phonebooth', 16, 24, ctx => {
    px(ctx, '#05030f', 0, 0, 16, 24); px(ctx, '#0a3a4a', 1, 1, 14, 22); px(ctx, '#00f0ff66', 2, 3, 12, 14);
    px(ctx, '#00f0ff', 2, 1, 12, 1); px(ctx, '#e8e8ff', 6, 8, 4, 5);
  });
  tex(scene, 'cardboard', 20, 14, ctx => { px(ctx, '#05030f', 0, 2, 20, 12); px(ctx, '#8a6a4a', 1, 3, 18, 10); px(ctx, '#6a4a2a', 1, 3, 18, 2); px(ctx, '#e8e8ff', 4, 7, 8, 1); });
}

interface PropDef { key: string; body?: [number, number]; overhead?: string; glow?: number; pole?: boolean }
const P: Record<string, PropDef> = {
  hydrant: { key: 'hydrant', body: [8, 8] },
  lamp: { key: 'lamp-base', body: [6, 6], overhead: 'lamp-head', glow: COLORS.yellow, pole: true },
  bus: { key: 'busstop', body: [26, 6] },
  news: { key: 'newsbox', body: [10, 10] },
  tree: { key: 'tree-pit', body: [6, 6], overhead: 'tree' },
  bollard: { key: 'bollard', body: [5, 5] },
  bags: { key: 'trashbags' },
  bench: { key: 'bench-street', body: [34, 8] },
  traffic: { key: 'traffic-light', body: [6, 6], pole: true },
  scooter: { key: 'scooter', body: [18, 6] },
  booth: { key: 'phonebooth', body: [14, 12], glow: COLORS.cyan },
  boxes: { key: 'cardboard' },
};
const BY_STYLE: Record<StreetStyle, (keyof typeof P)[]> = {
  avenue: ['lamp', 'lamp', 'tree', 'tree', 'hydrant', 'bus', 'news', 'bench', 'bollard', 'bags', 'scooter', 'booth'],
  crossroad: ['traffic', 'lamp', 'lamp', 'bollard', 'bollard', 'hydrant', 'news', 'booth', 'scooter'],
  alley: ['bags', 'bags', 'bags', 'boxes', 'boxes', 'scooter', 'lamp'],
  market: ['boxes', 'boxes', 'bags', 'bench', 'scooter', 'lamp', 'booth'],
  parking: ['bollard', 'bollard', 'lamp', 'scooter', 'scooter', 'bags'],
  plaza: ['tree', 'tree', 'bench', 'lamp', 'booth'],
  docks: ['bollard', 'bollard', 'boxes', 'bags', 'lamp'],
  checkpoint: ['bollard', 'bollard', 'lamp', 'boxes'],
};

/**
 * Furniture along the sidewalks (tiles touching a building), never in front of an exit or the entry.
 * Solid props get a small static body in `walls`; tree crowns and lamp heads are drawn above the player.
 */
export function placeStreetProps(scene: Phaser.Scene, template: RoomTemplate, style: StreetStyle, rng: Rng,
  walls: Phaser.Physics.Arcade.StaticGroup, blocked: Set<string>) {
  const g = template.grid;
  const isFloor = (x: number, y: number) => { const c = g[y]?.[x]; return c === '.' || c === 'P'; };
  const built = (x: number, y: number) => { const c = g[y]?.[x]; return c === undefined || c === '#' || c === ' ' || c === 'D'; };
  const p = g.findIndex(r => r.includes('P')), start = { x: g[p].indexOf('P'), y: p };
  const spots: { x: number; y: number; dx: number; dy: number }[] = [];
  g.forEach((row, ty) => [...row].forEach((ch, tx) => {
    if (ch !== '.' || blocked.has(`${tx},${ty}`)) return;
    if (g[ty - 1]?.[tx] === 'D' || g[ty - 2]?.[tx] === 'D') return;
    if (Math.abs(tx - start.x) + Math.abs(ty - start.y) < 3) return;
    const dir = [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([dx, dy]) => built(tx + dx, ty + dy));
    if (dir && isFloor(tx - dir[0], ty - dir[1])) spots.push({ x: tx, y: ty, dx: dir[0], dy: dir[1] });
  }));
  const count = Math.min(spots.length, Math.round(spots.length / 2.6));
  for (let i = 0; i < count; i++) {
    const s = spots.splice(Math.floor(rng() * spots.length), 1)[0];
    // Never two props side by side: they would wall off the sidewalk.
    for (let k = spots.length - 1; k >= 0; k--) if (Math.abs(spots[k].x - s.x) + Math.abs(spots[k].y - s.y) <= 1) spots.splice(k, 1);
    const def = P[pick(rng, BY_STYLE[style])];
    // Hug the building side of the tile.
    // A building below means we see its roof: stay on the pavement instead of overlapping it.
    const x = s.x * TILE + 16 + s.dx * 9, y = s.y * TILE + 16 + (s.dy === 1 ? -4 : s.dy * 9);
    if (def.body) {
      const o = walls.create(x, y, def.key) as Phaser.Physics.Arcade.Image;
      o.setDepth(2.5);
      (o.body as Phaser.Physics.Arcade.StaticBody).setSize(def.body[0], def.body[1]);
      blocked.add(`${s.x},${s.y}`);
    } else {
      scene.add.image(x, y, def.key).setDepth(1.8);
    }
    if (def.overhead) {
      const flip = s.dx > 0;
      const oy = def.pole ? y - 10 : y - 6;
      scene.add.image(x + (def.pole ? (flip ? -6 : 6) : 0), oy, def.overhead).setDepth(36).setFlipX(flip).setAlpha(def.overhead === 'tree' ? 0.95 : 1);
    }
    if (def.glow) scene.add.image(x - s.dx * 14, y - s.dy * 14, 'glow').setTint(def.glow).setAlpha(0.3).setScale(1.6, 1.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(1.7);
    if (def.key === 'traffic-light') {
      const l = scene.add.rectangle(x, y - 1, 3, 3, 0xff3b3b).setDepth(3);
      const seq = [0x39ff88, 0xf5e663, 0xff3b3b];
      let k = Math.floor(rng() * 3);
      scene.time.addEvent({ delay: 2200, loop: true, callback: () => l.setFillStyle(seq[k++ % 3]) });
    }
  }
}
