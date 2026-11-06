import Phaser from 'phaser';
import { txt } from '../ui/text';

export function sparks(scene: Phaser.Scene, x: number, y: number, color: number, count = 6, dist = 14) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = scene.add.image(x, y, 'fx-spark').setTint(color).setDepth(50);
    scene.tweens.add({
      targets: s, x: x + Math.cos(a) * dist * (0.5 + Math.random()), y: y + Math.sin(a) * dist * (0.5 + Math.random()),
      alpha: 0, duration: 220 + Math.random() * 160, onComplete: () => s.destroy(),
    });
  }
}

export function floatText(scene: Phaser.Scene, x: number, y: number, str: string, color = '#e8e8ff', size = 7) {
  const t = txt(scene, x, y, str, size, color).setOrigin(0.5).setDepth(60);
  scene.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 650, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
}

/** Diagonal neon rain drawn on a Graphics layer each frame. */
export class Rain {
  private g: Phaser.GameObjects.Graphics;
  private drops: { x: number; y: number; v: number; l: number }[] = [];
  constructor(scene: Phaser.Scene, private w: number, private h: number, count = 70, depth = 40) {
    this.g = scene.add.graphics().setDepth(depth);
    for (let i = 0; i < count; i++) this.drops.push(this.newDrop(true));
  }
  private newDrop(anywhere: boolean) {
    return { x: Math.random() * (this.w + 60), y: anywhere ? Math.random() * this.h : -10, v: 220 + Math.random() * 160, l: 4 + Math.random() * 6 };
  }
  update(dtMs: number) {
    const dt = dtMs / 1000;
    this.g.clear();
    for (const d of this.drops) {
      d.y += d.v * dt;
      d.x -= d.v * 0.25 * dt;
      if (d.y > this.h) Object.assign(d, this.newDrop(false));
      this.g.lineStyle(1, d.l > 8 ? 0x00f0ff : 0x6a6aa0, d.l > 8 ? 0.35 : 0.25);
      this.g.lineBetween(d.x, d.y, d.x + d.l * 0.25, d.y - d.l);
    }
  }
}
