import Phaser from 'phaser';
import { CONFIG } from '../config';

/** Crisp small text: rendered at the camera zoom so each text texel maps to one screen pixel. */
export function txt(scene: Phaser.Scene, x: number, y: number, str: string, size = 8, color = '#e8e8ff') {
  return scene.add.text(x, y, str, {
    fontFamily: '"Lucida Console", "Courier New", monospace',
    fontSize: `${size}px`,
    color,
    resolution: CONFIG.ZOOM,
  });
}

export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
