import type Phaser from 'phaser';
import { createRng } from '../core/rng';
import type { CanvasTex, Px } from './generateTextures';

/** Furniture for the hideout apartment, drawn top-down (front faces slightly visible). */
export function generateHideoutArt(scene: Phaser.Scene, tex: CanvasTex, px: Px) {
  const rng = createRng(77);

  tex(scene, 'floor-home', 32, 32, ctx => {
    px(ctx, '#1c1626', 0, 0, 32, 32);
    px(ctx, '#231b30', 0, 0, 32, 1); px(ctx, '#231b30', 0, 0, 1, 32);
    px(ctx, '#231b30', 16, 0, 1, 32); px(ctx, '#231b30', 0, 16, 32, 1);
    for (let i = 0; i < 6; i++) px(ctx, '#2a2138', Math.floor(rng() * 32), Math.floor(rng() * 32), 1, 1);
  });

  // Interior wall: dark panels with a neon trim, no street windows.
  tex(scene, 'wall-home', 32, 32, ctx => {
    px(ctx, '#15101f', 0, 0, 32, 32);
    px(ctx, '#1d1630', 1, 1, 14, 28); px(ctx, '#1d1630', 17, 1, 14, 28);
    px(ctx, '#2a2140', 1, 1, 14, 1); px(ctx, '#2a2140', 17, 1, 14, 1);
    px(ctx, '#ff2a6d', 0, 30, 32, 1); px(ctx, '#8a1038', 0, 31, 32, 1);
  });

  // Floor-to-ceiling window onto the city, set in the top wall.
  tex(scene, 'window-city', 160, 28, ctx => {
    px(ctx, '#05030f', 0, 0, 160, 28);
    const sky = ctx.createLinearGradient(0, 2, 0, 26);
    sky.addColorStop(0, '#2a0f3d'); sky.addColorStop(1, '#ff2a6d55');
    ctx.fillStyle = sky; ctx.fillRect(2, 2, 156, 24);
    for (let x = 2; x < 158; x += 6 + Math.floor(rng() * 8)) {
      const h = 8 + Math.floor(rng() * 16), w = 5 + Math.floor(rng() * 7);
      px(ctx, '#0d0820', x, 26 - h, w, h);
      for (let wy = 27 - h; wy < 25; wy += 3) for (let wx = x + 1; wx < x + w - 1; wx += 2)
        if (rng() < 0.3) px(ctx, rng() < 0.7 ? '#f5e663' : '#00f0ff', wx, wy, 1, 1);
    }
    px(ctx, '#ff2a6d', 104, 6, 14, 3); // distant neon billboard
    px(ctx, '#00f0ff', 30, 9, 8, 2);
    for (let i = 0; i < 20; i++) px(ctx, '#8a86b066', 2 + Math.floor(rng() * 154), 2 + Math.floor(rng() * 20), 1, 3);
    for (let x = 0; x <= 160; x += 40) px(ctx, '#3a3058', Math.min(x, 158), 0, 2, 28); // mullions
    px(ctx, '#00f0ff', 0, 26, 160, 1);
  });

  tex(scene, 'bed', 44, 56, ctx => {
    px(ctx, '#05030f', 0, 0, 44, 56);
    px(ctx, '#2a2245', 1, 1, 42, 54);
    px(ctx, '#e8e8ff', 4, 3, 16, 8); px(ctx, '#c8c8e8', 24, 3, 16, 8); // pillows
    px(ctx, '#6a2cff', 2, 14, 40, 38); px(ctx, '#36167f', 2, 14, 40, 3); // blanket
    for (let y = 20; y < 50; y += 6) px(ctx, '#ff2a6d55', 2, y, 40, 1);
    px(ctx, '#00f0ff', 1, 54, 42, 1); // underglow
  });

  tex(scene, 'desk', 56, 30, ctx => {
    px(ctx, '#05030f', 0, 0, 56, 30);
    px(ctx, '#2a2245', 1, 1, 54, 22); px(ctx, '#1a1430', 1, 23, 54, 6);
    px(ctx, '#05030f', 8, 2, 40, 14); px(ctx, '#06303a', 9, 3, 38, 12); // monitor
    for (let y = 5; y < 14; y += 3) px(ctx, '#00f0ff', 11, y, 6 + Math.floor(rng() * 26), 1);
    px(ctx, '#3a3058', 14, 18, 28, 3); // keyboard
    px(ctx, '#ff2a6d', 48, 18, 4, 3); // mug
  });

  tex(scene, 'couch', 64, 22, ctx => {
    px(ctx, '#05030f', 0, 0, 64, 22);
    px(ctx, '#36167f', 1, 1, 62, 20);
    px(ctx, '#6a2cff', 4, 2, 27, 11); px(ctx, '#6a2cff', 33, 2, 27, 11); // cushions
    px(ctx, '#24104f', 1, 14, 62, 7); // backrest (faces the window)
    px(ctx, '#ff2a6d', 1, 21, 62, 1);
  });

  tex(scene, 'table', 30, 16, ctx => {
    px(ctx, '#05030f', 0, 0, 30, 16);
    px(ctx, '#3a3058', 1, 1, 28, 12); px(ctx, '#221d35', 1, 13, 28, 3);
    px(ctx, '#f5e663', 6, 4, 3, 3); px(ctx, '#00f0ff', 18, 5, 6, 2);
  });

  tex(scene, 'kitchen', 112, 24, ctx => {
    px(ctx, '#05030f', 0, 0, 112, 24);
    px(ctx, '#3a3058', 1, 1, 86, 14); px(ctx, '#221d35', 1, 15, 86, 8); // counter
    px(ctx, '#1a1430', 10, 4, 18, 8); px(ctx, '#8a86b0', 18, 3, 2, 3); // sink
    [42, 54].forEach(x => { px(ctx, '#05030f', x, 4, 9, 8); px(ctx, '#ff3b3b', x + 3, 7, 3, 2); }); // hob
    px(ctx, '#f5e663', 70, 5, 4, 6); // noodle cup
    px(ctx, '#c8c8e8', 89, 1, 22, 22); px(ctx, '#8a86b0', 89, 9, 22, 1); px(ctx, '#05030f', 107, 4, 1, 3); // fridge
    px(ctx, '#00f0ff', 1, 23, 110, 1);
  });

  tex(scene, 'gun-rack', 60, 22, ctx => {
    px(ctx, '#05030f', 0, 0, 60, 22);
    px(ctx, '#2a2140', 1, 1, 58, 20);
    px(ctx, '#3a3058', 1, 1, 58, 1);
    for (let x = 6; x < 58; x += 11) px(ctx, '#5a5578', x, 3, 2, 1); // hooks
    px(ctx, '#e8e8ff', 6, 4, 1, 15); px(ctx, '#00f0ff', 7, 4, 1, 15); px(ctx, '#f5e663', 5, 16, 3, 1); // mono-blade
    px(ctx, '#e8e8ff', 16, 5, 1, 9); px(ctx, '#ff2a6d', 17, 5, 1, 9); px(ctx, '#e8e8ff', 19, 7, 1, 8); px(ctx, '#ff2a6d', 20, 7, 1, 8); // mantis
    px(ctx, '#a8a6d8', 27, 6, 6, 7); px(ctx, '#e8e8ff', 27, 6, 6, 2); px(ctx, '#3a3550', 28, 13, 4, 4); // titan fist
    for (let i = 0; i < 4; i++) px(ctx, '#00f0ff', 39 + i, 6 + i * 3, 3, 1); px(ctx, '#e8e8ff', 42, 15, 2, 2); // wire coil
    px(ctx, '#3a3550', 49, 8, 7, 3); px(ctx, '#a8a6d8', 49, 8, 7, 1); px(ctx, '#3a3550', 50, 11, 2, 5); // pistol
  });

  tex(scene, 'rack', 18, 72, ctx => {
    px(ctx, '#05030f', 0, 0, 18, 72);
    px(ctx, '#221d35', 1, 1, 16, 70);
    px(ctx, '#e8e8ff', 8, 4, 1, 26); px(ctx, '#ff2a6d', 7, 28, 3, 5); // blade
    px(ctx, '#3a3058', 4, 38, 10, 4); px(ctx, '#f5e663', 5, 42, 2, 4); // pistol
    px(ctx, '#00f0ff', 5, 52, 8, 4); px(ctx, '#00f0ff', 5, 60, 8, 4); // spare implants
    px(ctx, '#007a8a', 6, 53, 6, 2); px(ctx, '#007a8a', 6, 61, 6, 2);
  });

  tex(scene, 'plant', 16, 20, ctx => {
    px(ctx, '#05030f', 3, 12, 10, 8); px(ctx, '#3a3058', 4, 13, 8, 6);
    [[2, 4], [7, 1], [11, 5], [5, 8], [9, 9]].forEach(([x, y]) => px(ctx, '#39ff88', x, y, 4, 4));
    px(ctx, '#1d7a46', 7, 6, 2, 7);
  });

  tex(scene, 'rug', 112, 64, ctx => {
    px(ctx, '#2a0f3d', 0, 0, 112, 64);
    px(ctx, '#ff2a6d55', 3, 3, 106, 1); px(ctx, '#ff2a6d55', 3, 60, 106, 1);
    px(ctx, '#ff2a6d55', 3, 3, 1, 58); px(ctx, '#ff2a6d55', 108, 3, 1, 58);
    for (let x = 12; x < 104; x += 12) px(ctx, '#6a2cff44', x, 12, 6, 40);
  });
}
