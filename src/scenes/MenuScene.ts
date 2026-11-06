import Phaser from 'phaser';
import { CONFIG, COLORS, SCENES } from '../config';
import { Rain } from '../fx/effects';
import { txt } from '../ui/text';
import { setupCamera } from '../ui/camera';
import { HelpOverlay } from '../ui/HelpOverlay';

export class MenuScene extends Phaser.Scene {
  private rain!: Rain;
  private title!: Phaser.GameObjects.Text;
  private ghost!: Phaser.GameObjects.Text;

  constructor() { super(SCENES.Menu); }

  create() {
    setupCamera(this);
    const { WIDTH: W, HEIGHT: H } = CONFIG;
    // Skyline silhouettes with lit windows.
    const g = this.add.graphics();
    for (let x = 0; x < W; x += 24 + Math.floor(Math.random() * 16)) {
      const h = 60 + Math.random() * 120, w = 20 + Math.random() * 20;
      g.fillStyle(0x140f2b).fillRect(x, H - h, w, h);
      for (let wy = H - h + 6; wy < H - 6; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 5)
        if (Math.random() < 0.18) g.fillStyle(Math.random() < 0.7 ? 0xf5e663 : 0xff2a6d, 0.8).fillRect(wx, wy, 2, 3);
    }
    this.add.image(W / 2, 80, 'glow').setScale(5, 2).setTint(0xff2a6d).setAlpha(0.35);
    this.rain = new Rain(this, W, H, 90);

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
    txt(this, W / 2, 196, 'ou ENTRÉE', 7, '#8a86b0').setOrigin(0.5);

    new HelpOverlay(this);
    txt(this, W - 24, H - 12, 'commandes', 7, '#8a86b0').setOrigin(1, 0.5);
  }

  private started = false;
  private start() {
    if (this.started) return;
    this.started = true;
    this.cameras.main.fadeOut(250, 11, 8, 32);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SCENES.Hideout));
  }

  update(_t: number, dt: number) {
    this.rain.update(dt);
    // Occasional chromatic glitch on the title.
    const glitch = Math.random() < 0.06;
    this.ghost.setPosition(CONFIG.WIDTH / 2 + (glitch ? Phaser.Math.Between(-4, 4) : 2), 70 + (glitch ? Phaser.Math.Between(-2, 2) : 0));
    this.title.setAlpha(Math.random() < 0.02 ? 0.4 : 1);
  }
}
