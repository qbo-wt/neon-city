import Phaser from 'phaser';
import { createRng } from '../core/rng';
import { BACK_VIEWS, PALETTE, SPRITES } from './sprites';
import { generateHideoutArt } from './hideoutArt';

export type CanvasTex = (scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => void;
export type Px = (ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w?: number, h?: number) => void;

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

function gridTexture(scene: Phaser.Scene, key: string, grid: string[]) {
  const w = Math.max(...grid.map(r => r.length));
  canvasTexture(scene, key, w, grid.length, ctx => {
    grid.forEach((row, y) => [...row].forEach((ch, x) => {
      const col = PALETTE[ch];
      if (!col) return;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }));
  });
}

const px = (ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w = 1, h = 1) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
};

/** Builds every texture the game uses. No image files: all art is drawn here. */
export function generateTextures(scene: Phaser.Scene): void {
  for (const [key, grid] of Object.entries(SPRITES)) gridTexture(scene, key, grid);

  // Dash afterimage: player silhouette in cyan.
  gridTexture(scene, 'player-dash', SPRITES.player.map(r => r.replace(/[^.]/g, 'c')));

  for (const [key, { rows, to }] of Object.entries(BACK_VIEWS)) {
    gridTexture(scene, `${key}-back`, SPRITES[key].map((r, i) => rows.includes(i) ? r.replace(/[^.k]/g, to) : r));
  }

  // Soft ground shadow under characters.
  canvasTexture(scene, 'shadow', 14, 6, ctx => {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(7, 3, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  generateHideoutArt(scene, canvasTexture, px);

  const rng = createRng(1337);

  // Wet asphalt with neon reflections.
  canvasTexture(scene, 'tile-floor', 32, 32, ctx => {
    px(ctx, '#110c24', 0, 0, 32, 32);
    px(ctx, '#171030', 0, 0, 32, 1);
    px(ctx, '#171030', 0, 0, 1, 32);
    for (let i = 0; i < 10; i++) px(ctx, '#1b1438', Math.floor(rng() * 32), Math.floor(rng() * 32), 2, 1);
    if (rng() < 0.9) {
      const x = Math.floor(rng() * 24), y = Math.floor(rng() * 28);
      px(ctx, '#1d2a4a', x, y, 7, 2);
      px(ctx, '#ff2a6d33', x + 2, y, 3, 1);
    }
  });

  // Building wall with lit windows and a neon trim.
  canvasTexture(scene, 'tile-wall', 32, 32, ctx => {
    px(ctx, '#1a1430', 0, 0, 32, 32);
    px(ctx, '#241c40', 0, 0, 32, 2);
    for (let wy = 5; wy < 28; wy += 8) for (let wx = 3; wx < 30; wx += 7) {
      const lit = rng();
      px(ctx, lit < 0.25 ? '#f5e663' : lit < 0.4 ? '#ff2a6d' : lit < 0.5 ? '#00f0ff' : '#0f0a1e', wx, wy, 4, 4);
    }
    px(ctx, '#00f0ff', 0, 30, 32, 1);
    px(ctx, '#007a8a', 0, 31, 32, 1);
  });

  // Obstacle: dumpster / crate with magenta trim.
  canvasTexture(scene, 'tile-obstacle', 32, 32, ctx => {
    px(ctx, '#05030f', 2, 4, 28, 26);
    px(ctx, '#2a2245', 3, 5, 26, 24);
    px(ctx, '#3a3058', 3, 5, 26, 3);
    px(ctx, '#ff2a6d', 3, 27, 26, 1);
    for (let x = 6; x < 28; x += 5) px(ctx, '#221d35', x, 10, 2, 15);
    px(ctx, '#f5e663', 13, 15, 6, 3);
  });

  const door = (key: string, glow: string, dark: string) => canvasTexture(scene, key, 32, 32, ctx => {
    px(ctx, '#05030f', 0, 0, 32, 32);
    px(ctx, dark, 4, 2, 24, 30);
    px(ctx, glow, 4, 2, 24, 1);
    px(ctx, glow, 4, 2, 1, 30);
    px(ctx, glow, 27, 2, 1, 30);
    for (let y = 6; y < 30; y += 4) px(ctx, glow + '55', 6, y, 20, 1);
  });
  door('door', '#00f0ff', '#062a35');
  door('door-locked', '#ff3b3b', '#2a0812');

  // Slash arc (drawn facing right, rotated at runtime).
  canvasTexture(scene, 'slash', 32, 32, ctx => {
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(8, 16, 14, -1.1, 1.1);
    ctx.stroke();
    ctx.strokeStyle = '#e8e8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(8, 16, 14, -0.9, 0.9);
    ctx.stroke();
  });

  // Soft radial glow used for neon light pools and pickups.
  canvasTexture(scene, 'glow', 64, 64, ctx => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}
