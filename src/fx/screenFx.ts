import type Phaser from 'phaser';
import { settings } from '../core/settings';

/** Phaser camera shake, skipped when the player turned screen effects down (options). */
export function camShake(cam: Phaser.Cameras.Scene2D.Camera | undefined, ms: number, intensity: number) {
  if (cam && !settings().reduceFx) cam.shake(ms, intensity);
}

/** Phaser full-screen colour flash, skipped when the player turned screen effects down (options). */
export function camFlash(cam: Phaser.Cameras.Scene2D.Camera | undefined, ms: number, r: number, g: number, b: number) {
  if (cam && !settings().reduceFx) cam.flash(ms, r, g, b);
}
