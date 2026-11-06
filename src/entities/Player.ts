import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import { resolveParry } from '../core/combat';
import type { Stats } from '../core/types';
import type { Controls } from '../input/controls';
import { sparks } from '../fx/effects';

export type HitResult = 'parried' | 'hit' | 'ignored';

export interface AttackEvent {
  x: number; y: number; radius: number;
  comboIndex: number; mult: number;
  dirX: number; dirY: number;
}

export const PLAYER_ATTACK = 'player-attack';

export class Player extends Phaser.Physics.Arcade.Sprite {
  hp: number;
  speedMult = 1;
  inputEnabled = true;
  dashCharges: number;

  private dashUntil = 0;
  private dashRechargeAt = 0;
  private dashDir = { x: 1, y: 0 };
  private nextAfterimageAt = 0;
  private invulnUntil = 0;
  private parryStartMs = -Infinity;
  private parryUntil = 0;
  private parryPending = false;
  private lockUntil = 0;
  private nextAttackAt = 0;
  private lastAttackAt = -Infinity;
  private comboIndex = 0;
  private lungeUntil = 0;
  private lungeDir = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, x: number, y: number, public stats: Stats, private controls: Controls) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(5, 3, 6);
    this.setDepth(10);
    this.hp = stats.maxHp;
    this.dashCharges = stats.dashCharges;
  }

  setStats(stats: Stats) {
    this.stats = stats;
    this.dashCharges = Math.min(this.dashCharges, stats.dashCharges);
  }

  isDashing(now: number) { return now < this.dashUntil; }

  tick(now: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!this.inputEnabled) { body.setVelocity(0, 0); return; }

    // Dash charges refill one at a time.
    if (this.dashCharges < this.stats.dashCharges && now >= this.dashRechargeAt) {
      this.dashCharges++;
      if (this.dashCharges < this.stats.dashCharges) this.dashRechargeAt = now + CONFIG.DASH_COOLDOWN_MS;
    }

    // A parry window that closes without catching a hit is a whiff: brief lockout.
    if (this.parryPending && now > this.parryUntil) {
      this.parryPending = false;
      this.lockUntil = now + CONFIG.PARRY_WHIFF_LOCK_MS;
      this.clearTint();
    }

    const dashing = now < this.dashUntil;
    const parrying = this.parryPending;
    const locked = now < this.lockUntil;
    const move = this.controls.move();
    const aim = this.aimDir();

    // Priority: parry > dash > attack. Dash is allowed during attacks and whiff lock, never during an active parry.
    if (!dashing && !parrying && !locked && this.controls.wantsParry(now)) {
      this.startParry(now);
    } else if (!parrying && this.dashCharges > 0 && this.controls.dash()) {
      this.startDash(now, move.x || move.y ? move : aim);
    } else if (!dashing && !parrying && !locked && now >= this.nextAttackAt && this.controls.wantsAttack(now)) {
      this.attack(now, aim);
    }

    if (now < this.dashUntil) {
      body.setVelocity(this.dashDir.x * CONFIG.DASH_SPEED, this.dashDir.y * CONFIG.DASH_SPEED);
      if (now >= this.nextAfterimageAt) this.afterimage(now);
    } else if (now < this.lungeUntil) {
      body.setVelocity(this.lungeDir.x * 90, this.lungeDir.y * 90);
    } else {
      const sp = this.stats.speed * this.speedMult * (this.parryPending ? 0.3 : 1);
      body.setVelocity(move.x * sp, move.y * sp);
    }

    this.updateLook(now, aim);
  }

  private shadow?: Phaser.GameObjects.Image;
  private reticle?: Phaser.GameObjects.Image;

  /** Body faces the cursor (back view when aiming up); a cyan chevron shows exactly where the next hit lands. */
  private updateLook(now: number, aim: { x: number; y: number }) {
    this.shadow ??= this.scene.add.image(this.x, this.y, 'shadow').setDepth(4);
    this.reticle ??= this.scene.add.image(this.x, this.y, 'chevron').setTint(COLORS.cyan).setDepth(9).setAlpha(0.9);
    this.setTexture(aim.y < -0.5 ? 'player-back' : 'player').setFlipX(aim.x < 0);
    this.shadow.setPosition(this.x, this.y + 7);
    this.reticle.setPosition(this.x + aim.x * 14, this.y + 3 + aim.y * 14).setRotation(Math.atan2(aim.y, aim.x));
    this.setAlpha(now < this.invulnUntil && Math.floor(now / 60) % 2 === 0 ? 0.35 : 1);
  }

  private aimDir() {
    const p = this.controls.pointerWorld();
    const dx = p.x - this.x, dy = p.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  private startDash(now: number, dir: { x: number; y: number }) {
    if (this.dashCharges === this.stats.dashCharges) this.dashRechargeAt = now + CONFIG.DASH_COOLDOWN_MS;
    this.dashCharges--;
    this.dashDir = dir;
    this.dashUntil = now + CONFIG.DASH_DURATION_MS;
  }

  private afterimage(now: number) {
    this.nextAfterimageAt = now + 28;
    const img = this.scene.add.image(this.x, this.y, 'player-dash').setFlipX(this.flipX).setAlpha(0.6).setDepth(9);
    this.scene.tweens.add({ targets: img, alpha: 0, duration: 180, onComplete: () => img.destroy() });
  }

  private startParry(now: number) {
    this.parryStartMs = now;
    this.parryUntil = now + CONFIG.PARRY_WINDOW_MS;
    this.parryPending = true;
    this.setTint(COLORS.cyan);
    const ring = this.scene.add.circle(this.x, this.y, 10).setStrokeStyle(1, COLORS.cyan).setDepth(11);
    this.scene.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: CONFIG.PARRY_WINDOW_MS, onComplete: () => ring.destroy() });
  }

  private attack(now: number, aim: { x: number; y: number }) {
    const chained = now - this.lastAttackAt <= CONFIG.COMBO_RESET_MS + CONFIG.ATTACK_COOLDOWN_MS;
    this.comboIndex = chained ? (this.comboIndex % CONFIG.COMBO_HITS) + 1 : 1;
    this.lastAttackAt = now;
    const finisher = this.comboIndex === CONFIG.COMBO_HITS;
    this.nextAttackAt = now + CONFIG.ATTACK_COOLDOWN_MS + (finisher ? 120 : 0);
    this.lungeDir = aim;
    this.lungeUntil = now + 70;

    const hx = this.x + aim.x * CONFIG.ATTACK_RANGE * 0.7, hy = this.y + aim.y * CONFIG.ATTACK_RANGE * 0.7;
    const slash = this.scene.add.image(this.x + aim.x * 8, this.y + aim.y * 8, 'slash')
      .setRotation(Math.atan2(aim.y, aim.x)).setDepth(12).setScale(finisher ? 1.3 : 1)
      .setFlipY(this.comboIndex === 2);
    if (finisher) slash.setTint(COLORS.magenta);
    this.scene.tweens.add({ targets: slash, alpha: 0, duration: 140, onComplete: () => slash.destroy() });

    const ev: AttackEvent = {
      x: hx, y: hy, radius: finisher ? 18 : 14, comboIndex: this.comboIndex,
      mult: finisher ? CONFIG.FINISHER_MULT : 1, dirX: aim.x, dirY: aim.y,
    };
    this.scene.events.emit(PLAYER_ATTACK, ev);
  }

  receiveHit(amount: number, now: number, fromX: number, fromY: number): HitResult {
    if (now < this.dashUntil) return 'ignored';
    // Parry is checked before post-hit invulnerability, otherwise a parry right after taking a hit always whiffs.
    if (this.parryPending && resolveParry(this.parryStartMs, now) === 'parried') {
      this.parryPending = false;
      this.clearTint();
      this.invulnUntil = now + 200;
      sparks(this.scene, (this.x + fromX) / 2, (this.y + fromY) / 2, COLORS.cyan, 10, 20);
      this.scene.cameras.main.flash(80, 0, 240, 255, false);
      return 'parried';
    }
    if (now < this.invulnUntil) return 'ignored';
    this.hp = Math.max(0, this.hp - amount);
    this.invulnUntil = now + CONFIG.HIT_INVULN_MS;
    const dx = this.x - fromX, dy = this.y - fromY, len = Math.hypot(dx, dy) || 1;
    this.lungeDir = { x: dx / len * 1.6, y: dy / len * 1.6 };
    this.lungeUntil = now + 90;
    this.scene.cameras.main.shake(120, 0.006);
    sparks(this.scene, this.x, this.y, COLORS.magenta, 8);
    return 'hit';
  }
}
