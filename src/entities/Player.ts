import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import { resolveParry } from '../core/combat';
import type { Stats } from '../core/types';
import type { Controls } from '../input/controls';
import { sparks } from '../fx/effects';
import { audio } from '../audio/audio';
import { PLAYER_ORIGIN_Y, artSuffix, playerKey, type Facing } from '../gfx/playerArt';
import { WEAPONS, type SpecialId, type Weapon } from '../data/weapons';

export type HitResult = 'parried' | 'hit' | 'ignored';

export interface AttackEvent {
  x: number; y: number; radius: number;
  comboIndex: number; mult: number;
  dirX: number; dirY: number;
  /** last hit of the weapon's combo */
  finisher: boolean;
  /** knockback multiplier, and a daze (ms) the finisher puts on light enemies */
  knock: number;
  daze: number;
}

/** Ranged weapon: a shot request. */
export interface ShootEvent { x: number; y: number; angle: number; speed: number; mult: number; charged: boolean }
/** Weapon special: started (or, for the leap, landed). */
export interface SpecialEvent { id: SpecialId | 'leap-land'; x: number; y: number; dirX: number; dirY: number }

export const PLAYER_ATTACK = 'player-attack';
export const PLAYER_SHOOT = 'player-shoot';
export const PLAYER_SPECIAL = 'player-special';
/** Emitted with (x, y) on a successful parry, and on taking a hit. */
export const PLAYER_PARRY = 'player-parry';
export const PLAYER_HURT = 'player-hurt';

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
  /** Increments on every dash: enemies remember which dash already cut them (Tranchant Cinétique). */
  dashSerial = 0;
  weapon: Weapon = WEAPONS.blade;
  /** off in street-event sectors, where E talks */
  specialEnabled = true;
  private specialReadyAt = 0;
  /** Special moves that carry the body (Tranche-vent, Bond de mante). */
  private motionUntil = 0;
  private motionVel = { x: 0, y: 0 };
  private motionKind?: SpecialId;
  cutSerial = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, public stats: Stats, private controls: Controls, private mode: 'combat' | 'explore' = 'combat') {
    super(scene, x, y, playerKey('d', 'idle0'));
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    // 24×24 frames with the feet on row 21: same body circle as before, relative to the feet.
    this.setOrigin(0.5, PLAYER_ORIGIN_Y);
    body.setCircle(5, 7, 13);
    this.on(Phaser.Animations.Events.ANIMATION_UPDATE, (_a: unknown, frame: Phaser.Animations.AnimationFrame) => {
      if (/walk[03]$/.test(frame.textureKey)) this.footstep();
    });
    this.setDepth(10);
    this.hp = stats.maxHp;
    this.dashCharges = stats.dashCharges;
  }

  setStats(stats: Stats) {
    this.stats = stats;
    this.dashCharges = Math.min(this.dashCharges, stats.dashCharges);
  }

  isDashing(now: number) { return now < this.dashUntil; }
  /** Tranche-vent in progress: enemies on the path get cut. */
  isCutting(now: number) { return now < this.motionUntil && this.motionKind === 'windcut'; }
  /** 0..1 how recharged the weapon special is. */
  specialCharge(now: number) { return Math.min(1, Math.max(0, 1 - (this.specialReadyAt - now) / this.weapon.special.cooldownMs)); }
  setWeapon(w: Weapon) { this.weapon = w; }
  private get parryWindow() { return CONFIG.PARRY_WINDOW_MS + this.stats.parryBonusMs; }

  tick(now: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!this.inputEnabled) { body.setVelocity(0, 0); this.animate(now, this.walkDir, false); return; }

    // Dash charges refill one at a time.
    if (this.dashCharges < this.stats.dashCharges && now >= this.dashRechargeAt) {
      this.dashCharges++;
      if (this.dashCharges < this.stats.dashCharges) this.dashRechargeAt = now + CONFIG.DASH_COOLDOWN_MS * this.stats.dashCooldownMult;
    }

    // A parry window that closes without catching a hit is a whiff: brief lockout.
    if (this.parryPending && now > this.parryUntil) {
      this.parryPending = false;
      this.lockUntil = now + CONFIG.PARRY_WHIFF_LOCK_MS;
      this.clearTint();
      audio.sfx('whiff');
    }

    const dashing = now < this.dashUntil;
    const parrying = this.parryPending;
    const locked = now < this.lockUntil;
    const move = this.controls.move();
    const aim = this.aimDir();

    // Priority: parry > dash > attack. Dash is allowed during attacks and whiff lock, never during an active parry.
    if (this.mode === 'combat' && !dashing && !parrying && !locked && !this.stats.parryLocked && this.controls.wantsParry(now)) {
      this.startParry(now);
    } else if (!parrying && this.dashCharges > 0 && this.controls.dash()) {
      this.startDash(now, move.x || move.y ? move : aim);
    } else if (this.mode === 'combat' && this.specialEnabled && !dashing && !parrying && now >= this.specialReadyAt && now >= this.motionUntil && this.controls.special()) {
      this.startSpecial(now, aim);
    } else if (this.mode === 'combat' && !dashing && !parrying && !locked && now >= this.nextAttackAt && this.controls.wantsAttack(now)) {
      this.attack(now, aim);
    }

    if (now < this.motionUntil) {
      body.setVelocity(this.motionVel.x, this.motionVel.y);
      if (now >= this.nextAfterimageAt) this.afterimage(now);
      const l = Math.hypot(this.motionVel.x, this.motionVel.y) || 1;
      this.updateLook(now, { x: this.motionVel.x / l, y: this.motionVel.y / l }, true);
      return;
    }
    if (this.motionKind === 'leap') {
      // Landed: the scene deals the impact.
      this.motionKind = undefined;
      this.scene.events.emit(PLAYER_SPECIAL, { id: 'leap-land', x: this.x, y: this.y, dirX: aim.x, dirY: aim.y } satisfies SpecialEvent);
    } else this.motionKind = undefined;

    if (now < this.dashUntil) {
      body.setVelocity(this.dashDir.x * CONFIG.DASH_SPEED, this.dashDir.y * CONFIG.DASH_SPEED);
      if (now >= this.nextAfterimageAt) this.afterimage(now);
    } else if (now < this.lungeUntil) {
      body.setVelocity(this.lungeDir.x * 90, this.lungeDir.y * 90);
    } else {
      const sp = this.stats.speed * this.speedMult * (this.parryPending ? 0.3 : 1);
      body.setVelocity(move.x * sp, move.y * sp);
    }

    // Outside a run there is nothing to aim at: face where you walk.
    if (move.x || move.y) this.walkDir = move;
    this.updateLook(now, this.mode === 'combat' ? aim : this.walkDir, !!(move.x || move.y) || now < this.dashUntil);
  }

  private walkDir = { x: 0, y: 1 };
  private shadow?: Phaser.GameObjects.Image;
  private reticle?: Phaser.GameObjects.Image;

  /** Body faces the cursor (back view when aiming up); a cyan chevron shows exactly where the next hit lands. */
  private updateLook(now: number, aim: { x: number; y: number }, moving: boolean) {
    this.shadow ??= this.scene.add.image(this.x, this.y, 'shadow').setDepth(4);
    this.reticle ??= this.scene.add.image(this.x, this.y, 'chevron').setTint(COLORS.cyan).setDepth(9).setAlpha(0.9);
    this.animate(now, aim, moving);
    this.shadow.setPosition(this.x, this.y + 7);
    this.reticle.setPosition(this.x + aim.x * 14, this.y + 3 + aim.y * 14).setRotation(Math.atan2(aim.y, aim.x))
      .setVisible(this.mode === 'combat');
    this.setAlpha(now < this.invulnUntil && Math.floor(now / 60) % 2 === 0 ? 0.35 : 1);
  }

  private hurtUntil = 0;
  private facing: Facing = 'd';

  /** Knocked to one knee: shown when the run ends in death (the scene stops ticking the player). */
  collapse() {
    this.anims.stop();
    this.setTexture(playerKey(this.facing, 'down'));
  }
  private attackAt = -Infinity;

  /** Picks the pose: knocked down > hurt > dash > guard > slash > walk > idle. */
  private animate(now: number, look: { x: number; y: number }, moving: boolean) {
    const moving2 = now < this.motionUntil;
    const dir = now < this.dashUntil ? this.dashDir : moving2 ? this.motionVel : look;
    const facing: Facing = dir.y < -0.6 ? 'u' : Math.abs(dir.x) > 0.55 ? 's' : 'd';
    this.setFlipX(dir.x < 0);
    this.facing = facing;
    const red = artSuffix(this.weapon.art === 'blade' && this.stats.rangeMult > 1 ? 'red' : this.weapon.art);
    const since = now - this.attackAt;
    const still = this.hp <= 0 ? 'down' : now < this.hurtUntil ? 'hurt' : now < this.dashUntil || moving2 ? 'dash'
      : this.parryPending ? 'guard' + red : since < 90 ? 'atk0' + red : since < 190 ? 'atk1' + red : null;
    if (still) {
      this.anims.stop();
      this.setTexture(playerKey(facing, still));
      return;
    }
    const key = `pl-${moving ? 'walk' : 'idle'}-${facing}`;
    if (this.anims.currentAnim?.key === key && this.anims.isPlaying) return;
    // Turning while walking keeps the step in progress instead of restarting the cycle.
    const keepStep = moving && this.anims.currentAnim?.key.startsWith('pl-walk') ? this.anims.currentFrame?.index ?? 0 : 0;
    this.anims.play({ key, startFrame: Math.max(0, keepStep - 1) });
  }

  /** A small puff of dust under the foot that just landed. */
  private footstep() {
    const side = this.anims.currentFrame?.textureKey.endsWith('0') ? -3 : 3;
    const puff = this.scene.add.circle(this.x + side, this.y + 7, 1.5, 0x8a86b0, 0.45).setDepth(4.5);
    this.scene.tweens.add({ targets: puff, scale: 2.4, alpha: 0, y: puff.y - 2, duration: 320, onComplete: () => puff.destroy() });
  }

  private aimDir() {
    const p = this.controls.pointerWorld();
    const dx = p.x - this.x, dy = p.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  private startDash(now: number, dir: { x: number; y: number }) {
    if (this.dashCharges === this.stats.dashCharges) this.dashRechargeAt = now + CONFIG.DASH_COOLDOWN_MS * this.stats.dashCooldownMult;
    this.dashCharges--;
    this.dashDir = dir;
    this.dashUntil = now + CONFIG.DASH_DURATION_MS;
    this.dashSerial++;
    audio.sfx('dash');
    for (let i = 0; i < 5; i++) {
      const puff = this.scene.add.circle(this.x - dir.x * 4 + (Math.random() - 0.5) * 8, this.y + 7, 1.5, 0x8a86b0, 0.5).setDepth(4.5);
      this.scene.tweens.add({ targets: puff, scale: 3, alpha: 0, x: puff.x - dir.x * 8, duration: 360, onComplete: () => puff.destroy() });
    }
  }

  private afterimage(now: number) {
    this.nextAfterimageAt = now + 28;
    const img = this.scene.add.image(this.x, this.y, this.texture.key).setOrigin(this.originX, this.originY).setFlipX(this.flipX)
      .setTint(COLORS.cyan).setTintMode(Phaser.TintModes.FILL).setAlpha(0.6).setDepth(9);
    this.scene.tweens.add({ targets: img, alpha: 0, duration: 180, onComplete: () => img.destroy() });
  }

  private startParry(now: number) {
    this.parryStartMs = now;
    this.parryUntil = now + this.parryWindow;
    this.parryPending = true;
    this.setTint(COLORS.cyan);
    const ring = this.scene.add.circle(this.x, this.y, 10).setStrokeStyle(1, COLORS.cyan).setDepth(11);
    this.scene.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: CONFIG.PARRY_WINDOW_MS, onComplete: () => ring.destroy() });
  }

  private attack(now: number, aim: { x: number; y: number }) {
    const w = this.weapon;
    const chained = now - this.lastAttackAt <= CONFIG.COMBO_RESET_MS + w.cooldownMs;
    this.comboIndex = chained ? (this.comboIndex % w.combo) + 1 : 1;
    this.lastAttackAt = now;
    this.attackAt = now;
    const finisher = this.comboIndex === w.combo;
    this.nextAttackAt = now + (w.cooldownMs + (finisher ? w.finisherMs : 0)) / this.stats.attackSpeed;

    if (w.shot) {
      // Ranged: a shot toward the cursor, every last shot of the cycle is charged; slight recoil.
      const mult = w.damageMult * (finisher ? w.shot.charged : 1);
      this.lungeDir = { x: -aim.x * 0.5, y: -aim.y * 0.5 };
      this.lungeUntil = now + 40;
      audio.sfx('playerShoot', { pitch: finisher ? 0.7 : 1 });
      this.scene.events.emit(PLAYER_SHOOT, { x: this.x + aim.x * 10, y: this.y + aim.y * 10, angle: Math.atan2(aim.y, aim.x), speed: w.shot.speed, mult, charged: finisher } satisfies ShootEvent);
      return;
    }

    this.lungeDir = aim;
    this.lungeUntil = now + (w.id === 'gorilla' ? 110 : 70);
    audio.sfx(w.id === 'gorilla' ? 'swingHeavy' : 'swing', { pitch: finisher ? 0.8 : (w.id === 'mantis' ? 1.3 : 1) + this.comboIndex * 0.06 });

    const reach = w.reach * this.stats.rangeMult;
    const hx = this.x + aim.x * reach, hy = this.y + aim.y * reach;
    const [sx, sy] = w.arc.scale;
    const slash = this.scene.add.image(this.x + aim.x * (8 + reach / 3), this.y + aim.y * (8 + reach / 3), 'slash')
      .setRotation(Math.atan2(aim.y, aim.x)).setDepth(12).setScale(sx * (finisher ? 1.3 : 1) * this.stats.rangeMult, sy * (finisher ? 1.3 : 1) * this.stats.rangeMult)
      .setFlipY(this.comboIndex % 2 === 0);
    if (w.id === 'blade' && this.stats.rangeMult > 1) slash.setTint(0xff3b3b); // katana: red moon arc
    else if (finisher) slash.setTint(COLORS.magenta);
    else if (w.arc.tint) slash.setTint(w.arc.tint);
    this.scene.tweens.add({ targets: slash, alpha: 0, duration: w.id === 'mantis' ? 90 : 140, onComplete: () => slash.destroy() });
    if (w.id === 'gorilla' && finisher) this.scene.cameras.main.shake(90, 0.005);

    const ev: AttackEvent = {
      x: hx, y: hy, radius: w.radius[finisher ? 1 : 0] * this.stats.rangeMult, comboIndex: this.comboIndex,
      mult: w.damageMult * (finisher ? this.stats.finisherMult : 1), dirX: aim.x, dirY: aim.y,
      finisher, knock: w.knock, daze: finisher ? w.finisherStun : 0,
    };
    this.scene.events.emit(PLAYER_ATTACK, ev);
  }

  private startSpecial(now: number, aim: { x: number; y: number }) {
    const sp = this.weapon.special;
    this.specialReadyAt = now + sp.cooldownMs;
    audio.sfx('special');
    if (sp.id === 'windcut') {
      this.motionKind = 'windcut';
      this.motionVel = { x: aim.x * 520, y: aim.y * 520 };
      this.motionUntil = now + 170;
      this.invulnUntil = Math.max(this.invulnUntil, now + 230);
      this.cutSerial++;
    } else if (sp.id === 'leap') {
      // Leap to the cursor, at most 110 px away, untouchable in the air.
      const p = this.controls.pointerWorld();
      let dx = p.x - this.x, dy = p.y - this.y;
      const d = Math.hypot(dx, dy) || 1, k = Math.min(1, 110 / d);
      dx *= k; dy *= k;
      this.motionKind = 'leap';
      this.motionVel = { x: dx / 0.22, y: dy / 0.22 };
      this.motionUntil = now + 220;
      this.invulnUntil = Math.max(this.invulnUntil, now + 260);
    } else {
      this.lockUntil = now + 180;
    }
    this.scene.events.emit(PLAYER_SPECIAL, { id: sp.id, x: this.x, y: this.y, dirX: aim.x, dirY: aim.y } satisfies SpecialEvent);
  }

  receiveHit(amount: number, now: number, fromX: number, fromY: number): HitResult {
    if (now < this.dashUntil) return 'ignored';
    // Parry is checked before post-hit invulnerability, otherwise a parry right after taking a hit always whiffs.
    if (this.parryPending && resolveParry(this.parryStartMs, now, this.parryWindow) === 'parried') {
      this.parryPending = false;
      this.clearTint();
      this.invulnUntil = now + 200;
      sparks(this.scene, (this.x + fromX) / 2, (this.y + fromY) / 2, COLORS.cyan, 10, 20);
      this.scene.cameras.main.flash(80, 0, 240, 255, false);
      this.scene.events.emit(PLAYER_PARRY, (this.x + fromX) / 2, (this.y + fromY) / 2);
      return 'parried';
    }
    if (now < this.invulnUntil) return 'ignored';
    this.hp = Math.max(0, this.hp - amount * this.stats.damageTakenMult);
    this.invulnUntil = now + CONFIG.HIT_INVULN_MS;
    this.hurtUntil = now + 180;
    const dx = this.x - fromX, dy = this.y - fromY, len = Math.hypot(dx, dy) || 1;
    this.lungeDir = { x: dx / len * 1.6, y: dy / len * 1.6 };
    this.lungeUntil = now + 90;
    this.scene.cameras.main.shake(120, 0.006);
    sparks(this.scene, this.x, this.y, COLORS.magenta, 8);
    audio.sfx('hurt');
    this.scene.events.emit(PLAYER_HURT, this.x, this.y);
    return 'hit';
  }
}
