import Phaser from 'phaser';
import { COLORS } from '../../config';
import { ENEMY_RIGS } from '../../gfx/enemyArt';
import { artSuffix, playerKey, type WeaponArt } from '../../gfx/playerArt';
import type { Facing } from '../../gfx/rig';
import type { Pt, Unit } from '../../tactics/types';

/** Facing and mirror for a step on the iso board: +x goes down-right, +y down-left. */
export function isoFacing(d: Pt): { f: Facing; flip: boolean } {
  if (Math.abs(d.x) >= Math.abs(d.y)) return d.x >= 0 ? { f: 'd', flip: false } : { f: 'u', flip: true };
  return d.y >= 0 ? { f: 'd', flip: true } : { f: 'u', flip: false };
}

export type PoseKind = 'windup' | 'strike' | 'hurt' | 'charge';

/** Which boss pose a spell plays. */
const BOSS_POSE: Record<string, string> = {
  'b-butt': 'quake', 'x-blade': 'quake', 'b-barrage': 'barrage', 'x-ray': 'barrage', 'x-wave': 'nova',
  'b-charge': 'charge', 'b-call': 'fan', 'x-drones': 'fan', 'x-blink': 'fan',
};

/**
 * One unit on the board: its sprite (the existing character sheets, front and back views for the
 * four diagonals), shadow, health bar and status marks. Movement and poses are tweened; the
 * fight state stays in the tactics engine.
 */
export class UnitView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private bar: Phaser.GameObjects.Graphics;
  private aura?: Phaser.GameObjects.Image;
  private ring?: Phaser.GameObjects.Ellipse;
  private primeFx?: Phaser.GameObjects.Image;
  private facing: Facing = 'd';
  private flip = false;
  private headY: number;
  private hover = 0;
  showBar = false;

  constructor(private scene: Phaser.Scene, readonly unit: Unit, private pos: (p: Pt) => Pt, private weaponArt: WeaponArt = 'blade', npcKey?: string) {
    const k = unit.kind;
    this.npc = npcKey;
    let tex: string, frame: string | undefined, originY: number;
    if (k === 'player') { tex = playerKey('d', 'idle0'); originY = 22 / 24; this.headY = 18; }
    else if (npcKey) { tex = npcKey; frame = 'd-idle0'; originY = 22 / 24; this.headY = 18; }
    else if (unit.team === 2) { tex = `iso-br-${k}`; originY = 1; this.headY = 22; }
    else if (k === 'turret') { tex = 'iso-turret'; originY = 1; this.headY = 18; }
    else {
      const rig = ENEMY_RIGS[k as keyof typeof ENEMY_RIGS];
      tex = rig.key; frame = 'd-idle0';
      originY = k === 'drone' ? 1 : (rig.feetRow + 1) / rig.S;
      this.headY = k === 'drone' ? 20 : rig.feetRow - rig.headRow + 4;
      if (k === 'drone') this.hover = 8;
    }
    const p = pos(unit);
    this.shadow = scene.add.image(p.x, p.y + 1, 'shadow').setDepth(60).setScale(unit.boss ? 2.2 : unit.team === 2 ? 1.2 : 1.3, 1.2).setAlpha(unit.team === 2 ? 0 : 0.9);
    this.sprite = scene.add.sprite(p.x, p.y - this.hover, tex, frame).setOrigin(0.5, originY);
    this.bar = scene.add.graphics();
    if (unit.elite === 'frenzy' || unit.elite === 'explosive') {
      this.aura = scene.add.image(p.x, p.y - 6, 'glow').setTint(unit.elite === 'frenzy' ? 0xff3b3b : COLORS.yellow).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.45).setScale(0.7);
    }
    if (unit.elite === 'cloak') this.sprite.setAlpha(0.55);
    this.idle();
    this.sync();
  }
  private npc?: string;

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y + this.hover; }

  private animKey(name: 'idle' | 'walk') {
    const k = this.unit.kind;
    if (k === 'player') return `pl-${name}-${this.facing}`;
    if (this.npc) return `${this.npc}-${name === 'walk' ? 'walk' : 'idle'}-${this.facing}`;
    if (this.unit.team === 2 || k === 'turret') return undefined;
    return `${ENEMY_RIGS[k as keyof typeof ENEMY_RIGS].key}-${name}-${this.facing}`;
  }

  private play(name: 'idle' | 'walk') {
    const key = this.animKey(name);
    if (!key || !this.scene.anims.exists(key)) return;
    if (this.sprite.anims.currentAnim?.key === key && this.sprite.anims.isPlaying) return;
    this.sprite.anims.play(key);
  }

  idle() { this.play('idle'); }

  face(d: Pt) {
    if (!d.x && !d.y) return;
    const { f, flip } = isoFacing(d);
    this.facing = f; this.flip = flip;
    this.sprite.setFlipX(flip);
  }

  /** A still frame: attack wind-up / release, hurt. */
  pose(kind: PoseKind, spellId?: string) {
    const u = this.unit;
    if (u.team === 2 || u.kind === 'turret') return;
    this.sprite.anims.stop();
    if (u.kind === 'player') {
      const sfx = artSuffix(this.weaponArt);
      const name = kind === 'hurt' ? 'hurt' : kind === 'windup' ? `atk0${sfx}` : kind === 'charge' ? 'dash' : `atk1${sfx}`;
      this.sprite.setTexture(playerKey(this.facing, name));
      return;
    }
    if (this.npc) return;
    const rig = ENEMY_RIGS[u.kind as keyof typeof ENEMY_RIGS];
    const tex = this.scene.textures.get(rig.key);
    const move = spellId ? BOSS_POSE[spellId] : undefined;
    const tries = kind === 'hurt' ? ['hurt'] : kind === 'charge' ? ['charge', 'strike']
      : move ? [move === 'charge' ? (kind === 'windup' ? 'windup-charge' : 'charge') : `${kind}-${move}`, kind] : [kind];
    const name = tries.find(n => tex.has(`${this.facing}-${n}`));
    if (name) this.sprite.setTexture(rig.key, `${this.facing}-${name}`);
  }

  /** Back to the idle loop (players: their idle textures; sheets: their idle anim). */
  rest() {
    if (this.unit.kind === 'player') this.sprite.setTexture(playerKey(this.facing, 'idle0'));
    this.idle();
  }

  /** Walks cell by cell along the path. */
  async walk(path: Pt[], msPerCell = 150): Promise<void> {
    let from: Pt = { x: this.unit.x, y: this.unit.y };
    // The unit already stands at the end of the path in the engine: walk from where the sprite is.
    const startCell = this.cellOfSprite();
    if (startCell) from = startCell;
    this.play('walk');
    for (const c of path) {
      this.face({ x: c.x - from.x, y: c.y - from.y });
      this.play('walk');
      await this.tweenTo(this.pos(c), msPerCell, 'Linear');
      from = c;
    }
    this.cell = path[path.length - 1] ?? this.cell;
    this.idle();
  }

  /** Pushed, pulled, charging or jumping: no walk cycle. */
  async shove(path: Pt[], kind: 'push' | 'pull' | 'charge' | 'dash' | 'jump'): Promise<void> {
    const end = path[path.length - 1];
    if (!end) return;
    if (kind === 'jump') {
      const p = this.pos(end), sy = this.sprite.y;
      this.face({ x: end.x - (this.cell?.x ?? end.x), y: end.y - (this.cell?.y ?? end.y) });
      await new Promise<void>(res => {
        const o = { t: 0 }, x0 = this.sprite.x, y0 = sy + this.hover;
        this.scene.tweens.add({ targets: o, t: 1, duration: 260, ease: 'Sine.easeInOut', onUpdate: () => {
          const x = x0 + (p.x - x0) * o.t, y = y0 + (p.y - y0) * o.t - Math.sin(o.t * Math.PI) * 26;
          this.sprite.setPosition(x, y - this.hover); this.sync();
        }, onComplete: () => res() });
      });
    } else {
      if (kind === 'charge' || kind === 'dash') this.pose('charge');
      for (const c of path) await this.tweenTo(this.pos(c), kind === 'push' || kind === 'pull' ? 70 : 60, 'Quad.easeOut');
    }
    this.cell = end;
    this.rest();
  }

  private cell?: Pt;
  private cellOfSprite() { return this.cell; }
  place(p: Pt) {
    this.cell = { x: p.x, y: p.y };
    const s = this.pos(p);
    this.sprite.setPosition(s.x, s.y - this.hover);
    this.sync();
  }

  private tweenTo(p: Pt, duration: number, ease: string) {
    return new Promise<void>(res => this.scene.tweens.add({
      targets: this.sprite, x: p.x, y: p.y - this.hover, duration, ease,
      onUpdate: () => this.sync(), onComplete: () => { this.sync(); res(); },
    }));
  }

  /** Shadow, depth, bar and marks follow the sprite. */
  sync() {
    const x = this.sprite.x, y = this.sprite.y + this.hover;
    this.sprite.setDepth(100 + y + (this.unit.team === 2 ? -1 : 0));
    this.shadow.setPosition(x, y + 1).setDepth(60);
    this.aura?.setPosition(x, y - 6).setDepth(99 + y);
    this.ring?.setPosition(x, y).setDepth(61);
    this.primeFx?.setPosition(x, y - 8).setDepth(101 + y);
    this.drawBar();
  }

  drawBar() {
    const g = this.bar, u = this.unit;
    g.clear();
    if (!this.showBar || u.dead) return;
    const w = u.boss ? 22 : 14, x = this.sprite.x - w / 2, y = this.sprite.y - this.headY - 4 + (this.unit.team === 2 ? 0 : 0);
    g.setDepth(900);
    g.fillStyle(0x05030f, 0.85).fillRect(x - 1, y - 1, w + 2, 4);
    const col = u.team === 0 ? COLORS.cyan : u.team === 2 ? 0x8a86b0 : COLORS.magenta;
    g.fillStyle(0x221d35).fillRect(x, y, w, 2);
    g.fillStyle(col).fillRect(x, y, Math.max(0, Math.round((w * u.hp) / u.maxHp)), 2);
    if (u.shield > 0) g.fillStyle(0xe8e8ff).fillRect(x, y - 1, Math.min(w, Math.round((w * u.shield) / u.maxHp)), 1);
  }

  /** Primed bomber: a pulsing warning light. */
  setPrimed(on: boolean) {
    if (on && !this.primeFx) {
      this.primeFx = this.scene.add.image(this.x, this.y - 8, 'glow').setTint(COLORS.yellow).setBlendMode(Phaser.BlendModes.ADD).setScale(0.6);
      this.scene.tweens.add({ targets: this.primeFx, scale: 1, alpha: 0.4, yoyo: true, repeat: -1, duration: 220 });
    } else if (!on) { this.primeFx?.destroy(); this.primeFx = undefined; }
  }

  /** The unit whose turn it is gets a ring at its feet. */
  setActive(on: boolean) {
    if (on && !this.ring) {
      this.ring = this.scene.add.ellipse(this.x, this.y, 22, 11).setStrokeStyle(1, this.unit.team === 0 ? COLORS.cyan : COLORS.magenta, 0.9);
      this.scene.tweens.add({ targets: this.ring, scale: 1.15, yoyo: true, repeat: -1, duration: 500 });
      this.sync();
    } else if (!on) { this.ring?.destroy(); this.ring = undefined; }
  }

  flash(color = 0xffffff) {
    this.sprite.setTint(color).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(70, () => { if (this.sprite.active) { this.sprite.clearTint(); if (this.unit.elite === 'cloak') this.sprite.setAlpha(0.55); } });
  }

  async die(): Promise<void> {
    this.setPrimed(false); this.setActive(false);
    this.bar.clear();
    this.aura?.destroy();
    if (this.unit.kind === 'player') {
      this.sprite.anims.stop();
      this.sprite.setTexture(playerKey(this.facing, 'down'));
      return;
    }
    this.pose('hurt');
    await new Promise<void>(res => this.scene.tweens.add({ targets: [this.sprite, this.shadow], alpha: 0, y: '+=3', duration: 380, onComplete: () => res() }));
    this.destroy();
  }

  destroy() {
    this.sprite.destroy(); this.shadow.destroy(); this.bar.destroy();
    this.aura?.destroy(); this.ring?.destroy(); this.primeFx?.destroy();
  }
}
