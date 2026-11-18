import Phaser from 'phaser';
import { floatText } from '../fx/effects';
import { txt } from '../ui/text';
import { audio } from '../audio/audio';
import { HEAD_PX } from '../three/Interior3D';

type Facing = 'd' | 'u' | 's';
/** Which way a direction faces: u (away from the camera), s (sideways) or d (toward it). */
const facingOf = (x: number, y: number): Facing => (y < -0.6 ? 'u' : Math.abs(x) > 0.55 ? 's' : 'd');

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
  /** Sits (3D seated pose) on a seat this high (m): bench, stool, chair. */
  seat?: number;
  /** Dialogue provider (story lines, reactions to your last run); falls back to `lines`. */
  talk?: () => string;
}

/**
 * Building resident: an invisible physics body (wandering, activity, speech bubble, emotes) that the 3D
 * character follows (see InteriorScene.setup3d). They answer when spoken to.
 */
export class Npc extends Phaser.Physics.Arcade.Sprite {
  readonly name: string;
  readonly seat: number;
  private lines: string[];
  private talk?: () => string;
  private lineIndex = 0;
  private target?: { x: number; y: number };
  private waitUntil = 0;
  private nextEmoteAt: number;
  private bubble?: Phaser.GameObjects.Container;
  private facing: Facing;
  /** u (back to the camera) or d / s, and the mirror: the 3D view turns the character the same way. */
  get faceDir() { return { facing: this.facing, flip: this.flipX }; }
  /** Talking right now (speech bubble shown). */
  get speaking() { return !!this.bubble; }

  constructor(scene: Phaser.Scene, x: number, y: number, readonly look: string, readonly activity: NpcActivity,
    private bounds: Phaser.Geom.Rectangle, opts: NpcOpts = {}) {
    super(scene, x, y, 'body');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    // Same invisible 24×24 body as the player: feet on row 15.
    this.setOrigin(0.5, 15 / 24).setVisible(false);
    (this.body as Phaser.Physics.Arcade.Body).setCircle(5, 7, 13).setImmovable(true);
    this.setDepth(8).setFlipX(!!opts.flip);
    this.name = opts.name ?? 'Passant';
    this.seat = opts.seat ?? 0;
    this.lines = opts.lines ?? ['...'];
    this.talk = opts.talk;
    this.facing = opts.faceUp ? 'u' : 'd';
    this.nextEmoteAt = scene.time.now + 1500 + Math.random() * 5000;
  }

  /** Shows the next line in a speech bubble. */
  speak() {
    this.say(this.talk?.() ?? this.lines[this.lineIndex++ % this.lines.length]);
  }

  /** A line in a speech bubble for `ms` (the corridor's little scenes time their exchanges with it). */
  say(line: string, ms = 2800 + line.length * 40) {
    this.bubble?.destroy();
    audio.sfx('talk');
    const t = txt(this.scene, 0, 0, line, 6, '#e8e8ff').setOrigin(0.5).setWordWrapWidth(150).setAlign('center');
    const bg = this.scene.add.rectangle(0, 0, t.width + 8, t.height + 6, 0x05030f, 0.92).setStrokeStyle(1, 0x8a86b0);
    const name = txt(this.scene, -bg.width / 2 + 2, -bg.height / 2 - 7, this.name, 5, '#f5e663');
    const bubble = this.scene.add.container(this.x, this.y + 2 - HEAD_PX - t.height / 2, [bg, t, name]).setDepth(60);
    this.bubble = bubble;
    // Only this bubble: a newer one has its own timer.
    this.scene.time.delayedCall(ms, () => { bubble.destroy(); if (this.bubble === bubble) this.bubble = undefined; });
    // (The 3D view turns them toward the player while the bubble is up.)
  }

  tick(now: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.activity === 'wander') {
      if (now < this.waitUntil || this.bubble) {
        body.setVelocity(0, 0);
      } else {
        if (!this.target || Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y) < 4 || !body.blocked.none) {
          this.target = { x: Phaser.Math.Between(this.bounds.left, this.bounds.right), y: Phaser.Math.Between(this.bounds.top, this.bounds.bottom) };
          this.waitUntil = now + 800 + Math.random() * 2600;
        }
        const a = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        body.setVelocity(Math.cos(a) * 30, Math.sin(a) * 30);
        this.facing = facingOf(Math.cos(a), Math.sin(a));
        this.setFlipX(Math.cos(a) < 0);
      }
    } else {
      body.setVelocity(0, 0);
    }

    // Smoke and steam are drawn by the 3D room (Interior3D).
    const emotes = EMOTES[this.activity];
    if (!this.bubble && emotes.length && now >= this.nextEmoteAt) {
      this.nextEmoteAt = now + 4000 + Math.random() * 6000;
      floatText(this.scene, this.x, this.y + 4 - HEAD_PX, Phaser.Utils.Array.GetRandom(emotes), this.activity === 'dance' ? '#ff2a6d' : '#8a86b0', 6);
    }
    this.bubble?.setPosition(this.x, this.bubble.y);
  }
}
