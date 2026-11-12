import Phaser from 'phaser';
import { CONFIG, COLORS, SCENES } from '../config';
import { txt } from '../ui/text';
import { setupCamera } from '../ui/camera';
import { HelpOverlay } from '../ui/HelpOverlay';
import { audio } from '../audio/audio';
import { environment, fadeVisibility, showStage, stage, stageOpacity } from '../three/stage';
import { generateArena } from '../tactics/arena';
import { createRng } from '../core/rng';
import { CharacterRig } from '../three/characters';
import type * as THREE from 'three';

export class MenuScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;
  private ghost!: Phaser.GameObjects.Text;

  constructor() { super(SCENES.Menu); }

  private rigs: CharacterRig[] = [];
  private t = 0;

  create() {
    setupCamera(this);
    const { WIDTH: W, HEIGHT: H } = CONFIG;
    // Behind the title: the 3D street at night, the camera drifting along it, a few people in the rain.
    this.rigs = [];
    const world = stage(this.game.canvas);
    showStage(true, this.game.canvas);
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
    });
    this.add.rectangle(W / 2, 90, W, 90, 0x05030f, 0.45);
    this.add.image(W / 2, 80, 'glow').setScale(5, 2).setTint(0xff2a6d).setAlpha(0.25);

    this.ghost = txt(this, W / 2, 70, 'NEON CITY', 40, '#00f0ff').setOrigin(0.5).setAlpha(0.6);
    this.title = txt(this, W / 2, 70, 'NEON CITY', 40, '#ff2a6d').setOrigin(0.5).setStroke('#05030f', 4);
    txt(this, W / 2, 104, 'Plus de chrome. Moins d\'humain.', 10, '#f5e663').setOrigin(0.5);

    const play = this.add.container(W / 2, 170, [
      this.add.rectangle(0, 0, 120, 22, 0x140f2b, 0.9).setStrokeStyle(1, COLORS.cyan),
      txt(this, 0, 0, 'JOUER', 11, '#e8e8ff').setOrigin(0.5),
    ]).setSize(120, 22).setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: play, alpha: 0.6, yoyo: true, repeat: -1, duration: 700 });
    play.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.button === 0) this.start(); });
    this.input.keyboard!.once('keydown-ENTER', () => this.start());
    txt(this, W / 2, 196, 'Ou appuie sur ENTRÉE', 7, '#8a86b0').setOrigin(0.5);

    new HelpOverlay(this);
    audio.setMusic('hub');
    txt(this, W - 24, H - 12, 'Commandes', 7, '#8a86b0').setOrigin(1, 0.5);
  }

  private started = false;
  private start() {
    if (this.started) return;
    this.started = true;
    audio.sfx('uiOpen');
    this.cameras.main.fadeOut(250, 11, 8, 32);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SCENES.Hideout));
  }

  update(_t: number, dt: number) {
    const world = stage(this.game.canvas);
    this.t += dt / 1000;
    this.rigs.forEach(r => r.update(dt / 1000));
    world.panScreen(Math.sin(this.t * 0.15) * dt * 0.012, 0, CONFIG.WIDTH * CONFIG.ZOOM);
    stageOpacity(fadeVisibility(this.cameras.main.fadeEffect));
    world.frame();
    // Occasional chromatic glitch on the title.
    const glitch = Math.random() < 0.06;
    this.ghost.setPosition(CONFIG.WIDTH / 2 + (glitch ? Phaser.Math.Between(-4, 4) : 2), 70 + (glitch ? Phaser.Math.Between(-2, 2) : 0));
    this.title.setAlpha(Math.random() < 0.02 ? 0.4 : 1);
  }
}
