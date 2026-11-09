import Phaser from 'phaser';
import { floatText } from '../fx/effects';
import { txt } from '../ui/text';
import { facingOf, type Facing } from '../gfx/rig';

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

/** Which animation of the NPC sheet each activity plays (wanderers switch between walk and idle). */
const ANIM: Record<NpcActivity, string> = {
  wander: 'walk', idle: 'idle', smoke: 'smoke', talk: 'talk', sit: 'sit', phone: 'phone',
  eat: 'eat', play: 'play', cook: 'cook', lean: 'lean', dance: 'dance',
};

/**
 * Building resident drawn on the character rig (see gfx/npcArt): every activity is animated frame by
 * frame (smoking, phone, talking, sitting, eating, gaming, cooking, leaning, dancing), wanderers walk
 * in three views, and they answer when spoken to.
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
  private facing: Facing;

  constructor(scene: Phaser.Scene, x: number, y: number, private look: string, private activity: NpcActivity,
    private bounds: Phaser.Geom.Rectangle, opts: NpcOpts = {}) {
    super(scene, x, y, look, 'd-idle0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    // Same 24×24 frame layout as the player: feet on row 21.
    this.setOrigin(0.5, 15 / 24);
    (this.body as Phaser.Physics.Arcade.Body).setCircle(5, 7, 13).setImmovable(true);
    this.setDepth(8).setFlipX(!!opts.flip);
    this.name = opts.name ?? 'Passant';
    this.lines = opts.lines ?? ['...'];
    this.facing = opts.faceUp ? 'u' : 'd';
    this.shadow = scene.add.image(x, y + 7, 'shadow').setDepth(4);
    this.nextEmoteAt = scene.time.now + 1500 + Math.random() * 5000;
    // Nobody moves in sync: each NPC runs its animation at its own pace.
    this.anims.timeScale = 0.85 + Math.random() * 0.3;
    this.idleFrame();

    // Light sources that go with the activity (the props themselves are drawn in the frames).
    if (activity === 'phone') this.prop = scene.add.image(x, y, 'glow').setTint(0x00f0ff).setScale(0.12).setAlpha(0.9).setBlendMode(Phaser.BlendModes.ADD).setDepth(9);
    if (activity === 'smoke') this.prop = scene.add.image(x, y, 'glow').setTint(0xff8c2a).setScale(0.06).setAlpha(0.8).setBlendMode(Phaser.BlendModes.ADD).setDepth(9);
    if (activity === 'play') this.prop = scene.add.image(x, y, 'glow').setTint(0x6a2cff).setScale(0.35).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(9);
  }

  /** Plays the activity loop for the current facing (wanderers: idle while they wait). */
  private idleFrame() {
    this.playLoop(this.activity === 'wander' ? 'idle' : ANIM[this.activity]);
  }

  private playLoop(name: string) {
    const key = `${this.look}-${name}-${this.facing}`;
    if (this.anims.currentAnim?.key === key && this.anims.isPlaying) return;
    const n = this.scene.anims.get(key)?.frames.length ?? 1;
    this.anims.play({ key, startFrame: Math.floor(Math.random() * n) });
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
    if (this.activity !== 'cook' && this.activity !== 'play' && this.activity !== 'eat' && !(this.activity === 'sit' && this.facing === 'u')) this.facing = 'd';
    if (this.activity !== 'wander') this.idleFrame();
  }

  tick(now: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.activity === 'wander') {
      if (now < this.waitUntil || this.bubble) {
        body.setVelocity(0, 0);
        this.idleFrame();
      } else {
        if (!this.target || Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y) < 4 || !body.blocked.none) {
          this.target = { x: Phaser.Math.Between(this.bounds.left, this.bounds.right), y: Phaser.Math.Between(this.bounds.top, this.bounds.bottom) };
          this.waitUntil = now + 800 + Math.random() * 2600;
        }
        const a = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        body.setVelocity(Math.cos(a) * 30, Math.sin(a) * 30);
        this.facing = facingOf(Math.cos(a), Math.sin(a));
        this.playLoop('walk');
        this.setFlipX(Math.cos(a) < 0);
      }
    } else {
      body.setVelocity(0, 0);
    }

    // Props follow the hands.
    const side = this.flipX ? -1 : 1;
    if (this.prop) {
      if (this.activity === 'phone') this.prop.setPosition(this.x + side * 3, this.y - 9);
      if (this.activity === 'smoke') {
        // The ember glows at the hand, brighter when it is at the mouth.
        const up = String(this.frame.name).endsWith('smoke1');
        this.prop.setPosition(this.x + side * (up ? 2 : 4), this.y + (up ? -8 : 2));
        (this.prop as Phaser.GameObjects.Image).setAlpha(up ? 1 : 0.5);
      }
      if (this.activity === 'play') { this.prop.setPosition(this.x, this.y - 8); (this.prop as Phaser.GameObjects.Image).setAlpha(0.3 + Math.random() * 0.4); }
    }
    if (this.activity === 'smoke' && Math.random() < 0.02) {
      const s = this.scene.add.image(this.x + side * 2, this.y - 10, 'steam').setDepth(30).setScale(0.5).setAlpha(0.6);
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
    this.shadow.setPosition(this.x, this.y + 7);
    this.bubble?.setPosition(this.x, this.bubble.y);
  }
}
