import Phaser from 'phaser';
import { SCENES } from '../config';
import { generateTextures } from '../gfx/generateTextures';
import { setupCamera } from '../ui/camera';
import { LoadingScreen } from '../ui/LoadingScreen';
import { wipeTo } from '../ui/transition';
import { preloadAll } from '../three/preload';

/** Shortest time the loading screen stays up, so it never just flashes. */
const MIN_MS = 1600;

/** Loading screen: draws the 2D art, fetches every 3D file and the anime avatars, then the menu. */
export class BootScene extends Phaser.Scene {
  private screen?: LoadingScreen;

  constructor() { super(SCENES.Boot); }

  create() {
    setupCamera(this);
    this.scene.launch(SCENES.Overlay);
    const screen = new LoadingScreen(this);
    this.screen = screen;
    const t0 = this.time.now;
    screen.setProgress(0, 'TEXTURES');
    // One frame on screen first, then the heavy work.
    this.time.delayedCall(30, () => {
      generateTextures(this);
      const mb = (n: number) => (n / 1048576).toFixed(1).replace('.', ',');
      void preloadAll(s => screen.setProgress(s.progress, s.label, s.total ? `${mb(s.bytes)} / ${mb(s.total)} Mo` : '')).then(() => {
        const wait = Math.max(0, MIN_MS - (this.time.now - t0));
        this.time.delayedCall(wait, () => this.whenShown(() => { if (this.scene.isActive()) wipeTo(this, SCENES.Menu); }));
      });
    });
  }

  /** Waits for the bar to reach 100 % on screen. */
  private whenShown(then: () => void) {
    if (!this.scene.isActive()) return;
    if (this.screen?.done) this.time.delayedCall(250, then);
    else this.time.delayedCall(50, () => this.whenShown(then));
  }

  update(time: number, dt: number) { this.screen?.update(time, dt); }
}
