import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import type { EnemyDef } from '../data/enemies';
import type { EliteMod } from '../core/runMap';
import { floatText, sparks } from '../fx/effects';
import { audio } from '../audio/audio';
import type { Player } from './Player';
import { ENEMY_RIGS, type EnemyRig } from '../gfx/enemyArt';
import { facingOf, type Facing } from '../gfx/rig';

export interface ShotOpts { psy?: number; key?: string; from?: string }

/** Scaling applied on spawn: elite squads (and notoriety) make enemies tougher. */
export interface EnemyMods { hpMult?: number; damageMult?: number; speedMult?: number; telegraphMult?: number; elite?: EliteMod }

export interface EnemyHooks {
  player: Player;
  fireBullet(x: number, y: number, angle: number, speed: number, damage: number, opts?: ShotOpts): void;
  /** Walking direction toward the player along the level's flow field (null = no path known). */
  steer(x: number, y: number): { x: number; y: number } | null;
  /** True when (x, y) lies in a tile taken by a crate or a large prop. */
  occupied(x: number, y: number): boolean;
  onDeath(e: Enemy): void;
  /** An explosive elite died here. */
  eliteBlast(x: number, y: number): void;
  /** The run's simulation clock (slows on parries, freezes on hit-stop). */
  now(): number;
  /** This enemy's melee blow just landed on the player (thorns). */
  struckPlayer(e: Enemy): void;
}

type AiState = 'chase' | 'windup' | 'attack' | 'recover' | 'stunned';
type BossMove = 'charge' | 'fan' | 'nova' | 'barrage' | 'quake';
const BOSS_CYCLES: Record<string, BossMove[]> = {
  warden: ['charge', 'barrage', 'fan', 'quake', 'charge', 'nova'],
  boss: ['charge', 'nova', 'barrage', 'quake', 'fan', 'charge', 'barrage', 'nova', 'quake'],
};

/** Light enemies are pushed back and briefly staggered by hits; heavy ones barely flinch. */
const HITSTUN_MS = { light: 160, heavy: 60 };
/** Shooters keep their distance: [too close, too far] in px. */
const KITE: Record<string, [number, number]> = { ranged: [80, 150], burst: [70, 140], hack: [140, 210] };

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  hp: number;
  readonly maxHp: number;
  dead = false;
  /** Blew itself up: no kill credit, no credits. */
  exploded = false;

  private ai: AiState = 'chase';
  private aiUntil = 0;
  private aiSince = 0;
  private vulnerable = false;
  private nextAttackAt: number;
  private chargeDir = { x: 0, y: 0 };
  private chargeHit = false;
  private move: BossMove = 'charge';
  private cycle = 0;
  private strafe = Math.random() < 0.5 ? 1 : -1;
  private flashUntil = 0;
  private facing = { x: 0, y: 1 };
  private shadow: Phaser.GameObjects.Image;
  private chevron: Phaser.GameObjects.Image;
  private rig: EnemyRig;
  private look: Facing = 'd';
  private hurtUntil = 0;
  /** Follow-through pose shown right after an attack is released. */
  private strikeUntil = 0;
  private strikeFrame = 'strike';
  private stars: Phaser.GameObjects.Rectangle[] = [];
  private quakeRing?: Phaser.GameObjects.Arc;
  // Stuck detection: if an enemy trying to move stays in place, it side-steps for a moment.
  private stuckCheckAt = 0;
  private stuckFrom = { x: 0, y: 0 };
  private unstickUntil = 0;
  private unstickDir = { x: 0, y: 0 };

  readonly def: EnemyDef;
  readonly elite?: EliteMod;
  /** Shield elites: damage hits this first; no knockback while it holds. */
  private shield = 0;
  private shieldRing?: Phaser.GameObjects.Arc;
  private aura?: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, baseDef: EnemyDef, private hooks: EnemyHooks, mods: EnemyMods = {}) {
    const def: EnemyDef = {
      ...baseDef,
      hp: Math.round(baseDef.hp * (mods.hpMult ?? 1) * (mods.elite ? 1.3 : 1)),
      damage: baseDef.damage * (mods.damageMult ?? 1),
      speed: baseDef.speed * (mods.speedMult ?? 1) * (mods.elite === 'frenzy' ? 1.35 : 1),
      telegraphMs: baseDef.telegraphMs * (mods.telegraphMult ?? 1) * (mods.elite === 'frenzy' ? 0.8 : 1),
    };
    const rig = ENEMY_RIGS[def.id];
    super(scene, x, y, rig.key, 'd-idle0');
    this.def = def;
    this.elite = mods.elite;
    this.rig = rig;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    // Drawn at native size: the origin sits at the waist, the hitbox rests on the feet (drones: on the hull).
    this.setOrigin(0.5, rig.originRow / rig.S).setDepth(8);
    const r = def.radius, centre = def.id === 'drone' ? rig.originRow : rig.feetRow + 1 - r;
    (this.body as Phaser.Physics.Arcade.Body).setCircle(r, rig.S / 2 - r, centre - r);
    const scale = rig.S / 20;
    this.on(Phaser.Animations.Events.ANIMATION_UPDATE, (_a: unknown, frame: Phaser.Animations.AnimationFrame) => {
      if (rig.S >= 32 && /walk[03]$/.test(String(frame.textureFrame))) this.stomp();
    });
    this.hp = this.maxHp = def.hp;
    this.nextAttackAt = hooks.now() + 500 + Math.random() * 500;
    this.shadow = scene.add.image(x, y, 'shadow').setScale(def.id === 'drone' ? 1 : scale).setDepth(4).setAlpha(def.id === 'drone' ? 0.5 : 1);
    this.chevron = scene.add.image(x, y, 'chevron').setTint(def.behavior === 'hack' ? 0x39ff88 : COLORS.magenta).setDepth(7).setAlpha(0.9);
    if (mods.elite === 'shield') {
      this.shield = Math.round(this.maxHp * 0.4);
      this.shieldRing = scene.add.circle(x, y, def.radius + 6).setStrokeStyle(1, COLORS.cyan, 0.9).setFillStyle(COLORS.cyan, 0.08).setDepth(9);
    }
    if (mods.elite === 'frenzy' || mods.elite === 'explosive') {
      this.aura = scene.add.image(x, y, 'glow').setTint(mods.elite === 'frenzy' ? 0xff3b3b : COLORS.yellow).setBlendMode(Phaser.BlendModes.ADD).setDepth(7).setScale(rig.S / 40).setAlpha(0.5);
    }
  }

  /** Boss phase 2 below 50% HP, phase 3 (frenzy) below 25%. */
  get enraged() { return this.def.behavior === 'boss' && this.hp < this.maxHp / 2; }
  get frenzy() { return this.def.behavior === 'boss' && this.hp < this.maxHp / 4; }
  private get speed() { return this.def.speed * (this.frenzy ? 1.65 : this.enraged ? 1.4 : 1); }
  private get telegraph() { return this.def.telegraphMs * (this.frenzy ? 0.55 : this.enraged ? 0.7 : 1); }
  private get heavy() { return this.def.behavior === 'boss' || this.def.behavior === 'charge'; }

  /** True once per stun: the next player hit counts as a counter-attack. */
  consumeVulnerable(): boolean {
    const v = this.vulnerable;
    this.vulnerable = false;
    return v;
  }

  stun(now: number, ms: number = CONFIG.STUN_MS) {
    this.ai = 'stunned';
    this.aiUntil = now + ms;
    this.vulnerable = true;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    floatText(this.scene, this.x, this.y - 12, 'ÉTOURDI', '#f5e663', 6);
    audio.sfx('stun');
    if (!this.stars.length) this.stars = [0, 1, 2].map(i => this.scene.add.rectangle(this.x, this.y, 2, 2, i === 1 ? COLORS.white : COLORS.yellow).setDepth(30));
  }

  /** Heavy footstep: a puff of dust under each foot. */
  private stomp() {
    const feet = this.y + this.rig.feetRow + 1 - this.rig.originRow;
    for (const side of [-1, 1]) {
      const puff = this.scene.add.circle(this.x + side * this.rig.S / 6, feet, 2, 0x8a86b0, 0.4).setDepth(4.5);
      this.scene.tweens.add({ targets: puff, scale: 2.6, alpha: 0, duration: 380, onComplete: () => puff.destroy() });
    }
  }

  /** Muzzle flash / cast light in the direction of an attack. */
  private flashAt(nx: number, ny: number, color: number) {
    const reach = this.rig.S / 2;
    const fl = this.scene.add.image(this.x + nx * reach, this.y + ny * reach, 'glow').setTint(color).setScale(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(30);
    this.scene.tweens.add({ targets: fl, alpha: 0, scale: 0.6, duration: 110, onComplete: () => fl.destroy() });
  }

  /** Dazed: stunned without opening a counter (heavy fists, shockwave, garrote). Bosses shrug most of it off. */
  daze(now: number, ms: number) {
    if (this.dead || this.ai === 'stunned') return;
    const t = this.def.behavior === 'boss' ? ms * 0.3 : ms;
    this.ai = 'stunned';
    this.aiUntil = now + t;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    if (!this.stars.length) this.stars = [0, 1, 2].map(i => this.scene.add.rectangle(this.x, this.y, 2, 2, i === 1 ? COLORS.white : COLORS.yellow).setDepth(30));
  }

  /** Yanked by a mono-wire: thrown at (vx, vy) for `ms`. */
  yank(vx: number, vy: number, ms: number) {
    if (this.dead || this.def.behavior === 'boss') return;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(vx, vy);
    this.enter('recover', ms);
  }

  takeHit(amount: number, crit: boolean, countered: boolean, fromX: number, fromY: number, stagger: boolean, knock = 1) {
    if (this.dead) return;
    if (this.shield > 0) {
      // The shield soaks the blow; what is left goes through once it breaks.
      this.shield -= amount;
      sparks(this.scene, this.x, this.y, COLORS.cyan, 4, 10);
      if (this.shield > 0) { floatText(this.scene, this.x, this.y - 10, String(amount), '#00f0ff', 6); this.flashUntil = this.hooks.now() + 50; return; }
      amount = -this.shield;
      this.shield = 0;
      this.shieldRing?.destroy();
      this.shieldRing = undefined;
      floatText(this.scene, this.x, this.y - 16, 'BOUCLIER BRISÉ', '#00f0ff', 6);
      audio.sfx('parry', { pitch: 0.6 });
      if (amount <= 0) return;
    }
    this.hp -= amount;
    this.flashUntil = this.hooks.now() + 70;
    this.hurtUntil = this.hooks.now() + 130;
    floatText(this.scene, this.x, this.y - 10, String(amount), countered ? '#00f0ff' : crit ? '#f5e663' : '#e8e8ff', countered || crit ? 9 : 7);
    sparks(this.scene, this.x, this.y, countered ? COLORS.cyan : COLORS.white, 5);
    if (this.hp <= 0) { this.die(); return; }

    const charging = this.ai === 'attack' && this.heavy;
    if (!charging && !this.shieldRing) {
      const dx = this.x - fromX, dy = this.y - fromY, len = Math.hypot(dx, dy) || 1, k = (this.heavy ? 50 : 150) * knock;
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(dx / len * k, dy / len * k);
      // Hitstun lets the knockback play out instead of being overwritten by the chase on the same frame.
      // A windup is only interrupted on light enemies by a combo finisher, so parry timing stays readable.
      if (this.ai === 'chase' || this.ai === 'recover') this.enter('recover', this.heavy ? HITSTUN_MS.heavy : HITSTUN_MS.light);
      else if (stagger && !this.heavy && this.ai === 'windup') this.enter('recover', 300);
    }
  }

  private die() {
    this.dead = true;
    if (this.elite === 'explosive' && !this.exploded) this.hooks.eliteBlast(this.x, this.y);
    audio.sfx('kill', { pitch: 24 / this.rig.S });
    if (!this.exploded) this.fall();
    sparks(this.scene, this.x, this.y, COLORS.magenta, 14, 22);
    sparks(this.scene, this.x, this.y, COLORS.yellow, 6, 16);
    this.hooks.onDeath(this);
    this.destroy();
  }

  /** The body keeps the hurt pose, topples over, flickers and fades. */
  private fall() {
    // The enemy is destroyed right after: keep the scene, not `this`, for the tweens.
    const scene = this.scene, drone = this.def.id === 'drone', big = this.def.behavior === 'boss';
    const body = scene.add.sprite(this.x, this.y, this.rig.key, `${this.look}-hurt`).setOrigin(this.originX, this.originY).setFlipX(this.flipX).setDepth(7);
    scene.tweens.add({
      targets: body, angle: drone ? 25 : this.flipX ? -90 : 90, y: body.y + (drone ? 10 : this.rig.S / 6), duration: big ? 520 : 240, ease: 'Quad.in',
      onComplete: () => scene.tweens.add({ targets: body, alpha: 0, duration: big ? 1400 : 600, delay: big ? 900 : 350, onComplete: () => body.destroy() }),
    });
  }

  override destroy(fromScene?: boolean) {
    this.shieldRing?.destroy();
    this.aura?.destroy();
    this.stars.forEach(s => s.destroy());
    this.stars = [];
    this.quakeRing?.destroy();
    this.shadow?.destroy();
    this.chevron?.destroy();
    super.destroy(fromScene);
  }

  private enter(ai: AiState, ms: number) {
    this.ai = ai;
    this.aiSince = this.hooks.now();
    this.aiUntil = this.aiSince + ms;
  }

  tick(now: number) {
    if (this.dead) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const p = this.hooks.player;
    const dx = p.x - this.x, dy = p.y - this.y, dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist, ny = dy / dist;
    const done = now >= this.aiUntil;

    switch (this.ai) {
      case 'stunned':
        body.velocity.scale(0.85);
        if (done) { this.vulnerable = false; this.enter('chase', 0); }
        break;
      case 'recover':
        body.velocity.scale(0.85);
        if (done) this.enter('chase', 0);
        break;
      case 'chase':
        this.chase(now, body, nx, ny, dist);
        break;
      case 'windup':
        body.velocity.scale(0.7);
        if (done) this.release(now, nx, ny, dist);
        break;
      case 'attack':
        this.attacking(now, body, dist, done);
        break;
    }
    if (this.dead) return;
    this.updateLook(now, body, nx, ny);
  }

  /** Facing: where it attacks when winding up or charging, else where it moves, else the player. */
  private updateLook(now: number, body: Phaser.Physics.Arcade.Body, nx: number, ny: number) {
    const v = body.velocity;
    const kites = this.def.behavior in KITE;
    if (this.ai === 'attack' || (this.ai === 'windup' && !kites && this.chargeDir.x + this.chargeDir.y !== 0)) {
      this.facing = this.chargeDir;
    } else if (this.ai === 'chase' && v.length() > 12 && !kites) {
      const l = v.length();
      this.facing = { x: v.x / l, y: v.y / l };
    } else if (this.ai !== 'stunned') {
      this.facing = { x: nx, y: ny };
    }
    const f = this.facing, reach = this.def.radius + 7;
    this.pose(now, f, v.length() > 10);
    // Drones hover: their shadow sits further below and breathes.
    const hover = this.def.id === 'drone' ? 12 + Math.sin(now / 150) * 2 : this.rig.feetRow + 1 - this.rig.originRow;
    this.shadow.setPosition(this.x, this.y + hover);
    this.shieldRing?.setPosition(this.x, this.y + 2);
    this.aura?.setPosition(this.x, this.y + 4).setAlpha(0.35 + 0.15 * Math.sin(now / 120));
    // Cloaked elites are near-invisible until close or attacking.
    let cloaked = false;
    if (this.elite === 'cloak') {
      const p = this.hooks.player, near = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) < 70;
      cloaked = !near && this.ai !== 'windup' && this.ai !== 'attack' && now >= this.hurtUntil + 300;
      this.setAlpha(cloaked ? (Math.random() < 0.05 ? 0.4 : 0.12) : 1);
      this.shadow.setAlpha(cloaked ? 0.2 : 1);
    }
    this.chevron.setPosition(this.x + f.x * reach, this.y + 3 + f.y * reach).setRotation(Math.atan2(f.y, f.x))
      .setVisible(this.ai !== 'stunned' && !cloaked)
      .setScale(this.ai === 'windup' ? 1.5 : 1);

    // Visual state: white flash on hit, blink while winding up, yellow when stunned.
    if (now < this.flashUntil || (this.ai === 'windup' && Math.floor(now / (this.def.behavior === 'explode' ? 45 : 70)) % 2 === 0)) {
      this.setTint(this.def.behavior === 'explode' ? COLORS.yellow : 0xffffff).setTintMode(Phaser.TintModes.FILL);
    } else if (this.ai === 'stunned') {
      this.setTint(COLORS.yellow).setTintMode(Phaser.TintModes.MULTIPLY);
    } else {
      this.clearTint();
    }
  }

  private shoot(x: number, y: number, angle: number, speed: number, damage: number, opts: ShotOpts = {}) {
    this.hooks.fireBullet(x, y, angle, speed, damage, { ...opts, from: this.def.id });
  }

  /** Picks the frame: hurt > stun > windup > charge > follow-through > walk > idle. */
  private pose(now: number, f: { x: number; y: number }, moving: boolean) {
    const look = facingOf(f.x, f.y);
    this.look = look;
    this.setFlipX(f.x < 0);
    const boss = this.def.behavior === 'boss';
    let still: string | null = null;
    if (now < this.hurtUntil) still = 'hurt';
    else if (this.ai === 'stunned') still = 'stun';
    else if (this.ai === 'windup') still = boss ? `windup-${this.move}` : 'windup';
    else if (this.ai === 'attack') still = 'charge';
    else if (now < this.strikeUntil) still = this.strikeFrame;
    if (still && !this.texture.has(`${look}-${still}`)) still = this.ai === 'attack' ? 'windup' : 'strike';
    if (still && this.texture.has(`${look}-${still}`)) {
      this.anims.stop();
      this.setFrame(`${look}-${still}`);
    } else {
      const key = `${this.rig.key}-${moving ? 'walk' : 'idle'}-${look}`;
      if (this.anims.currentAnim?.key !== key || !this.anims.isPlaying) {
        // Keep the step when turning; otherwise start anywhere so a crowd does not move in sync.
        const keep = this.anims.currentAnim?.key.includes('-walk-') && moving ? (this.anims.currentFrame?.index ?? 1) - 1 : Math.floor(Math.random() * 4);
        this.anims.play({ key, startFrame: Math.max(0, keep) });
      }
    }
    // Stun stars circle over the head.
    if (this.ai === 'stunned' && this.stars.length) {
      const head = this.y - (this.rig.originRow - this.rig.headRow) - 2;
      this.stars.forEach((s, i) => { const a = now / 160 + i * 2.1; s.setPosition(this.x + Math.cos(a) * this.rig.S / 5, head + Math.sin(a) * 2); });
    } else if (this.stars.length) { this.stars.forEach(s => s.destroy()); this.stars = []; }
  }

  /** Where to walk: along the flow field (around obstacles) when far, straight at the player when close. */
  private pathDir(nx: number, ny: number, dist: number) {
    if (dist < 40) return { x: nx, y: ny };
    return this.hooks.steer(this.x, this.y) ?? { x: nx, y: ny };
  }

  /** Called while chasing: if we barely moved in 400 ms while trying to, slide sideways for 350 ms. */
  private checkStuck(now: number, dir: { x: number; y: number }) {
    if (now < this.stuckCheckAt) return;
    const moved = Phaser.Math.Distance.Between(this.x, this.y, this.stuckFrom.x, this.stuckFrom.y);
    if (this.stuckCheckAt > 0 && moved < 4 && Math.hypot(dir.x, dir.y) > 0.1) {
      // Snagged on a corner: first slide back to the middle of our tile, which frees big bodies;
      // if already centred, side-step perpendicular to where we were trying to go.
      const cx = Math.floor(this.x / 32) * 32 + 16 - this.x, cy = Math.floor(this.y / 32) * 32 + 16 - this.y, off = Math.hypot(cx, cy);
      const side = Math.random() < 0.5 ? 1 : -1;
      this.unstickDir = off > 5 ? { x: cx / off, y: cy / off } : { x: -dir.y * side, y: dir.x * side };
      this.unstickUntil = now + (off > 5 ? Math.min(350, off / this.speed * 1000 + 60) : 350);
      this.strafe = -this.strafe;
    }
    this.stuckCheckAt = now + 400;
    this.stuckFrom = { x: this.x, y: this.y };
  }

  private chase(now: number, body: Phaser.Physics.Arcade.Body, nx: number, ny: number, dist: number) {
    const b = this.def.behavior;
    const kite = KITE[b];
    if (now < this.unstickUntil) {
      body.setVelocity(this.unstickDir.x * this.speed, this.unstickDir.y * this.speed);
      return;
    }
    if (kite && this.hooks.occupied(this.x, this.y)) {
      // Wedged against a crate or a bench: step out of that tile before kiting again.
      const out = this.hooks.steer(this.x, this.y) ?? { x: -nx, y: -ny };
      body.setVelocity(out.x * this.speed, out.y * this.speed);
      this.checkStuck(now, out);
      return;
    }
    if (kite) {
      // Keep a firing distance and strafe around the player; approach along the path, never through walls.
      const want = dist < kite[0] ? -1 : dist > kite[1] ? 1 : 0;
      const p = want === 1 ? this.pathDir(nx, ny, dist) : { x: nx, y: ny };
      const vx = p.x * want - p.y * this.strafe * 0.6, vy = p.y * want + p.x * this.strafe * 0.6;
      body.setVelocity(vx * this.speed, vy * this.speed);
      this.checkStuck(now, { x: vx, y: vy });
      if (now >= this.nextAttackAt && dist < 240) this.enter('windup', this.telegraph);
      return;
    }
    const p = this.pathDir(nx, ny, dist);
    body.setVelocity(p.x * this.speed, p.y * this.speed);
    this.checkStuck(now, p);
    if (now < this.nextAttackAt) return;
    if ((b === 'melee' && dist < 22) || (b === 'explode' && dist < 26) || (b === 'charge' && dist < 140)) {
      this.chargeDir = { x: nx, y: ny };
      this.enter('windup', this.telegraph);
      if (b === 'charge') audio.sfx('windup', { pitch: 0.7 });
    }
    if (b === 'boss') {
      const cycle = BOSS_CYCLES[this.def.id] ?? BOSS_CYCLES.boss;
      this.move = cycle[this.cycle++ % cycle.length];
      this.chargeDir = { x: nx, y: ny };
      this.enter('windup', this.telegraph * (this.move === 'quake' ? 1.4 : 1));
      audio.sfx(this.move === 'charge' ? 'charge' : 'windup', { pitch: 0.6 });
      if (this.move === 'quake') {
        // Telegraph: a red ring grows around the boss; get out before it closes.
        this.quakeRing = this.scene.add.circle(this.x, this.y, 78).setStrokeStyle(2, 0xff3b3b).setFillStyle(0xff3b3b, 0.08).setScale(0.15).setDepth(6);
        this.scene.tweens.add({ targets: this.quakeRing, scale: 1, duration: this.telegraph * 1.4 });
      }
    }
  }

  private release(now: number, nx: number, ny: number, dist: number) {
    const b = this.def.behavior;
    const cd = { boss: this.frenzy ? 380 : this.enraged ? 600 : 950, ranged: 1300 + Math.random() * 700, burst: 1500 + Math.random() * 600, hack: 2600 + Math.random() * 800 }[b as string] ?? 750;
    this.nextAttackAt = now + cd;
    this.chargeDir = { x: 0, y: 0 };
    this.strikeUntil = now + 200;
    this.strikeFrame = b === 'boss' ? (this.move === 'charge' ? 'strike' : `strike-${this.move}`) : 'strike';
    const aimAt = () => Math.atan2(this.hooks.player.y - this.y, this.hooks.player.x - this.x);

    if (b === 'melee') {
      sparks(this.scene, this.x + nx * 10, this.y + ny * 10, COLORS.magenta, 4, 8);
      audio.sfx('swing', { pitch: 1.25 });
      if (dist < 26) this.resolveHitOnPlayer(now);
      this.enter('recover', 400);
    } else if (b === 'ranged') {
      this.shoot(this.x, this.y, Math.atan2(ny, nx), 150, this.def.damage);
      this.flashAt(nx, ny, COLORS.yellow);
      audio.sfx('enemyShoot');
      this.enter('recover', 300);
    } else if (b === 'burst') {
      // Three quick shots, each re-aimed: keep moving.
      for (let i = 0; i < 3; i++) this.scene.time.delayedCall(i * 110, () => {
        if (this.dead) return;
        const a = aimAt();
        this.shoot(this.x, this.y, a, 165, this.def.damage);
        this.flashAt(Math.cos(a), Math.sin(a), COLORS.yellow);
        audio.sfx('enemyShoot', { pitch: 1.2 });
      });
      this.strikeUntil = now + 340;
      this.enter('recover', 420);
    } else if (b === 'hack') {
      // Slow quickhack orb: little damage, but it fries the player's mind (psychosis).
      this.shoot(this.x, this.y, Math.atan2(ny, nx), 85, this.def.damage, { psy: this.def.psyOnHit, key: 'bullet-hack' });
      this.flashAt(nx, ny, 0x39ff88);
      audio.sfx('hack');
      this.strikeUntil = now + 320;
      this.enter('recover', 500);
    } else if (b === 'explode') {
      this.explode(now);
    } else if (b === 'charge' || (b === 'boss' && this.move === 'charge')) {
      this.chargeDir = { x: nx, y: ny };
      this.chargeHit = false;
      audio.sfx('charge', { pitch: b === 'boss' ? 0.8 : 1 });
      this.enter('attack', b === 'boss' ? 650 : 550);
    } else if (this.move === 'fan') {
      const n = this.enraged ? 11 : 7, spread = 1.0, base = Math.atan2(ny, nx);
      for (let i = 0; i < n; i++) this.shoot(this.x, this.y, base - spread / 2 + (spread * i) / (n - 1), 120, this.def.damage * 0.7);
      audio.sfx('playerShoot', { pitch: 0.6 });
      // Phase 2+: the fan is followed by a nova.
      if (this.enraged) this.scene.time.delayedCall(380, () => { if (!this.dead) this.nova(); });
      this.enter('recover', 400);
    } else if (this.move === 'barrage') {
      // A stream of aimed shots: keep strafing.
      const shots = this.frenzy ? 12 : 8;
      for (let i = 0; i < shots; i++) this.scene.time.delayedCall(i * 75, () => {
        if (this.dead) return;
        const a = aimAt() + (Math.random() - 0.5) * 0.12;
        this.shoot(this.x, this.y, a, 180, this.def.damage * 0.55);
        if (i % 2 === 0) { this.flashAt(Math.cos(a), Math.sin(a), this.def.id === 'boss' ? COLORS.magenta : COLORS.yellow); audio.sfx('enemyShoot', { pitch: 0.8 }); }
      });
      this.strikeUntil = now + shots * 75 + 80;
      this.enter('recover', shots * 75 + 200);
    } else if (this.move === 'quake') {
      this.quakeRing?.destroy();
      this.quakeRing = undefined;
      const wave = this.scene.add.circle(this.x, this.y, 78).setStrokeStyle(3, 0xff3b3b).setDepth(6);
      this.scene.tweens.add({ targets: wave, scale: 1.25, alpha: 0, duration: 260, onComplete: () => wave.destroy() });
      sparks(this.scene, this.x, this.y, 0xff3b3b, 20, 70);
      audio.sfx('quake');
      this.scene.cameras.main.shake(220, 0.01);
      this.strikeUntil = now + 380;
      if (dist < 78) this.resolveHitOnPlayer(now, 1.3);
      if (this.frenzy) this.scene.time.delayedCall(300, () => { if (!this.dead) this.nova(); });
      this.enter('recover', 650);
    } else {
      this.nova();
      this.enter('recover', 700);
    }
  }

  /** Nova: rings of bullets with a gap to slip through; one more ring per phase. */
  private nova() {
    audio.sfx('nova');
    const n = this.enraged ? 18 : 14, gap = Math.floor(Math.random() * n), rings = this.frenzy ? 3 : 2;
    for (let ring = 0; ring < rings; ring++) this.scene.time.delayedCall(ring * 260, () => {
      if (this.dead) return;
      for (let i = 0; i < n; i++) if (i !== gap && i !== (gap + 1) % n) this.shoot(this.x, this.y, (i + ring * 0.5) * (Math.PI * 2 / n), 95, this.def.damage * 0.6);
    });
  }

  private explode(now: number) {
    const p = this.hooks.player;
    if (Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) < 40 && this.hooks.player.receiveHit(this.def.damage, now, this.x, this.y) === 'hit') this.hooks.struckPlayer(this);
    const flash = this.scene.add.image(this.x, this.y, 'glow').setTint(COLORS.yellow).setScale(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(40);
    this.scene.tweens.add({ targets: flash, scale: 1.8, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    sparks(this.scene, this.x, this.y, COLORS.yellow, 18, 36);
    this.scene.cameras.main.shake(160, 0.008);
    audio.sfx('explode');
    this.exploded = true;
    this.die();
  }

  private attacking(now: number, body: Phaser.Physics.Arcade.Body, dist: number, done: boolean) {
    const sp = this.speed * 5;
    body.setVelocity(this.chargeDir.x * sp, this.chargeDir.y * sp);
    if (!this.chargeHit && dist < this.def.radius + 8) {
      this.chargeHit = true;
      if (this.resolveHitOnPlayer(now) === 'parried') return;
    }
    // Ignore contacts left over from the chase: only a wall hit during the charge itself counts.
    if (now - this.aiSince > 60 && !body.blocked.none) {
      // Slammed into a wall: dazed and open to a counter.
      this.scene.cameras.main.shake(120, 0.005);
      this.stun(now, 700);
      return;
    }
    if (done) { this.enter('recover', 600); this.strikeUntil = now + 220; this.strikeFrame = 'strike'; }
  }

  private resolveHitOnPlayer(now: number, mult = 1) {
    const res = this.hooks.player.receiveHit(this.def.damage * mult, now, this.x, this.y);
    if (res === 'hit') this.hooks.struckPlayer(this);
    if (res === 'parried') this.stun(now, this.def.behavior === 'melee' ? CONFIG.STUN_MS : CONFIG.STUN_MS * 1.5);
    return res;
  }
}
