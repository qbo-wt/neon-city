import Phaser from 'phaser';
import { CONFIG, COLORS, SCENES } from '../config';
import { computeHitDamage } from '../core/combat';
import { applyBlocker, crisisMultipliers, hpDrainPerSec, psyOnKill, psyTier, tickPsychosis } from '../core/psychosis';
import { TILE, spawnPoints, type Reward, type RoomPlan } from '../core/runMap';
import { createRng, shuffle } from '../core/rng';
import { loadSave, writeSave } from '../core/save';
import { computeStats, totalLoad } from '../core/stats';
import { getStorage } from '../core/storage';
import type { Stats } from '../core/types';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { IMPLANTS } from '../data/implants';
import { Bullets } from '../entities/Bullets';
import { Enemy, type EnemyHooks } from '../entities/Enemy';
import { PLAYER_ATTACK, Player, type AttackEvent } from '../entities/Player';
import { Rain, floatText, sparks } from '../fx/effects';
import { Controls } from '../input/controls';
import { buildRoom, doorColumns, type BuiltRoom } from '../systems/roomBuilder';
import { STREET_NAMES, decorateStreet, obstacleFor, paintStreetGround, streetStyle } from '../gfx/streetArt';
import { addRecord } from '../core/history';
import { getRun, newRun, setRun, type HudData, type RunState } from '../systems/runState';
import { ImplantChoice } from '../ui/ImplantChoice';
import { txt } from '../ui/text';
import { setupCamera } from '../ui/camera';

export const HUD_H = 14;

const REWARD_ICON: Record<Reward, string> = { implant: 'implant-pickup', credits: 'credit', heal: 'heal', chest: 'chest' };

export class RunScene extends Phaser.Scene {
  private run!: RunState;
  private room!: RoomPlan;
  private built!: BuiltRoom;
  private stats!: Stats;
  private controls!: Controls;
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private bullets!: Bullets;
  private rain!: Rain;
  private hooks!: EnemyHooks;
  private boss?: Enemy;
  private choice?: ImplantChoice;
  private waveIndex = 0;
  private pendingSpawns = 0;
  /** Psychosis only ticks while enemies are live in the room — never during transitions. */
  private roomActive = false;
  private leaving = false;
  private ending = false;

  constructor() { super(SCENES.Run); }

  init(data: { seed?: number }) {
    if (data?.seed !== undefined) setRun(this.registry, newRun(data.seed, loadSave(getStorage()).ownedNodes));
    this.run = getRun(this.registry);
    this.waveIndex = 0;
    this.pendingSpawns = 0;
    this.roomActive = this.leaving = this.ending = false;
    this.boss = this.choice = undefined;
  }

  create() {
    const cam = setupCamera(this, -HUD_H);
    cam.fadeIn(220, 11, 8, 32);

    this.room = this.run.rooms[this.run.roomIndex];
    // Every sector is a different street: ground, obstacles and props are drawn from the run seed.
    const style = streetStyle(this.room.template);
    const rng = createRng(this.run.seed * 31 + this.run.roomIndex * 7919);
    paintStreetGround(this, 'street-ground', this.room.template, style, rng);
    this.add.image(0, 0, 'street-ground').setOrigin(0).setDepth(0);
    this.built = buildRoom(this, this.room.template, this.room.doorRewards.length, { floorKey: null, streetLights: false, obstacleKey: () => obstacleFor(style, rng) });
    decorateStreet(this, this.room.template, style, rng, doorColumns(this.room.doorRewards.length));
    const streetName = STREET_NAMES[style][this.run.roomIndex % 2];
    this.stats = computeStats(this.run.implants, this.run.ownedNodes);
    this.controls = new Controls(this);
    this.player = new Player(this, this.built.start.x, this.built.start.y, this.stats, this.controls);
    this.player.hp = Math.min(this.run.hp, this.stats.maxHp);

    this.enemies = this.physics.add.group();
    this.bullets = new Bullets(this);
    this.physics.add.collider(this.player, this.built.walls);
    this.physics.add.collider(this.enemies, this.built.walls);
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.collider(this.bullets.group, this.built.walls, b => (b as Phaser.GameObjects.GameObject).destroy());
    this.physics.add.overlap(this.bullets.group, this.player, (_p, b) => this.bulletHitsPlayer(b as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.bullets.group, this.enemies, (b, e) => this.bulletHitsEnemy(b as Phaser.Physics.Arcade.Image, e as Enemy));

    this.hooks = {
      player: this.player,
      fireBullet: (x, y, a, s, d, o) => this.bullets.fire(x, y, a, s, d, 'enemy', o),
      onDeath: e => this.onEnemyDeath(e),
    };

    this.events.on(PLAYER_ATTACK, this.onPlayerAttack, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(PLAYER_ATTACK, this.onPlayerAttack, this));

    this.rain = new Rain(this, CONFIG.WIDTH, 256, 60);
    if (!this.scene.isActive(SCENES.Hud)) this.scene.launch(SCENES.Hud);

    const label = this.room.isBoss ? 'ALERTE — CIBLE PRIORITAIRE' : `SECTEUR ${this.run.roomIndex + 1} / ${CONFIG.ROOMS_PER_RUN}
${streetName.toUpperCase()}`;
    const banner = txt(this, CONFIG.WIDTH / 2, 110, label, 12, this.room.isBoss ? '#ff2a6d' : '#00f0ff').setOrigin(0.5).setAlign('center').setDepth(100).setStroke('#05030f', 4);
    this.tweens.add({ targets: banner, alpha: 0, delay: 600, duration: 400, onComplete: () => banner.destroy() });
    this.time.delayedCall(700, () => { this.roomActive = true; this.spawnWave(); });
  }

  update(time: number, delta: number) {
    const dt = Math.min(delta, CONFIG.MAX_DT_MS);
    this.rain.update(dt);
    if (this.ending) return;
    if (this.choice) { this.choice.tick(); this.publishHud(); return; }
    this.run.timeMs += dt;

    const tier = psyTier(this.run.psy);
    this.player.speedMult = crisisMultipliers(tier).speed;
    this.player.tick(time);
    this.enemies.getChildren().forEach(e => (e as Enemy).tick(time));

    if (this.roomActive) {
      this.run.psy = tickPsychosis(this.run.psy, totalLoad(this.run.implants, this.stats), dt, this.stats.psyResist);
      this.player.hp = Math.max(0, this.player.hp - hpDrainPerSec(tier) * dt / 1000);
      // Death wins over a simultaneous room clear.
      if (this.player.hp <= 0) { this.endRun(false); return; }
      if (this.pendingSpawns === 0 && this.enemies.countActive() === 0) this.onWaveCleared();
    }

    if (this.controls.blocker() && this.run.blockers > 0) {
      this.run.blockers--;
      this.run.psy = applyBlocker(this.run.psy, this.stats.blockerAmount);
      floatText(this, this.player.x, this.player.y - 14, `-${this.stats.blockerAmount} PSY`, '#39ff88', 8);
    }

    this.run.hp = this.player.hp;
    if (this.player.hp <= 0) this.endRun(false);
    this.publishHud();
  }

  // ---------- combat ----------

  private onPlayerAttack(ev: AttackEvent) {
    const tier = psyTier(this.run.psy);
    for (const obj of [...this.enemies.getChildren()]) {
      const e = obj as Enemy;
      if (e.dead || Phaser.Math.Distance.Between(ev.x, ev.y, e.x, e.y) > ev.radius + e.def.radius) continue;
      const countered = e.consumeVulnerable();
      const { amount, crit } = computeHitDamage(this.stats, { countered, tier, roll: Math.random(), mult: ev.mult });
      this.run.damageDealt += Math.min(amount, Math.max(0, e.hp));
      e.takeHit(amount, crit, countered, this.player.x, this.player.y, ev.comboIndex === CONFIG.COMBO_HITS);
      if (countered || ev.comboIndex === CONFIG.COMBO_HITS) this.cameras.main.shake(70, 0.004);
    }
  }

  private bulletHitsPlayer(b: Phaser.Physics.Arcade.Image) {
    if (!b.active || b.getData('owner') !== 'enemy') return;
    const res = this.player.receiveHit(b.getData('damage'), this.time.now, b.x, b.y);
    if (res === 'parried') this.bullets.reflect(b);
    else if (res === 'hit') {
      // Quickhack: the shot also pushes psychosis up.
      const psy = (b.getData('psy') as number) * (1 - this.stats.psyResist);
      if (psy > 0) {
        this.run.psy = Math.min(100, this.run.psy + psy);
        floatText(this, this.player.x, this.player.y - 16, `+${Math.round(psy)} PSY`, '#39ff88', 8);
      }
      b.destroy();
    }
  }

  private bulletHitsEnemy(b: Phaser.Physics.Arcade.Image, e: Enemy) {
    if (!b.active || b.getData('owner') !== 'player' || e.dead) return;
    const dmg = Math.round(b.getData('damage'));
    this.run.damageDealt += Math.min(dmg, Math.max(0, e.hp));
    e.takeHit(dmg, false, false, b.x, b.y, true);
    b.destroy();
  }

  // ---------- room flow ----------

  private spawnWave() {
    const ids = this.room.waves[this.waveIndex];
    const rng = createRng(this.run.seed + this.run.roomIndex * 101 + this.waveIndex * 7);
    const tile = { x: Math.floor(this.player.x / TILE), y: Math.floor(this.player.y / TILE) };
    spawnPoints(this.room.template, ids.length, tile, rng).forEach((pt, i) => {
      this.pendingSpawns++;
      // Spawn telegraph so nothing appears on top of the player without warning.
      const warn = this.add.image(pt.x, pt.y, 'glow').setTint(COLORS.magenta).setScale(0.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(5);
      this.tweens.add({ targets: warn, scale: 0.8, alpha: 0.3, yoyo: true, repeat: 1, duration: 120 + i * 20 });
      this.time.delayedCall(500 + i * 60, () => {
        warn.destroy();
        this.pendingSpawns--;
        if (this.ending) return;
        // The player may have moved onto the point during the telegraph: re-pick if too close.
        const p = Phaser.Math.Distance.Between(pt.x, pt.y, this.player.x, this.player.y) < CONFIG.MIN_SPAWN_DIST ? this.freePoint() : pt;
        const e = this.spawnEnemy(ids[i], p.x, p.y);
        if (e.def.behavior === 'boss') this.boss = e;
      });
    });
  }

  /** A floor point away from the player's current position. */
  private freePoint() {
    const tile = { x: Math.floor(this.player.x / TILE), y: Math.floor(this.player.y / TILE) };
    return spawnPoints(this.room.template, 1, tile, Math.random)[0];
  }

  private spawnEnemy(id: EnemyId, x: number, y: number): Enemy {
    const e = new Enemy(this, x, y, ENEMIES[id], this.hooks);
    this.enemies.add(e);
    sparks(this, x, y, COLORS.magenta, 6, 12);
    return e;
  }

  private onEnemyDeath(e: Enemy) {
    if (e === this.boss) this.boss = undefined;
    if (e.exploded) return; // blew itself up: no kill, no credits
    this.run.kills++;
    this.run.psy = psyOnKill(this.run.psy, this.stats.psyResist);
    const gain = Math.round(e.def.credits * this.stats.creditMult);
    this.run.creditsEarned += gain;
    if (gain) floatText(this, e.x, e.y - 4, `+${gain}¢`, '#f5e663', 7);
    if (e === this.boss) this.boss = undefined;
  }

  private onWaveCleared() {
    this.waveIndex++;
    if (this.waveIndex < this.room.waves.length) { this.spawnWave(); return; }
    this.roomActive = false;
    this.bullets.group.clear(true, true);
    if (this.room.isBoss && !this.room.doorRewards.length) {
      this.ending = true;
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.cameras.main.flash(400, 255, 42, 109);
      txt(this, CONFIG.WIDTH / 2, 110, 'CIBLE NEUTRALISÉE', 14, '#f5e663').setOrigin(0.5).setDepth(100);
      this.time.delayedCall(1500, () => this.finish(true));
      return;
    }
    floatText(this, CONFIG.WIDTH / 2, 120, this.room.isBoss ? 'CIBLE NEUTRALISÉE' : 'SECTEUR NETTOYÉ', this.room.isBoss ? '#f5e663' : '#00f0ff', 11);
    if (this.stats.regenOnClear > 0) {
      const before = this.player.hp;
      this.player.hp = this.run.hp = Math.min(this.stats.maxHp, before + this.stats.maxHp * this.stats.regenOnClear);
      this.run.hpHealed += Math.max(0, this.player.hp - before);
      floatText(this, this.player.x, this.player.y - 14, `+${Math.round(this.player.hp - before)} PV`, '#39ff88', 8);
    }
    this.unlockDoors();
  }

  private unlockDoors() {
    this.built.doorSlots.forEach((slot, i) => {
      const reward = this.room.doorRewards[i];
      slot.locked.destroy();
      const door = this.physics.add.staticImage(slot.x, slot.y, 'door');
      const icon = this.add.image(slot.x, slot.y + 2, REWARD_ICON[reward]).setDepth(20);
      this.tweens.add({ targets: icon, y: slot.y - 2, yoyo: true, repeat: -1, duration: 500 });
      this.add.image(slot.x, slot.y + 20, 'glow').setTint(COLORS.cyan).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(1);
      this.physics.add.overlap(this.player, door, () => this.takeDoor(reward));
    });
  }

  private takeDoor(reward: Reward) {
    if (this.leaving) return;
    this.leaving = true;
    const ri = this.run.roomIndex;
    if (reward === 'implant') {
      const owned = new Set(this.run.implants.map(i => i.id));
      const options = shuffle(createRng(this.run.seed + ri * 13), IMPLANTS.filter(i => !owned.has(i.id))).slice(0, 3);
      if (options.length) {
        this.physics.pause();
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        this.choice = new ImplantChoice(this, options, this.controls, imp => {
          this.run.implants.push(imp);
          const next = computeStats(this.run.implants, this.run.ownedNodes);
          // Set the live HP: update() copies player.hp into run.hp every frame.
          this.player.hp = this.run.hp = Math.min(next.maxHp, this.player.hp + Math.max(0, next.maxHp - this.stats.maxHp));
          this.choice = undefined;
          this.nextRoom();
        });
        return;
      }
      reward = 'credits';
    }
    if (reward === 'credits') this.run.creditsEarned += Math.round((8 + ri * 2) * this.stats.creditMult);
    if (reward === 'heal') {
      const before = this.player.hp;
      this.player.hp = this.run.hp = Math.min(this.stats.maxHp, before + this.stats.maxHp * CONFIG.HEAL_FRACTION);
      this.run.hpHealed += Math.max(0, this.player.hp - before);
      floatText(this, this.player.x, this.player.y - 14, `+${Math.round(this.player.hp - before)} PV`, '#39ff88', 9);
    }
    if (reward === 'chest') {
      this.run.creditsEarned += Math.round((5 + ri * 2) * this.stats.creditMult);
      if (Math.random() < 0.5) this.run.blockers++;
    }
    this.nextRoom();
  }

  private nextRoom() {
    this.run.roomIndex++;
    this.cameras.main.fadeOut(200, 11, 8, 32);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart({}));
  }

  private endRun(victory: boolean) {
    if (this.ending) return;
    this.ending = true;
    this.roomActive = false;
    this.physics.pause();
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.player.setTint(COLORS.magenta);
    this.cameras.main.shake(300, 0.01);
    this.cameras.main.flash(300, 255, 0, 40);
    txt(this, CONFIG.WIDTH / 2, 110, 'SIGNAL VITAL PERDU', 16, '#ff2a6d').setOrigin(0.5).setDepth(100);
    this.time.delayedCall(1300, () => this.finish(victory));
  }

  /** Bank credits, reset the run (implants and psychosis are lost), and show the result. */
  private finish(victory: boolean) {
    const storage = getStorage();
    const save = loadSave(storage);
    const bonus = victory ? Math.round(CONFIG.BOSS_CREDIT_BONUS * this.stats.creditMult * this.stats.bossBonusMult) : 0;
    const earned = this.run.creditsEarned + bonus;
    save.credits += earned;
    save.runs += 1;
    save.bestRoom = Math.max(save.bestRoom, this.run.roomIndex + 1);
    save.history = addRecord(save.history, {
      date: Date.now(), victory, sector: this.run.roomIndex + 1, kills: this.run.kills,
      damageDealt: Math.round(this.run.damageDealt), hpHealed: Math.round(this.run.hpHealed), credits: earned, timeMs: Math.round(this.run.timeMs),
    });
    writeSave(storage, save);
    this.registry.remove('run');
    this.scene.stop(SCENES.Hud);
    this.scene.start(SCENES.Death, { victory, creditsEarned: earned, roomReached: this.run.roomIndex + 1 });
  }

  private publishHud() {
    const hud: HudData = {
      hp: this.player.hp, maxHp: this.stats.maxHp, psy: this.run.psy, credits: this.run.creditsEarned,
      dash: this.player.dashCharges, dashMax: this.stats.dashCharges, blockers: this.run.blockers,
      room: this.run.roomIndex + 1, rooms: CONFIG.ROOMS_PER_RUN, implants: this.run.implants.map(i => i.name),
      boss: this.boss && !this.boss.dead ? { hp: this.boss.hp, max: this.boss.maxHp, name: this.boss.def.name } : undefined,
    };
    this.registry.set('hud', hud);
  }
}
