import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import type { EnemyDef, EnemyId } from '../data/enemies';
import { floatText, sparks } from '../fx/effects';
import type { Player } from './Player';

export interface EnemyHooks {
  player: Player;
  fireBullet(x: number, y: number, angle: number, speed: number, damage: number): void;
  summon(id: EnemyId): void;
  onDeath(e: Enemy): void;
}

type AiState = 'chase' | 'windup' | 'attack' | 'recover' | 'stunned';
type BossMove = 'charge' | 'fan' | 'summon';
const BOSS_CYCLE: BossMove[] = ['charge', 'fan', 'charge', 'summon', 'fan'];

/** Light enemies are pushed back and briefly staggered by hits; heavy ones barely flinch. */
const HITSTUN_MS = { light: 160, heavy: 60 };

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  hp: number;
  readonly maxHp: number;
  dead = false;
  /** Spawned by the boss: pays no credits. */
  summoned = false;

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
  private baseKey: string;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly def: EnemyDef, private hooks: EnemyHooks) {
    super(scene, x, y, `enemy-${def.id}`);
    this.baseKey = `enemy-${def.id}`;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const scale = def.id === 'boss' ? 2 : def.id === 'brute' ? 1.3 : 1;
    this.setScale(scale).setDepth(8);
    const r = def.radius / scale;
    (this.body as Phaser.Physics.Arcade.Body).setCircle(r, 8 - r, 10 - r);
    this.hp = this.maxHp = def.hp;
    this.nextAttackAt = scene.time.now + 500 + Math.random() * 500;
    this.shadow = scene.add.image(x, y, 'shadow').setScale(scale).setDepth(4);
    this.chevron = scene.add.image(x, y, 'chevron').setTint(COLORS.magenta).setDepth(7).setAlpha(0.9);
  }

  get enraged() { return this.def.behavior === 'boss' && this.hp < this.maxHp / 2; }
  private get speed() { return this.def.speed * (this.enraged ? 1.4 : 1); }
  private get telegraph() { return this.def.telegraphMs * (this.enraged ? 0.7 : 1); }
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
  }

  takeHit(amount: number, crit: boolean, countered: boolean, fromX: number, fromY: number, stagger: boolean) {
    if (this.dead) return;
    this.hp -= amount;
    this.flashUntil = this.scene.time.now + 70;
    floatText(this.scene, this.x, this.y - 10, String(amount), countered ? '#00f0ff' : crit ? '#f5e663' : '#e8e8ff', countered || crit ? 9 : 7);
    sparks(this.scene, this.x, this.y, countered ? COLORS.cyan : COLORS.white, 5);
    if (this.hp <= 0) { this.die(); return; }

    const charging = this.ai === 'attack' && this.heavy;
    if (!charging) {
      const dx = this.x - fromX, dy = this.y - fromY, len = Math.hypot(dx, dy) || 1, k = this.heavy ? 50 : 150;
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(dx / len * k, dy / len * k);
      // Hitstun lets the knockback play out instead of being overwritten by the chase on the same frame.
      // A windup is only interrupted on light enemies by a combo finisher, so parry timing stays readable.
      if (this.ai === 'chase' || this.ai === 'recover') this.enter('recover', this.heavy ? HITSTUN_MS.heavy : HITSTUN_MS.light);
      else if (stagger && !this.heavy && this.ai === 'windup') this.enter('recover', 300);
    }
  }

  private die() {
    this.dead = true;
    sparks(this.scene, this.x, this.y, COLORS.magenta, 14, 22);
    sparks(this.scene, this.x, this.y, COLORS.yellow, 6, 16);
    this.hooks.onDeath(this);
    this.destroy();
  }

  override destroy(fromScene?: boolean) {
    this.shadow?.destroy();
    this.chevron?.destroy();
    super.destroy(fromScene);
  }

  private enter(ai: AiState, ms: number) {
    this.ai = ai;
    this.aiSince = this.scene.time.now;
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
    this.updateLook(now, body, nx, ny);
  }

  /** Facing: where it attacks when winding up or charging, else where it moves, else the player. */
  private updateLook(now: number, body: Phaser.Physics.Arcade.Body, nx: number, ny: number) {
    const v = body.velocity;
    if (this.ai === 'attack' || (this.ai === 'windup' && this.def.behavior !== 'ranged' && this.chargeDir.x + this.chargeDir.y !== 0)) {
      this.facing = this.chargeDir;
    } else if (this.ai === 'chase' && v.length() > 12 && this.def.behavior !== 'ranged') {
      const l = v.length();
      this.facing = { x: v.x / l, y: v.y / l };
    } else if (this.ai !== 'stunned') {
      this.facing = { x: nx, y: ny };
    }
    const f = this.facing, reach = this.def.radius + 7;
    this.setTexture(f.y < -0.5 ? `${this.baseKey}-back` : this.baseKey).setFlipX(f.x < 0);
    this.shadow.setPosition(this.x, this.y + 7 * this.scaleY);
    this.chevron.setPosition(this.x + f.x * reach, this.y + 3 + f.y * reach).setRotation(Math.atan2(f.y, f.x))
      .setVisible(this.ai !== 'stunned')
      .setScale(this.ai === 'windup' ? 1.5 : 1);

    // Visual state: white flash on hit, blink while winding up, yellow when stunned.
    if (now < this.flashUntil || (this.ai === 'windup' && Math.floor(now / 70) % 2 === 0)) {
      this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    } else if (this.ai === 'stunned') {
      this.setTint(COLORS.yellow).setTintMode(Phaser.TintModes.MULTIPLY);
    } else {
      this.clearTint();
    }
  }

  private chase(now: number, body: Phaser.Physics.Arcade.Body, nx: number, ny: number, dist: number) {
    const b = this.def.behavior;
    if (b === 'ranged') {
      // Keep a firing distance and strafe around the player.
      const want = dist < 80 ? -1 : dist > 150 ? 1 : 0;
      body.setVelocity((nx * want - ny * this.strafe * 0.6) * this.speed, (ny * want + nx * this.strafe * 0.6) * this.speed);
      if (now >= this.nextAttackAt && dist < 220) this.enter('windup', this.telegraph);
      return;
    }
    body.setVelocity(nx * this.speed, ny * this.speed);
    if (now < this.nextAttackAt) return;
    if (b === 'melee' && dist < 22) { this.chargeDir = { x: nx, y: ny }; this.enter('windup', this.telegraph); }
    if (b === 'charge' && dist < 140) { this.chargeDir = { x: nx, y: ny }; this.enter('windup', this.telegraph); }
    if (b === 'boss') {
      this.move = BOSS_CYCLE[this.cycle++ % BOSS_CYCLE.length];
      this.chargeDir = { x: nx, y: ny };
      this.enter('windup', this.telegraph);
    }
  }

  private release(now: number, nx: number, ny: number, dist: number) {
    const b = this.def.behavior;
    const cd = b === 'boss' ? (this.enraged ? 600 : 950) : b === 'ranged' ? 1300 + Math.random() * 700 : 750;
    this.nextAttackAt = now + cd;
    this.chargeDir = { x: 0, y: 0 };
    if (b === 'melee') {
      sparks(this.scene, this.x + nx * 10, this.y + ny * 10, COLORS.magenta, 4, 8);
      if (dist < 26) this.resolveHitOnPlayer(now);
      this.enter('recover', 400);
    } else if (b === 'ranged') {
      this.hooks.fireBullet(this.x, this.y, Math.atan2(ny, nx), 150, this.def.damage);
      this.enter('recover', 300);
    } else if (b === 'charge' || (b === 'boss' && this.move === 'charge')) {
      this.chargeDir = { x: nx, y: ny };
      this.chargeHit = false;
      this.enter('attack', b === 'boss' ? 650 : 550);
    } else if (this.move === 'fan') {
      const n = this.enraged ? 11 : 7, spread = 1.0, base = Math.atan2(ny, nx);
      for (let i = 0; i < n; i++) this.hooks.fireBullet(this.x, this.y, base - spread / 2 + (spread * i) / (n - 1), 120, this.def.damage * 0.7);
      this.enter('recover', 400);
    } else {
      this.hooks.summon('runner');
      this.hooks.summon('runner');
      this.enter('recover', 600);
    }
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
    if (done) this.enter('recover', 600);
  }

  private resolveHitOnPlayer(now: number) {
    const res = this.hooks.player.receiveHit(this.def.damage, now, this.x, this.y);
    if (res === 'parried') this.stun(now, this.def.behavior === 'melee' ? CONFIG.STUN_MS : CONFIG.STUN_MS * 1.5);
    return res;
  }
}
