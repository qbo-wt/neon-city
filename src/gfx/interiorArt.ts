import type Phaser from 'phaser';
import { createRng } from '../core/rng';
import type { CanvasTex, Px } from './generateTextures';

/** Megabuilding corridor, ripperdoc clinic and netrunner den: tiles and props. */
export function generateInteriorArt(scene: Phaser.Scene, tex: CanvasTex, px: Px) {
  const rng = createRng(4242);

  // ---------- corridor ----------
  tex(scene, 'floor-corridor', 32, 32, ctx => {
    px(ctx, '#211a2c', 0, 0, 32, 32);
    px(ctx, '#2a2238', 0, 0, 32, 1); px(ctx, '#2a2238', 0, 0, 1, 32);
    px(ctx, '#2a2238', 16, 0, 1, 32); px(ctx, '#2a2238', 0, 16, 32, 1);
    for (let i = 0; i < 8; i++) px(ctx, '#17121f', Math.floor(rng() * 32), Math.floor(rng() * 32), 2, 1); // grime
  });
  tex(scene, 'wall-corridor', 32, 32, ctx => {
    px(ctx, '#2a2238', 0, 0, 32, 32);
    px(ctx, '#332a44', 0, 0, 32, 20);
    px(ctx, '#3d3352', 0, 20, 32, 2);
    px(ctx, '#1d1729', 0, 22, 32, 10);
    px(ctx, '#f5e66355', 0, 29, 32, 1);
  });
  const aptDoor = (key: string, lit: string) => tex(scene, key, 32, 32, ctx => {
    px(ctx, '#1d1729', 0, 0, 32, 32);
    px(ctx, '#05030f', 6, 4, 20, 28);
    px(ctx, '#3a3058', 7, 5, 18, 27);
    px(ctx, '#2a2245', 9, 8, 14, 22);
    px(ctx, lit, 21, 17, 2, 3); // keypad
    px(ctx, '#05030f', 11, 2, 10, 4); px(ctx, lit, 12, 3, 8, 2); // number plate
  });
  aptDoor('door-apt', '#8a86b0');
  aptDoor('door-home', '#00f0ff');
  tex(scene, 'elevator', 64, 32, ctx => {
    px(ctx, '#1d1729', 0, 0, 64, 32);
    px(ctx, '#05030f', 6, 3, 52, 29);
    px(ctx, '#8a8aa8', 8, 6, 23, 26); px(ctx, '#8a8aa8', 33, 6, 23, 26);
    px(ctx, '#b8b8d0', 8, 6, 23, 2); px(ctx, '#b8b8d0', 33, 6, 23, 2);
    px(ctx, '#5a5a78', 31, 6, 2, 26);
    px(ctx, '#05030f', 26, 0, 12, 4); px(ctx, '#f5e663', 28, 1, 8, 2); // floor indicator
    px(ctx, '#39ff88', 59, 14, 3, 3); px(ctx, '#39ff88', 60, 18, 1, 2); // call button
  });
  // Side doors (in the left/right walls): doorway drawn on the inner edge.
  const sideDoor = (key: string, glow: string, dark: string, innerRight: boolean) => tex(scene, key, 32, 32, ctx => {
    px(ctx, '#2a2238', 0, 0, 32, 32);
    const x = innerRight ? 18 : 0;
    px(ctx, '#05030f', x, 2, 14, 30);
    px(ctx, dark, x + 1, 3, 12, 29);
    px(ctx, glow, innerRight ? 31 : 0, 2, 1, 30);
    for (let y = 6; y < 30; y += 5) px(ctx, glow + '66', x + 2, y, 10, 1);
  });
  sideDoor('door-doc', '#ff3b3b', '#2a0812', true);
  sideDoor('door-net', '#39ff88', '#04140b', false);
  sideDoor('door-exit-right', '#e8e8ff', '#2a2245', false);
  sideDoor('door-exit-left', '#39ff88', '#04140b', true);

  tex(scene, 'vending', 24, 32, ctx => {
    px(ctx, '#05030f', 0, 0, 24, 32);
    px(ctx, '#ff2a6d', 1, 1, 22, 30);
    px(ctx, '#05030f', 3, 4, 13, 18);
    for (let y = 5; y < 21; y += 4) for (let x = 4; x < 15; x += 4) px(ctx, ['#f5e663', '#00f0ff', '#39ff88', '#e8e8ff'][(x + y) % 4], x, y, 2, 2);
    px(ctx, '#e8e8ff', 18, 6, 3, 8); px(ctx, '#05030f', 4, 25, 12, 4);
  });
  tex(scene, 'bench', 48, 14, ctx => {
    px(ctx, '#05030f', 0, 0, 48, 14);
    px(ctx, '#5a4a3a', 1, 1, 46, 8); px(ctx, '#3a2f25', 1, 9, 46, 4);
    for (let x = 4; x < 46; x += 8) px(ctx, '#3a2f25', x, 1, 1, 8);
  });
  tex(scene, 'trashcan', 14, 16, ctx => {
    px(ctx, '#05030f', 0, 0, 14, 16); px(ctx, '#3a3550', 1, 1, 12, 14);
    px(ctx, '#5a5578', 1, 1, 12, 3); px(ctx, '#39ff88', 5, 7, 4, 4);
  });
  tex(scene, 'noticeboard', 40, 22, ctx => {
    px(ctx, '#05030f', 0, 0, 40, 22); px(ctx, '#3a2f25', 1, 1, 38, 20);
    [['#e8e8ff', 3, 3], ['#f5e663', 15, 4], ['#ff2a6d', 27, 3], ['#00f0ff', 7, 12], ['#e8e8ff', 21, 12]]
      .forEach(([c, x, y]) => px(ctx, c as string, x as number, y as number, 9, 7));
  });

  // ---------- ripperdoc clinic: cold white tiles, red medical accents ----------
  tex(scene, 'floor-clinic', 32, 32, ctx => {
    px(ctx, '#c9ccd6', 0, 0, 32, 32);
    px(ctx, '#aeb2c0', 0, 0, 32, 1); px(ctx, '#aeb2c0', 0, 0, 1, 32);
    px(ctx, '#aeb2c0', 16, 0, 1, 32); px(ctx, '#aeb2c0', 0, 16, 32, 1);
    if (rng() < 0.4) px(ctx, '#8a1038aa', Math.floor(rng() * 26), Math.floor(rng() * 26), 3, 2); // old stains
  });
  tex(scene, 'wall-clinic', 32, 32, ctx => {
    px(ctx, '#e4e6ee', 0, 0, 32, 32);
    px(ctx, '#d0d3de', 0, 0, 32, 2);
    px(ctx, '#ff3b3b', 0, 22, 32, 3);
    px(ctx, '#9aa0b4', 0, 29, 32, 3);
  });
  tex(scene, 'surgery-chair', 30, 58, ctx => {
    px(ctx, '#05030f', 0, 0, 30, 58);
    px(ctx, '#5a5a78', 13, 40, 4, 16); // pillar
    px(ctx, '#2a2a3c', 2, 2, 26, 50);
    px(ctx, '#3d3d58', 4, 4, 22, 14); // headrest
    px(ctx, '#4a4a6a', 4, 20, 22, 30);
    px(ctx, '#ff3b3b', 4, 20, 22, 1);
    px(ctx, '#b8b8d0', 0, 24, 3, 14); px(ctx, '#b8b8d0', 27, 24, 3, 14); // arm straps
  });
  tex(scene, 'surgical-arm', 40, 26, ctx => {
    px(ctx, '#05030f', 18, 0, 4, 26);
    px(ctx, '#b8b8d0', 19, 0, 2, 14);
    px(ctx, '#b8b8d0', 6, 12, 28, 2);
    [6, 18, 32].forEach(x => { px(ctx, '#e8e8ff', x - 2, 14, 4, 6); px(ctx, '#ff3b3b', x - 1, 20, 2, 3); });
  });
  tex(scene, 'limb-rack', 64, 28, ctx => {
    px(ctx, '#05030f', 0, 0, 64, 28); px(ctx, '#d0d3de', 1, 1, 62, 26);
    [6, 20, 34, 48].forEach((x, i) => {
      const c = ['#b8b8d0', '#f5e663', '#00f0ff', '#b8b8d0'][i];
      px(ctx, c, x, 4, 8, 4); px(ctx, c, x + 2, 8, 4, 14); px(ctx, '#05030f', x + 2, 21, 4, 2); // chrome arms
    });
  });
  tex(scene, 'med-monitor', 34, 30, ctx => {
    px(ctx, '#05030f', 0, 0, 34, 30); px(ctx, '#9aa0b4', 1, 1, 32, 28);
    px(ctx, '#05030f', 3, 3, 28, 16);
    const ecg = [10, 10, 10, 9, 4, 15, 10, 10, 11, 10, 10, 10, 8, 10, 10, 10, 9, 5, 14, 10, 10, 10, 10, 10];
    ecg.forEach((y, i) => px(ctx, '#39ff88', 4 + i, y, 1, 1));
    px(ctx, '#ff3b3b', 4, 22, 6, 4); px(ctx, '#f5e663', 12, 22, 6, 4);
  });
  tex(scene, 'med-cabinet', 48, 26, ctx => {
    px(ctx, '#05030f', 0, 0, 48, 26); px(ctx, '#e4e6ee', 1, 1, 46, 24);
    px(ctx, '#9aa0b4', 24, 1, 1, 24);
    px(ctx, '#ff3b3b', 9, 8, 6, 2); px(ctx, '#ff3b3b', 11, 6, 2, 6); // red cross
    for (let x = 28; x < 44; x += 5) px(ctx, '#00f0ff88', x, 6, 3, 12); // vials
  });

  // ---------- netrunner den: black, green phosphor, servers and cables ----------
  tex(scene, 'floor-net', 32, 32, ctx => {
    px(ctx, '#03080a', 0, 0, 32, 32);
    px(ctx, '#0a2a1a', 0, 0, 32, 1); px(ctx, '#0a2a1a', 0, 0, 1, 32);
    if (rng() < 0.5) px(ctx, '#39ff8822', Math.floor(rng() * 28), Math.floor(rng() * 28), 4, 1);
  });
  tex(scene, 'wall-net', 32, 32, ctx => {
    px(ctx, '#05100c', 0, 0, 32, 32);
    for (let y = 3; y < 28; y += 5) {
      px(ctx, '#0b1d15', 2, y, 28, 4);
      for (let x = 4; x < 28; x += 3) if (rng() < 0.4) px(ctx, rng() < 0.8 ? '#39ff88' : '#f5e663', x, y + 1, 1, 1);
    }
    px(ctx, '#39ff88', 0, 30, 32, 1);
  });
  tex(scene, 'server', 22, 40, ctx => {
    px(ctx, '#05030f', 0, 0, 22, 40); px(ctx, '#0b1d15', 1, 1, 20, 38);
    for (let y = 3; y < 37; y += 4) {
      px(ctx, '#123326', 2, y, 18, 3);
      for (let x = 3; x < 19; x += 3) if (rng() < 0.5) px(ctx, rng() < 0.85 ? '#39ff88' : '#ff2a6d', x, y + 1, 1, 1);
    }
  });
  tex(scene, 'net-chair', 32, 44, ctx => {
    px(ctx, '#05030f', 0, 0, 32, 44);
    px(ctx, '#1a1a24', 3, 2, 26, 38);
    px(ctx, '#26263a', 5, 4, 22, 12);
    px(ctx, '#39ff88', 14, 4, 4, 2); // neural jack
    px(ctx, '#26263a', 5, 18, 22, 20);
    px(ctx, '#0f3d24', 0, 16, 3, 18); px(ctx, '#0f3d24', 29, 16, 3, 18);
  });
  tex(scene, 'net-desk', 72, 28, ctx => {
    px(ctx, '#05030f', 0, 0, 72, 28); px(ctx, '#101018', 1, 1, 70, 26);
    [3, 26, 49].forEach(x => {
      px(ctx, '#05030f', x, 2, 20, 14); px(ctx, '#02140a', x + 1, 3, 18, 12);
      for (let y = 4; y < 14; y += 2) px(ctx, '#39ff88', x + 2, y, 3 + Math.floor(rng() * 13), 1);
    });
    px(ctx, '#26263a', 14, 19, 44, 4);
  });
  tex(scene, 'cables', 96, 40, ctx => {
    ctx.lineWidth = 2;
    ['#0f3d24', '#1a1a24', '#36167f'].forEach((c, i) => {
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.moveTo(0, 6 + i * 12);
      ctx.bezierCurveTo(30, 40 - i * 8, 60, i * 10, 96, 20 + i * 6);
      ctx.stroke();
    });
  });
}
