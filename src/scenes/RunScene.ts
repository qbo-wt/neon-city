import Phaser from 'phaser';
import { CONFIG, COLORS, SCENES } from '../config';
import { computeHitDamage } from '../core/combat';
import { addRecord } from '../core/history';
import { buildFlowField, nextStep, reachableCount } from '../core/flowField';
import { rollLoot } from '../core/loot';
import { applyBlocker, crisisMultipliers, hpDrainPerSec, psyOnKill, psyTier, tickPsychosis } from '../core/psychosis';
import { TILE, spawnPoints, type Reward, type RoomPlan } from '../core/runMap';
import { createRng, pick, type Rng } from '../core/rng';
import { loadSave, writeSave } from '../core/save';
import { computeStats, totalLoad } from '../core/stats';
import { getStorage } from '../core/storage';
import type { Relic, Stats } from '../core/types';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { FAMILY_COLORS, FAMILY_NAMES } from '../data/implants';
import { SYNERGIES, activeSynergies } from '../data/synergies';
import { applyOffer, offerImplants } from '../core/implantOffer';
import { RELICS } from '../data/relics';
import { Bullets } from '../entities/Bullets';
import { Enemy, type EnemyHooks } from '../entities/Enemy';
import { PLAYER_ATTACK, PLAYER_HURT, PLAYER_PARRY, PLAYER_SHOOT, PLAYER_SPECIAL, Player, type AttackEvent, type ShootEvent, type SpecialEvent } from '../entities/Player';
import { WEAPONS, type Weapon } from '../data/weapons';
import { heatCreditMult, heatEffects, heatRecordBonus } from '../data/heat';
import { dailySeed, dateKey, recordDaily } from '../core/daily';
import { bossIntro } from '../core/story';
import { BOSS_LINES } from '../data/story';
import type { SaveData } from '../core/save';
import { audio } from '../audio/audio';
import { Rain, floatText, sparks } from '../fx/effects';
import { LIGHT_LABELS, Lighting, pickLightEvents } from '../fx/lighting';
import { STREET_NAMES, decorateStreet, obstacleFor, paintStreetGround, streetStyle, type StreetStyle } from '../gfx/streetArt';
import { Controls } from '../input/controls';
import { lightCity, overheadCity, paintCity } from '../gfx/cityArt';
import { placeStreetProps } from '../gfx/streetProps';
import { buildRoom, type BuiltRoom } from '../systems/roomBuilder';
import { getRun, newRun, setRun, type HudData, type RunState } from '../systems/runState';
import { ImplantChoice } from '../ui/ImplantChoice';
import { ChoicePanel } from '../ui/ChoicePanel';
import { Npc } from '../entities/Npc';
import { STREET_EVENTS, STREET_EVENT_IDS, eventLine, eventOptions, type EventCtx, type StreetEventId } from '../systems/streetEvents';
import { contractMet, contractProgress, type SectorTally } from '../core/contract';
import { makeElite, makeEvent, type EliteMod } from '../core/runMap';
import { IMPLANTS, canUpgrade } from '../data/implants';
import type { Offer } from '../core/implantOffer';
import { setupCamera } from '../ui/camera';
import { txt } from '../ui/text';

export const HUD_H = 14;

const REWARD_ICON: Record<Reward, string> = { implant: 'implant-pickup', credits: 'credit', heal: 'heal', chest: 'chest', event: 'icon-event', elite: 'icon-elite' };
const DOOR_LABELS: Record<Reward, string> = { implant: 'IMPLANT', credits: 'CRÉDITS', heal: 'SOIN', chest: 'COFFRE', event: 'RENCONTRE', elite: 'ÉLITE ★' };
const ELITE_LABELS: Record<EliteMod, string> = { shield: 'BOUCLIERS', explosive: 'EXPLOSIFS', cloak: 'CAMOUFLÉS', frenzy: 'ENRAGÉS' };

function psyBonusLabel(tier: ReturnType<typeof psyTier>) {
  const m = crisisMultipliers(tier);
  if (m.damage <= 1) return '';
  return `+${Math.round((m.damage - 1) * 100)} % DÉG${m.speed > 1 ? ` +${Math.round((m.speed - 1) * 100)} % VIT` : ''}`;
}

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
  /** Tiles enemies must path around (breakables and large props). Small posts are not in here. */
  private navBlocked = new Set<string>();
  /** Shared enemy navigation: distance to the player for every tile, rebuilt as the player moves. */
  private flow?: Int16Array;
  private flowFrom = '';
  private nextFlowAt = 0;
  private bullets!: Bullets;
  private rain!: Rain;
  private lighting!: Lighting;
  private hooks!: EnemyHooks;
  private boss?: Enemy;
  private choice?: ImplantChoice;
  private panel?: ChoicePanel;
  /** Street event sector: the NPC you talk to, and whether you already did. */
  private eventNpc?: Npc;
  private eventId?: StreetEventId;
  private eventDone = false;
  private eventPrompt?: Phaser.GameObjects.Text;
  /** Measured for fixer contracts. */
  private tally: SectorTally = { hitsTaken: 0, timeMs: 0, parries: 0 };
  /** The save as it was when this sector started: your history with the bosses. */
  private meta!: SaveData;
  private bossPhase = 0;
  private bossLine?: Phaser.GameObjects.Text;
  private waveIndex = 0;
  private pendingSpawns = 0;
  /** Psychosis only ticks while enemies are live in the room — never during transitions. */
  private roomActive = false;
  private leaving = false;
  private ending = false;
  /**
   * Simulation clock: what the player and enemies see as "now". It freezes during hit-stop and runs
   * slower during the parry slow-motion; input buffers keep using the real clock.
   */
  private simNow = 0;
  private freezeUntil = 0;
  private slowUntil = 0;
  private slowScale = 1;
  private curScale = 1;
  private frozenByFx = false;

  constructor() { super(SCENES.Run); }

  /** Freeze the action for a few ms: the impact frame of a hit. */
  private hitstop(ms: number) { this.freezeUntil = Math.max(this.freezeUntil, this.game.loop.time + ms); }
  /** Slow motion at `scale` for `ms` of real time. */
  private slowmo(ms: number, scale: number) { this.slowUntil = Math.max(this.slowUntil, this.game.loop.time + ms); this.slowScale = scale; }

  private applyTimeScale(real: number) {
    const s = real < this.freezeUntil ? 0 : real < this.slowUntil ? this.slowScale : 1;
    if (s === this.curScale) return s;
    this.curScale = s;
    this.time.timeScale = s;
    this.tweens.timeScale = s;
    this.anims.globalTimeScale = s;
    const world = this.physics.world;
    if (s === 0) { if (!world.isPaused) { world.pause(); this.frozenByFx = true; } }
    else {
      if (this.frozenByFx) { if (!this.ending) world.resume(); this.frozenByFx = false; }
      world.timeScale = 1 / s;
    }
    return s;
  }

  init(data: { seed?: number; daily?: boolean }) {
    if (data?.seed !== undefined) {
      const sv = loadSave(getStorage());
      // The daily run is the same city for everyone today: fixed seed, mono-blade, no notoriety.
      if (data.daily) { const key = dateKey(); setRun(this.registry, newRun(dailySeed(key), sv.ownedNodes, 'blade', { daily: key })); }
      else setRun(this.registry, newRun(data.seed, sv.ownedNodes, sv.weapon, { heat: sv.heat }));
    }
    this.run = getRun(this.registry);
    this.waveIndex = 0;
    this.pendingSpawns = 0;
    this.roomActive = this.leaving = this.ending = false;
    this.boss = this.choice = this.panel = this.eventNpc = this.eventId = undefined;
    this.eventDone = false;
    this.tally = { hitsTaken: 0, timeMs: 0, parries: 0 };
    this.meta = loadSave(getStorage());
    this.bossPhase = 0;
    this.bossLine = undefined;
    this.simNow = this.time.now;
    this.freezeUntil = this.slowUntil = 0;
    this.curScale = 1;
    this.frozenByFx = false;
    this.blockedTiles = new Set();
    this.navBlocked = new Set();
  }

  private get weapon(): Weapon { return WEAPONS[this.run.weapon] ?? WEAPONS.blade; }
  private computeStats() {
    let s = computeStats(this.run.implants, this.run.ownedNodes, this.run.relics);
    if (this.weapon.modify) s = this.weapon.modify(s);
    const h = heatEffects(this.run.heat);
    return { ...s, healMult: s.healMult * h.healMult, psyRateMult: s.psyRateMult * h.psyRateMult };
  }

  create() {
    setupCamera(this, -HUD_H).fadeIn(220, 11, 8, 32);

    this.room = this.run.rooms[this.run.roomIndex];
    // Every sector is a different street: ground, obstacles and props are drawn from the run seed.
    const style = streetStyle(this.room.template);
    const rng = createRng(this.run.seed * 31 + this.run.roomIndex * 7919);
    paintStreetGround(this, 'street-ground', this.room.template, style, rng);
    this.add.image(0, 0, 'street-ground').setOrigin(0).setDepth(0);
    // The surrounding city (facades, rooftops, shadows) is one painted layer; walls are invisible bodies.
    const city = paintCity(this, 'city-layer', this.room.template, style, this.run.seed * 17 + this.run.roomIndex * 131);
    this.add.image(0, 0, 'city-layer').setOrigin(0).setDepth(1.5);
    lightCity(this, city);
    this.built = buildRoom(this, this.room.template, this.room.doorRewards.length, { floorKey: null, wallKey: null, streetLights: false, obstacleKey: () => obstacleFor(style, rng) });
    decorateStreet(this, this.room.template, style, rng);
    overheadCity(this, this.room.template, style, rng);
    const streetName = STREET_NAMES[style][this.run.roomIndex % 2];

    this.stats = this.computeStats();
    this.controls = new Controls(this);
    this.player = new Player(this, this.built.start.x, this.built.start.y, this.stats, this.controls);
    this.player.hp = Math.min(this.run.hp, this.stats.maxHp);
    this.player.setWeapon(this.weapon);

    this.enemies = this.physics.add.group();
    this.pickups = this.physics.add.group();
    this.bullets = new Bullets(this);
    this.breakables = this.physics.add.staticGroup();
    this.placeBreakables(style, rng);
    placeStreetProps(this, this.room.template, style, rng, this.built.walls, this.blockedTiles, this.navBlocked);

    this.physics.add.collider(this.player, this.built.walls);
    this.physics.add.collider(this.player, this.breakables);
    this.physics.add.collider(this.enemies, this.built.walls);
    this.physics.add.collider(this.enemies, this.breakables);
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
      steer: (x, y) => this.steer(x, y),
      occupied: (x, y) => this.navBlocked.has(`${Math.floor(x / TILE)},${Math.floor(y / TILE)}`),
      now: () => this.simNow,
      struckPlayer: e => { this.run.killer = e.def.id; this.thorns(e); },
      eliteBlast: (x, y) => this.eliteBlast(x, y),
    };

    this.events.on(PLAYER_ATTACK, this.onPlayerAttack, this);
    this.events.on(PLAYER_PARRY, this.onParry, this);
    this.events.on(PLAYER_SHOOT, this.onShoot, this);
    this.events.on(PLAYER_SPECIAL, this.onSpecial, this);
    this.events.on(PLAYER_HURT, this.onHurt, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(PLAYER_ATTACK, this.onPlayerAttack, this);
      this.events.off(PLAYER_PARRY, this.onParry, this);
      this.events.off(PLAYER_SHOOT, this.onShoot, this);
      this.events.off(PLAYER_SPECIAL, this.onSpecial, this);
      this.events.off(PLAYER_HURT, this.onHurt, this);
      // Time scales are shared with other systems: always leave them at normal speed.
      this.anims.globalTimeScale = 1;
      this.time.timeScale = 1;
      this.tweens.timeScale = 1;
    });
    audio.setMusic(this.room.isBoss ? 'boss' : 'run');
    audio.setIntensity(0.3);

    this.rain = new Rain(this, CONFIG.WIDTH, CONFIG.HEIGHT, 60);
    const light = pickLightEvents(rng, this.room.isBoss);
    this.lighting = new Lighting(this, light, this.player, this.built);
    if (!this.scene.isActive(SCENES.Hud)) this.scene.launch(SCENES.Hud);
    this.followCamera(0, true);

    const event = this.room.kind === 'event';
    if (event) this.setupEvent(rng);
    this.player.specialEnabled = !event;
    // A contract signed with a fixer runs in the next combat sector.
    if (!event && !this.room.isBoss && this.run.contract && this.run.contract.room === undefined) this.run.contract.room = this.run.roomIndex;
    const label = this.room.isBoss ? 'ALERTE — CIBLE PRIORITAIRE'
      : event ? `${STREET_EVENTS[this.eventId!].banner}\n${streetName.toUpperCase()}`
        : `SECTEUR ${this.run.roomIndex + 1} / ${CONFIG.ROOMS_PER_RUN}\n${streetName.toUpperCase()}`;
    const sub = this.room.elite ? `\n★ SECTEUR ÉLITE — ${ELITE_LABELS[this.room.elite]} ★` : light.length && !this.room.isBoss && !event ? `\n⚠ ${LIGHT_LABELS[light[0]]}` : '';
    const banner = this.screenText(label + sub, 12, this.room.isBoss || this.room.elite ? '#ff2a6d' : event ? '#f5e663' : '#00f0ff', 110);
    this.tweens.add({ targets: banner, alpha: 0, delay: 900, duration: 400, onComplete: () => banner.destroy() });
    if (this.room.elite) audio.sfx('elite');
    if (!event) this.time.delayedCall(800, () => { this.roomActive = true; this.spawnWave(); });
  }

  // ---------- street events ----------

  /** A calm street with one person to talk to; the exits are open from the start. */
  private setupEvent(rng: Rng) {
    this.eventId = pick(rng, STREET_EVENT_IDS);
    const ev = STREET_EVENTS[this.eventId];
    // Stand on the free street tile closest to the middle of the map (maps are not rectangles).
    const g = this.room.template.grid, cx = g[0].length / 2, cy = g.length / 2;
    const start = { x: Math.floor(this.built.start.x / TILE), y: Math.floor(this.built.start.y / TILE) };
    let best = { x: Math.floor(cx), y: Math.floor(cy) }, bestD = Infinity;
    g.forEach((row, ty) => [...row].forEach((ch, tx) => {
      if (ch !== '.' || this.navBlocked.has(`${tx},${ty}`) || this.blockedTiles.has(`${tx},${ty}`) || g[ty - 1]?.[tx] === 'D') return;
      if (Math.abs(tx - start.x) + Math.abs(ty - start.y) < 3) return;
      const d = Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy);
      if (d < bestD) { bestD = d; best = { x: tx, y: ty }; }
    }));
    const x = best.x * TILE + TILE / 2, y = best.y * TILE + TILE / 2;
    this.eventNpc = new Npc(this, x, y, ev.look, 'idle', new Phaser.Geom.Rectangle(x, y, 1, 1), { name: ev.name });
    this.physics.add.collider(this.player, this.eventNpc);
    this.add.image(x, y + 6, 'glow').setTint(ev.color).setAlpha(0.45).setScale(1.6, 0.8).setBlendMode(Phaser.BlendModes.ADD).setDepth(3);
    this.eventPrompt = txt(this, x, y - 22, '', 7, '#e8e8ff').setOrigin(0.5).setDepth(50).setStroke('#05030f', 3);
    audio.setIntensity(0);
    this.time.delayedCall(300, () => this.unlockDoors());
  }

  private updateEvent() {
    const npc = this.eventNpc;
    if (!npc) return;
    npc.tick(this.simNow);
    const near = !this.eventDone && Phaser.Math.Distance.Between(npc.x, npc.y, this.player.x, this.player.y) < 30;
    this.eventPrompt?.setText(near ? `[E] Parler à ${STREET_EVENTS[this.eventId!].name}` : '');
    if (near && this.controls.interact()) this.openEvent();
  }

  private openEvent() {
    const id = this.eventId!, ev = STREET_EVENTS[id];
    this.physics.pause();
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    audio.sfx('talk');
    this.panel = new ChoicePanel(this, this.controls, ev.name, eventLine(id, Math.random), eventOptions(id, this.eventCtx()), () => {
      this.panel = undefined;
      this.eventDone = true;
      this.physics.resume();
    }, ev.color);
  }

  private eventCtx(): EventCtx {
    const say = (msg: string, color = '#e8e8ff') => {
      const t = this.screenText(msg, 10, color, 90);
      this.tweens.add({ targets: t, alpha: 0, y: 76, delay: 900, duration: 500, onComplete: () => t.destroy() });
    };
    return {
      rng: Math.random,
      credits: () => this.run.creditsEarned,
      spend: n => { this.run.creditsEarned = Math.max(0, this.run.creditsEarned - n); audio.sfx('buy'); },
      gain: n => { this.run.creditsEarned += n; audio.sfx('credit'); },
      hp: () => this.player.hp,
      hurt: n => { this.player.hp = this.run.hp = Math.max(1, this.player.hp - n); audio.sfx('hurt'); this.cameras.main.flash(120, 255, 40, 40); },
      healFraction: f => { const g = this.heal(this.stats.maxHp * f); say(`+${Math.round(g)} PV`, '#39ff88'); audio.sfx('heal'); },
      addPsy: n => this.addPsy(n),
      addBlocker: () => { this.run.blockers++; },
      implants: opts => {
        const options: Offer[] = opts === 'black'
          ? IMPLANTS.filter(i => i.rarity === 'black' && !this.run.implants.some(o => o.id === i.id)).slice(0, 3).map(i => ({ implant: i, level: 1, upgrade: false }))
          : offerImplants(Math.random, this.run.implants, this.run.roomIndex, opts);
        if (options.length) this.openImplantChoice(options, () => this.physics.resume(), opts === 'black' ? 'MARCHÉ NOIR — UNE GREFFE, UN PRIX' : 'GREFFE DE RUE — CHOISIS UN IMPLANT');
      },
      relicLeft: () => (this.relicsLeft().length ? this.relicsLeft()[0] : undefined),
      giveRelic: r => this.grantRelic(r),
      canUpgrade: () => this.run.implants.some(canUpgrade),
      upgradeRandom: () => {
        const list = this.run.implants.filter(canUpgrade);
        if (!list.length) return undefined;
        const imp = pick(Math.random, list);
        this.run.implants = this.run.implants.map(i => (i.id === imp.id ? { ...i, level: (i.level ?? 1) + 1 } : i));
        this.refreshStats();
        audio.sfx('implant');
        return imp.name;
      },
      sign: c => { this.run.contract = { ...c }; },
      say,
    };
  }

  /** Recompute stats after the build changed, keeping the HP gained from a higher max. */
  private refreshStats() {
    const before = this.stats.maxHp, next = this.computeStats();
    this.player.hp = this.run.hp = Math.min(next.maxHp, this.player.hp + Math.max(0, next.maxHp - before));
    this.stats = next;
    this.player.setStats(next);
  }

  /** Explosive elite: a short warning ring, then a blast. */
  private eliteBlast(x: number, y: number) {
    const ring = this.add.circle(x, y, 30).setStrokeStyle(2, COLORS.yellow).setFillStyle(COLORS.yellow, 0.1).setScale(0.2).setDepth(6);
    this.tweens.add({ targets: ring, scale: 1, duration: 450, onComplete: () => {
      ring.destroy();
      if (this.ending) return;
      sparks(this, x, y, COLORS.yellow, 14, 30);
      audio.sfx('explode', { vol: 0.7 });
      this.cameras.main.shake(120, 0.006);
      if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 32) this.player.receiveHit(12, this.simNow, x, y);
    } });
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
    const real = Math.min(delta, CONFIG.MAX_DT_MS);
    this.rain.update(real);
    this.lighting.update(time, real);
    // Keep time scales moving while the run ends, or a freeze at the killing blow would never thaw.
    if (this.ending) { this.applyTimeScale(time); return; }
    if (this.choice) { this.choice.tick(); this.publishHud(); return; }
    if (this.panel) { this.panel.tick(); this.publishHud(); return; }
    this.run.timeMs += real;
    const dt = real * this.applyTimeScale(time);
    this.simNow += dt;
    const now = this.simNow;

    const tier = psyTier(this.run.psy);
    this.player.speedMult = crisisMultipliers(tier).speed;
    this.player.tick(now);
    this.updateFlow(now);
    if (dt > 0) {
      this.enemies.getChildren().forEach(e => (e as Enemy).tick(now));
      this.separateEnemies();
    }
    this.magnetPickups();
    this.dashCuts();
    this.updateEvent();
    this.bossPhases();
    if (this.roomActive) this.tally.timeMs += real;
    this.followCamera(real);

    if (this.roomActive) {
      this.run.psy = tickPsychosis(this.run.psy, totalLoad(this.run.implants, this.stats), dt, this.stats.psyResist, this.stats.psyRateMult);
      const drain = hpDrainPerSec(tier) * dt / 1000;
      if (drain > 0 && this.player.hp - drain <= 0) this.run.killer = 'psychosis';
      this.player.hp = Math.max(0, this.player.hp - drain);
      // Death wins over a simultaneous room clear.
      if (this.player.hp <= 0) { this.endRun(false); return; }
      if (this.pendingSpawns === 0 && this.enemies.countActive() === 0) this.onWaveCleared();
    }

    if (this.controls.blocker() && this.run.blockers > 0) {
      this.run.blockers--;
      this.run.psy = applyBlocker(this.run.psy, this.stats.blockerAmount);
      audio.sfx('blocker');
      floatText(this, this.player.x, this.player.y - 14, `-${this.stats.blockerAmount} PSY`, '#39ff88', 8);
    }

    this.run.hp = this.player.hp;
    if (this.player.hp <= 0) this.endRun(false);
    this.publishHud();
  }

  // ---------- enemy navigation ----------

  /**
   * Soft crowd separation instead of rigid enemy-enemy collisions: overlapping enemies drift apart,
   * so two of them meeting in a narrow passage slide past each other instead of locking up.
   */
  private separateEnemies() {
    const list = this.enemies.getChildren() as Enemy[];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.dead || b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
      const min = a.def.radius + b.def.radius;
      if (d >= min) continue;
      const push = (min - d) * 0.25, ux = dx / d, uy = dy / d;
      a.setPosition(a.x - ux * push, a.y - uy * push);
      b.setPosition(b.x + ux * push, b.y + uy * push);
    }
  }

  /** Tranchant Cinétique: enemies you dash through take a cut, once per dash. */
  private dashCuts() {
    // Tranche-vent: the blade special cuts everything on its path once.
    if (this.player.isCutting(this.simNow)) {
      for (const obj of [...this.enemies.getChildren()]) {
        const e = obj as Enemy;
        if (e.dead || e.getData('windcut') === this.player.cutSerial) continue;
        if (Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) > e.def.radius + 14) continue;
        e.setData('windcut', this.player.cutSerial);
        this.strike(e, 1.6 * this.weapon.damageMult, 1.5);
        this.hitstop(40);
      }
    }
    if (this.stats.dashDamage <= 0 || !this.player.isDashing(this.simNow)) return;
    for (const obj of [...this.enemies.getChildren()]) {
      const e = obj as Enemy;
      if (e.dead || e.getData('dashCut') === this.player.dashSerial) continue;
      if (Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) > e.def.radius + 9) continue;
      e.setData('dashCut', this.player.dashSerial);
      const dmg = Math.round(this.stats.dashDamage);
      this.run.damageDealt += Math.min(dmg, Math.max(0, e.hp));
      e.takeHit(dmg, false, false, this.player.x, this.player.y, false);
      audio.sfx('hit', { pitch: 1.5 });
      this.hitstop(25);
    }
  }

  /** Coque Titan / Forteresse: melee attackers take damage back. */
  private thorns(e: Enemy) {
    if (this.stats.thorns <= 0 || e.dead) return;
    e.takeHit(Math.round(this.stats.thorns), false, false, this.player.x, this.player.y, false);
    sparks(this, e.x, e.y, COLORS.white, 6, 12);
  }

  /** Psychosis change from an effect (parry, crit, hit), kept inside 0-100. */
  private addPsy(v: number) {
    if (!v) return;
    this.run.psy = Math.min(100, Math.max(0, this.run.psy + (v > 0 ? v * (1 - this.stats.psyResist) : v)));
  }

  /** Heals from pickups, doors and sector regen go through the heal multiplier (Pacte de Sang). */
  private heal(amount: number, fromKill = false) {
    const before = this.player.hp;
    this.player.hp = this.run.hp = Math.min(this.stats.maxHp, before + amount * (fromKill ? 1 : this.stats.healMult));
    const gained = Math.max(0, this.player.hp - before);
    this.run.hpHealed += gained;
    return gained;
  }

  private passable = (tx: number, ty: number) => {
    const c = this.room.template.grid[ty]?.[tx];
    return (c === '.' || c === 'P') && !this.navBlocked.has(`${tx},${ty}`);
  };

  private updateFlow(time: number) {
    const t = this.playerTile(), key = `${t.x},${t.y}`;
    if (key === this.flowFrom && time < this.nextFlowAt) return;
    const g = this.room.template.grid;
    // The player's own tile is always a valid target, even if a prop sits on part of it.
    this.flow = buildFlowField((x, y) => (x === t.x && y === t.y) || this.passable(x, y), g[0].length, g.length, t);
    this.flowFrom = key;
    this.nextFlowAt = time + 300;
  }

  private steer(x: number, y: number): { x: number; y: number } | null {
    if (!this.flow) return null;
    const g = this.room.template.grid, t = this.playerTile(), w = g[0].length;
    const cur = { x: Math.floor(x / TILE), y: Math.floor(y / TILE) };
    const ok = (tx: number, ty: number) => (tx === t.x && ty === t.y) || this.passable(tx, ty);
    let step = nextStep(this.flow, w, g.length, cur, ok);
    if (!ok(cur.x, cur.y)) {
      // Pushed into an occupied tile (crate, bench…): leave it through a free side first, never diagonally past it.
      const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: cur.x + dx, y: cur.y + dy }))
        .filter(p => ok(p.x, p.y)).sort((a, b) => this.flow![a.y * w + a.x] - this.flow![b.y * w + b.x]);
      step = sides[0] ?? step;
    }
    if (!step) return null;
    const cx = step.x * TILE + TILE / 2 - x, cy = step.y * TILE + TILE / 2 - y, l = Math.hypot(cx, cy) || 1;
    return { x: cx / l, y: cy / l };
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
    const reach = () => reachableCount(this.passable, g[0].length, g.length, start);
    let reachable = reach();
    for (let i = 0; i < count && free.length; i++) {
      const t = free.splice(Math.floor(rng() * free.length), 1)[0];
      // Never wall off part of the map with a crate.
      this.navBlocked.add(`${t.x},${t.y}`);
      const after = reach();
      if (after < reachable - 1) { this.navBlocked.delete(`${t.x},${t.y}`); continue; }
      reachable = after;
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
    audio.sfx(hp > 0 ? 'hit' : 'break', { pitch: 1.4, vol: 0.6 });
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
    this.navBlocked.delete(`${Math.floor(b.x / TILE)},${Math.floor(b.y / TILE)}`);
    this.nextFlowAt = 0; // a path just opened
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
      audio.sfx('credit');
    } else if (loot.kind === 'heal') {
      const gained = this.heal(loot.amount);
      floatText(this, k.x, k.y - 6, `+${Math.round(gained)} PV`, '#39ff88', 7);
      audio.sfx('heal');
    } else if (loot.kind === 'relic') {
      this.grantRelic(k.getData('relic') as Relic);
      (k.getData('halo') as Phaser.GameObjects.Image | undefined)?.destroy();
    }
    k.destroy();
  }

  private grantRelic(relic: Relic) {
    this.run.relics.push(relic);
    this.refreshStats();
    this.cameras.main.flash(250, 255, 59, 59);
    audio.sfx('relic');
    const t = this.screenText(`${relic.name.toUpperCase()}\n${relic.description}`, 9, '#ff3b3b', 80);
    this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 500, onComplete: () => t.destroy() });
  }

  // ---------- combat ----------

  private onPlayerAttack(ev: AttackEvent) {
    const tier = psyTier(this.run.psy);
    // Hit-stop length grows with the weight of the blow: plain hit < crit < finisher < counter, +kill.
    let stop = 0, sound: 'hit' | 'crit' | null = null;
    for (const obj of [...this.enemies.getChildren()]) {
      const e = obj as Enemy;
      if (e.dead || Phaser.Math.Distance.Between(ev.x, ev.y, e.x, e.y) > ev.radius + e.def.radius) continue;
      const countered = e.consumeVulnerable();
      const { amount, crit } = computeHitDamage(this.stats, { countered, tier, roll: Math.random(), mult: ev.mult, psy: this.run.psy, hpRatio: this.player.hp / this.stats.maxHp });
      this.addPsy(this.stats.hitPsy + (crit ? this.stats.critPsy : 0));
      this.run.damageDealt += Math.min(amount, Math.max(0, e.hp));
      const finisher = ev.finisher;
      e.takeHit(amount, crit, countered, this.player.x, this.player.y, finisher, ev.knock);
      if (ev.daze && !e.dead) e.daze(this.simNow, ev.daze);
      if (countered || finisher) this.cameras.main.shake(70, 0.004);
      stop = Math.max(stop, countered ? 85 : finisher ? 55 : crit ? 45 : 28) + (e.dead ? 30 : 0);
      sound = crit || countered || sound === 'crit' ? 'crit' : 'hit';
    }
    if (stop) this.hitstop(stop);
    if (sound) audio.sfx(sound, { pitch: ev.finisher ? 0.85 : 1 });
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

  /** One weapon blow on an enemy (specials): damage with crits and psychosis bonuses, tracked. */
  private strike(e: Enemy, mult: number, knock = 1) {
    if (e.dead) return;
    const { amount, crit } = computeHitDamage(this.stats, { countered: e.consumeVulnerable(), tier: psyTier(this.run.psy), roll: Math.random(), mult, psy: this.run.psy, hpRatio: this.player.hp / this.stats.maxHp });
    this.run.damageDealt += Math.min(amount, Math.max(0, e.hp));
    e.takeHit(amount, crit, false, this.player.x, this.player.y, true, knock);
    audio.sfx(crit ? 'crit' : 'hit');
  }

  /** Every enemy (and breakable) within r of (x, y). */
  private aoe(x: number, y: number, r: number, mult: number, daze = 0) {
    for (const obj of [...this.enemies.getChildren()]) {
      const e = obj as Enemy;
      if (e.dead || Phaser.Math.Distance.Between(x, y, e.x, e.y) > r + e.def.radius) continue;
      this.strike(e, mult, 1.4);
      if (daze && !e.dead) e.daze(this.simNow, daze);
    }
    for (const obj of [...this.breakables.getChildren()]) {
      const b = obj as Phaser.Physics.Arcade.Image;
      if (Phaser.Math.Distance.Between(x, y, b.x, b.y) <= r + 10) this.damageBreakable(b, this.stats.damage * mult);
    }
  }

  private ring(x: number, y: number, r: number, color: number) {
    const c = this.add.circle(x, y, r).setStrokeStyle(3, color).setFillStyle(color, 0.12).setScale(0.2).setDepth(40);
    this.tweens.add({ targets: c, scale: 1, alpha: 0, duration: 280, onComplete: () => c.destroy() });
  }

  private onShoot(ev: ShootEvent) {
    this.bullets.fire(ev.x, ev.y, ev.angle, ev.speed, this.stats.damage * ev.mult, 'player', { key: ev.charged ? 'bullet-gold' : 'bullet-player' });
    const fl = this.add.image(ev.x, ev.y, 'glow').setTint(COLORS.yellow).setScale(ev.charged ? 0.5 : 0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(30);
    this.tweens.add({ targets: fl, alpha: 0, duration: 90, onComplete: () => fl.destroy() });
  }

  /** Weapon specials (E / Shift). Tranche-vent and the leap's flight are handled by the player itself. */
  private onSpecial(ev: SpecialEvent) {
    const W = this.weapon;
    if (ev.id === 'leap-land') {
      this.aoe(ev.x, ev.y, 40, 2 * W.damageMult);
      this.ring(ev.x, ev.y, 40, COLORS.magenta);
      this.cameras.main.shake(140, 0.007);
      audio.sfx('quake', { vol: 0.6, pitch: 1.4 });
      this.hitstop(60);
    } else if (ev.id === 'shockwave') {
      this.aoe(ev.x, ev.y, 62, 1.5, 900);
      this.ring(ev.x, ev.y, 62, COLORS.white);
      sparks(this, ev.x, ev.y, COLORS.white, 16, 50);
      this.cameras.main.shake(200, 0.01);
      audio.sfx('quake');
      this.hitstop(80);
    } else if (ev.id === 'garrote') {
      const g = this.add.graphics().setDepth(39);
      for (const obj of [...this.enemies.getChildren()]) {
        const e = obj as Enemy;
        const d = Phaser.Math.Distance.Between(ev.x, ev.y, e.x, e.y);
        if (e.dead || d > 110) continue;
        g.lineStyle(1, COLORS.cyan, 0.9).lineBetween(ev.x, ev.y, e.x, e.y);
        e.yank((ev.x - e.x) * 4, (ev.y - e.y) * 4, 200);
        this.strike(e, 0.8 * W.damageMult, 0);
        if (!e.dead) e.daze(this.simNow, 600);
      }
      this.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
      audio.sfx('hack', { pitch: 0.6 });
    } else if (ev.id === 'volley') {
      const base = Math.atan2(ev.dirY, ev.dirX);
      for (let i = 0; i < 7; i++) this.bullets.fire(ev.x + ev.dirX * 8, ev.y + ev.dirY * 8, base - 0.45 + i * 0.15, 360, this.stats.damage * 0.7, 'player', { key: 'bullet-player' });
      audio.sfx('playerShoot', { pitch: 0.6 });
      this.cameras.main.shake(80, 0.004);
    } else if (ev.id === 'windcut') {
      const t = this.add.image(ev.x, ev.y, 'slash').setRotation(Math.atan2(ev.dirY, ev.dirX)).setScale(2.4, 0.8).setTint(COLORS.cyan).setDepth(12).setAlpha(0.8);
      this.tweens.add({ targets: t, x: ev.x + ev.dirX * 80, y: ev.y + ev.dirY * 80, alpha: 0, duration: 200, onComplete: () => t.destroy() });
    }
  }

  private bulletHitsPlayer(b: Phaser.Physics.Arcade.Image) {
    if (!b.active || b.getData('owner') !== 'enemy') return;
    const res = this.player.receiveHit(b.getData('damage'), this.simNow, b.x, b.y);
    if (res === 'parried') this.bullets.reflect(b);
    else if (res === 'hit') {
      if (b.getData('from')) this.run.killer = b.getData('from') as string;
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
    audio.sfx('hit', { pitch: 1.3, vol: 0.7 });
    this.hitstop(e.dead ? 40 : 18);
    b.destroy();
  }

  /** Perfect parry: a freeze, then slow motion, a shock ring and a chromatic flash on the HUD. */
  private onParry(x: number, y: number) {
    audio.sfx('parry');
    if (this.stats.parryPsy) {
      this.addPsy(this.stats.parryPsy);
      floatText(this, this.player.x, this.player.y - 18, `${this.stats.parryPsy > 0 ? '+' : ''}${this.stats.parryPsy} PSY`, '#39ff88', 7);
    }
    this.hitstop(70);
    this.slowmo(380, 0.3);
    this.registry.set('parryAt', this.game.loop.time);
    this.tally.parries++;
    const ring = this.add.circle(x, y, 6).setStrokeStyle(2, COLORS.cyan).setDepth(40);
    this.tweens.add({ targets: ring, scale: 5, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
  }

  private onHurt() {
    this.hitstop(60);
    this.tally.hitsTaken++;
    this.registry.set('hurtAt', this.game.loop.time);
  }

  // ---------- room flow ----------

  private playerTile() { return { x: Math.floor(this.player.x / TILE), y: Math.floor(this.player.y / TILE) }; }

  private spawnWave() {
    const ids = this.room.waves[this.waveIndex];
    audio.setIntensity(1);
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
        audio.sfx('spawn');
        if (e.def.behavior === 'boss') {
          this.boss = e; audio.sfx('bossRoar'); this.cameras.main.shake(500, 0.006);
          if (e.def.id === 'warden' || e.def.id === 'boss') this.time.delayedCall(700, () => this.bossSay(e, bossIntro(e.def.id as 'warden' | 'boss', this.meta)));
        }
      });
    });
  }

  /** A floor point away from the player's current position. */
  private freePoint() {
    return spawnPoints(this.room.template, 1, this.playerTile(), Math.random, this.blockedTiles)[0];
  }

  private spawnEnemy(id: EnemyId, x: number, y: number): Enemy {
    const h = heatEffects(this.run.heat), boss = ENEMIES[id].behavior === 'boss';
    const e = new Enemy(this, x, y, ENEMIES[id], this.hooks, {
      elite: boss ? undefined : this.room.elite,
      hpMult: h.hpMult * (boss ? h.bossHpMult : 1), damageMult: h.damageMult,
      speedMult: h.speedMult * (boss ? h.bossSpeedMult : 1), telegraphMult: h.telegraphMult,
    });
    this.enemies.add(e);
    sparks(this, x, y, COLORS.magenta, 6, 12);
    return e;
  }

  /** A boss line on screen, under its health bar. */
  private bossSay(_e: Enemy, line: string) {
    // One line at a time: a new one replaces whatever the boss was saying.
    this.bossLine?.destroy();
    const t = this.screenText(`« ${line} »`, 8, '#ff2a6d', 52);
    this.bossLine = t;
    audio.sfx('talk', { pitch: 0.55 });
    this.tweens.add({ targets: t, alpha: 0, delay: 2600, duration: 500, onComplete: () => { t.destroy(); if (this.bossLine === t) this.bossLine = undefined; } });
  }

  /** Bosses speak up when they change phase. */
  private bossPhases() {
    const b = this.boss;
    if (!b || b.dead || (b.def.id !== 'warden' && b.def.id !== 'boss')) return;
    const phase = b.frenzy ? 2 : b.enraged ? 1 : 0;
    if (phase <= this.bossPhase) return;
    this.bossPhase = phase;
    const l = BOSS_LINES[b.def.id as 'warden' | 'boss'];
    this.bossSay(b, phase === 2 ? l.frenzy : l.enraged);
  }

  private onEnemyDeath(e: Enemy) {
    if (e === this.boss && (e.def.id === 'warden' || e.def.id === 'boss')) this.bossSay(e, BOSS_LINES[e.def.id as 'warden' | 'boss'].death);
    if (e === this.boss) this.boss = undefined;
    if (e.exploded) return; // blew itself up: no kill, no credits
    this.run.kills++;
    this.run.killsByType[e.def.id] = (this.run.killsByType[e.def.id] ?? 0) + 1;
    this.run.psy = psyOnKill(this.run.psy, this.stats.psyResist);
    // Lifesteal implants, and the cyberpsycho's trade: in crisis every kill patches you up.
    const leech = this.stats.killHeal + (psyTier(this.run.psy) === 'crisis' ? CONFIG.CRISIS_KILL_HEAL : 0);
    if (leech > 0) {
      const g = this.heal(leech, true);
      if (g >= 1) floatText(this, this.player.x + 8, this.player.y - 12, `+${Math.round(g)}`, '#39ff88', 6);
    }
    const gain = Math.round(e.def.credits * this.stats.creditMult);
    this.run.creditsEarned += gain;
    if (gain) floatText(this, e.x, e.y - 4, `+${gain}¢`, '#f5e663', 7);
    // Bosses always leave something behind, and go down in slow motion.
    if (e.def.behavior === 'boss') {
      for (let i = 0; i < 3; i++) this.dropLoot(e.x + (i - 1) * 12, e.y);
      audio.sfx('explode');
      this.hitstop(160);
      this.slowmo(1400, 0.25);
    }
  }

  private onWaveCleared() {
    this.waveIndex++;
    if (this.waveIndex < this.room.waves.length) { this.spawnWave(); return; }
    this.roomActive = false;
    this.bullets.group.clear(true, true);
    audio.setIntensity(0.2);
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
      const gained = this.heal(this.stats.maxHp * this.stats.regenOnClear);
      floatText(this, this.player.x, this.player.y - 14, `+${Math.round(gained)} PV`, '#39ff88', 8);
    }
    // Extra rewards first (elite loot, contract bounty), then the exits open.
    const steps: ((next: () => void) => void)[] = [];
    const ri = this.run.roomIndex;
    if (this.room.elite) {
      this.run.creditsEarned += Math.round(15 * this.stats.creditMult);
      steps.push(next => this.openImplantChoice(offerImplants(createRng(this.run.seed + ri * 29), this.run.implants, ri, { minRarity: ri >= 6 ? 'epic' : 'rare' }),
        () => { this.physics.resume(); next(); }, 'BUTIN D\'ÉLITE — CHOISIS UN IMPLANT'));
    }
    const c = this.run.contract;
    if (c && c.room === ri) {
      this.run.contract = undefined;
      const ok = contractMet(c, this.tally);
      steps.push(next => {
        const t = this.screenText(ok ? 'CONTRAT REMPLI — PRIME VERSÉE' : 'CONTRAT ÉCHOUÉ', 11, ok ? '#f5e663' : '#ff2a6d', 80);
        this.tweens.add({ targets: t, alpha: 0, delay: 1200, duration: 500, onComplete: () => t.destroy() });
        audio.sfx(ok ? 'buy' : 'deny');
        if (!ok) { next(); return; }
        if (c.reward === 'credits') { this.run.creditsEarned += Math.round(c.amount * this.stats.creditMult); next(); return; }
        this.time.delayedCall(700, () => this.openImplantChoice(offerImplants(Math.random, this.run.implants, ri, { minRarity: c.reward === 'implant-epic' ? 'epic' : 'rare' }),
          () => { this.physics.resume(); next(); }, 'PRIME DU FIXER — CHOISIS UN IMPLANT'));
      });
    }
    const runSteps = (i: number) => (i < steps.length ? steps[i](() => runSteps(i + 1)) : this.unlockDoors());
    runSteps(0);
  }

  private unlockDoors() {
    this.built.doorSlots.forEach((slot, i) => {
      const reward = this.room.doorRewards[i];
      slot.locked.destroy();
      const door = this.physics.add.staticImage(slot.x, slot.y, 'door');
      const fam = this.room.doorFamilies[i];
      const icon = this.add.image(slot.x, slot.y + 2, REWARD_ICON[reward]).setDepth(20);
      if (reward === 'implant') icon.setTint(Phaser.Display.Color.HexStringToColor(FAMILY_COLORS[fam]).color);
      this.tweens.add({ targets: icon, y: slot.y - 2, yoyo: true, repeat: -1, duration: 500 });
      this.add.image(slot.x, slot.y + 20, 'glow').setTint(COLORS.cyan).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(1);
      // Say what is behind the door, so picking an exit is a choice of route.
      const label = reward === 'implant' ? `IMPLANT ${FAMILY_NAMES[fam]}` : DOOR_LABELS[reward];
      const color = reward === 'implant' ? FAMILY_COLORS[fam] : '#e8e8ff';
      txt(this, slot.x, slot.y + 22, label, 5, color).setOrigin(0.5).setDepth(21).setStroke('#05030f', 3);
      this.physics.add.overlap(this.player, door, () => this.takeDoor(reward, fam));
    });
    audio.sfx('door');
  }

  private takeDoor(reward: Reward, family?: import('../core/types').Family) {
    if (this.leaving) return;
    this.leaving = true;
    audio.sfx('door', { pitch: 1.3 });
    const ri = this.run.roomIndex;
    if (reward === 'implant') {
      const options = offerImplants(createRng(this.run.seed + ri * 13), this.run.implants, ri, { family, allowBlack: ri >= 2 });
      if (options.length) {
        this.openImplantChoice(options, () => this.nextRoom());
        return;
      }
      reward = 'credits';
    }
    if (reward === 'credits') this.run.creditsEarned += Math.round((8 + ri * 2) * this.stats.creditMult);
    if (reward === 'heal') {
      const gained = this.heal(this.stats.maxHp * CONFIG.HEAL_FRACTION);
      floatText(this, this.player.x, this.player.y - 14, `+${Math.round(gained)} PV`, '#39ff88', 9);
      audio.sfx('heal');
    }
    if (reward === 'chest') {
      this.run.creditsEarned += Math.round((5 + ri * 2) * this.stats.creditMult);
      if (Math.random() < 0.5) this.run.blockers++;
    }
    // Route doors change what the next sector is.
    const next = this.run.rooms[ri + 1];
    if (next && !next.isBoss && reward === 'event') this.run.rooms[ri + 1] = makeEvent(next);
    if (next && !next.isBoss && reward === 'elite') this.run.rooms[ri + 1] = makeElite(next, createRng(this.run.seed + ri * 37));
    this.nextRoom();
  }

  /** Implant cards; `then` runs once one is taken. */
  private openImplantChoice(options: import('../core/implantOffer').Offer[], then: () => void, title?: string) {
    this.physics.pause();
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    audio.sfx('uiOpen');
    this.choice = new ImplantChoice(this, options, this.controls, this.run.implants, o => {
      audio.sfx('implant');
      const before = this.stats.maxHp;
      const had = new Set(activeSynergies(this.run.implants).map(a => `${a.synergy}${a.tier}`));
      this.run.implants = applyOffer(this.run.implants, o);
      const next = this.computeStats();
      // Set the live HP: update() copies player.hp into run.hp every frame.
      this.player.hp = this.run.hp = Math.min(next.maxHp, this.player.hp + Math.max(0, next.maxHp - before));
      this.stats = next;
      this.player.setStats(next);
      // A new synergy tier is a moment: announce it.
      const fresh = activeSynergies(this.run.implants).filter(a => !had.has(`${a.synergy}${a.tier}`));
      this.choice = undefined;
      if (fresh.length) {
        const t = SYNERGIES[fresh[0].synergy].tiers[fresh[0].tier];
        const msg = this.screenText(`SYNERGIE ${FAMILY_NAMES[fresh[0].synergy]} — ${t.name.toUpperCase()}\n${t.description}`, 9, FAMILY_COLORS[fresh[0].synergy], 90);
        audio.sfx('relic');
        this.time.delayedCall(1300, () => { msg.destroy(); then(); });
      } else then();
    }, title);
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
    if (!victory) { this.player.collapse(); audio.sfx('kill', { pitch: 0.5 }); audio.setMusic('off'); }
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
    // Notoriety pays: +10 % per point on everything, plus a one-off prize for a new record.
    const pts = this.run.heatPoints;
    const record = victory && !this.run.daily ? heatRecordBonus(pts, save.bestHeat) : 0;
    const earned = Math.round((this.run.creditsEarned + bonus) * heatCreditMult(pts)) + record;
    const sector = this.run.roomIndex + 1;
    save.credits += earned;
    save.runs += 1;
    save.bestRoom = Math.max(save.bestRoom, sector);
    if (victory && !this.run.daily) save.bestHeat = Math.max(save.bestHeat, pts);
    for (const [id, n] of Object.entries(this.run.killsByType)) save.codex[id] = (save.codex[id] ?? 0) + n;
    const killer = victory ? undefined : this.run.killer ?? 'psychosis';
    if (killer) save.deaths[killer] = (save.deaths[killer] ?? 0) + 1;
    save.story.lastRun = { victory, sector, killer, weapon: this.run.weapon, heat: pts };
    let dailyBest = false;
    if (this.run.daily) {
      const r = recordDaily(save.daily, { date: this.run.daily, sector, victory, timeMs: Math.round(this.run.timeMs), kills: this.run.kills });
      save.daily = r.list;
      dailyBest = r.best;
    }
    save.history = addRecord(save.history, {
      date: Date.now(), victory, sector, kills: this.run.kills,
      damageDealt: Math.round(this.run.damageDealt), hpHealed: Math.round(this.run.hpHealed), credits: earned, timeMs: Math.round(this.run.timeMs),
      weapon: this.run.weapon, heat: pts, daily: this.run.daily,
    });
    writeSave(storage, save);
    this.registry.remove('run');
    this.scene.stop(SCENES.Hud);
    this.scene.start(SCENES.Death, {
      victory, creditsEarned: earned, roomReached: sector, heat: pts, recordBonus: record, daily: this.run.daily, dailyBest,
      killer: killer === 'psychosis' ? 'la cyberpsychose' : killer ? ENEMIES[killer as EnemyId]?.name : undefined,
    });
  }

  private publishHud() {
    const hud: HudData = {
      hp: this.player.hp, maxHp: this.stats.maxHp, psy: this.run.psy, credits: this.run.creditsEarned,
      dash: this.player.dashCharges, dashMax: this.stats.dashCharges, blockers: this.run.blockers,
      room: this.run.roomIndex + 1, rooms: CONFIG.ROOMS_PER_RUN,
      implants: this.run.implants.map(i => i.name + (i.level && i.level > 1 ? ' ' + ['', 'I', 'II', 'III'][i.level] : '')), relics: this.run.relics.map(r => r.name),
      synergies: activeSynergies(this.run.implants).map(a => SYNERGIES[a.synergy].tiers[a.tier].name),
      psyBonus: psyBonusLabel(psyTier(this.run.psy)),
      notice: this.run.contract && this.run.contract.room === this.run.roomIndex ? contractProgress(this.run.contract, this.tally)
        : this.run.contract ? 'CONTRAT EN ATTENTE' : this.room.elite ? `ÉLITE — ${ELITE_LABELS[this.room.elite]}` : undefined,
      boss: this.boss && !this.boss.dead ? { hp: this.boss.hp, max: this.boss.maxHp, name: this.boss.def.name } : undefined,
      special: { name: this.weapon.special.name, charge: this.player.specialCharge(this.simNow) },
      weapon: this.weapon.name,
      tag: [this.run.daily ? 'RUN DU JOUR' : '', this.run.heatPoints ? `NOTORIÉTÉ ${this.run.heatPoints}` : ''].filter(Boolean).join(' · '),
    };
    this.registry.set('hud', hud);
  }
}
