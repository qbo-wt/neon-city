import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import type { Implant } from '../core/types';
import type { Controls } from '../input/controls';
import { txt } from './text';

/** Modal: pick one of up to 3 implants with the mouse or keys 1-3. Camera-fixed. */
export class ImplantChoice {
  private root: Phaser.GameObjects.Container;
  private done = false;

  constructor(private scene: Phaser.Scene, private options: Implant[], private controls: Controls, private onPick: (i: Implant) => void) {
    const { WIDTH: W, HEIGHT: H } = CONFIG;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(200);
    this.root.add(scene.add.rectangle(W / 2, H / 2, W, H, 0x05030f, 0.82));
    this.root.add(txt(scene, W / 2, 40, 'CLINIQUE CLANDESTINE — CHOISIS UN IMPLANT', 10, '#00f0ff').setOrigin(0.5));
    this.root.add(txt(scene, W / 2, 56, 'Chaque implant augmente ta charge de psychose', 7, '#8a86b0').setOrigin(0.5));

    const cw = 136, gap = 12, total = options.length * cw + (options.length - 1) * gap;
    options.forEach((imp, i) => {
      const x = W / 2 - total / 2 + i * (cw + gap) + cw / 2, y = 140;
      const card = scene.add.rectangle(x, y, cw, 120, 0x140f2b).setStrokeStyle(1, COLORS.cyan).setInteractive({ useHandCursor: true });
      card.on('pointerover', () => card.setStrokeStyle(2, COLORS.magenta));
      card.on('pointerout', () => card.setStrokeStyle(1, COLORS.cyan));
      card.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.button === 0) this.pick(imp); });
      this.root.add(card);
      this.root.add(scene.add.image(x, y - 34, 'implant-pickup').setScale(2));
      this.root.add(txt(scene, x, y - 8, imp.name, 8, '#e8e8ff').setOrigin(0.5).setWordWrapWidth(cw - 10).setAlign('center'));
      this.root.add(txt(scene, x, y + 16, imp.description, 7, '#f5e663').setOrigin(0.5).setWordWrapWidth(cw - 10).setAlign('center'));
      this.root.add(txt(scene, x, y + 40, `Charge psy +${imp.load}`, 7, '#ff2a6d').setOrigin(0.5));
      this.root.add(txt(scene, x, y + 52, `[${i + 1}]`, 6, '#8a86b0').setOrigin(0.5));
    });
    // Children must be camera-fixed too, or their hit areas are offset by the camera scroll.
    this.root.setScrollFactor(0, 0, true);
  }

  /** Call every frame while open. */
  tick() {
    const n = this.controls.numberPressed();
    if (n && this.options[n - 1]) this.pick(this.options[n - 1]);
  }

  private pick(imp: Implant) {
    if (this.done) return;
    this.done = true;
    this.root.destroy();
    this.onPick(imp);
  }
}
