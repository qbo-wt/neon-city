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
  const sidewalk = (y: number, h: number) => {
    f('#2a2438', 0, y, W, h);
    for (let x = 0; x < W; x += 16) f('#221d30', x, y, 1, h);
    f('#221d30', 0, y + h / 2, W, 1);
  };
  const curb = (y: number) => { f('#5a5578', 0, y, W, 2); f('#05030f', 0, y + 2, W, 1); };

  const top = TILE, bot = H - TILE; // inner floor span (walls are drawn as tiles on top)
  switch (style) {
    case 'avenue': case 'crossroad': case 'checkpoint': {
      asphalt(0, 0, W, H);
      sidewalk(top, 28); curb(top + 28);
      sidewalk(bot - 28, 28); curb(bot - 30);
      const mid = (top + bot) / 2;
      for (let x = 8; x < W; x += 28) f('#f5e663', x, mid - 1, 14, 2); // centre line
      if (style === 'crossroad') {
        asphalt(6 * TILE, top, 3 * TILE, bot - top);
        for (let y = top + 34; y < bot - 34; y += 8) f('#e8e8ffcc', 6 * TILE - 12, y, 10, 4), f('#e8e8ffcc', 9 * TILE + 2, y, 10, 4);
      }
      if (style === 'checkpoint') {
        for (let x = 0; x < W; x += 16) f(x % 32 ? '#05030f' : '#f5e663', x, top + 30, 16, 4), f(x % 32 ? '#f5e663' : '#05030f', x, bot - 34, 16, 4);
        f('#ff2a6d22', 4 * TILE, top + 40, 7 * TILE, bot - top - 80);
      }
      break;
    }
    case 'alley':
      asphalt(0, 0, W, H);
      for (let i = 0; i < 6; i++) { // cracks
        let x = rng() * W, y = top + rng() * (bot - top);
        ctx.strokeStyle = '#05030f'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 5; k++) { x += (rng() - 0.5) * 30; y += (rng() - 0.5) * 18; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      f('#39ff8814', 0, top, W, 6); // sickly light from a sign
      break;
    case 'market': case 'plaza':
      f(style === 'market' ? '#2a1e2e' : '#262236', 0, 0, W, H);
      for (let y = 0; y < H; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < W; x += 16) f(style === 'market' ? '#33253a' : '#2e2a42', x, y, 15, 15);
      if (style === 'plaza') { ctx.strokeStyle = '#00f0ff55'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(W / 2, H / 2, 46, 0, Math.PI * 2); ctx.stroke(); }
      if (style === 'market') for (let x = 0; x < W; x += 40) f('#ff2a6d22', x, top, 20, bot - top);
      break;
    case 'parking':
      asphalt(0, 0, W, H);
      for (let x = TILE; x < W - TILE; x += 40) { f('#e8e8ffaa', x, top + 4, 2, 50); f('#e8e8ffaa', x, bot - 54, 2, 50); }
      f('#e8e8ffaa', TILE, top + 54, W - 2 * TILE, 2); f('#e8e8ffaa', TILE, bot - 56, W - 2 * TILE, 2);
      f('#f5e663', W / 2 - 10, H / 2 - 1, 20, 2); f('#f5e663', W / 2 + 6, H / 2 - 5, 4, 10);
      break;
    case 'docks':
      f('#1e1e26', 0, 0, W, H);
      for (let i = 0; i < 40; i++) f('#25252f', rng() * W, rng() * H, 6, 1);
      for (let x = 0; x < W; x += 16) f(x % 32 ? '#05030f' : '#f5e663', x, top + 4, 16, 3);
      for (let i = 0; i < 4; i++) { ctx.fillStyle = '#0a0a12'; ctx.beginPath(); ctx.ellipse(rng() * W, top + rng() * (bot - top), 14, 6, 0, 0, Math.PI * 2); ctx.fill(); } // oil
      break;
  }
  // Puddles reflecting the neon.
  const puddles = style === 'alley' ? 7 : 4;
  for (let i = 0; i < puddles; i++) {
    const x = rng() * W, y = top + 10 + rng() * (bot - top - 20), w = 14 + rng() * 22;
    ctx.fillStyle = '#1d2a4acc'; ctx.beginPath(); ctx.ellipse(x, y, w / 2, w / 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pick(rng, ['#ff2a6d55', '#00f0ff55', '#f5e66344']); ctx.fillRect(x - w / 4, y - 1, w / 2, 1);
  }
  t.refresh();
}

/** Signs, graffiti, lamps, steam and litter: different on every sector. */
export function decorateStreet(scene: Phaser.Scene, template: RoomTemplate, style: StreetStyle, rng: Rng, skipCols: number[]) {
  const W = template.grid[0].length * TILE;
  // Neon shop signs on the top facade, away from doors.
  const cols = [1, 3, 5, 7, 9, 11, 13].filter(c => !skipCols.includes(c));
  const neon = [COLORS.magenta, COLORS.cyan, COLORS.yellow, 0x39ff88];
  cols.forEach(c => {
    if (rng() < 0.35) return;
    const col = pick(rng, neon), hexc = '#' + col.toString(16).padStart(6, '0');
    const label = style === 'checkpoint' ? pick(rng, ['PSY-SEC', 'ZONE FERMÉE', 'ARRÊT']) : pick(rng, SIGNS);
    const sign = txt(scene, c * TILE + 16, 22, label, 6, hexc).setOrigin(0.5).setDepth(3);
    scene.add.rectangle(c * TILE + 16, 22, sign.width + 6, 10, 0x05030f, 0.85).setStrokeStyle(1, col).setDepth(2.9);
    scene.add.image(c * TILE + 16, 44, 'glow').setTint(col).setAlpha(0.28).setScale(1.2, 0.7).setBlendMode(Phaser.BlendModes.ADD).setDepth(1);
    if (rng() < 0.3) scene.tweens.add({ targets: sign, alpha: 0.2, yoyo: true, repeat: -1, duration: 60, repeatDelay: 1500 + rng() * 3000 });
  });
  // Graffiti tags on the bottom facade.
  for (let i = 0; i < 3; i++) {
    const g = scene.add.graphics().setDepth(2);
    g.lineStyle(2, pick(rng, neon), 0.6);
    const x = 40 + rng() * (W - 80), y = template.grid.length * TILE - 18;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) g.lineTo(x + k * 5, y + (k % 2 ? -6 : 4) * rng());
    g.strokePath();
  }
  // Ground props on free floor tiles.
  const free: { x: number; y: number }[] = [];
  template.grid.forEach((row, ty) => [...row].forEach((ch, tx) => { if (ch === '.' && ty > 1 && ty < 6) free.push({ x: tx, y: ty }); }));
  const props = style === 'alley' ? 7 : 5;
  for (let i = 0; i < props && free.length; i++) {
    const p = free.splice(Math.floor(rng() * free.length), 1)[0];
    const x = p.x * TILE + 8 + rng() * 16, y = p.y * TILE + 8 + rng() * 16;
    const kind = pick(rng, style === 'checkpoint' ? ['cone', 'cone', 'manhole'] : ['manhole', 'cone', 'lamp', 'steam-vent']);
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
