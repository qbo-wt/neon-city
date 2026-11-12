import Phaser from 'phaser';
import { CONFIG } from '../config';

export const UI_FONT = '"Chakra Petch", "Segoe UI", sans-serif';
export const TITLE_FONT = '"Teko", "Arial Narrow", sans-serif';

/** Interface text (Chakra Petch), rendered at the camera zoom so each text texel maps to one screen pixel. */
export function txt(scene: Phaser.Scene, x: number, y: number, str: string, size = 8, color = '#e8e8ff') {
  return scene.add.text(x, y, str, {
    fontFamily: UI_FONT,
    fontSize: `${size}px`,
    color,
    resolution: CONFIG.ZOOM,
  });
}

/** Big display titles (Teko: tall, condensed). */
export function title(scene: Phaser.Scene, x: number, y: number, str: string, size = 24, color = '#f5e663') {
  return scene.add.text(x, y, str, { fontFamily: TITLE_FONT, fontSize: `${size}px`, color, resolution: CONFIG.ZOOM });
}

export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
