import Phaser from 'phaser';
import { CONFIG } from '../config';
import { C, T, bold, pinToCamera, scanlines, skewPoly, stripes } from './kit';
import { title } from './text';

const STRIP = 14;

/**
 * The top strip of the walkable rooms, in the same look as the fight HUD: place name on the left,
 * banked credits, runs and record on the right. Camera-fixed (screen y 0..14).
 */
export function roomStrip(scene: Phaser.Scene, place: string, depth = 150) {
  const W = CONFIG.WIDTH;
  const g = scene.add.graphics();
  g.fillStyle(C.deep, 0.92).fillRect(0, 0, W, STRIP);
  g.fillStyle(C.night, 0.95).fillPoints(skewPoly(-6, 0, 220, STRIP + 2, 3), true);
  g.fillStyle(C.night, 0.95).fillPoints(skewPoly(W - 200, 0, 206, STRIP + 2, -3), true);
  scanlines(g, 0, 0, W, STRIP, 0, C.white, 0.03);
  g.lineStyle(0.5, C.cyan, 0.55).lineBetween(0, STRIP, W, STRIP);
  g.fillStyle(C.cyan, 1).fillRect(0, STRIP - 0.5, 40, 1.25);
  g.fillStyle(C.yellow, 1).fillRect(W - 40, STRIP - 0.5, 40, 1.25);
  stripes(g, 226, 4, 26, 6, C.white, 0.08, 3, 1);
  const brand = bold(scene, 5, STRIP / 2, 'NEON//CITY', 5, T.cyan).setOrigin(0, 0.5);
  const name = title(scene, brand.width + 11, STRIP / 2 + 0.9, place, 9, T.text).setFontStyle('600').setOrigin(0, 0.5);
  g.fillStyle(C.line, 1).fillPoints(skewPoly(brand.width + 6, 3.5, 2, 7, 1.5), true);
  const credits = title(scene, W - 5, STRIP / 2 + 0.9, '', 10, T.yellow).setFontStyle('600').setOrigin(1, 0.5);
  const stats = bold(scene, 0, STRIP / 2, '', 5, T.dim).setOrigin(1, 0.5);
  const sep = scene.add.graphics();
  const root = scene.add.container(0, 0, [g, brand, name, sep, credits, stats]).setDepth(depth);
  pinToCamera(root);
  return {
    root,
    setInfo(c: number, runs: number, best: number) {
      credits.setText(`${c}¢`);
      stats.setText(`RUNS ${runs}   ·   RECORD SECTEUR ${best}`).setX(credits.x - credits.width - 9);
      sep.clear().fillStyle(C.line, 1).fillPoints(skewPoly(credits.x - credits.width - 5.5, 3.5, 2, 7, 1.5), true);
    },
  };
}
