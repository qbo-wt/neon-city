import Phaser from 'phaser';
import { CONFIG, SCENES } from '../config';
import { txt } from '../ui/text';
import { setupCamera } from '../ui/camera';
import { HelpOverlay } from '../ui/HelpOverlay';
import { Button, C, GlitchText, T, bold, chip, hints, scanlines, skewPoly, stripes } from '../ui/kit';
import { wipeTo } from '../ui/transition';
import { FineRain, Skyline } from '../ui/cityArt';
import { audio } from '../audio/audio';
import { environment, showStage, stage, stageOpacity } from '../three/stage';
import { generateArena } from '../tactics/arena';
import { createRng } from '../core/rng';
import { CharacterRig } from '../three/characters';
import type * as THREE from 'three';

export class MenuScene extends Phaser.Scene {
  constructor() { super(SCENES.Menu); }

  private rigs: CharacterRig[] = [];
  private t = 0;
  /** 3D street opacity: fades in once the board is built */
  private stageA = 0;
  private built = false;
  private play?: Button;
  private sky?: Skyline;
  private rain?: FineRain;

  create() {
    setupCamera(this);
    const { WIDTH: W, HEIGHT: H } = CONFIG;
    this.started = false;
    this.stageA = 0;
    this.built = false;
    // Behind the title: the 3D street at night, the camera drifting along it, a few people in the rain.
    this.rigs = [];
    const world = stage(this.game.canvas);
    showStage(true, this.game.canvas);
    stageOpacity(0);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { showStage(false); stageOpacity(1); this.rigs.forEach(r => world.scene.remove(r.root)); this.rigs = []; });
    const { board } = generateArena('avenue', createRng(12), 0);
    void environment(world).then(() => (this.scene.isActive() ? world.buildBoard(board, 12) : undefined)).then(() => {
      if (!this.scene.isActive()) return;
      world.frameBoard(W * CONFIG.ZOOM, H * CONFIG.ZOOM, 0);
      world.zoomAt(1.9, W * CONFIG.ZOOM * 0.5, H * CONFIG.ZOOM * 0.62, W * CONFIG.ZOOM, H * CONFIG.ZOOM);
      const people: [string, number, number, number][] = [['hero', 7, 8, 0.4], ['runner', 9, 7, -2.4], ['hacker', 10, 7, -2], ['res3', 5, 9, 1.2], ['res6', 6, 10, 1.6]];
      for (const [kind, x, y, yaw] of people) {
        const r = new CharacterRig(kind);
        // Never on a parked car: the first free cell along the row.
        let cx = x;
        while (cx < board.w - 1 && board.cells[y * board.w + cx] !== 'floor') cx++;
        r.root.position.copy(world.cellPos({ x: cx, y }));
        r.root.rotation.y = yaw;
        world.scene.add(r.root as THREE.Object3D);
        this.rigs.push(r);
        void r.ready.then(() => r.play(kind === 'runner' || kind === 'hacker' ? 'talk' : 'idle'));
      }
      this.built = true;
    });

    // Until the 3D street is built, the painted skyline stands in for it; then they cross-fade.
    this.sky = new Skyline(this, -10);
    this.rain = new FineRain(this, 120, -5);

    // Shade the left third and the bottom so the title and the buttons read over the street.
    const shade = this.add.graphics();
    shade.fillGradientStyle(C.deep, C.deep, C.deep, C.deep, 0.92, 0, 0.92, 0).fillRect(0, 0, 290, H);
    shade.fillGradientStyle(C.deep, C.deep, C.deep, C.deep, 0, 0, 0.85, 0.85).fillRect(0, H - 70, W, 70);
    shade.fillGradientStyle(C.deep, C.deep, C.deep, C.deep, 0.6, 0.6, 0, 0).fillRect(0, 0, W, 30);
    scanlines(shade, 0, 0, W, H, 0, 0x000000, 0.12, 1);
    // Frame: corner brackets, a top rule with stripes.
    const deco = this.add.graphics();
    deco.lineStyle(0.5, C.cyan, 0.5).lineBetween(28, 22, W - 28, 22);
    deco.fillStyle(C.cyan, 1).fillRect(28, 21, 30, 2);
    stripes(deco, W - 88, 18, 60, 3, C.magenta, 0.6, 4, 1.5);
    for (const [x, y, sx, sy] of [[8, 8, 1, 1], [W - 8, 8, -1, 1], [8, H - 8, 1, -1], [W - 8, H - 8, -1, -1]]) {
      deco.lineStyle(0.5, C.white, 0.5).beginPath();
      deco.moveTo(x, y + sy * 10); deco.lineTo(x, y); deco.lineTo(x + sx * 10, y); deco.strokePath();
    }
    bold(this, 28, 13, 'NEON//OS 4.2', 5, T.cyan).setOrigin(0, 0.5);
    txt(this, 80, 13, 'DISTRICT 0 // NUIT PERMANENTE', 5, T.mute).setOrigin(0, 0.5);

    chip(this, 30, 50, 'ROGUELITE TACTIQUE', C.magenta, { filled: true, size: 5 });
    const logo = new GlitchText(this, 0, 84, 'NEON CITY', 64, '#f4f1ff', { every: 3200 });
    logo.setX(28 + logo.main.width / 2);
    deco.fillStyle(C.yellow, 1).fillPoints(skewPoly(30, 110, 104, 3, 2), true);
    deco.fillStyle(C.yellow, 0.5).fillPoints(skewPoly(138, 110, 10, 3, 2), true);
    deco.fillStyle(C.yellow, 0.25).fillPoints(skewPoly(152, 110, 5, 3, 2), true);
    txt(this, 30, 121, 'Plus de chrome. Moins d\'humain.', 9, T.yellow).setOrigin(0, 0.5);

    this.play = new Button(this, 30, 148, 150, 22, 'JOUER', { accent: C.yellow, solid: true, key: 'ENTRÉE', size: 14, hoverSfx: true, onClick: () => this.start() });
    const help = new HelpOverlay(this);
    new Button(this, 30, 176, 150, 16, 'COMMANDES', { accent: C.cyan, key: 'I', size: 9, hoverSfx: true, onClick: () => help.toggle() });
    this.input.keyboard!.once('keydown-ENTER', () => this.start());
    hints(this, 0, H - 14, [['ENTRÉE', 'Jouer'], ['I', 'Commandes'], ['M', 'Son']], C.yellow).setX(30);
    txt(this, W - 26, H - 14, 'Avatars VIPE Heroes (CC-BY) · décors Kenney & KayKit (CC0)', 5, T.off).setOrigin(1, 0.5);

    audio.setMusic('hub');
  }

  private started = false;
  private start() {
    if (this.started) return;
    this.started = true;
    audio.sfx('uiOpen');
    this.play?.setCardState('sel');
    wipeTo(this, SCENES.Hideout);
  }

  update(_t: number, dt: number) {
    const world = stage(this.game.canvas);
    this.t += dt / 1000;
    this.rigs.forEach(r => r.update(dt / 1000));
    world.panScreen(Math.sin(this.t * 0.15) * dt * 0.012, 0, CONFIG.WIDTH * CONFIG.ZOOM);
    if (this.built) this.stageA = Math.min(1, this.stageA + dt / 900);
    stageOpacity(this.stageA);
    this.sky?.update(dt / 1000);
    this.sky?.objects.forEach(o => (o as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(1 - this.stageA));
    this.rain?.update(dt);
    world.frame();
    // The play button breathes.
    if (this.play && !this.started) this.play.setAlpha(0.9 + 0.1 * Math.sin(this.t * 4));
  }
}
