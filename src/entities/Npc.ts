import Phaser from 'phaser';
import { floatText } from '../fx/effects';
import { txt } from '../ui/text';

export type NpcActivity = 'wander' | 'smoke' | 'talk' | 'sit' | 'phone' | 'idle' | 'eat' | 'play' | 'cook' | 'lean' | 'dance';

const EMOTES: Record<NpcActivity, string[]> = {
  wander: [], idle: ['...', '?'],
  smoke: [], talk: ['...', 'Ha ha', '!', 'Tu savais ?', 'Chut'],
  sit: ['Zzz', '...'], phone: ['Allô ?', 'Ouais...', 'Demain.'],
  eat: ['Slurp', 'Trop salé', 'Encore un !'], play: ['Allez !', 'Non non NON', 'GG', 'Record !'],
  cook: ['Ramen !', 'Suivant !', 'Ça arrive !'], lean: ['...', 'Tu regardes quoi ?', 'Pff'],
  dance: ['♪', '♫', '♪ ♪'],
};

export interface NpcOpts {
  flip?: boolean;
  faceUp?: boolean;
  bounds?: Phaser.Geom.Rectangle;
  name?: string;
  lines?: string[];
}

/**
 * Building resident built from generated parts (see gfx/npcArt): walks with a leg animation,
 * breathes when idle, carries props for what they are doing, and answers when spoken to.
 */
export class Npc extends Phaser.Physics.Arcade.Sprite {
  readonly name: string;
  private lines: string[];
  private lineIndex = 0;
  private target?: { x: number; y: number };
  private waitUntil = 0;
  private nextEmoteAt: number;
  private shadow: Phaser.GameObjects.Image;
  private prop?: Phaser.GameObjects.GameObject & { setPosition: (x: number, y: number) => unknown; setVisible: (v: boolean) => unknown };
  private bubble?: Phaser.GameObjects.Container;
  private facingUp: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, private look: string, private activity: NpcActivity,
    private bounds: Phaser.Geom.Rectangle, opts: NpcOpts = {}) {
    super(scene, x, y, `${look}-a`);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    (this.body as Phaser.Physics.Arcade.Body).setCircle(5, 3, 9).setImmovable(true);
    this.setDepth(8).setFlipX(!!opts.flip);
    this.name = opts.name ?? 'Passant';
    this.lines = opts.lines ?? ['...'];
    this.facingUp = !!opts.faceUp;
    this.shadow = scene.add.image(x, y + 8, 'shadow').setDepth(4);
    this.nextEmoteAt = scene.time.now + 1500 + Math.random() * 5000;
    this.idleFrame();

    // Breathing: a slow squash so nobody stands frozen.
    scene.tweens.add({ targets: this, scaleY: activity === 'sit' ? 0.9 : 1.035, duration: 900 + Math.random() * 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    if (activity === 'sit') this.setScale(1, 0.92);
    if (activity === 'dance') scene.tweens.add({ targets: this, angle: { from: -8, to: 8 }, duration: 260, yoyo: true, repeat: -1 });

    // Activity props.
    if (activity === 'phone') this.prop = scene.add.image(x, y, 'glow').setTint(0x00f0ff).setScale(0.12).setAlpha(0.9).setBlendMode(Phaser.BlendModes.ADD).setDepth(9);
    if (activity === 'smoke') this.prop = scene.add.rectangle(x, y, 1, 1, 0xff8c2a).setDepth(9);
    if (activity === 'eat') this.prop = scene.add.image(x, y, 'bowl').setDepth(9);
    if (activity === 'play') this.prop = scene.add.image(x, y, 'glow').setTint(0x6a2cff).setScale(0.35).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(9);
  }

  private idleFrame() {
    this.anims.stop();
    this.setTexture(`${this.look}${this.facingUp ? '-back' : ''}-a`);
  }

  /** Shows the next line in a speech bubble. */
  speak() {
    this.bubble?.destroy();
    const line = this.lines[this.lineIndex++ % this.lines.length];
    const t = txt(this.scene, 0, 0, line, 6, '#e8e8ff').setOrigin(0.5).setWordWrapWidth(150).setAlign('center');
    const bg = this.scene.add.rectangle(0, 0, t.width + 8, t.height + 6, 0x05030f, 0.92).setStrokeStyle(1, 0x8a86b0);
    const name = txt(this.scene, -bg.width / 2 + 2, -bg.height / 2 - 7, this.name, 5, '#f5e663');
    this.bubble = this.scene.add.container(this.x, this.y - 22 - t.height / 2, [bg, t, name]).setDepth(60);
    this.scene.time.delayedCall(2800 + line.length * 40, () => { this.bubble?.destroy(); this.bubble = undefined; });
    // Turn toward whoever talks to them.
    if (this.activity !== 'cook' && this.activity !== 'play' && this.activity !== 'eat') this.facingUp = false;
    if (this.activity !== 'wander') this.idleFrame();
  }

  tick(now: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.activity === 'wander') {
      if (now < this.waitUntil || this.bubble) {
        body.setVelocity(0, 0);
        if (this.anims.isPlaying) this.idleFrame();
      } else {
        if (!this.target || Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y) < 4 || !body.blocked.none) {
          this.target = { x: Phaser.Math.Between(this.bounds.left, this.bounds.right), y: Phaser.Math.Between(this.bounds.top, this.bounds.bottom) };
          this.waitUntil = now + 800 + Math.random() * 2600;
        }
        const a = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        body.setVelocity(Math.cos(a) * 30, Math.sin(a) * 30);
        this.facingUp = Math.sin(a) < -Math.abs(Math.cos(a));
        const anim = `${this.look}-walk${this.facingUp ? '-back' : ''}`;
        if (this.anims.currentAnim?.key !== anim || !this.anims.isPlaying) this.play(anim);
        this.setFlipX(Math.cos(a) < 0);
      }
    } else {
      body.setVelocity(0, 0);
    }

    // Props follow the hands.
    const side = this.flipX ? -1 : 1;
    if (this.prop) {
      if (this.activity === 'phone') this.prop.setPosition(this.x + side * 4, this.y - 4);
      if (this.activity === 'smoke') this.prop.setPosition(this.x + side * 6, this.y - 1);
      if (this.activity === 'eat') this.prop.setPosition(this.x, this.y - 2);
      if (this.activity === 'play') { this.prop.setPosition(this.x, this.y - 8); (this.prop as Phaser.GameObjects.Image).setAlpha(0.3 + Math.random() * 0.4); }
    }
    if (this.activity === 'smoke' && Math.random() < 0.02) {
      const s = this.scene.add.image(this.x + side * 6, this.y - 4, 'steam').setDepth(30).setScale(0.5).setAlpha(0.6);
      this.scene.tweens.add({ targets: s, y: s.y - 16, scale: 1.4, alpha: 0, duration: 1400, onComplete: () => s.destroy() });
    }
    if (this.activity === 'cook' && Math.random() < 0.04) {
      const s = this.scene.add.image(this.x + (Math.random() - 0.5) * 30, this.y + 14, 'steam').setDepth(30).setScale(0.6).setAlpha(0.5);
      this.scene.tweens.add({ targets: s, y: s.y - 22, scale: 1.6, alpha: 0, duration: 1500, onComplete: () => s.destroy() });
    }
    const emotes = EMOTES[this.activity];
    if (!this.bubble && emotes.length && now >= this.nextEmoteAt) {
      this.nextEmoteAt = now + 4000 + Math.random() * 6000;
      floatText(this.scene, this.x, this.y - 16, Phaser.Utils.Array.GetRandom(emotes), this.activity === 'dance' ? '#ff2a6d' : '#8a86b0', 6);
    }
    this.shadow.setPosition(this.x, this.y + 8);
    this.bubble?.setPosition(this.x, this.bubble.y);
  }
}
