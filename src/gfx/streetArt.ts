import Phaser from 'phaser';
import { COLORS } from '../config';
import { createRng, pick, type Rng } from '../core/rng';
import { TILE } from '../core/runMap';
import type { RoomTemplate } from '../data/rooms';
import type { CanvasTex, Px } from './generateTextures';
import { txt } from '../ui/text';

export type StreetStyle = 'avenue' | 'alley' | 'market' | 'crossroad' | 'parking' | 'plaza' | 'docks' | 'checkpoint';

const STYLE_BY_TEMPLATE: Record<string, StreetStyle> = {
  alley: 'alley', market: 'market', crossroad: 'crossroad', parking: 'parking',
  plaza: 'avenue', warehouse: 'docks', 'boss-arena': 'checkpoint',
};

export const STREET_NAMES: Record<StreetStyle, string[]> = {
  avenue: ['Avenue Kessler', 'Boulevard des Néons'],
  alley: ['Ruelle des Rats', 'Passage Sombre'],
  market: ['Marché de nuit', 'Bazar Sun-Lo'],
  crossroad: ['Carrefour Delta', 'Croisement 9'],
  parking: ['Parking Niveau -1', 'Parking Hoshi'],
  plaza: ['Place du Totem', 'Esplanade Vega'],
  docks: ['Docks Est', 'Zone industrielle'],
  checkpoint: ['Barrage Psy-Sec', 'Barrage Psy-Sec'],
};

const OBSTACLES: Record<StreetStyle, string[]> = {
  avenue: ['ob-car-0', 'ob-car-1', 'ob-barrier', 'tile-obstacle'],
  alley: ['tile-obstacle', 'ob-trash', 'ob-crate'],
  market: ['ob-stall-0', 'ob-stall-1', 'ob-crate'],
  crossroad: ['ob-barrier', 'ob-car-0', 'ob-car-2'],
  parking: ['ob-car-0', 'ob-car-1', 'ob-car-2'],
  plaza: ['ob-planter', 'ob-vending', 'ob-planter'],
  docks: ['ob-crate', 'ob-container', 'tile-obstacle'],
  checkpoint: ['ob-barrier', 'ob-container'],
};

const SIGNS = ['RAMEN', 'BAR', 'HÔTEL', '24/7', 'NOODLES', 'CLUB', 'PRÊTEUR', 'TATOUAGE', 'KARAOKÉ', 'PHARMA', 'ARCADE', 'SUSHI', 'MOTEL'];

export const streetStyle = (t: RoomTemplate): StreetStyle => STYLE_BY_TEMPLATE[t.id] ?? 'avenue';
export const obstacleFor = (style: StreetStyle, rng: Rng) => pick(rng, OBSTACLES[style]);

/** Static sprites used by every street (obstacles and props). */
export function generateStreetTextures(scene: Phaser.Scene, tex: CanvasTex, px: Px) {
  const car = (key: string, body: string, dark: string) => tex(scene, key, 32, 32, ctx => {
    px(ctx, '#05030f', 1, 3, 30, 27);
    px(ctx, body, 2, 4, 28, 25);
    px(ctx, dark, 2, 4, 28, 3); px(ctx, dark, 2, 26, 28, 3);
    px(ctx, '#0d1a2a', 7, 8, 18, 6); px(ctx, '#0d1a2a', 7, 19, 18, 5); // windshields
    px(ctx, '#3a5a7a', 8, 9, 6, 1);
    px(ctx, '#f5e663', 3, 5, 3, 2); px(ctx, '#f5e663', 26, 5, 3, 2); // headlights
    px(ctx, '#ff3b3b', 3, 27, 3, 1); px(ctx, '#ff3b3b', 26, 27, 3, 1);
  });
  car('ob-car-0', '#3a3058', '#2a2245');
  car('ob-car-1', '#8a1038', '#5a0a24');
  car('ob-car-2', '#a89a2a', '#6a6018');
  tex(scene, 'ob-barrier', 32, 32, ctx => {
    px(ctx, '#05030f', 1, 10, 30, 16); px(ctx, '#8a8aa8', 2, 11, 28, 14);
    for (let x = 2; x < 30; x += 8) px(ctx, '#ff3b3b', x, 11, 4, 14);
    px(ctx, '#b8b8d0', 2, 11, 28, 2);
  });
  tex(scene, 'ob-trash', 32, 32, ctx => {
    [[4, 12, 12], [14, 8, 13], [10, 18, 14], [20, 16, 10]].forEach(([x, y, r]) => {
      px(ctx, '#05030f', x - 1, y - 1, r + 2, r + 2); px(ctx, '#1a1a24', x, y, r, r); px(ctx, '#2a2a3c', x + 2, y + 1, r - 5, 2);
    });
  });
  tex(scene, 'ob-crate', 32, 32, ctx => {
    px(ctx, '#05030f', 2, 3, 28, 27); px(ctx, '#5a4a3a', 3, 4, 26, 25);
    px(ctx, '#3a2f25', 3, 4, 26, 2); px(ctx, '#3a2f25', 3, 16, 26, 1); px(ctx, '#3a2f25', 15, 4, 1, 25);
    px(ctx, '#f5e663', 6, 8, 6, 3);
  });
  tex(scene, 'ob-container', 32, 32, ctx => {
    px(ctx, '#05030f', 0, 2, 32, 28); px(ctx, '#00707a', 1, 3, 30, 26);
    for (let x = 3; x < 30; x += 4) px(ctx, '#004a52', x, 3, 1, 26);
    px(ctx, '#e8e8ff', 4, 14, 12, 3);
  });
  const stall = (key: string, a: string, b: string) => tex(scene, key, 32, 32, ctx => {
    px(ctx, '#05030f', 1, 1, 30, 30);
    for (let x = 1; x < 31; x += 6) { px(ctx, a, x, 2, 3, 12); px(ctx, b, x + 3, 2, 3, 12); } // awning
    px(ctx, '#3a2f25', 2, 15, 28, 14);
    px(ctx, '#f5e663', 5, 18, 4, 4); px(ctx, '#ff2a6d', 12, 18, 4, 4); px(ctx, '#39ff88', 19, 18, 4, 4);
    px(ctx, '#f5e66388', 1, 14, 30, 1);
  });
  stall('ob-stall-0', '#ff2a6d', '#e8e8ff');
  stall('ob-stall-1', '#00f0ff', '#05030f');
  tex(scene, 'ob-planter', 32, 32, ctx => {
    px(ctx, '#05030f', 2, 6, 28, 24); px(ctx, '#5a5578', 3, 7, 26, 22); px(ctx, '#1a2a1a', 6, 10, 20, 16);
    [[8, 11], [16, 13], [12, 19], [20, 18]].forEach(([x, y]) => px(ctx, '#39ff88', x, y, 5, 5));
  });
  tex(scene, 'ob-vending', 32, 32, ctx => {
    px(ctx, '#05030f', 4, 2, 24, 29); px(ctx, '#00a0b0', 5, 3, 22, 27);
    px(ctx, '#05030f', 7, 6, 13, 16);
    for (let y = 7; y < 21; y += 4) for (let x = 8; x < 19; x += 4) px(ctx, (x + y) % 3 ? '#f5e663' : '#ff2a6d', x, y, 2, 2);
  });
  // Decor (no collision)
  tex(scene, 'manhole', 16, 16, ctx => {
    ctx.fillStyle = '#05030f'; ctx.beginPath(); ctx.arc(8, 8, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2a3c'; ctx.beginPath(); ctx.arc(8, 8, 6, 0, Math.PI * 2); ctx.fill();
    for (let y = 4; y < 13; y += 3) px(ctx, '#1a1a24', 3, y, 10, 1);
  });
  tex(scene, 'cone', 8, 10, ctx => {
    px(ctx, '#05030f', 0, 8, 8, 2); px(ctx, '#ff8c2a', 2, 1, 4, 8); px(ctx, '#e8e8ff', 2, 4, 4, 2);
  });
  tex(scene, 'lamp', 10, 10, ctx => {
    px(ctx, '#05030f', 2, 2, 6, 6); px(ctx, '#f5e663', 3, 3, 4, 4);
  });
  tex(scene, 'steam', 8, 8, ctx => {
    ctx.fillStyle = 'rgba(200,200,230,0.35)'; ctx.beginPath(); ctx.arc(4, 4, 4, 0, Math.PI * 2); ctx.fill();
  });
}

/** Paints this sector's ground (road, sidewalks, markings, puddles) into one texture. */
export function paintStreetGround(scene: Phaser.Scene, key: string, template: RoomTemplate, style: StreetStyle, rng: Rng) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const W = template.grid[0].length * TILE, H = template.grid.length * TILE;
  const t = scene.textures.createCanvas(key, W, H)!;
  const ctx = t.getContext();
  const f = (c: string, x: number, y: number, w: number, h: number) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const asphalt = (x: number, y: number, w: number, h: number) => {
    f('#14101f', x, y, w, h);
    for (let i = 0; i < w * h / 90; i++) f(rng() < 0.5 ? '#191428' : '#100c1a', x + rng() * w, y + rng() * h, 2, 1);
  };

  // Map-aware painting: sidewalks hug the walls whatever the shape, markings run through the middle.
  const g = template.grid, rows = g.length, cols = g[0].length;
  const walkable = (x: number, y: number) => { const c = g[y]?.[x]; return c === '.' || c === 'P' || c === 'o'; };
  const nearWall = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !walkable(x + dx, y + dy));
  const hasSidewalk = style === 'avenue' || style === 'crossroad' || style === 'checkpoint';
  const isWalk = (x: number, y: number) => hasSidewalk && walkable(x, y) && nearWall(x, y);

  // Base ground.
  if (style === 'market') {
    f('#2a1e2e', 0, 0, W, H);
    for (let y = 0; y < H; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < W; x += 16) f('#33253a', x, y, 15, 15);
  } else if (style === 'docks') {
    f('#1e1e26', 0, 0, W, H);
    for (let i = 0; i < W * H / 400; i++) f('#25252f', rng() * W, rng() * H, 6, 1);
  } else {
    asphalt(0, 0, W, H);
  }

  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const x = tx * TILE, y = ty * TILE;
    if (g[ty][tx] === ' ') { f('#0b0820', x, y, TILE, TILE); continue; }
    if (!isWalk(tx, ty)) continue;
    // Sidewalk slab, with a curb on every side that faces the road.
    f('#2a2438', x, y, TILE, TILE);
    f('#221d30', x + 15, y, 1, TILE); f('#221d30', x, y + 15, TILE, 1);
    const curbTo = (dx: number, dy: number) => walkable(tx + dx, ty + dy) && !isWalk(tx + dx, ty + dy);
    if (curbTo(0, 1)) { f('#5a5578', x, y + TILE - 3, TILE, 2); f('#05030f', x, y + TILE - 1, TILE, 1); }
    if (curbTo(0, -1)) { f('#5a5578', x, y + 1, TILE, 2); f('#05030f', x, y, TILE, 1); }
    if (curbTo(1, 0)) { f('#5a5578', x + TILE - 3, y, 2, TILE); f('#05030f', x + TILE - 1, y, 1, TILE); }
    if (curbTo(-1, 0)) { f('#5a5578', x + 1, y, 2, TILE); f('#05030f', x, y, 1, TILE); }
  }

  const road = (tx: number, ty: number) => walkable(tx, ty) && !isWalk(tx, ty);
  const midRow = Math.floor(rows / 2), midCol = Math.floor(cols / 2);
  if (style === 'avenue' || style === 'crossroad' || style === 'checkpoint') {
    for (let tx = 0; tx < cols; tx++) if (road(tx, midRow)) { f('#f5e663', tx * TILE + 4, midRow * TILE - 1, 12, 2); f('#f5e663', tx * TILE + 20, midRow * TILE - 1, 8, 2); }
  }
  if (style === 'crossroad') {
    for (let ty = 0; ty < rows; ty++) if (road(midCol, ty)) f('#f5e663', midCol * TILE - 1, ty * TILE + 6, 2, 14);
    // Zebra crossings on the four arms of the junction.
    for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
      if (!road(tx, ty)) continue;
      const dx = Math.abs(tx - midCol), dy = Math.abs(ty - midRow);
      if (dx === 5 && dy <= 2) for (let k = 0; k < 4; k++) f('#e8e8ffbb', tx * TILE + 4, ty * TILE + 2 + k * 8, 24, 4);
      if (dy === 4 && dx <= 3) for (let k = 0; k < 4; k++) f('#e8e8ffbb', tx * TILE + 2 + k * 8, ty * TILE + 4, 4, 24);
    }
  }
  if (style === 'parking') {
    for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
      if (!walkable(tx, ty)) continue;
      if (ty % 5 === 2) f('#e8e8ffaa', tx * TILE, ty * TILE + 30, TILE, 2);
      if (ty % 5 === 1 || ty % 5 === 3) f('#e8e8ffaa', tx * TILE, ty * TILE, 2, TILE);
    }
    f('#f5e663', W / 2 - 10, H - 3 * TILE, 20, 2);
  }
  if (style === 'checkpoint') {
    // Containment circle painted on the asphalt, dashed yellow/black, with the Psy-Sec mark in the middle.
    const cx = W / 2, cy = H / 2, R = 4.6 * TILE;
    ctx.fillStyle = '#ff2a6d14'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 6;
    ctx.setLineDash([14, 14]); ctx.strokeStyle = '#f5e663'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.lineDashOffset = 14; ctx.strokeStyle = '#05030f'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = '#ff2a6d88'; ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.font = 'bold 14px monospace'; ctx.fillStyle = '#ff2a6d88'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PSY-SEC', cx, cy);
  }
  if (style === 'docks') {
    for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) if (walkable(tx, ty) && !walkable(tx, ty - 1))
      for (let k = 0; k < 4; k++) f(k % 2 ? '#05030f' : '#f5e663', tx * TILE + k * 8, ty * TILE + 3, 8, 3);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = '#0a0a12'; ctx.beginPath(); ctx.ellipse(rng() * W, rng() * H, 14, 6, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  if (style === 'alley') {
    for (let i = 0; i < 12; i++) {
      let x = rng() * W, y = rng() * H;
      ctx.strokeStyle = '#05030f'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (rng() - 0.5) * 30; y += (rng() - 0.5) * 18; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }

  // Street wear: tyre marks, lane arrows, drains along the curbs, cracked slabs and litter.
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const x = tx * TILE, y = ty * TILE;
    if (road(tx, ty)) {
      if (style !== 'market' && rng() < 0.06) {
        ctx.strokeStyle = '#0000004d'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(x, y + 8 + rng() * 16); ctx.quadraticCurveTo(x + 16, y + rng() * 32, x + 32, y + 8 + rng() * 16); ctx.stroke();
      }
      if ((style === 'avenue' || style === 'crossroad') && Math.abs(ty - midRow) === 2 && tx % 7 === 3) {
        const dir = ty < midRow ? -1 : 1, ax = x + 16, ay = y + 16; // lane arrow
        f('#e8e8ff88', ax - 8 * dir, ay - 1, 12, 3);
        ctx.fillStyle = '#e8e8ff88'; ctx.beginPath(); ctx.moveTo(ax + 6 * dir, ay - 5); ctx.lineTo(ax + 12 * dir, ay + 0.5); ctx.lineTo(ax + 6 * dir, ay + 6); ctx.fill();
      }
      if (rng() < 0.04) for (let k = 0; k < 3; k++) f(pick(rng, ['#e8e8ff66', '#ff2a6d66', '#f5e66366', '#8a86b066']), x + rng() * 30, y + rng() * 30, 2, 1);
    }
    if (isWalk(tx, ty)) {
      const toRoad = [[0, 1], [0, -1], [1, 0], [-1, 0]].find(([dx, dy]) => road(tx + dx, ty + dy));
      if (toRoad && (tx + ty) % 5 === 0) { // drain grate on the curb
        const gx = x + 10 + toRoad[0] * 10, gy = y + 12 + toRoad[1] * 10;
        f('#05030f', gx, gy, 10, 7); for (let k = 1; k < 10; k += 2) f('#3a3550', gx + k, gy + 1, 1, 5);
      }
      if (rng() < 0.15) { ctx.strokeStyle = '#14101f'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + rng() * 32, y + rng() * 32); ctx.lineTo(x + rng() * 32, y + rng() * 32); ctx.stroke(); }
      if (rng() < 0.08) f(pick(rng, ['#c8c8e8', '#ff8c2a', '#39ff88']), x + 4 + rng() * 24, y + 4 + rng() * 24, 3, 2); // a can, a flyer
    }
  }

  // Puddles reflecting the neon, only on walkable ground.
  const floorTiles: [number, number][] = [];
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) if (walkable(tx, ty)) floorTiles.push([tx, ty]);
  const puddles = Math.round(floorTiles.length / (style === 'alley' ? 18 : 30));
  for (let i = 0; i < puddles; i++) {
    const [tx, ty] = pick(rng, floorTiles);
    const x = tx * TILE + 16, y = ty * TILE + 16, w = 14 + rng() * 22;
    ctx.fillStyle = '#1d2a4acc'; ctx.beginPath(); ctx.ellipse(x, y, w / 2, w / 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pick(rng, ['#ff2a6d55', '#00f0ff55', '#f5e66344']); ctx.fillRect(x - w / 4, y - 1, w / 2, 1);
  }
  t.refresh();
}

/** Signs, graffiti, lamps, steam and litter: different on every sector, placed along the real walls. */
export function decorateStreet(scene: Phaser.Scene, template: RoomTemplate, style: StreetStyle, rng: Rng) {
  const g = template.grid;
  const walkable = (x: number, y: number) => { const c = g[y]?.[x]; return c === '.' || c === 'P' || c === 'o'; };
  const neon = [COLORS.magenta, COLORS.cyan, COLORS.yellow, 0x39ff88];

  // Ground props on free floor tiles: about one per 18 tiles. (Facades, signs and graffiti come from cityArt.)
  const free: { x: number; y: number }[] = [];
  g.forEach((row, ty) => [...row].forEach((ch, tx) => { if (ch === '.') free.push({ x: tx, y: ty }); }));
  const props = Math.round(free.length / (style === 'alley' ? 12 : 18));
  for (let i = 0; i < props && free.length; i++) {
    const p = free.splice(Math.floor(rng() * free.length), 1)[0];
    const x = p.x * TILE + 8 + rng() * 16, y = p.y * TILE + 8 + rng() * 16;
    const kind = pick(rng, style === 'checkpoint' ? ['cone', 'cone', 'manhole', 'lamp'] : ['manhole', 'cone', 'lamp', 'steam-vent', 'lamp']);
    if (kind === 'manhole' || kind === 'steam-vent') {
      scene.add.image(x, y, 'manhole').setDepth(0.5);
      if (kind === 'steam-vent' || rng() < 0.5) {
        scene.time.addEvent({ delay: 220, loop: true, callback: () => {
          const s = scene.add.image(x + (Math.random() - 0.5) * 6, y, 'steam').setDepth(30).setAlpha(0.5);
          scene.tweens.add({ targets: s, y: y - 30, x: s.x + 6, scale: 2.2, alpha: 0, duration: 1600, onComplete: () => s.destroy() });
        } });
      }
    } else if (kind === 'lamp') {
      scene.add.image(x, y, 'lamp').setDepth(0.6);
      scene.add.image(x, y, 'glow').setTint(COLORS.yellow).setAlpha(0.3).setScale(1.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(1);
    } else {
      scene.add.image(x, y, 'cone').setDepth(0.6);
    }
  }
}

/** Breakables, relics, gold bullets and the blackout mask. */
export function generateLootTextures(scene: Phaser.Scene, tex: CanvasTex, px: Px) {
  tex(scene, 'br-crate', 22, 22, ctx => {
    px(ctx, '#05030f', 0, 0, 22, 22); px(ctx, '#8a6a4a', 1, 1, 20, 20);
    px(ctx, '#5a4a3a', 1, 1, 20, 2); px(ctx, '#5a4a3a', 1, 10, 20, 2); px(ctx, '#5a4a3a', 10, 1, 2, 20);
    px(ctx, '#f5e663', 3, 15, 16, 2); // hazard tape
  });
  tex(scene, 'br-barrel', 16, 22, ctx => {
    px(ctx, '#05030f', 1, 0, 14, 22); px(ctx, '#39a85a', 2, 1, 12, 20);
    px(ctx, '#1d6a3a', 2, 6, 12, 1); px(ctx, '#1d6a3a', 2, 14, 12, 1);
    px(ctx, '#f5e663', 5, 8, 6, 5); px(ctx, '#05030f', 7, 9, 2, 3); // toxic sign
  });
  tex(scene, 'br-vending', 20, 28, ctx => {
    px(ctx, '#05030f', 0, 0, 20, 28); px(ctx, '#ff8c2a', 1, 1, 18, 26);
    px(ctx, '#05030f', 3, 3, 10, 14);
    for (let y = 4; y < 16; y += 4) for (let x = 4; x < 12; x += 4) px(ctx, (x + y) % 8 ? '#39ff88' : '#00f0ff', x, y, 2, 2);
    px(ctx, '#e8e8ff', 15, 5, 2, 7); px(ctx, '#05030f', 4, 21, 9, 3);
  });
  tex(scene, 'br-trash', 16, 16, ctx => {
    px(ctx, '#05030f', 1, 1, 14, 15); px(ctx, '#3a5a7a', 2, 2, 12, 13); px(ctx, '#5a7a9a', 2, 2, 12, 3);
    px(ctx, '#e8e8ff', 5, 8, 6, 1); px(ctx, '#e8e8ff', 5, 11, 6, 1);
  });
  tex(scene, 'relic-katana', 26, 26, ctx => {
    for (let i = 0; i < 20; i++) { px(ctx, '#e8e8ff', 4 + i, 21 - i, 2, 2); px(ctx, '#ff2a6d', 5 + i, 22 - i, 1, 1); }
    px(ctx, '#f5e663', 3, 19, 5, 5); px(ctx, '#05030f', 4, 20, 3, 3);
    px(ctx, '#8a1038', 0, 23, 4, 3);
  });
  tex(scene, 'relic-pistols', 26, 18, ctx => {
    const gun = (x: number, y: number) => { px(ctx, '#05030f', x, y, 12, 6); px(ctx, '#f5e663', x + 1, y + 1, 10, 3); px(ctx, '#a89a2a', x + 2, y + 4, 3, 5); px(ctx, '#05030f', x + 2, y + 8, 3, 1); };
    gun(1, 2); gun(13, 6);
  });
  tex(scene, 'bullet-gold', 5, 5, ctx => { px(ctx, '#a89a2a', 0, 1, 5, 3); px(ctx, '#f5e663', 1, 0, 3, 5); px(ctx, '#ffffff', 2, 2, 1, 1); });
  // Blackout: everything dark except a soft circle around the player.
  tex(scene, 'darkness', 1100, 700, ctx => {
    const gr = ctx.createRadialGradient(550, 350, 30, 550, 350, 120);
    gr.addColorStop(0, 'rgba(5,3,15,0)');
    gr.addColorStop(1, 'rgba(5,3,15,0.94)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 1100, 700);
  });
}
