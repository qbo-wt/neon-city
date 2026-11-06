import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import type { Rng } from '../core/rng';
import { Rain } from './effects';
import { txt } from '../ui/text';

export type LightEvent = 'blackout' | 'storm' | 'searchlight' | 'alarm' | 'surge';

export const LIGHT_LABELS: Record<LightEvent, string> = {
  blackout: 'COUPURES DE COURANT', storm: 'ORAGE', searchlight: 'PATROUILLE AÉRIENNE', alarm: 'ALERTE ROUGE', surge: 'SURTENSION NÉON',
};

/** About 6 sectors out of 10 get a lighting event; bosses always fight under alarm and searchlights. */
export function pickLightEvents(rng: Rng, isBoss: boolean): LightEvent[] {
  if (isBoss) return ['alarm', 'searchlight'];
  const r = rng();
  if (r < 0.38) return [];
  if (r < 0.56) return ['blackout'];
  if (r < 0.72) return ['storm'];
  if (r < 0.87) return ['searchlight'];
  return ['surge'];
}

/** Lighting that changes mid-fight: darkness, lightning, sweeping beams, strobes. */
export class Lighting {
  private overlay: Phaser.GameObjects.Rectangle;
  private dark?: Phaser.GameObjects.Image;
  private beams: Phaser.GameObjects.Image[] = [];
  private rain?: Rain;
  private nextAt: number;
  private flashUntil = 0;

  constructor(private scene: Phaser.Scene, private events: LightEvent[], private target: { x: number; y: number },
    private world: { width: number; height: number }) {
    const { WIDTH: W, HEIGHT: H } = CONFIG;
    this.overlay = scene.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0).setScrollFactor(0).setDepth(44);
    this.nextAt = scene.time.now + 3000 + Math.random() * 3000;
    if (this.has('blackout')) this.dark = scene.add.image(0, 0, 'darkness').setDepth(45).setAlpha(0);
    if (this.has('storm')) this.rain = new Rain(scene, W, H, 130, 41);
    if (this.has('searchlight')) {
      for (let i = 0; i < 2; i++) {
        this.beams.push(scene.add.image(0, 0, 'glow').setTint(i ? 0xbfe8ff : 0xffffff).setAlpha(0.2)
          .setScale(2.6, 5).setBlendMode(Phaser.BlendModes.ADD).setDepth(43));
      }
    }
  }

  private has(e: LightEvent) { return this.events.includes(e); }

  update(time: number, dt: number) {
    const W = this.world.width, H = this.world.height;
    this.rain?.update(dt);
    this.dark?.setPosition(this.target.x, this.target.y);
    this.beams.forEach((b, i) => b.setPosition(
      W / 2 + Math.sin(time / 1700 + i * 2.1) * W * 0.42,
      H / 2 + Math.cos(time / 2300 + i * 1.3) * H * 0.36,
    ).setRotation(Math.sin(time / 2000 + i) * 0.5));

    // Continuous tints.
    let color = 0xffffff, alpha = 0;
    if (this.has('alarm')) { color = 0xff0022; alpha = 0.04 + 0.07 * Math.abs(Math.sin(time / 280)); }
    if (this.has('searchlight') && Math.floor(time / 240) % 8 < 2) { color = Math.floor(time / 120) % 2 ? 0xff2a3a : 0x2a6aff; alpha = Math.max(alpha, 0.07); }
    if (this.has('surge')) {
      const c = Phaser.Display.Color.HSVToRGB((time / 4000) % 1, 1, 1) as Phaser.Types.Display.ColorObject;
      color = Phaser.Display.Color.GetColor(c.r, c.g, c.b); alpha = 0.07;
    }
    if (time < this.flashUntil) { color = 0xffffff; alpha = 0.6 * (this.flashUntil - time) / 180; }
    this.overlay.setFillStyle(color, alpha);

    if (time < this.nextAt) return;
    if (this.has('storm')) this.lightning(time);
    else if (this.has('blackout')) this.blackout(time);
    else if (this.has('surge')) { this.scene.cameras.main.flash(120, 255, 42, 109); this.nextAt = time + 5000 + Math.random() * 3000; }
    else this.nextAt = time + 999999;
  }

  private lightning(time: number) {
    this.flashUntil = time + 180;
    this.scene.cameras.main.shake(160, 0.004);
    if (Math.random() < 0.5) this.scene.time.delayedCall(260, () => { this.flashUntil = this.scene.time.now + 140; });
    this.nextAt = time + 3500 + Math.random() * 5000;
  }

  private blackout(time: number) {
    const d = this.dark!;
    this.nextAt = time + 9000 + Math.random() * 5000;
    const label = txt(this.scene, CONFIG.WIDTH / 2, 60, 'COUPURE DE COURANT', 9, '#f5e663').setOrigin(0.5).setScrollFactor(0).setDepth(46).setStroke('#05030f', 3);
    // Flicker, hold the dark, then the grid comes back.
    this.scene.tweens.chain({ targets: d, tweens: [
      { alpha: 0.9, duration: 60 }, { alpha: 0, duration: 60 }, { alpha: 0.9, duration: 60 }, { alpha: 0.2, duration: 80 },
      { alpha: 1, duration: 120 }, { alpha: 1, duration: 3400 }, { alpha: 0, duration: 400 },
    ], onComplete: () => label.destroy() });
    this.scene.time.delayedCall(1200, () => label.setAlpha(0.5));
  }
}

export const LIGHT_COLORS = COLORS;
