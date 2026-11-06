import Phaser from 'phaser';
import { floatText } from '../fx/effects';

export type NpcActivity = 'wander' | 'smoke' | 'talk' | 'sit' | 'phone' | 'idle';

const EMOTES: Record<NpcActivity, string[]> = {
  wander: [], idle: ['...', '?'],
  smoke: [], talk: ['...', 'ha ha', '!', 'tu savais ?', 'chut'],
  sit: ['zzz', '...'], phone: ['allô ?', 'ouais...', 'demain.'],
};

/** Building resident: walks between random points or stays put doing something. No combat. */
export class Npc extends Phaser.Physics.Arcade.Sprite {
  private target?: { x: number; y: number };
  private waitUntil = 0;
  private nextEmoteAt: number;
  private shadow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, private look: string, private activity: NpcActivity,
    private bounds: Phaser.Geom.Rectangle, private faceUp = false) {
    super(scene, x, y, look);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    (this.body as Phaser.Physics.Arcade.Body).setCircle(5, 3, 6).setImmovable(true);
    this.setDepth(8);
    this.shadow = scene.add.image(x, y + 7, 'shadow').setDepth(4);
    this.nextEmoteAt = scene.time.now + 1500 + Math.random() * 4000;
    if (faceUp) this.setTexture(`${look}-back`);
  }

  tick(now: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.activity === 'wander') {
      if (now < this.waitUntil) body.setVelocity(0, 0);
      else {
        if (!this.target || Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y) < 4 || body.blocked.none === false) {
          this.target = { x: Phaser.Math.Between(this.bounds.left, this.bounds.right), y: Phaser.Math.Between(this.bounds.top, this.bounds.bottom) };
          this.waitUntil = now + 800 + Math.random() * 2200;
        }
        const a = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        body.setVelocity(Math.cos(a) * 32, Math.sin(a) * 32);
      }
      const v = body.velocity;
      if (v.length() > 1) this.setTexture(v.y < -Math.abs(v.x) ? `${this.look}-back` : this.look).setFlipX(v.x < 0);
    } else {
      body.setVelocity(0, 0);
    }

    if (this.activity === 'smoke' && Math.random() < 0.02) {
      const s = this.scene.add.image(this.x + (this.flipX ? -5 : 5), this.y - 4, 'steam').setDepth(30).setScale(0.5).setAlpha(0.6);
      this.scene.tweens.add({ targets: s, y: s.y - 16, scale: 1.4, alpha: 0, duration: 1400, onComplete: () => s.destroy() });
    }
    const emotes = EMOTES[this.activity];
    if (emotes.length && now >= this.nextEmoteAt) {
      this.nextEmoteAt = now + 3500 + Math.random() * 5000;
      floatText(this.scene, this.x, this.y - 14, Phaser.Utils.Array.GetRandom(emotes), '#8a86b0', 6);
    }
    this.shadow.setPosition(this.x, this.y + 7);
  }
}
