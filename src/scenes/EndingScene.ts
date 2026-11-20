import Phaser from 'phaser';
import * as THREE from 'three';
import { CONFIG, SCENES } from '../config';
import { Rain } from '../fx/effects';
import { txt } from '../ui/text';
import { setupCamera } from '../ui/camera';
import { C, T, bold, chip, hints, panel, scanlines } from '../ui/kit';
import { wipeTo } from '../ui/transition';
import { audio } from '../audio/audio';
import { environment, fadeVisibility, showStage, stage, stageOpacity } from '../three/stage';
import { disposeTree } from '../three/dispose';
import { generateArena } from '../tactics/arena';
import { createRng } from '../core/rng';
import { CharacterRig } from '../three/characters';
import { TIER_LOOK, type EndingTier } from '../core/ending';
import { updateSettings } from '../core/settings';
import { ENDINGS } from '../data/ending';

export interface EndingData {
  tier: EndingTier;
  /** this win is the first of its tier: its reward is announced (the save already holds it) */
  fresh: boolean;
  /** what DeathScene gets when the ending is over or skipped */
  next: object;
}

/** Where each avatar stands on the Menu's avenue (cells), and which way it faces. */
const SPOTS: Record<string, [number, number, number]> = {
  hero: [7, 8, 0.4], nyx: [9, 7, -2.4], doc: [10, 7, -2], lo: [6, 9, 1.3], res3: [5, 10, 1.4], res6: [6, 10, 1.6], res1: [9, 9, -2.2],
};
const BEAT_MS = 7500;
const CHARS_PER_S = 45;

/**
 * The ending of a winning run, between the last fight and the score screen: four captioned beats over
 * the night street, each tier with its own text (data/ending.ts). Click / Entrée / Espace go to the next
 * beat, Échap skips everything. Plays about 30 s.
 */
export class EndingScene extends Phaser.Scene {
  private rigs = new Map<string, CharacterRig>();
  private beat = -1;
  private elapsed = 0;
  private shown = 0;
  private leaving = false;
  private built = false;
  private end!: EndingData;
  private rain!: Rain;
  private caption?: Phaser.GameObjects.Text;
  private full = '';
  private beatUi: Phaser.GameObjects.GameObject[] = [];
  private world?: ReturnType<typeof stage>;
  private board?: ReturnType<typeof generateArena>['board'];
  private drift = 0;
  constructor() { super(SCENES.Ending); }

  create(data: EndingData) {
    this.end = data;
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    this.leaving = false; this.built = false; this.beat = -1; this.elapsed = 0; this.rigs = new Map();
    setupCamera(this).fadeIn(500, 5, 3, 15);
    audio.setMusic('hub');
    if (data.fresh) updateSettings({ look: TIER_LOOK[data.tier] });
    const world = stage(this.game.canvas);
    this.world = world;
    showStage(true, this.game.canvas);
    stageOpacity(0);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      showStage(false); stageOpacity(1);
      this.rigs.forEach(r => { world.scene.remove(r.root); disposeTree(r.root); });
      this.rigs.clear();
    });
    const { board } = generateArena('avenue', createRng(12), 0);
    this.board = board;
    const wanted = new Set(ENDINGS[data.tier].beats.flatMap(b => b.cast));
    void environment(world).then(() => (this.scene.isActive() ? world.buildBoard(board, 12) : undefined)).then(() => {
      if (!this.scene.isActive()) return;
      for (const kind of wanted) {
        const spot = SPOTS[kind];
        if (!spot) continue;
        const r = new CharacterRig(kind);
        let cx = spot[0];
        while (cx < board.w - 1 && board.cells[spot[1] * board.w + cx] !== 'floor') cx++;
        r.root.position.copy(world.cellPos({ x: cx, y: spot[1] }));
        r.root.rotation.y = spot[2];
        r.root.visible = false;
        world.scene.add(r.root as THREE.Object3D);
        this.rigs.set(kind, r);
      }
      this.built = true;
      this.frameBeat();
    });

    // Letterbox, scanlines, rain: a film look over the street.
    this.rain = new Rain(this, W, H, 80);
    const shade = this.add.graphics().setDepth(10);
    shade.fillStyle(C.deep, 1).fillRect(0, 0, W, 22).fillRect(0, H - 76, W, 76);
    shade.fillGradientStyle(C.deep, C.deep, C.deep, C.deep, 0, 0, 1, 1).fillRect(0, H - 100, W, 24);
    scanlines(shade, 0, 0, W, H, 0, 0x000000, 0.12, 1);
    this.add.graphics().setDepth(11).fillStyle(C.cyan, 0.8).fillRect(28, 21, 30, 2);
    chip(this, 30, 11, ENDINGS[data.tier].chapter, C.yellow, { size: 5.5, filled: true }).setDepth(12);
    hints(this, W - 100, H - 8, [['CLIC', 'Suite'], ['ÉCHAP', 'Passer']], C.cyan).setDepth(12);

    this.input.keyboard!.on('keydown-ESC', () => this.leave());
    this.input.keyboard!.on('keydown-ENTER', () => this.advance());
    this.input.keyboard!.on('keydown-SPACE', () => this.advance());
    this.time.delayedCall(400, () => this.input.on('pointerdown', () => this.advance()));
    this.nextBeat();
  }

  private beats() { return ENDINGS[this.end.tier].beats; }

  /** Fades out, shows the next beat, fades in; after the last one, the score screen. */
  private advance() {
    if (this.leaving) return;
    if (this.beat >= this.beats().length - 1) { this.leave(); return; }
    this.nextBeat();
  }

  private nextBeat() {
    this.beat++;
    audio.sfx('endBeat', { pitch: 1 + this.beat * 0.06 });
    this.elapsed = 0;
    this.shown = 0;
    this.drift = 0;
    const cam = this.cameras.main;
    cam.fadeIn(350, 5, 3, 15);
    this.beatUi.forEach(o => o.destroy());
    this.beatUi = [];
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT, n = this.beats().length, b = this.beats()[this.beat];
    this.full = b.text;
    const box = panel(this, 36, H - 70, W - 72, 52, { accent: C.yellow, cut: 6, dots: 'br', marks: false });
    box.setDepth(12);
    this.caption = txt(this, 50, H - 62, '', 8, T.text).setOrigin(0, 0).setWordWrapWidth(W - 100).setLineSpacing(3).setDepth(13);
    const pips = bold(this, W - 44, H - 28, `${this.beat + 1} / ${n}`, 5, T.mute).setOrigin(1, 0.5).setDepth(13);
    this.beatUi.push(box, this.caption, pips);
    if (this.beat === n - 1 && this.end.fresh) this.rewardCard();
    this.frameBeat();
    if (this.built) {
      const hero = this.rigs.get('hero');
      if (hero && (this.beat === 0 || this.beat === n - 1)) hero.play('victory');
    }
  }

  private rewardCard() {
    const W = CONFIG.WIDTH, r = ENDINGS[this.end.tier].reward, pw = 280, left = (W - pw) / 2;
    const p = panel(this, left, 32, pw, 40, { accent: C.magenta, title: 'DÉBLOQUÉ', titleSize: 9, code: 'RÉCOMPENSE', dots: 'br' }).setDepth(13);
    const t = bold(this, W / 2, 47, r.title, 10, T.magenta).setOrigin(0.5).setDepth(14);
    const l = txt(this, W / 2, 59, r.line, 5.5, T.text).setOrigin(0.5).setAlign('center').setWordWrapWidth(pw - 24).setDepth(14);
    this.beatUi.push(p, t, l);
    audio.sfx('endUnlock');
  }

  /** Who is on screen in this beat, and the camera on them. */
  private frameBeat() {
    if (!this.built || !this.world || !this.board || this.beat < 0) return;
    const world = this.world, b = this.beats()[this.beat], vw = CONFIG.WIDTH * CONFIG.ZOOM, vh = CONFIG.HEIGHT * CONFIG.ZOOM;
    this.rigs.forEach((r, kind) => { r.root.visible = b.cast.includes(kind); if (r.root.visible && kind !== 'hero') r.play(b.cast.length > 2 ? 'talk' : 'idle'); });
    const pts = b.cast.map(k => this.rigs.get(k)?.root.position).filter((p): p is THREE.Vector3 => !!p);
    if (!pts.length) return;
    const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const project = () => { const v = c.clone().setY(1).project(world.camera); return [(v.x * 0.5 + 0.5) * vw, (0.5 - v.y * 0.5) * vh] as const; };
    world.frameBoard(vw, vh, 0);
    const [px, py] = project();
    world.zoomAt(b.zoom, px, py, vw, vh);
    const [qx, qy] = project();
    world.panScreen(qx - vw / 2, qy - vh * 0.36, vw);
  }

  private leave() {
    if (this.leaving) return;
    this.leaving = true;
    wipeTo(this, SCENES.Death, this.end.next);
  }

  update(_t: number, dt: number) {
    this.rain.update(dt);
    if (!this.leaving) {
      this.elapsed += dt;
      this.shown = Math.min(this.full.length, this.shown + dt / 1000 * CHARS_PER_S);
      this.caption?.setText(this.full.slice(0, Math.floor(this.shown)));
      if (this.elapsed > BEAT_MS) this.advance();
    }
    const world = this.world;
    if (!world) return;
    this.rigs.forEach(r => r.update(dt / 1000));
    // A slow drift of the camera, so the still street is never frozen.
    if (this.built) { this.drift += dt / 1000; world.panScreen(Math.sin(this.drift * 0.6) * dt * 0.01, 0, CONFIG.WIDTH * CONFIG.ZOOM); }
    stageOpacity(Math.min(fadeVisibility(this.cameras.main.fadeEffect), this.built ? 1 : 0));
    world.frame();
  }
}
