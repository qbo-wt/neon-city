import Phaser from 'phaser';
import { CONFIG } from '../config';

/** Every scene camera: top-left origin, x2 zoom, so world coordinates are the 480x270 logical grid. */
export function setupCamera(scene: Phaser.Scene, scrollY = 0) {
  return scene.cameras.main.setOrigin(0, 0).setZoom(CONFIG.ZOOM).setScroll(0, scrollY);
}
