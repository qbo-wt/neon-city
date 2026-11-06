import Phaser from 'phaser';
import { CONFIG, COLORS, SCENES } from '../config';
import { computeHitDamage } from '../core/combat';
import { addRecord } from '../core/history';
import { rollLoot } from '../core/loot';
import { applyBlocker, crisisMultipliers, hpDrainPerSec, psyOnKill, psyTier, tickPsychosis } from '../core/psychosis';
import { TILE, spawnPoints, type Reward, type RoomPlan } from '../core/runMap';
import { createRng, pick, shuffle, type Rng } from '../core/rng';
import { loadSave, writeSave } from '../core/save';
import { computeStats, totalLoad } from '../core/stats';
import { getStorage } from '../core/storage';
import type { Relic, Stats } from '../core/types';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { IMPLANTS } from '../data/implants';
import { RELICS } from '../data/relics';
import { Bullets } from '../entities/Bullets';
import { Enemy, type EnemyHooks } from '../entities/Enemy';
import { PLAYER_ATTACK, Player, type AttackEvent } from '../entities/Player';
import { Rain, floatText, sparks } from '../fx/effects';
import { LIGHT_LABELS, Lighting, pickLightEvents } from '../fx/lighting';
import { STREET_NAMES, decorateStreet, obstacleFor, paintStreetGround, streetStyle, type StreetStyle } from '../gfx/streetArt';
import { Controls } from '../input/controls';
import { buildRoom, type BuiltRoom } from '../systems/roomBuilder';
import { getRun, newRun, setRun, type HudData, type RunState } from '../systems/runState';
import { ImplantChoice } from '../ui/ImplantChoice';
import { setupCamera } from '../ui/camera';
import { txt } from '../ui/text';

export const HUD_H = 14;

const REWARD_ICON: Record<Reward, string> = { implant: 'implant-pickup', credits: 'credit', heal: 'heal', chest: 'chest' };

/** Breakable kinds: texture, hit points, loot rolls. */
const BREAKABLES = {
  crate: { key: 'br-crate', hp: 18, rolls: 1 },
  barrel: { key: 'br-barrel', hp: 24, rolls: 1 },
  trash: { key: 'br-trash', hp: 10, rolls: 1 },
  vending: { key: 'br-vending', hp: 36, rolls: 2 },
} as const;
type BreakKind = keyof typeof BREAKABLES;
const BREAK_BY_STYLE: Record<StreetStyle, BreakKind[]> = {
  avenue: ['trash', 'vending', 'crate'], alley: ['trash', 'trash', 'crate', 'barrel'], market: ['crate', 'crate', 'vending'],
  crossroad: ['trash', 'vending', 'barrel'], parking: ['barrel', 'trash', 'crate'], plaza: ['vending', 'trash'],
  docks: ['crate', 'barrel', 'barrel'], checkpoint: ['barrel', 'crate'],
};

export class RunScene extends Phaser.Scene {
  private run!: RunState;
  private room!: RoomPlan;
  private built!: BuiltRoom;
  private stats!: Stats;
  private controls!: Controls;
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private breakables!: Phaser.Physics.Arcade.StaticGroup;
  private pickups!: Phaser.Physics.Arcade.Group;
  private blockedTiles = new Set<string>();
  private bullets!: Bullets;
  private rain!: Rain;
  private lighting!: Lighting;
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
    this.blockedTiles = new Set();
  }

  private computeStats() { return computeStats(this.run.implants, this.run.ownedNodes, this.run.relics); }

  create() {
    setupCamera(this, -HUD_H).fadeIn(220, 11, 8, 32);

    this.room = this.run.rooms[this.run.roomIndex];
    // Every sector is a different street: ground, obstacles and props are drawn from the run seed.
    const style = streetStyle(this.room.template);
    const rng = createRng(this.run.seed * 31 + this.run.roomIndex * 7919);
    paintStreetGround(this, 'street-ground', this.room.template, style, rng);
    this.add.image(0, 0, 'street-ground').setOrigin(0).setDepth(0);
    this.built = buildRoom(this, this.room.template, this.room.doorRewards.length, { floorKey: null, streetLights: false, obstacleKey: () => obstacleFor(style, rng) });
    decorateStreet(this, this.room.template, style, rng);
    const streetName = STREET_NAMES[style][this.run.roomIndex % 2];

    this.stats = this.computeStats();
    this.controls = new Controls(this);
    this.player = new Player(this, this.built.start.x, this.built.start.y, this.stats, this.controls);
    this.player.hp = Math.min(this.run.hp, this.stats.maxHp);

    this.enemies = this.physics.add.group();
    this.pickups = this.physics.add.group();
    this.bullets = new Bullets(this);
    this.breakables = this.physics.add.staticGroup();
    this.placeBreakables(style, rng);

    this.physics.add.collider(this.player, this.built.walls);
    this.physics.add.collider(this.player, this.breakables);
    this.physics.add.collider(this.enemies, this.built.walls);
    this.physics.add.collider(this.enemies, this.breakables);
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.collider(this.bullets.group, this.built.walls, b => (b as Phaser.GameObjects.GameObject).destroy());
    this.physics.add.collider(this.bullets.group, this.breakables, (b, br) => {
      const bullet = b as Phaser.Physics.Arcade.Image;
      this.damageBreakable(br as Phaser.Physics.Arcade.Image, bullet.getData('damage') as number);
      bullet.destroy();
    });
    this.physics.add.overlap(this.bullets.group, this.player, (_p, b) => this.bulletHitsPlayer(b as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.bullets.group, this.enemies, (b, e) => this.bulletHitsEnemy(b as Phaser.Physics.Arcade.Image, e as Enemy));
    this.physics.add.overlap(this.player, this.pickups, (_p, k) => this.collect(k as Phaser.Physics.Arcade.Image));

    this.hooks = {
      player: this.player,
      fireBullet: (x, y, a, s, d, o) => this.bullets.fire(x, y, a, s, d, 'enemy', o),
      onDeath: e => this.onEnemyDeath(e),
    };

    this.events.on(PLAYER_ATTACK, this.onPlayerAttack, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(PLAYER_ATTACK, this.onPlayerAttack, this));

    this.rain = new Rain(this, CONFIG.WIDTH, CONFIG.HEIGHT, 60);
    const light = pickLightEvents(rng, this.room.isBoss);
    this.lighting = new Lighting(this, light, this.player, this.built);
    if (!this.scene.isActive(SCENES.Hud)) this.scene.launch(SCENES.Hud);
    this.followCamera(0, true);

    const label = this.room.isBoss ? 'ALERTE — CIBLE PRIORITAIRE' : `SECTEUR ${this.run.roomIndex + 1} / ${CONFIG.ROOMS_PER_RUN}\n${streetName.toUpperCase()}`;
    const sub = light.length && !this.room.isBoss ? `\n⚠ ${LIGHT_LABELS[light[0]]}` : '';
    const banner = this.screenText(label + sub, 12, this.room.isBoss ? '#ff2a6d' : '#00f0ff', 110);
    this.tweens.add({ targets: banner, alpha: 0, delay: 900, duration: 400, onComplete: () => banner.destroy() });
    this.time.delayedCall(800, () => { this.roomActive = true; this.spawnWave(); });
  }

  /** Text fixed on screen (banners), regardless of the camera scroll. */
  private screenText(s: string, size: number, color: string, y = 110) {
    return txt(this, CONFIG.WIDTH / 2, y, s, size, color).setOrigin(0.5).setAlign('center').setScrollFactor(0).setDepth(100).setStroke('#05030f', 4);
  }

  /** Smooth follow, clamped to the map; small maps are centred. */
  private followCamera(dt: number, snap = false) {
    const cam = this.cameras.main, W = this.built.width, H = this.built.height;
    const vw = CONFIG.WIDTH, vh = CONFIG.HEIGHT - HUD_H;
    const tx = W <= vw ? (W - vw) / 2 : Phaser.Math.Clamp(this.player.x - vw / 2, 0, W - vw);
    const ty = (H <= vh ? (H - vh) / 2 : Phaser.Math.Clamp(this.player.y - vh / 2, 0, H - vh)) - HUD_H;
    const k = snap ? 1 : 1 - Math.pow(0.002, dt / 1000);
    cam.scrollX += (tx - cam.scrollX) * k;
    cam.scrollY += (ty - cam.scrollY) * k;
  }

  update(time: number, delta: number) {
    const dt = Math.min(delta, CONFIG.MAX_DT_MS);
    this.rain.update(dt);
    this.lighting.update(time, dt);
    if (this.ending) return;
    if (this.choice) { this.choice.tick(); this.publishHud(); return; }
    this.run.timeMs += dt;

    const tier = psyTier(this.run.psy);
    this.player.speedMult = crisisMultipliers(tier).speed;
    this.player.tick(time);
    this.enemies.getChildren().forEach(e => (e as Enemy).tick(time));
    this.magnetPickups();
    this.followCamera(dt);

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

  // ---------- breakables and loot ----------

  private placeBreakables(style: StreetStyle, rng: Rng) {
    const g = this.room.template.grid;
    const start = { x: Math.floor(this.built.start.x / TILE), y: Math.floor(this.built.start.y / TILE) };
    const free: { x: number; y: number }[] = [];
    g.forEach((row, ty) => [...row].forEach((ch, tx) => {
      if (ch !== '.' || g[ty - 1]?.[tx] === 'D') return; // keep exits clear
      if (Math.abs(tx - start.x) + Math.abs(ty - start.y) < 3) return;
      free.push({ x: tx, y: ty });
    }));
    const count = this.room.isBoss ? 4 : Math.round(free.length / 20);
    for (let i = 0; i < count && free.length; i++) {
      const t = free.splice(Math.floor(rng() * free.length), 1)[0];
      const kind = pick(rng, BREAK_BY_STYLE[style]);
      const def = BREAKABLES[kind];
      const b = this.breakables.create(t.x * TILE + 16, t.y * TILE + 16, def.key) as Phaser.Physics.Arcade.Image;
      b.setDepth(3).setData({ hp: def.hp, rolls: def.rolls });
      this.blockedTiles.add(`${t.x},${t.y}`);
    }
  }

  private damageBreakable(b: Phaser.Physics.Arcade.Image, amount: number) {
    if (!b.active) return;
    const hp = (b.getData('hp') as number) - amount;
    b.setData('hp', hp);
    this.tweens.add({ targets: b, x: b.x + 2, duration: 40, yoyo: true, repeat: 1 });
    sparks(this, b.x, b.y, COLORS.yellow, 3, 8);
    if (hp > 0) return;
    // Burst into debris and roll the loot.
    for (let i = 0; i < 8; i++) {
      const d = this.add.rectangle(b.x, b.y, 3, 3, Phaser.Utils.Array.GetRandom([0x8a6a4a, 0x3a3550, 0x39a85a, 0xff8c2a])).setDepth(30);
      const a = Math.random() * Math.PI * 2;
      this.tweens.add({ targets: d, x: b.x + Math.cos(a) * 22, y: b.y + Math.sin(a) * 22, angle: 180, alpha: 0, duration: 420, onComplete: () => d.destroy() });
    }
    const rolls = b.getData('rolls') as number;
    for (let i = 0; i < rolls; i++) this.dropLoot(b.x + (i ? 8 : 0), b.y);
    this.blockedTiles.delete(`${Math.floor(b.x / TILE)},${Math.floor(b.y / TILE)}`);
    b.destroy();
  }

  private relicsLeft(): Relic[] {
    const owned = new Set(this.run.relics.map(r => r.id));
    return RELICS.filter(r => !owned.has(r.id));
  }

  private dropLoot(x: number, y: number) {
    const loot = rollLoot(Math.random, this.relicsLeft().length > 0);
    if (loot.kind === 'nothing') return;
    let key: string = loot.kind === 'heal' ? 'heal' : 'credit';
    let relic: Relic | undefined;
    if (loot.kind === 'relic') { relic = pick(Math.random, this.relicsLeft()); key = relic.texture; }
    const k = this.pickups.create(x, y, key) as Phaser.Physics.Arcade.Image;
    k.setDepth(9).setData({ loot, relic });
    (k.body as Phaser.Physics.Arcade.Body).setVelocity((Math.random() - 0.5) * 80, -60).setDrag(160, 160);
    if (relic) {
      const halo = this.add.image(x, y, 'glow').setTint(0xff3b3b).setBlendMode(Phaser.BlendModes.ADD).setDepth(8).setScale(0.8);
      this.tweens.add({ targets: halo, scale: 1.3, alpha: 0.4, yoyo: true, repeat: -1, duration: 400 });
      k.setData('halo', halo);
      const found = this.screenText('★ RELIQUE TROUVÉE ★', 10, '#ff3b3b', 70);
      this.time.delayedCall(1500, () => found.destroy());
    }
  }

  /** Pickups drift toward the player once close. */
  private magnetPickups() {
    this.pickups.getChildren().forEach(o => {
      const k = o as Phaser.Physics.Arcade.Image;
      const halo = k.getData('halo') as Phaser.GameObjects.Image | undefined;
      halo?.setPosition(k.x, k.y);
      const d = Phaser.Math.Distance.Between(k.x, k.y, this.player.x, this.player.y);
      if (d < 44) this.physics.moveToObject(k, this.player, 160);
    });
  }

  private collect(k: Phaser.Physics.Arcade.Image) {
    if (!k.active) return;
    const loot = k.getData('loot') as ReturnType<typeof rollLoot>;
    if (loot.kind === 'credits') {
      const gain = Math.round(loot.amount * this.stats.creditMult);
      this.run.creditsEarned += gain;
      floatText(this, k.x, k.y - 6, `+${gain}¢`, '#f5e663', 7);
    } else if (loot.kind === 'heal') {
      const before = this.player.hp;
      this.player.hp = Math.min(this.stats.maxHp, before + loot.amount);
      this.run.hpHealed += Math.max(0, this.player.hp - before);
      floatText(this, k.x, k.y - 6, `+${Math.round(this.player.hp - before)} PV`, '#39ff88', 7);
    } else if (loot.kind === 'relic') {
      const relic = k.getData('relic') as Relic;
      this.run.relics.push(relic);
      const prevMax = this.stats.maxHp;
      this.stats = this.computeStats();
      this.player.setStats(this.stats);
      this.player.hp = Math.min(this.stats.maxHp, this.player.hp + Math.max(0, this.stats.maxHp - prevMax));
      this.cameras.main.flash(250, 255, 59, 59);
      const t = this.screenText(`${relic.name.toUpperCase()}\n${relic.description}`, 9, '#ff3b3b', 80);
      this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 500, onComplete: () => t.destroy() });
      (k.getData('halo') as Phaser.GameObjects.Image | undefined)?.destroy();
    }
    k.destroy();
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
    for (const obj of [...this.breakables.getChildren()]) {
      const b = obj as Phaser.Physics.Arcade.Image;
      if (Phaser.Math.Distance.Between(ev.x, ev.y, b.x, b.y) <= ev.radius + 10) this.damageBreakable(b, this.stats.damage * ev.mult);
    }
    // Golden pistols: every swing also fires a shot toward the cursor.
    if (this.stats.gunDamage > 0) {
      this.bullets.fire(this.player.x + ev.dirX * 8, this.player.y + ev.dirY * 8, Math.atan2(ev.dirY, ev.dirX), 330,
        this.stats.damage * this.stats.gunDamage, 'player', { key: 'bullet-gold' });
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

  private playerTile() { return { x: Math.floor(this.player.x / TILE), y: Math.floor(this.player.y / TILE) }; }

  private spawnWave() {
    const ids = this.room.waves[this.waveIndex];
    const rng = createRng(this.run.seed + this.run.roomIndex * 101 + this.waveIndex * 7);
    spawnPoints(this.room.template, ids.length, this.playerTile(), rng, this.blockedTiles).forEach((pt, i) => {
      this.pendingSpawns++;
      // Spawn telegraph so nothing appears on top of the player without warning.
      const warn = this.add.image(pt.x, pt.y, 'glow').setTint(COLORS.magenta).setScale(0.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(5);
      this.tweens.add({ targets: warn, scale: 0.8, alpha: 0.3, yoyo: true, repeat: 1, duration: 120 + i * 20 });
      this.time.delayedCall(500 + i * 60, () => {
        warn.destroy();
        this.pendingSpawns--;
        if (this.ending) return;
        // The player may have moved onto the point during the telegraph: re-pick if too close.
        // Bosses enter in the middle of the arena, away from the entry; others re-pick if the player moved onto their point.
        const isBoss = ENEMIES[ids[i]].behavior === 'boss';
        const p = isBoss ? { x: this.built.width / 2, y: this.built.height / 2 - TILE }
          : Phaser.Math.Distance.Between(pt.x, pt.y, this.player.x, this.player.y) < CONFIG.MIN_SPAWN_DIST ? this.freePoint() : pt;
        const e = this.spawnEnemy(ids[i], p.x, p.y);
        if (e.def.behavior === 'boss') this.boss = e;
      });
    });
  }

  /** A floor point away from the player's current position. */
  private freePoint() {
    return spawnPoints(this.room.template, 1, this.playerTile(), Math.random, this.blockedTiles)[0];
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
    // Bosses always leave something behind.
    if (e.def.behavior === 'boss') for (let i = 0; i < 3; i++) this.dropLoot(e.x + (i - 1) * 12, e.y);
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
      this.screenText('CIBLE NEUTRALISÉE', 14, '#f5e663');
      this.time.delayedCall(1500, () => this.finish(true));
      return;
    }
    const t = this.screenText(this.room.isBoss ? 'CIBLE NEUTRALISÉE' : 'SECTEUR NETTOYÉ', 11, this.room.isBoss ? '#f5e663' : '#00f0ff', 120);
    this.tweens.add({ targets: t, alpha: 0, y: 100, delay: 600, duration: 600, onComplete: () => t.destroy() });
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
          const next = this.computeStats();
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
    this.screenText('SIGNAL VITAL PERDU', 16, '#ff2a6d');
    this.time.delayedCall(1300, () => this.finish(victory));
  }

  /** Bank credits, reset the run (implants, relics and psychosis are lost), and show the result. */
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
      room: this.run.roomIndex + 1, rooms: CONFIG.ROOMS_PER_RUN,
      implants: this.run.implants.map(i => i.name), relics: this.run.relics.map(r => r.name),
      boss: this.boss && !this.boss.dead ? { hp: this.boss.hp, max: this.boss.maxHp, name: this.boss.def.name } : undefined,
    };
    this.registry.set('hud', hud);
  }
}
