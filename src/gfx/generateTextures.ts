import Phaser from 'phaser';
import { PALETTE, SPRITES } from './sprites';

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

/**
 * The few 2D textures the Phaser layer still needs, drawn in code (no image files): map reward
 * icons, additive glow, slash arc and sparks for the combat effects, and blank bodies for the
 * physics of the interiors (the rooms and characters themselves are 3D, see src/three).
 */
export function generateTextures(scene: Phaser.Scene): void {
  for (const [key, grid] of Object.entries(SPRITES)) {
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

  // Invisible bodies: walking characters (24x24, feet on row 15) and 32 px walls, obstacles and doors.
  for (const [key, size] of [['body', 24], ['tile-wall', 32], ['tile-obstacle', 32], ['door-locked', 32]] as const) canvasTexture(scene, key, size, size, () => {});

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

  // Soft radial glow used for flashes and light pools.
  canvasTexture(scene, 'glow', 64, 64, ctx => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}
