import Phaser from 'phaser';
import { CONFIG, COLORS, SCENES } from '../config';
import { addRecord } from '../core/history';
import { rollLoot } from '../core/loot';
import { addPsy, applyBlocker, hpDrainPerTurn, psyDamageMult, psyOnKill, psyOnTurn, psyTier } from '../core/psychosis';
import { makeElite, makeEvent, type EliteMod, type Reward, type RoomPlan } from '../core/runMap';
import { createRng, pick, type Rng } from '../core/rng';
import { loadSave, writeSave, type SaveData } from '../core/save';
import { computeStats, grantedSpells, synergyBonus, totalLoad } from '../core/stats';
import { RELIC_RARITY_NAMES, applyRelicSpells, offerRelics, relicHooks, relicPool } from '../core/relics';
import { getStorage } from '../core/storage';
import type { Family, Relic, Stats } from '../core/types';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { FAMILY_COLORS, FAMILY_NAMES, IMPLANTS, canUpgrade } from '../data/implants';
import { SYNERGIES, activeSynergies } from '../data/synergies';
import { applyOffer, offerImplants, type Offer } from '../core/implantOffer';
import { RELICS } from '../data/relics';
import { ASPECT_BY_ID, aspectRank, defaultAspect, equip } from '../data/aspects';
import { heatCreditMult, heatEffects, heatRecordBonus } from '../data/heat';
import { dailySeed, dateKey, recordDaily } from '../core/daily';
import { bossIntro } from '../core/story';
import { BOSS_LINES } from '../data/story';
import { spell } from '../data/spells';
import { WEAPONS } from '../data/weapons';
import { audio } from '../audio/audio';
import { floatText, sparks } from '../fx/effects';
import { AnimeFx } from '../fx/animeFx';
import { Controls } from '../input/controls';
import { getRun, newRun, setRun, type HudData, type RunState } from '../systems/runState';
import { ImplantChoice } from '../ui/ImplantChoice';
import { ChoicePanel } from '../ui/ChoicePanel';
import { STREET_EVENTS, STREET_EVENT_IDS, eventLine, eventOptions, type EventCtx, type StreetEventId } from '../systems/streetEvents';
import { contractMet, contractProgress, type SectorTally } from '../core/contract';
import { setupCamera } from '../ui/camera';
import { HelpOverlay } from '../ui/HelpOverlay';
import { txt } from '../ui/text';
import { hideLoading, showLoading, wipeTo } from '../ui/transition';
import { DIRS, dist, keyOf, pathTo, reachable, same, walkable } from '../tactics/board';
import { generateArena, type ArenaStyle, type BreakableKind } from '../tactics/arena';
import {
  BLOCKER_PA, addUnits, beginFight, byUid, cast, castError, createFight, current, endTurn, exitTax, moveTo, previewCast,
  rangeCells, reachFor, unitAt, zoneCells, type Fight,
} from '../tactics/fight';
import { nextAction } from '../tactics/ai';
import { makeBreakable, makeEnemy, makePlayer, makeSummon, type EnemyScaling } from '../tactics/units';
import type { Board, FightEvent, Pt, SpellDef, Unit } from '../tactics/types';
import { UnitView3D as UnitView } from '../three/UnitView3D';
import { stage, environment, showStage, stageOpacity, fadeVisibility } from '../three/stage';
import type { World3D } from '../three/World3D';
import { BAR_H, TacticalUi } from './run/TacticalUi';

export const HUD_H = 14;

const REWARD_ICON: Record<Reward, string> = { implant: 'implant-pickup', credits: 'credit', heal: 'heal', chest: 'chest', event: 'icon-event', elite: 'icon-elite' };
const DOOR_LABELS: Record<Reward, string> = { implant: 'IMPLANT', credits: 'CRÉDITS', heal: 'SOIN', chest: 'COFFRE', event: 'RENCONTRE', elite: 'ÉLITE ★' };
const ELITE_LABELS: Record<EliteMod, string> = { shield: 'BOUCLIERS', explosive: 'EXPLOSIFS', cloak: 'CAMOUFLÉS', frenzy: 'ENRAGÉS' };

const STYLE_BY_TEMPLATE: Record<string, ArenaStyle> = {
  avenue: 'avenue', alley: 'alley', market: 'market', crossroad: 'crossroad', parking: 'parking',
  plaza: 'plaza', warehouse: 'docks', 'boss-arena': 'checkpoint',
};
export const STREET_NAMES: Record<ArenaStyle, string[]> = {
  avenue: ['Avenue Kessler', 'Boulevard des Néons'], alley: ['Ruelle des Rats', 'Passage Sombre'],
  market: ['Marché de nuit', 'Bazar Sun-Lo'], crossroad: ['Carrefour Delta', 'Croisement 9'],
  parking: ['Parking Niveau -1', 'Parking Hoshi'], plaza: ['Place du Totem', 'Esplanade Vega'],
  docks: ['Docks Est', 'Zone industrielle'], checkpoint: ['Barrage Psy-Sec', 'Barrage Psy-Sec'],
};

const wait = (scene: Phaser.Scene, ms: number) => new Promise<void>(res => scene.time.delayedCall(ms, res));

/** Cells to light on the 3D ground; flushed to the world when they change. */
class CellLayer {
  cells: { p: Pt; color: number; alpha: number }[] = [];
  dirty = true;
  constructor(readonly name: string, readonly order: number) {}
  clear() { if (this.cells.length) { this.cells = []; this.dirty = true; } }
  add(p: Pt, color: number, alpha: number) { this.cells.push({ p, color, alpha }); this.dirty = true; }
}

type Mode = 'explore' | 'placement' | 'input' | 'busy' | 'ai' | 'done';

/**
 * A sector of the run, on an isometric board. Outside fights you walk by clicking (event NPC, exits).
 * A fight starts with the placement phase, then turns follow the initiative order: your turn waits
 * for your clicks, enemy turns are played by the AI and animated event by event.
 */
export class RunScene extends Phaser.Scene {
  private run!: RunState;
  private room!: RoomPlan;
  private stats!: Stats;
  private spells: SpellDef[] = [];
  private controls!: Controls;
  private board!: Board;
  private world!: World3D;
  private fx!: AnimeFx;
  private ready = false;
  private markLayer!: CellLayer;
  private hero!: Unit;
  private units: Unit[] = [];
  private views = new Map<number, UnitView>();
  private fight?: Fight;
  private mode: Mode = 'explore';
  private ui!: TacticalUi;
  private overlay!: CellLayer;
  private hoverG!: CellLayer;
  private markers: Phaser.GameObjects.GameObject[] = [];
  private selected: number | null = null;
  private hoverCell?: Pt;
  private hoverSlot: number | null = null;
  private waveIndex = 0;
  private lastRound = 0;
  private choice?: ImplantChoice;
  private panel?: ChoicePanel;
  private help?: HelpOverlay;
  private eventId?: StreetEventId;
  private eventNpc?: Unit;
  private eventDone = false;
  private exitsOpen = false;
  private leaving = false;
  private ending = false;
  private tally: SectorTally = { hitsTaken: 0, rounds: 0, bestTurnKills: 0 };
  private turnKills = 0;
  private meta!: SaveData;
  private bossLine?: Phaser.GameObjects.Text;
  private uidSeq = 1000;

  constructor() { super(SCENES.Run); }

  init(data: { seed?: number; daily?: boolean }) {
    if (data?.seed !== undefined) {
      const sv = loadSave(getStorage());
      // The daily run is the same city for everyone today: fixed seed, mono-blade, no notoriety.
      if (data.daily) { const key = dateKey(); setRun(this.registry, newRun(dailySeed(key), sv.ownedNodes, 'blade', { daily: key })); }
      else {
        const aspect = sv.aspect[sv.weapon] ?? defaultAspect(sv.weapon);
        setRun(this.registry, newRun(data.seed, sv.ownedNodes, sv.weapon, { heat: sv.heat, aspect, aspectRank: aspectRank(sv.aspects, aspect) }));
      }
    }
    this.run = getRun(this.registry);
    this.units = [];
    this.views = new Map();
    this.fight = undefined;
    this.mode = 'explore';
    this.markers = [];
    this.tags = [];
    this.camKey = '';
    this.selected = null;
    this.hoverCell = undefined;
    this.hoverSlot = null;
    this.waveIndex = 0;
    this.lastRound = 0;
    this.choice = this.panel = undefined;
    this.eventId = this.eventNpc = undefined;
    this.eventDone = this.exitsOpen = this.leaving = this.ending = false;
    this.tally = { hitsTaken: 0, rounds: 0, bestTurnKills: 0 };
    this.turnKills = 0;
    this.meta = loadSave(getStorage());
    this.bossLine = undefined;
  }

  /** Stats and spell bar of the run: skill nodes, implants, synergies, relics, weapon and aspect, notoriety. */
  private build() {
    const geared = equip(this.run.weapon, computeStats(this.run.implants, this.run.ownedNodes, this.run.relics), this.run.aspect, this.run.aspectRank);
    const h = heatEffects(this.run.heat);
    this.stats = { ...geared.stats, healMult: geared.stats.healMult * h.healMult, psyRateMult: geared.stats.psyRateMult * h.psyRateMult };
    this.spells = applyRelicSpells([...geared.spells, ...grantedSpells(this.run.implants, this.run.relics).map(spell), spell('overheat'), spell('blocker')], this.run.relics);
  }

  create() {
    setupCamera(this, 0).fadeIn(220, 11, 8, 32);
    this.room = this.run.rooms[this.run.roomIndex];
    const style = STYLE_BY_TEMPLATE[this.room.template.id] ?? 'avenue';
    const rng = createRng(this.run.seed * 31 + this.run.roomIndex * 7919);
    const event = this.room.kind === 'event';
    const arena = generateArena(style, rng, this.room.isBoss && !this.room.doorRewards.length ? 0 : this.room.doorRewards.length, this.room.isBoss);
    this.board = arena.board;
    this.build();
    this.controls = new Controls(this);

    // The street in 3D, under the interface: Phaser keeps the bar, the texts and the windows.
    this.ready = false;
    this.world = stage(this.game.canvas);
    this.fx = new AnimeFx(this, this.world);
    showStage(true, this.game.canvas);
    this.overlay = new CellLayer('range', 0);
    this.hoverG = new CellLayer('hover', 1);
    this.markLayer = new CellLayer('marks', 0);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.views.forEach(v => v.destroy());
      for (const l of ['range', 'hover', 'marks']) this.world.setOverlay(l, []);
      showStage(false);
    });
    showLoading(this, 'CHARGEMENT DU SECTEUR');

    this.hero = makePlayer(this.stats, this.spells, this.run.hp, this.board.playerStarts[0]);
    this.hero.uid = 1;

    this.ui = new TacticalUi(this, {
      selectSpell: i => this.selectSpell(i),
      endTurn: () => this.onConfirm(),
      hoverSpell: i => { this.hoverSlot = i; this.refreshUi(); },
    });
    this.help = new HelpOverlay(this, CONFIG.WIDTH - 12, HUD_H + 40, 'run');

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (!this.ready || this.modal()) return;
      this.world.zoomAt(dy < 0 ? 1.15 : 1 / 1.15, p.x, p.y, CONFIG.WIDTH * CONFIG.ZOOM, CONFIG.HEIGHT * CONFIG.ZOOM);
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    if (!this.scene.isActive(SCENES.Hud)) this.scene.launch(SCENES.Hud);
    audio.setMusic(this.room.isBoss ? 'boss' : 'run');
    audio.setIntensity(event ? 0 : 0.4);

    const streetName = STREET_NAMES[style][this.run.roomIndex % 2];
    if (this.run.contract && !event && !this.room.isBoss && this.run.contract.room === undefined) this.run.contract.room = this.run.roomIndex;
    const label = this.room.isBoss ? 'ALERTE — CIBLE PRIORITAIRE' : event ? `${STREET_EVENTS[pick(createRng(this.run.seed + this.run.roomIndex), STREET_EVENT_IDS)].banner}\n${streetName.toUpperCase()}`
      : `SECTEUR ${this.run.roomIndex + 1} / ${CONFIG.ROOMS_PER_RUN}\n${streetName.toUpperCase()}`;
    const sub = this.room.elite ? `\n★ SECTEUR ÉLITE — ${ELITE_LABELS[this.room.elite]} ★` : '';
    const banner = this.screenText(label + sub, 12, this.room.isBoss || this.room.elite ? '#ff2a6d' : event ? '#f5e663' : '#00f0ff', 100);
    // Shown once the loading cover lifts, so it is not lost under it.
    banner.setAlpha(0);
    const showBanner = () => this.tweens.chain({ targets: banner, tweens: [{ alpha: 1, duration: 150 }, { alpha: 0, delay: 1300, duration: 400 }], onComplete: () => banner.destroy() });
    if (this.room.elite) audio.sfx('elite');

    void environment(this.world).then(() => this.world.buildBoard(this.board, this.run.seed + this.run.roomIndex * 97)).then(() => {
      if (!this.scene.isActive()) return;
      this.world.frameBoard(CONFIG.WIDTH * CONFIG.ZOOM, CONFIG.HEIGHT * CONFIG.ZOOM, 1.5, (BAR_H - HUD_H) / 2 / CONFIG.HEIGHT);
      hideLoading();
      this.time.delayedCall(250, showBanner);
      this.addUnit(this.hero);
      if (event) this.setupEvent(createRng(this.run.seed + this.run.roomIndex));
      else this.setupFight(arena.breakables, rng);
      this.ready = true;
      this.refreshUi();
    });
  }

  // ---------- board helpers ----------

  /** Screen position (Phaser world units) of a cell's centre on the ground. */
  private centre(p: Pt) { return this.world.toScreen(this.world.cellPos(p), CONFIG.WIDTH, CONFIG.HEIGHT); }
  private cellAtPointer(p: Phaser.Input.Pointer): Pt | undefined {
    return this.ready ? this.world.pickCell(p.x, p.y, CONFIG.WIDTH * CONFIG.ZOOM, CONFIG.HEIGHT * CONFIG.ZOOM) : undefined;
  }
  private liveUnits() { return this.fight ? this.fight.units.filter(u => !u.dead) : this.units.filter(u => !u.dead); }
  private unitOn(p: Pt) { return this.fight ? unitAt(this.fight, p) : this.liveUnits().find(u => same(u, p)); }

  private addUnit(u: Unit, npcKey?: string) {
    if (!this.fight) this.units.push(u);
    const v = new UnitView(this, this.world, u, this.weaponArt(), npcKey);
    v.place(u);
    v.face(u.team === 0 ? { x: -1, y: 0 } : { x: 1, y: 0 });
    v.rest();
    this.views.set(u.uid, v);
    return v;
  }
  private weaponArt() { const w = this.run.weapon; return w === 'gorilla' ? 'fist' : w === 'pistol' ? 'gun' : w === 'blade' ? (this.stats.range > 0 && this.run.relics.some(r => r.id === 'katana') ? 'red' : 'blade') : w; }

  /** Text fixed on screen (banners), regardless of the camera. */
  private screenText(s: string, size: number, color: string, y = 110) {
    return txt(this, CONFIG.WIDTH / 2, y, s, size, color).setOrigin(0.5).setAlign('center').setScrollFactor(0).setDepth(1100).setStroke('#05030f', 4);
  }

  // ---------- street events ----------

  private setupEvent(rng: Rng) {
    this.eventId = pick(rng, STREET_EVENT_IDS);
    const ev = STREET_EVENTS[this.eventId];
    const mid = { x: Math.floor(this.board.w / 2), y: Math.floor(this.board.h / 2) };
    const free = this.freeCells().sort((a, b) => dist(a, mid) - dist(b, mid));
    const at = free[0];
    const npc: Unit = { ...makeBreakable('crate', at), team: 2, kind: 'npc', name: ev.name, uid: 2 };
    this.eventNpc = npc;
    const v = this.addUnit(npc, ev.look);
    v.face({ x: 1, y: 0 });
    const c = this.centre(at);
    void c;
    this.markLayer.add(at, ev.color, 0.3);
    this.ui.setButton(null);
    this.time.delayedCall(300, () => this.openExits());
  }

  private openEvent() {
    if (!this.eventId || this.eventDone) return;
    const id = this.eventId, ev = STREET_EVENTS[id];
    audio.sfx('talk');
    this.panel = new ChoicePanel(this, this.controls, ev.name, eventLine(id, Math.random), eventOptions(id, this.eventCtx()), () => {
      this.panel = undefined;
      this.eventDone = true;
    }, ev.color);
  }

  private eventCtx(): EventCtx {
    const say = (msg: string, color = '#e8e8ff') => {
      const t = this.screenText(msg, 10, color, 90);
      this.tweens.add({ targets: t, alpha: 0, y: 76, delay: 900, duration: 500, onComplete: () => t.destroy() });
    };
    return {
      rng: Math.random,
      price: n => Math.max(1, Math.round(n * this.stats.priceMult)),
      credits: () => this.run.creditsEarned,
      spend: n => { this.run.creditsEarned = Math.max(0, this.run.creditsEarned - n); audio.sfx('buy'); },
      gain: n => { this.run.creditsEarned += n; audio.sfx('credit'); },
      hp: () => this.hero.hp,
      hurt: n => { this.hero.hp = this.run.hp = Math.max(1, this.hero.hp - n); audio.sfx('hurt'); this.cameras.main.flash(120, 255, 40, 40); },
      healFraction: f => { const g = this.heal(this.stats.maxHp * f); say(`+${Math.round(g)} PV`, '#39ff88'); audio.sfx('heal'); },
      addPsy: n => { this.run.psy = addPsy(this.run.psy, n, this.stats.psyResist); },
      addBlocker: () => { this.run.blockers++; },
      implants: opts => {
        const options: Offer[] = opts === 'black'
          ? IMPLANTS.filter(i => i.rarity === 'black' && !this.run.implants.some(o => o.id === i.id)).slice(0, 3).map(i => ({ implant: i, level: 1, upgrade: false }))
          : offerImplants(Math.random, this.run.implants, this.run.roomIndex, opts);
        if (options.length) this.time.delayedCall(10, () => this.openImplantChoice(options, () => undefined, opts === 'black' ? 'MARCHÉ NOIR — UNE GREFFE, UN PRIX' : 'GREFFE DE RUE — CHOISIS UN IMPLANT'));
      },
      relicLeft: () => offerRelics(Math.random, this.relicsLeft())[0],
      giveRelic: r => this.grantRelic(r),
      canUpgrade: () => this.run.implants.some(canUpgrade),
      upgradeRandom: () => {
        const list = this.run.implants.filter(canUpgrade);
        if (!list.length) return undefined;
        const imp = pick(Math.random, list);
        this.run.implants = this.run.implants.map(i => (i.id === imp.id ? { ...i, level: (i.level ?? 1) + 1 } : i));
        this.refreshBuild();
        audio.sfx('implant');
        return imp.name;
      },
      sign: c => { this.run.contract = { ...c }; },
      say,
    };
  }

  // ---------- fight setup ----------

  private scaling(boss: boolean): EnemyScaling {
    const h = heatEffects(this.run.heat), ri = this.run.roomIndex;
    return {
      hpMult: h.hpMult * (1 + CONFIG.DEPTH_HP * ri) * (boss ? h.bossHpMult : 1),
      dmgMult: h.damageMult * (1 + CONFIG.DEPTH_DAMAGE * ri) * (1 + this.stats.foeDamage),
      pmBonus: h.pmBonus, paBonus: boss ? h.bossPaBonus : 0, initBonus: h.initBonus, elite: this.room.elite,
    };
  }

  private freeCells(): Pt[] {
    const out: Pt[] = [];
    for (let y = 0; y < this.board.h; y++) for (let x = 0; x < this.board.w; x++) {
      const p = { x, y };
      if (walkable(this.board, p) && !this.unitOn(p)) out.push(p);
    }
    return out;
  }

  private setupFight(breakables: { at: Pt; kind: BreakableKind }[], rng: Rng) {
    for (const b of breakables) { const u = makeBreakable(b.kind, b.at); u.uid = this.uidSeq++; this.addUnit(u); }
    this.spawnWave(this.room.waves[0], rng, false);
    this.mode = 'placement';
    this.showStarts();
    this.ui.setButton('PRÊT');
    this.ui.say('Placement : clique une case bleue, puis PRÊT (Espace)', '#00f0ff');
    if (this.room.isBoss) this.time.delayedCall(900, () => {
      const b = this.units.find(u => u.boss);
      if (b) { audio.sfx('bossRoar'); this.cameras.main.shake(400, 0.005); this.bossSay(bossIntro(b.kind as 'warden' | 'boss', this.meta)); }
    });
  }

  /** Enemies of one wave on the enemy start cells (reinforcements: any free cell at the back). */
  private spawnWave(ids: EnemyId[], rng: Rng, reinforce: boolean): Unit[] {
    const sc = this.scaling(this.room.isBoss);
    const starts = this.board.enemyStarts.filter(p => !this.unitOn(p));
    const back = this.freeCells().filter(p => dist(p, this.hero) >= 5).sort((a, b) => a.x + a.y - (b.x + b.y));
    const cells = [...starts, ...back];
    const list: Unit[] = [];
    ids.forEach((id, i) => {
      const at = cells[i] ?? cells[0];
      if (!at) return;
      cells.splice(cells.indexOf(at), 1);
      const u = makeEnemy(id, at, sc);
      u.uid = this.uidSeq++;
      list.push(u);
    });
    if (reinforce && this.fight) addUnits(this.fight, list);
    for (const u of list) {
      const v = this.addUnit(u);
      v.showBar = !!this.fight;
      v.drawBar();
      sparks(this, v.x, v.y - 8, COLORS.magenta, 6, 12);
    }
    if (reinforce) { audio.sfx('spawn'); this.screenText('RENFORTS !', 11, '#ff2a6d', 80).setData('fade', 1); this.fadeBanners(); }
    void rng;
    return list;
  }

  private fadeBanners() {
    this.children.list.filter(o => o.getData?.('fade')).forEach(o => {
      o.setData('fade', 0);
      this.tweens.add({ targets: o, alpha: 0, delay: 900, duration: 400, onComplete: () => o.destroy() });
    });
  }

  private showStarts() {
    this.clearMarkers();
    for (const p of this.board.playerStarts) this.markLayer.add(p, 0x00f0ff, 0.45);
    for (const p of this.board.enemyStarts) if (this.unitOn(p)?.team === 1) this.markLayer.add(p, 0xff2a6d, 0.35);
  }
  private clearMarkers() { this.markers.forEach(m => m.destroy()); this.markers = []; this.tags = []; this.markLayer.clear(); }
  /** Things drawn by Phaser over a cell, moved when the camera moves. */
  private tags: { cell: Pt; icon: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }[] = [];
  private camKey = '';
  /** Wheel zooms, ZQSD / WASD / arrows move the view; overlays drawn by Phaser follow. */
  private moveCamera(dt: number) {
    const m = this.modal() ? { x: 0, y: 0 } : this.controls.move();
    if (m.x || m.y) this.world.panScreen(m.x * dt * 0.6, m.y * dt * 0.6, CONFIG.WIDTH * CONFIG.ZOOM);
    const cam = this.world.camera, key = `${cam.position.x.toFixed(3)},${cam.position.z.toFixed(3)},${cam.zoom.toFixed(3)}`;
    if (key === this.camKey) return;
    this.camKey = key;
    for (const t of this.tags) {
      const c = this.centre(t.cell);
      t.icon.setPosition(c.x, c.y - 14 * cam.zoom);
      t.label.setPosition(c.x, c.y - 28 * cam.zoom);
      t.icon.setScale(Math.min(2, cam.zoom));
    }
    this.drawHover();
  }

  private async startFight() {
    this.clearMarkers();
    this.mode = 'busy';
    const all = this.units.filter(u => !u.dead);
    // Uids are fixed already: keep them (createFight would renumber), and give the spawner fresh ones.
    const f = createFight(this.board, [], Math.random, (kind, team, at, by) => makeSummon(kind, team, at, by));
    f.units = all;
    f.nextUid = this.uidSeq + 100;
    f.hooks = relicHooks(this.run.relics);
    this.fight = f;
    for (const v of this.views.values()) { v.showBar = true; v.drawBar(); }
    audio.setIntensity(1);
    this.ui.setButton('FIN DU TOUR');
    const ev = beginFight(f);
    await this.play(ev);
    await this.loop();
  }

  // ---------- turn loop ----------

  /** Runs enemy turns until it is the player's turn (or the fight is over). */
  private async loop() {
    const f = this.fight!;
    while (!f.over && !this.ending) {
      const u = current(f);
      if (!u) break;
      this.views.forEach(v => v.setActive(v.unit === u));
      this.refreshUi();
      if (u.kind === 'player') { this.mode = 'input'; this.turnKills = 0; this.refreshUi(); return; }
      this.mode = 'ai';
      await wait(this, 220);
      for (let i = 0; i < 10 && !f.over && !u.dead; i++) {
        const a = nextAction(f, u);
        if (!a) break;
        const ev = a.t === 'cast' ? cast(f, u, a.spell, a.cell) : moveTo(f, u, a.to);
        if (!ev.length) break;
        await this.play(ev);
        await wait(this, 120);
      }
      if (f.over) break;
      await this.play(endTurn(f));
    }
    this.views.forEach(v => v.setActive(false));
    if (f.over) await this.fightOver(f.over);
  }

  private async playerAct(ev: FightEvent[]) {
    this.mode = 'busy';
    this.refreshUi();
    await this.play(ev);
    if (this.fight?.over) { await this.fightOver(this.fight.over); return; }
    this.mode = 'input';
    this.refreshUi();
  }

  private async endPlayerTurn() {
    const f = this.fight;
    if (!f || this.mode !== 'input') return;
    this.selected = null;
    this.mode = 'busy';
    this.tally.bestTurnKills = Math.max(this.tally.bestTurnKills, this.turnKills);
    await this.play(endTurn(f));
    await this.loop();
  }

  // ---------- animating events ----------

  private async play(events: FightEvent[]) {
    for (const e of events) {
      if (this.ending) return;
      await this.playOne(e);
    }
    this.refreshUi();
  }

  private async playOne(e: FightEvent) {
    const f = this.fight;
    const view = 'uid' in e ? this.views.get(e.uid) : undefined;
    const u = f && 'uid' in e ? byUid(f, e.uid) : undefined;
    switch (e.t) {
      case 'turn': {
        if (f && f.round !== this.lastRound) { this.lastRound = f.round; this.onNewRound(f); }
        if (u?.kind === 'player') this.onPlayerTurnStart(u);
        break;
      }
      case 'move': if (view) { await view.walk(e.path); audio.sfx('ui', { vol: 0.2, pitch: 0.6 }); } break;
      case 'cast': {
        if (!view || !u) break;
        const s = u.spells.find(x => x.id === e.spell) ?? spell(e.spell);
        if (!same(u, e.cell)) view.face({ x: Math.sign(e.cell.x - u.x), y: Math.sign(e.cell.y - u.y) });
        view.pose('windup', s.id, s.fx);
        audio.sfx(s.fx === 'shot' ? (u.team === 0 ? 'playerShoot' : 'enemyShoot') : s.fx === 'hack' ? 'hack' : s.fx === 'blast' ? 'swingHeavy' : s.fx === 'buff' || s.fx === 'heal' ? 'special' : 'swing');
        await wait(this, 110);
        view.pose('strike', s.id);
        this.spellFx(u, s, e.cell, e.crit);
        if (u.kind === 'player') this.onPlayerCast(s);
        await wait(this, 160);
        view.rest();
        break;
      }
      case 'damage': {
        if (!view || !u) break;
        view.flash(e.crit ? COLORS.yellow : 0xffffff);
        if (u.team !== 2) view.pose('hurt');
        const hurtPlayer = u.kind === 'player';
        const txtCol = e.push ? '#ff8c2a' : e.bleed ? '#ff3b3b' : hurtPlayer ? '#ff2a6d' : '#e8e8ff';
        floatText(this, view.x, view.y - 24, `-${e.amount}${e.crit ? ' !' : ''}${e.push ? ' (poussée)' : ''}`, txtCol, e.crit ? 9 : 7);
        if (e.absorbed) floatText(this, view.x + 10, view.y - 16, `-${e.absorbed} bouclier`, '#e8e8ff', 6);
        audio.sfx(e.crit ? 'crit' : e.push ? 'quake' : 'hit', { vol: 0.7 });
        if (e.crit || e.push) this.cameras.main.shake(80, 0.004);
        // Anime impact: crits get the full treatment, other blows a short colour split and shake.
        this.fx.hit(view.x, view.y - 12, e.crit ? 'crit' : hurtPlayer ? 'hurt' : 'hit', e.crit ? COLORS.yellow : undefined);
        if (hurtPlayer) { this.registry.set('hurtAt', this.game.loop.time); this.tally.hitsTaken++; audio.sfx('hurt'); }
        if (u.team === 1) this.run.damageDealt += e.amount;
        view.drawBar();
        await wait(this, 90);
        if (!u.dead) view.rest();
        break;
      }
      case 'heal': if (view) { floatText(this, view.x, view.y - 24, `+${e.amount}`, '#39ff88', 7); if (u?.kind === 'player') this.run.hpHealed += e.amount; view.drawBar(); } break;
      case 'shove': if (view) await view.shove(e.path, e.kind); break;
      case 'stat': if (view) floatText(this, view.x, view.y - 30, `${e.v > 0 ? '+' : ''}${e.v} ${({ pa: 'PA', pm: 'PM', dmg: '% dég', res: '% rés', range: 'PO', pushDmg: 'poussée' })[e.stat]}`, e.stat === 'pa' ? '#00f0ff' : e.stat === 'pm' ? '#39ff88' : '#f5e663', 7); break;
      case 'shield': if (view) { floatText(this, view.x, view.y - 28, `+${e.v} bouclier`, '#e8e8ff', 7); view.drawBar(); } break;
      case 'psy': {
        const before = this.run.psy;
        this.run.psy = addPsy(this.run.psy, e.v, this.stats.psyResist);
        const d = Math.round(this.run.psy - before);
        if (view && d) floatText(this, view.x, view.y - 32, `${d > 0 ? '+' : ''}${d} PSY`, '#39ff88', 7);
        break;
      }
      case 'prime': if (view) { view.setPrimed(true); audio.sfx('windup'); floatText(this, view.x, view.y - 30, 'AMORCÉ !', '#f5e663', 8); } break;
      case 'explode': {
        if (view) { sparks(this, view.x, view.y - 6, COLORS.yellow, 16, 34); }
        this.world.flashCells(e.cells, 0xff8c2a, 500);
        audio.sfx('explode'); this.cameras.main.shake(200, 0.008);
        if (view) this.fx.hit(view.x, view.y - 8, 'blast', 0xff8c2a);
        await wait(this, 200);
        break;
      }
      case 'death': if (u) await this.onDeath(u, e.by); break;
      case 'summon': {
        if (!u) break;
        const v = this.addUnit(u);
        v.showBar = true; v.drawBar();
        sparks(this, v.x, v.y - 8, u.team === 0 ? COLORS.cyan : COLORS.magenta, 8, 14);
        audio.sfx('spawn');
        break;
      }
      case 'phase': {
        if (u && (u.kind === 'warden' || u.kind === 'boss')) { const l = BOSS_LINES[u.kind]; this.bossSay(e.phase >= 2 ? l.frenzy : l.enraged); this.cameras.main.flash(200, 255, 42, 109); }
        break;
      }
    }
  }

  /** Visual of a spell: slash arcs, tracer, blast ring, wire, hack glyphs. */
  private spellFx(u: Unit, s: SpellDef, cell: Pt, crit: boolean) {
    const from = this.views.get(u.uid)!, to = this.centre(cell), fy = from.y - 10;
    const col = s.color;
    const zone = this.fight ? zoneCells(this.fight, u, s, cell) : [cell];
    if (s.fx === 'shot') {
      const b = this.add.image(from.x, fy, 'glow').setTint(col).setScale(0.18).setBlendMode(Phaser.BlendModes.ADD).setDepth(950);
      this.tweens.add({ targets: b, x: to.x, y: to.y - 8, duration: 120, onComplete: () => { b.destroy(); sparks(this, to.x, to.y - 8, col, 5, 10); } });
      const g = this.add.graphics().setDepth(949);
      g.lineStyle(1, col, 0.7).lineBetween(from.x, fy, to.x, to.y - 8);
      this.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
    } else if (s.fx === 'wire' || s.fx === 'hack') {
      const g = this.add.graphics().setDepth(949);
      g.lineStyle(1, col, 0.9).lineBetween(from.x, fy, to.x, to.y - 8);
      if (s.fx === 'hack') for (let i = 0; i < 6; i++) g.fillStyle(col, 0.8).fillRect(to.x - 8 + Math.random() * 16, to.y - 18 + Math.random() * 14, 2, 2);
      this.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
    } else if (s.fx === 'buff' || s.fx === 'heal') {
      const r = this.add.ellipse(from.x, from.y, 18, 9).setStrokeStyle(2, col).setDepth(949);
      this.tweens.add({ targets: r, scale: 2, alpha: 0, y: from.y - 6, duration: 360, onComplete: () => r.destroy() });
    } else if (s.fx === 'slash') {
      const sl = this.add.image(to.x, to.y - 10, 'slash').setTint(crit ? COLORS.yellow : col).setDepth(950).setScale(0.8).setRotation(Math.atan2(to.y - from.y, to.x - from.x));
      this.tweens.add({ targets: sl, alpha: 0, scale: 1.1, duration: 180, onComplete: () => sl.destroy() });
    }
    if (s.fx === 'blast' || zone.length > 1) {
      this.world.flashCells(zone, col, 420);
      if (s.fx === 'blast') sparks(this, to.x, to.y - 6, col, 10, 22);
    }
  }

  // ---------- run rules on fight events ----------

  private onPlayerTurnStart(p: Unit) {
    const before = this.run.psy;
    this.run.psy = psyOnTurn(this.run.psy, totalLoad(this.run.implants, this.stats), this.stats.psyResist, this.stats.psyRateMult);
    const tier = psyTier(this.run.psy);
    if (Math.floor(this.run.psy) > Math.floor(before) + 1) floatText(this, this.views.get(1)!.x, this.views.get(1)!.y - 34, `+${Math.round(this.run.psy - before)} PSY`, '#39ff88', 6);
    // Masque Oni: from 50 % psychosis, more PA / PM this turn.
    if (this.run.psy >= 50 && (this.stats.edgePa || this.stats.edgePm)) {
      p.pa += this.stats.edgePa; p.pm += this.stats.edgePm;
      floatText(this, this.views.get(1)!.x, this.views.get(1)!.y - 40, `+${this.stats.edgePa} PA +${this.stats.edgePm} PM (psychose)`, '#00f0ff', 6);
    }
    // High psychosis: the body pays at the start of each turn, but the blows land harder.
    const drain = Math.round(p.maxHp * hpDrainPerTurn(tier) * this.stats.psyDrainMult);
    if (drain > 0) {
      p.hp = Math.max(0, p.hp - drain);
      floatText(this, this.views.get(1)!.x, this.views.get(1)!.y - 24, `-${drain} (psychose)`, '#ff2a6d', 7);
      if (p.hp <= 0) { this.run.killer = 'psychosis'; p.dead = true; this.fight!.over = 'lose'; void this.views.get(1)?.die(); }
    }
    p.st.extraMult = psyDamageMult(tier) * (1 + this.stats.psyDamage * this.run.psy);
    this.ui.say('À TOI DE JOUER', '#00f0ff');
  }

  private onPlayerCast(s: SpellDef) {
    if (s.id === 'overheat') {
      this.run.psy = addPsy(this.run.psy, this.stats.overheatPsy, this.stats.psyResist);
      audio.sfx('glitch');
      this.registry.set('parryAt', this.game.loop.time);
    }
    if (this.stats.castPsy) this.run.psy = addPsy(this.run.psy, this.stats.castPsy, this.stats.psyResist);
  }

  private onNewRound(f: Fight) {
    this.tally.rounds = f.round;
    const at = (CONFIG.REINFORCE_ROUNDS as readonly number[]).indexOf(f.round);
    if (at >= 0 && at + 1 < this.room.waves.length && this.waveIndex < at + 1) {
      this.waveIndex = at + 1;
      this.spawnWave(this.room.waves[this.waveIndex], Math.random, true);
    }
  }

  private async onDeath(u: Unit, by?: number) {
    const view = this.views.get(u.uid);
    if (u.kind === 'player') {
      this.run.killer ??= by ? byUid(this.fight!, by)?.kind : this.run.killer;
      await view?.die();
      return;
    }
    if (u.team === 2) {
      audio.sfx('break', { vol: 0.7 });
      if (view) for (let i = 0; i < 8; i++) {
        const d = this.add.rectangle(view.x, view.y - 6, 3, 3, Phaser.Utils.Array.GetRandom([0x8a6a4a, 0x3a3550, 0x39a85a, 0xff8c2a])).setDepth(960);
        const a = Math.random() * Math.PI * 2;
        this.tweens.add({ targets: d, x: view.x + Math.cos(a) * 18, y: view.y - 6 + Math.sin(a) * 10, angle: 180, alpha: 0, duration: 420, onComplete: () => d.destroy() });
      }
      const x = view?.x ?? 0, y = view?.y ?? 0;
      await view?.die();
      this.views.delete(u.uid);
      this.loot(x, y);
      return;
    }
    if (u.team === 1) {
      // A bomber that blew itself up earns nothing.
      const selfBlast = u.kind === 'bomber' && by === undefined;
      if (!selfBlast) {
        this.run.kills++;
        this.run.killsByType[u.kind] = (this.run.killsByType[u.kind] ?? 0) + 1;
        this.run.psy = psyOnKill(this.run.psy, this.stats.psyResist, this.stats.psyPerKill);
        if (this.mode === 'input' || this.mode === 'busy') this.turnKills++;
        const gain = Math.round((ENEMIES[u.kind as EnemyId]?.credits ?? 0) * this.stats.creditMult);
        this.run.creditsEarned += gain;
        if (view && gain) floatText(this, view.x, view.y - 18, `+${gain}¢`, '#f5e663', 7);
        if (psyTier(this.run.psy) === 'crisis' && !this.hero.dead) {
          const g = Math.min(this.hero.maxHp - this.hero.hp, CONFIG.CRISIS_KILL_HEAL);
          if (g > 0) { this.hero.hp += g; floatText(this, this.views.get(1)!.x, this.views.get(1)!.y - 28, `+${g}`, '#39ff88', 6); }
        }
      }
      audio.sfx('kill');
      if (view) this.fx.hit(view.x, view.y - 12, u.boss ? 'boss' : 'kill', COLORS.magenta);
      if (u.boss) {
        this.bossSay(BOSS_LINES[u.kind as 'warden' | 'boss'].death);
        this.cameras.main.flash(300, 255, 42, 109);
        this.cameras.main.shake(400, 0.01);
        for (let i = 0; i < 3; i++) this.loot(view?.x ?? 0, view?.y ?? 0);
      }
    }
    await view?.die();
    this.views.delete(u.uid);
  }

  /** Relics not found yet in this run that can do something for the current spell bar. */
  private relicsLeft(): Relic[] {
    return relicPool(RELICS, this.run.relics, this.spells);
  }

  /** What a broken object (or a boss) leaves: applied right away. */
  private loot(x: number, y: number) {
    const loot = rollLoot(Math.random, this.relicsLeft().length > 0, this.stats.lootBonus > 0);
    if (loot.kind === 'credits') {
      const gain = Math.round(loot.amount * this.stats.creditMult * (1 + this.stats.lootBonus));
      this.run.creditsEarned += gain;
      floatText(this, x, y - 14, `+${gain}¢`, '#f5e663', 7);
      audio.sfx('credit');
    } else if (loot.kind === 'heal') {
      const g = this.heal(loot.amount);
      floatText(this, x, y - 14, `+${Math.round(g)} PV`, '#39ff88', 7);
      audio.sfx('heal');
    } else if (loot.kind === 'relic') { const r = offerRelics(Math.random, this.relicsLeft())[0]; if (r) this.grantRelic(r); }
  }

  private heal(amount: number) {
    const before = this.hero.hp;
    this.hero.hp = Math.min(this.hero.maxHp, before + amount * this.stats.healMult);
    this.hero.hp = Math.round(this.hero.hp);
    this.run.hp = this.hero.hp;
    const g = Math.max(0, this.hero.hp - before);
    this.run.hpHealed += g;
    this.views.get(1)?.drawBar();
    return g;
  }

  private grantRelic(relic: Relic) {
    if (this.run.relics.some(r => r.id === relic.id)) return;
    this.run.relics.push(relic);
    this.refreshBuild();
    // Found mid-fight (a crate): its fight effects start right away.
    if (this.fight) this.fight.hooks = relicHooks(this.run.relics);
    this.cameras.main.flash(250, 255, 59, 59);
    audio.sfx('relic');
    const t = this.screenText(`★ RELIQUE ${RELIC_RARITY_NAMES[relic.rarity]} — ${relic.name.toUpperCase()} ★\n${relic.description}`, 9, relic.rarity === 'cursed' ? '#39ff88' : '#ff3b3b', 80);
    this.tweens.add({ targets: t, alpha: 0, delay: 2600, duration: 500, onComplete: () => t.destroy() });
  }

  /** Boss and elite rewards: pick one relic among a few (Échap: none). */
  private openRelicChoice(options: Relic[], then: () => void, title: string) {
    if (!options.length) { then(); return; }
    const before = this.run.relics.length;
    this.panel = new ChoicePanel(this, this.controls, title, 'Une relique te suit jusqu\'à la fin de la run, sans charge psy. Les maudites donnent beaucoup, mais se paient. Échap : aucune.',
      options.map(r => ({ label: r.name, desc: r.description, cost: RELIC_RARITY_NAMES[r.rarity], pick: () => this.grantRelic(r) })),
      // The panel closes before the pick runs: wait a tick, then leave time to read the relic's banner.
      () => { this.panel = undefined; this.time.delayedCall(10, () => this.time.delayedCall(this.run.relics.length > before ? 1500 : 0, then)); }, 0xff3b3b);
  }

  /** The build changed (implant, relic): new stats and spell bar, HP gained with a higher max. */
  private refreshBuild() {
    const before = this.stats.maxHp;
    this.build();
    const p = this.hero;
    p.maxHp = this.stats.maxHp;
    p.hp = Math.min(p.maxHp, p.hp + Math.max(0, p.maxHp - before));
    p.maxPa = this.stats.pa; p.maxPm = this.stats.pm; p.init = this.stats.initiative;
    const fresh = makePlayer(this.stats, this.spells, p.hp, p);
    p.st = { ...fresh.st, extraMult: p.st.extraMult };
    p.spells = this.spells;
    this.run.hp = p.hp;
    this.refreshUi();
  }

  // ---------- end of a fight ----------

  private async fightOver(result: 'win' | 'lose') {
    if (this.mode === 'done') return;
    this.mode = 'done';
    this.selected = null;
    this.views.forEach(v => v.setActive(false));
    this.overlay.clear(); this.hoverG.clear();
    this.run.hp = this.hero.hp;
    if (result === 'lose') { this.endRun(false); return; }
    // Back to walking: no turn state carries over to the next fight.
    const h = this.hero;
    h.cd = {}; h.casts = {}; h.buffs = []; h.bleed = []; h.mem = {}; h.shield = 0; h.shieldTurns = 0; h.pa = h.maxPa; h.pm = h.maxPm;
    this.tally.rounds = this.fight!.round;
    this.tally.bestTurnKills = Math.max(this.tally.bestTurnKills, this.turnKills);
    for (const v of this.views.values()) { v.showBar = false; v.drawBar(); }
    this.views.get(1)?.rest();
    audio.setIntensity(0.2);
    if (this.room.isBoss && !this.room.doorRewards.length) {
      this.ending = true;
      this.screenText('CIBLE NEUTRALISÉE', 14, '#f5e663');
      this.time.delayedCall(1600, () => this.finish(true));
      return;
    }
    const t = this.screenText(this.room.isBoss ? 'CIBLE NEUTRALISÉE' : 'SECTEUR NETTOYÉ', 11, this.room.isBoss ? '#f5e663' : '#00f0ff', 110);
    this.tweens.add({ targets: t, alpha: 0, y: 96, delay: 700, duration: 600, onComplete: () => t.destroy() });
    if (this.stats.regenOnClear > 0) {
      const g = this.heal(this.stats.maxHp * this.stats.regenOnClear);
      floatText(this, this.views.get(1)!.x, this.views.get(1)!.y - 26, `+${Math.round(g)} PV`, '#39ff88', 8);
    }
    // Remaining breakables stay where they are; the fight objects go back to the plain board.
    this.units = this.fight!.units.filter(u => !u.dead && u.team !== 1);
    this.fight = undefined;
    this.ui.setButton(null);
    this.ui.setTimeline(undefined);
    const steps: ((next: () => void) => void)[] = [];
    const ri = this.run.roomIndex;
    // A mid-run boss always leaves a relic (one among three); an elite squad, one time in two (one among two).
    const relicRng = createRng(this.run.seed + ri * 41);
    if (this.room.isBoss) {
      const offer = offerRelics(relicRng, this.relicsLeft(), 3, true);
      steps.push(next => this.openRelicChoice(offer, next, 'BUTIN DU LIEUTENANT — UNE RELIQUE'));
    }
    if (this.room.elite) {
      this.run.creditsEarned += Math.round(15 * this.stats.creditMult);
      steps.push(next => this.openImplantChoice(offerImplants(createRng(this.run.seed + ri * 29), this.run.implants, ri, { minRarity: ri >= 6 ? 'epic' : 'rare' }), next, 'BUTIN D\'ÉLITE — CHOISIS UN IMPLANT'));
      if (relicRng() < 0.5) steps.push(next => this.openRelicChoice(offerRelics(relicRng, this.relicsLeft(), 2, true), next, 'BUTIN D\'ÉLITE — UNE RELIQUE'));
    }
    const c = this.run.contract;
    if (c && c.room === ri) {
      this.run.contract = undefined;
      const ok = contractMet(c, this.tally);
      steps.push(next => {
        const m = this.screenText(ok ? 'CONTRAT REMPLI — PRIME VERSÉE' : 'CONTRAT ÉCHOUÉ', 11, ok ? '#f5e663' : '#ff2a6d', 80);
        this.tweens.add({ targets: m, alpha: 0, delay: 1200, duration: 500, onComplete: () => m.destroy() });
        audio.sfx(ok ? 'buy' : 'deny');
        if (!ok) { next(); return; }
        if (c.reward === 'credits') { this.run.creditsEarned += Math.round(c.amount * this.stats.creditMult); next(); return; }
        this.time.delayedCall(700, () => this.openImplantChoice(offerImplants(Math.random, this.run.implants, ri, { minRarity: c.reward === 'implant-epic' ? 'epic' : 'rare' }), next, 'PRIME DU FIXER — CHOISIS UN IMPLANT'));
      });
    }
    const runSteps = (i: number) => (i < steps.length ? steps[i](() => runSteps(i + 1)) : this.openExits());
    this.time.delayedCall(800, () => runSteps(0));
  }

  /** Exits on the back edges, each showing what is behind it. */
  private openExits() {
    this.mode = 'explore';
    this.exitsOpen = true;
    this.board.exits.forEach((p, i) => {
      const reward = this.room.doorRewards[i];
      if (!reward) return;
      const fam = this.room.doorFamilies[i];
      const c = this.centre(p);
      this.markLayer.add(p, 0x39ff88, 0.45);
      const icon = this.add.image(c.x, c.y - 14, REWARD_ICON[reward]).setDepth(960);
      if (reward === 'implant') icon.setTint(Phaser.Display.Color.HexStringToColor(FAMILY_COLORS[fam]).color);
      this.tweens.add({ targets: icon, y: c.y - 18, yoyo: true, repeat: -1, duration: 500 });
      const label = reward === 'implant' ? `IMPLANT ${FAMILY_NAMES[fam]}` : DOOR_LABELS[reward];
      const t = txt(this, c.x, c.y - 28, label, 5, reward === 'implant' ? FAMILY_COLORS[fam] : '#e8e8ff').setOrigin(0.5).setDepth(961).setStroke('#05030f', 3);
      this.markers.push(icon, t);
      this.tags.push({ cell: p, icon, label: t });
    });
    if (this.room.doorRewards.length) {
      audio.sfx('door');
      this.ui.say(this.eventNpc && !this.eventDone ? `Parle à ${this.eventNpc.name.split(',')[0]} (clic) ou choisis une sortie` : 'Choisis une sortie : clique dessus', '#39ff88');
    }
    this.refreshUi();
  }

  private takeExit(i: number) {
    if (this.leaving) return;
    this.leaving = true;
    let reward = this.room.doorRewards[i];
    const family: Family = this.room.doorFamilies[i];
    audio.sfx('door', { pitch: 1.3 });
    const ri = this.run.roomIndex;
    // Intérêts composés: the run's credits earn a little each time you move on.
    if (this.stats.interest > 0) {
      const gain = Math.min(20, Math.round(this.run.creditsEarned * this.stats.interest));
      if (gain > 0) { this.run.creditsEarned += gain; floatText(this, this.views.get(1)!.x, this.views.get(1)!.y - 32, `+${gain}¢ (intérêts)`, '#f5e663', 7); }
    }
    if (reward === 'implant') {
      const options = offerImplants(createRng(this.run.seed + ri * 13), this.run.implants, ri, { family, allowBlack: ri >= 2 });
      if (options.length) { this.openImplantChoice(options, () => this.nextRoom()); return; }
      reward = 'credits';
    }
    if (reward === 'credits') this.run.creditsEarned += Math.round((8 + ri * 2) * this.stats.creditMult);
    if (reward === 'heal') { const g = this.heal(this.stats.maxHp * CONFIG.HEAL_FRACTION); floatText(this, this.views.get(1)!.x, this.views.get(1)!.y - 24, `+${Math.round(g)} PV`, '#39ff88', 9); audio.sfx('heal'); }
    let relic: Relic | undefined;
    if (reward === 'chest') {
      this.run.creditsEarned += Math.round((5 + ri * 2) * this.stats.creditMult);
      if (Math.random() < 0.5) this.run.blockers++;
      // Now and then the chest holds a relic.
      if (Math.random() < 0.15) relic = offerRelics(Math.random, this.relicsLeft())[0];
      if (relic) this.grantRelic(relic);
    }
    const next = this.run.rooms[ri + 1];
    if (next && !next.isBoss && reward === 'event') this.run.rooms[ri + 1] = makeEvent(next);
    if (next && !next.isBoss && reward === 'elite') this.run.rooms[ri + 1] = makeElite(next, createRng(this.run.seed + ri * 37));
    this.time.delayedCall(relic ? 2200 : reward === 'heal' || this.stats.interest > 0 ? 500 : 0, () => this.nextRoom());
  }

  private openImplantChoice(options: Offer[], then: () => void, title?: string) {
    audio.sfx('uiOpen');
    this.choice = new ImplantChoice(this, options, this.controls, this.run.implants, synergyBonus(this.run.relics), o => {
      audio.sfx('implant');
      const bonus = synergyBonus(this.run.relics);
      const had = new Set(activeSynergies(this.run.implants, bonus).map(a => `${a.synergy}${a.tier}`));
      this.run.implants = applyOffer(this.run.implants, o);
      this.refreshBuild();
      const fresh = activeSynergies(this.run.implants, bonus).filter(a => !had.has(`${a.synergy}${a.tier}`));
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
    this.run.hp = this.hero.hp;
    this.run.roomIndex++;
    wipeTo(this, SCENES.Run, {});
  }

  private endRun(victory: boolean) {
    if (this.ending) return;
    this.ending = true;
    if (!victory) { audio.sfx('kill', { pitch: 0.5 }); audio.setMusic('off'); }
    this.cameras.main.shake(300, 0.01);
    this.cameras.main.flash(300, 255, 0, 40);
    this.screenText('SIGNAL VITAL PERDU', 16, '#ff2a6d');
    this.time.delayedCall(1400, () => this.finish(victory));
  }

  /** Bank credits, reset the run (implants, relics and psychosis are lost), and show the result. */
  private finish(victory: boolean) {
    const storage = getStorage();
    const save = loadSave(storage);
    const bonus = victory ? Math.round(CONFIG.BOSS_CREDIT_BONUS * this.stats.creditMult * this.stats.bossBonusMult) : 0;
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
    wipeTo(this, SCENES.Death, {
      victory, creditsEarned: earned, roomReached: sector, heat: pts, recordBonus: record, daily: this.run.daily, dailyBest,
      killer: killer === 'psychosis' ? 'la cyberpsychose' : killer ? ENEMIES[killer as EnemyId]?.name : undefined,
    });
  }

  private bossSay(line: string) {
    this.bossLine?.destroy();
    const t = this.screenText(`« ${line} »`, 8, '#ff2a6d', 58);
    this.bossLine = t;
    audio.sfx('talk', { pitch: 0.55 });
    this.tweens.add({ targets: t, alpha: 0, delay: 2600, duration: 500, onComplete: () => { t.destroy(); if (this.bossLine === t) this.bossLine = undefined; } });
  }

  // ---------- input ----------

  private modal() { return !!(this.choice || this.panel || this.help?.isOpen); }

  private onPointerMove(p: Phaser.Input.Pointer) {
    if (this.modal()) return;
    this.hoverCell = this.cellAtPointer(p);
    this.drawHover();
    const u = this.hoverCell ? this.unitOn(this.hoverCell) : undefined;
    this.ui.setInfo(u ?? (this.fight ? current(this.fight) : undefined), this.fight);
  }

  private onPointerDown(p: Phaser.Input.Pointer) {
    if (this.modal() || this.ending) return;
    if (p.button === 2) { this.selected = null; this.refreshUi(); return; }
    if (p.button !== 0) return;
    // Clicks on the bar are handled by its buttons.
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    if (w.y > CONFIG.HEIGHT - BAR_H) return;
    const cell = this.cellAtPointer(p);
    if (!cell) return;
    if (this.mode === 'placement') this.placeHero(cell);
    else if (this.mode === 'input') this.clickFight(cell);
    else if (this.mode === 'explore') this.clickExplore(cell);
  }

  private placeHero(cell: Pt) {
    if (!this.board.playerStarts.some(s => same(s, cell))) { this.ui.say('Choisis une case bleue', '#ff2a6d'); return; }
    if (this.unitOn(cell) && !same(cell, this.hero)) return;
    this.hero.x = cell.x; this.hero.y = cell.y;
    this.views.get(1)!.place(cell);
    audio.sfx('ui');
  }

  private clickFight(cell: Pt) {
    const f = this.fight!, p = this.hero;
    if (this.selected !== null) {
      const s = this.spells[this.selected];
      const err = this.spellBlocked(s) ?? castError(f, p, s, cell);
      if (err) { this.ui.say(err, '#ff2a6d'); audio.sfx('deny'); return; }
      if (s.id === 'blocker') { this.useBlocker(); return; }
      const ev = cast(f, p, s, cell);
      // Keep the spell selected while it can still be cast this turn (several hits per turn).
      if (this.slotError(s)) this.selected = null;
      void this.playerAct(ev);
      return;
    }
    const map = reachFor(f, p);
    if (!map.has(keyOf(cell)) || same(cell, p)) {
      const u = unitAt(f, cell);
      if (u && u.team === 1) this.ui.say('Choisis un sort (1-9) pour attaquer', '#f5e663');
      return;
    }
    void this.playerAct(moveTo(f, p, cell));
  }

  /** Run-side conditions of a spell (neuro-blockers left). */
  private spellBlocked(s: SpellDef): string | null {
    if (s.id === 'blocker' && this.stats.blockerAmount <= 0) return 'neuro-bloqueurs grillés';
    if (s.id === 'blocker' && this.run.blockers <= 0) return 'aucun neuro-bloqueur';
    if (s.id === 'blocker' && this.hero.pa < BLOCKER_PA) return 'PA insuffisants';
    return null;
  }

  private useBlocker() {
    this.run.blockers--;
    this.hero.pa -= BLOCKER_PA;
    this.run.psy = applyBlocker(this.run.psy, this.stats.blockerAmount);
    audio.sfx('blocker');
    const v = this.views.get(1)!;
    floatText(this, v.x, v.y - 26, `-${this.stats.blockerAmount} PSY`, '#39ff88', 8);
    this.selected = null;
    this.refreshUi();
  }

  private clickExplore(cell: Pt) {
    if (this.leaving) return;
    const exitIdx = this.exitsOpen ? this.board.exits.findIndex((e, i) => same(e, cell) && this.room.doorRewards[i]) : -1;
    const npc = this.eventNpc && !this.eventDone && same(this.eventNpc, cell);
    let target = cell;
    if (npc) {
      // Walk next to the NPC, then talk.
      const near = DIRS.map(d => ({ x: cell.x + d.x, y: cell.y + d.y })).filter(q => walkable(this.board, q) && !this.unitOn(q))
        .sort((a, b) => dist(a, this.hero) - dist(b, this.hero));
      if (dist(this.hero, cell) === 1) { this.openEvent(); return; }
      if (!near.length) return;
      target = near[0];
    }
    if (this.unitOn(target) && !same(target, this.hero)) return;
    const map = reachable(this.board, this.hero, 999, q => !!this.unitOn(q) && !same(q, this.hero), () => 0);
    const path = pathTo(map, target);
    if (!path) return;
    this.mode = 'busy';
    this.hero.x = target.x; this.hero.y = target.y;
    void this.views.get(1)!.walk(path, 130).then(() => {
      this.mode = 'explore';
      if (npc) { const v = this.views.get(1)!; v.face({ x: cell.x - target.x, y: cell.y - target.y }); v.rest(); this.openEvent(); }
      if (exitIdx >= 0) this.takeExit(exitIdx);
    });
  }

  private selectSpell(i: number) {
    if (this.mode !== 'input') return;
    const s = this.spells[i];
    if (!s) return;
    if (this.selected === i) { this.selected = null; this.refreshUi(); return; }
    const err = this.spellBlocked(s) ?? this.slotError(s);
    if (err) { this.ui.say(err, '#ff2a6d'); audio.sfx('deny'); return; }
    if (s.id === 'blocker') { this.useBlocker(); return; }
    // Self spells go off at once.
    if (s.target === 'self') {
      const f = this.fight!;
      const e = castError(f, this.hero, s, this.hero);
      if (e) { this.ui.say(e, '#ff2a6d'); audio.sfx('deny'); return; }
      void this.playerAct(cast(f, this.hero, s, this.hero));
      return;
    }
    this.selected = i;
    audio.sfx('ui');
    this.refreshUi();
  }

  private slotError(s: SpellDef): string | null {
    const p = this.hero;
    if (p.pa < (s.id === 'blocker' ? BLOCKER_PA : s.pa)) return 'PA insuffisants';
    if ((p.cd[s.id] ?? 0) > 0) return `relance : ${p.cd[s.id]} tour${p.cd[s.id] > 1 ? 's' : ''}`;
    if (s.perTurn && (p.casts[s.id] ?? 0) >= s.perTurn) return 'plus de lancer ce tour';
    return null;
  }

  private onConfirm() {
    if (this.modal()) return;
    if (this.mode === 'placement') void this.startFight();
    else if (this.mode === 'input') void this.endPlayerTurn();
  }

  update(_time: number, delta: number) {
    const real = Math.min(delta, CONFIG.MAX_DT_MS);
    for (const l of [this.overlay, this.hoverG, this.markLayer]) if (l.dirty) { this.world.setOverlay(l.name, l.cells, l.order); l.dirty = false; }
    this.views.forEach(v => v.update(real / 1000));
    if (this.ready) this.moveCamera(real);
    stageOpacity(fadeVisibility(this.cameras.main.fadeEffect));
    this.world.frame();
    if (!this.ready || this.ending) return;
    // Modal windows (implant cards, street events) hide the fight bar and its spell card.
    const modal = !!(this.choice || this.panel);
    this.ui.setVisible(!modal);
    this.registry.set('modal', modal);
    if (modal && this.hoverSlot !== null) { this.hoverSlot = null; this.refreshUi(); }
    if (this.choice) { this.choice.tick(); this.publishHud(); return; }
    if (this.panel) { this.panel.tick(); this.publishHud(); return; }
    this.run.timeMs += real;
    // Help or guide open: the fight keeps running but takes no keys (Espace, numbers…).
    if (this.help?.isOpen) { this.publishHud(); return; }
    if (this.controls.confirm()) this.onConfirm();
    if (this.controls.escape()) { this.selected = null; this.refreshUi(); }
    const n = this.controls.numberPressed();
    if (n && this.mode === 'input') this.selectSpell(n - 1);
    if (!this.hoverCell || this.selected === null) this.ui.hint('');
    if (this.controls.blocker() && this.mode === 'input') { const i = this.spells.findIndex(s => s.id === 'blocker'); if (i >= 0) this.selectSpell(i); }
    this.publishHud();
  }

  // ---------- overlays ----------

  private diamond(g: CellLayer, p: Pt, fill: number, alpha: number, edge?: number) {
    g.add(p, fill, edge !== undefined ? Math.max(alpha, 0.3) : alpha);
  }

  /** Movement range (green) or spell range (blue; grey where sight is blocked). */
  private drawRange() {
    const g = this.overlay;
    g.clear();
    if (!this.fight) return;
    // Primed bombers: where the blast will land at their next turn.
    for (const u of this.fight.units) if (!u.dead && u.primed) for (const c of zoneCells(this.fight, u, { zone: { shape: 'circle', r: 2 } } as SpellDef, u)) this.diamond(g, c, 0xff8c2a, 0.28, 0xff8c2a);
    const f = this.fight, p = this.hero;
    // The chosen spell, or the one under the mouse on the bar: its range (blue, grey without sight),
    // and for spells cast on yourself, the zone they hit around you.
    const shown = this.selected ?? this.hoverSlot;
    if (shown !== null && this.spells[shown]) {
      const s = this.spells[shown];
      if (s.target === 'self') { if (s.zone.shape !== 'cell') for (const c of zoneCells(f, p, s, p)) this.diamond(g, c, 0xff2a6d, 0.3, 0xff2a6d); }
      else for (const r of rangeCells(f, p, s)) this.diamond(g, r.p, r.sight ? 0x2a6aff : 0x5a5578, r.sight ? 0.32 : 0.22);
      return;
    }
    if (this.mode !== 'input') return;
    for (const k of reachFor(f, p).keys()) {
      const [x, y] = k.split(',').map(Number);
      if (x === p.x && y === p.y) continue;
      this.diamond(g, { x, y }, 0x39ff88, 0.16);
    }
  }

  /** Under the cursor: the path and its PM cost, or the spell's zone and the damage it would do. */
  private drawHover() {
    const g = this.hoverG;
    g.clear();
    // The spell card follows the button under the mouse, wherever the cursor is.
    this.ui.showTip(this.hoverSlot !== null ? this.spells[this.hoverSlot] ?? null : null, this.hero, undefined, this.views.get(1)?.x ?? 0);
    this.hoverLabels.forEach(l => l.destroy());
    this.hoverLabels = [];
    const cell = this.hoverCell;
    if (!cell || this.modal()) return;
    this.diamond(g, cell, 0xffffff, 0.08, 0xe8e8ff);
    if (this.mode === 'explore' && this.exitsOpen) {
      const i = this.board.exits.findIndex((e, j) => same(e, cell) && this.room.doorRewards[j]);
      if (i >= 0) this.diamond(g, cell, 0x39ff88, 0.3, 0x39ff88);
    }
    if (this.mode === 'placement' && this.board.playerStarts.some(s => same(s, cell))) this.diamond(g, cell, 0x00f0ff, 0.35, 0x00f0ff);
    if (this.mode !== 'input' || !this.fight) return;
    const f = this.fight, p = this.hero;
    if (this.selected !== null) {
      const s = this.spells[this.selected];
      const err = castError(f, p, s, cell);
      if (!err) {
        for (const z of zoneCells(f, p, s, cell)) this.diamond(g, z, 0xff2a6d, 0.35, 0xff2a6d);
        const prev = previewCast(f, p, s, cell);
        let extra = '';
        for (const r of prev) {
          const u = byUid(f, r.uid);
          const v = this.views.get(r.uid);
          if (!u || !v || r.lost === 0) continue;
          const t = r.lost > 0 ? `-${r.lost}${r.dies ? ' ✝' : ''}` : `+${-r.lost}`;
          if (u.team !== 0) extra = `${u.name} ${t}`;
          this.hoverLabels.push(txt(this, v.x, v.y - 36, t, 7, r.lost > 0 ? (r.dies ? '#ff2a6d' : '#f5e663') : '#39ff88').setOrigin(0.5).setDepth(990).setStroke('#05030f', 3));
        }
        this.ui.hint(`${s.name} — ${this.dmgText(s)}${extra ? '   →  ' + extra : ''}`);
      } else { this.ui.hint(`${s.name} — ${err}`, '#ff2a6d'); }
      return;
    }
    // Hovering an enemy: where it can walk on its next turn (its full PM, with your tackle).
    const foe = unitAt(f, cell);
    if (foe && foe.team === 1 && foe.maxPm > 0) {
      const pm = Math.max(0, foe.maxPm + foe.buffs.reduce((n, b) => n + (b.stat === 'pm' ? b.v : 0), 0));
      const reach = reachable(this.board, foe, pm, q => !!unitAt(f, q) && !same(q, foe), q => exitTax(f, foe, q));
      for (const k of reach.keys()) { const [x, y] = k.split(',').map(Number); if (x !== foe.x || y !== foe.y) this.diamond(g, { x, y }, 0xff2a6d, 0.18); }
      return;
    }
    const map = reachFor(f, p), path = pathTo(map, cell);
    if (path && path.length) {
      for (const q of path) this.diamond(g, q, 0x39ff88, 0.4);
      const cost = map.get(keyOf(cell))!.cost;
      const c = this.centre(cell);
      this.hoverLabels.push(txt(this, c.x, c.y - 4, `${cost} PM${cost > path.length ? ' (tacle)' : ''}`, 6, '#39ff88').setOrigin(0.5).setDepth(990).setStroke('#05030f', 3));
    }
  }
  private hoverLabels: Phaser.GameObjects.Text[] = [];

  private dmgText(s: SpellDef) {
    const d = s.effects.find(e => e.k === 'dmg' || e.k === 'dash');
    return d && (d.k === 'dmg' || d.k === 'dash') ? `${d.min + this.hero.st.flat}-${d.max + this.hero.st.flat} dégâts` : s.desc;
  }

  private refreshUi() {
    const f = this.fight;
    const extra = this.mode === 'input' ? 'TON TOUR' : this.mode === 'ai' ? 'TOUR ENNEMI' : this.mode === 'placement' ? 'PLACEMENT' : 'HORS COMBAT';
    this.ui.setStats(this.hero, extra, !!f || this.mode === 'placement');
    const state = (s: SpellDef) => (this.mode !== 'input' ? 'pas ton tour' : this.spellBlocked(s) ?? this.slotError(s));
    this.ui.setSpells(this.spells, state, this.selected, this.hero.cd);
    this.ui.setTimeline(f);
    if (this.mode === 'input') this.ui.setButton('FIN DU TOUR');
    else if (this.mode === 'placement') this.ui.setButton('PRÊT');
    else if (this.mode === 'ai' || this.mode === 'busy') this.ui.setButton(f ? '...' : null);
    else this.ui.setButton(null);
    this.drawRange();
    this.drawHover();
    if (!this.hoverCell) this.ui.setInfo(f ? current(f) : undefined, f);
  }

  private publishHud() {
    const boss = this.liveUnits().find(u => u.boss);
    const hud: HudData = {
      hp: this.hero.hp, maxHp: this.hero.maxHp, psy: this.run.psy, credits: this.run.creditsEarned, blockers: this.run.blockers,
      room: this.run.roomIndex + 1, rooms: CONFIG.ROOMS_PER_RUN,
      implants: this.run.implants.map(i => i.name + (i.level && i.level > 1 ? ' ' + ['', 'I', 'II', 'III'][i.level] : '')), relics: this.run.relics.map(r => ({ name: r.name, desc: r.description, rarity: r.rarity })),
      synergies: activeSynergies(this.run.implants, synergyBonus(this.run.relics)).map(a => SYNERGIES[a.synergy].tiers[a.tier].name),
      psyBonus: psyBonusLabel(this.run.psy),
      notice: this.run.contract && this.run.contract.room === this.run.roomIndex ? contractProgress(this.run.contract, this.tally)
        : this.run.contract ? 'CONTRAT EN ATTENTE' : this.room.elite ? `ÉLITE — ${ELITE_LABELS[this.room.elite]}` : undefined,
      boss: boss ? { hp: boss.hp, max: boss.maxHp, name: boss.name } : undefined,
      weapon: WEAPONS[this.run.weapon].name + (this.run.aspect ? ` (${ASPECT_BY_ID.get(this.run.aspect)?.name} ${['', 'I', 'II', 'III'][this.run.aspectRank] ?? ''})` : ''),
      tag: [this.run.daily ? 'RUN DU JOUR' : '', this.run.heatPoints ? `NOTORIÉTÉ ${this.run.heatPoints}` : ''].filter(Boolean).join(' · '),
    };
    this.registry.set('hud', hud);
  }
}

function psyBonusLabel(psy: number) {
  const m = psyDamageMult(psyTier(psy));
  return m > 1 ? `+${Math.round((m - 1) * 100)} % DÉG` : '';
}

