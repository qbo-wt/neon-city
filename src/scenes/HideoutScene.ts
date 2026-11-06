import Phaser from 'phaser';
import { CONFIG, COLORS, SCENES } from '../config';
import { loadSave, writeSave, type SaveData } from '../core/save';
import { computeStats } from '../core/stats';
import { getStorage } from '../core/storage';
import type { RoomTemplate } from '../data/rooms';
import { Player } from '../entities/Player';
import { Rain } from '../fx/effects';
import { Controls } from '../input/controls';
import { buildRoom } from '../systems/roomBuilder';
import { SkillTreePanel } from '../ui/SkillTreePanel';
import { txt } from '../ui/text';
import { setupCamera } from '../ui/camera';
import { HUD_H } from './RunScene';

const HIDEOUT: RoomTemplate = { id: 'hideout', grid: [
  '###############',
  '#.............#',
  '#.............#',
  '#.............#',
  '#o...........o#',
  '#.............#',
  '#......P......#',
  '###############',
] };

/** The hub: a terminal for the permanent skill tree and a door to start a run. */
export class HideoutScene extends Phaser.Scene {
  private save!: SaveData;
  private player!: Player;
  private controls!: Controls;
  private panel!: SkillTreePanel;
  private rain!: Rain;
  private terminal = { x: 64, y: 72 };
  private door = { x: 240, y: 16 };
  private prompt!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private leaving = false;

  constructor() { super(SCENES.Hideout); }

  create() {
    this.leaving = false;
    const storage = getStorage();
    this.save = loadSave(storage);
    setupCamera(this, -HUD_H).fadeIn(250, 11, 8, 32);

    const built = buildRoom(this, HIDEOUT, 1);
    (built.doorSlots[0].locked as Phaser.GameObjects.Image).setTexture('door');
    this.add.image(this.door.x, this.door.y + 22, 'glow').setTint(COLORS.cyan).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);

    // Terminal: a glowing screen on a desk.
    const t = this.add.graphics().setDepth(2);
    t.fillStyle(0x05030f).fillRect(this.terminal.x - 14, this.terminal.y - 12, 28, 22);
    t.fillStyle(0x06303a).fillRect(this.terminal.x - 12, this.terminal.y - 10, 24, 14);
    t.fillStyle(COLORS.cyan).fillRect(this.terminal.x - 10, this.terminal.y - 8, 14, 1).fillRect(this.terminal.x - 10, this.terminal.y - 5, 18, 1).fillRect(this.terminal.x - 10, this.terminal.y - 2, 9, 1);
    this.add.image(this.terminal.x, this.terminal.y, 'glow').setTint(COLORS.cyan).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD);
    // Neon sign over the room.
    txt(this, 400, 50, 'PLANQUE', 9, '#ff2a6d').setOrigin(0.5).setDepth(3);

    this.controls = new Controls(this);
    this.player = new Player(this, built.start.x, built.start.y, computeStats([], this.save.ownedNodes), this.controls);
    this.physics.add.collider(this.player, built.walls);

    this.panel = new SkillTreePanel(this, () => this.save, s => { this.save = s; writeSave(storage, s); this.refreshInfo(); });
    this.rain = new Rain(this, CONFIG.WIDTH, 256, 25);

    txt(this, 4, -HUD_H + 3, 'NEON CITY — PLANQUE', 7, '#00f0ff');
    this.info = txt(this, CONFIG.WIDTH - 4, -HUD_H + 3, '', 7, '#f5e663').setOrigin(1, 0);
    this.prompt = txt(this, 0, 0, '', 7, '#e8e8ff').setOrigin(0.5).setDepth(50);
    this.refreshInfo();
  }

  private refreshInfo() {
    this.info.setText(`${this.save.credits}¢   runs ${this.save.runs}   record secteur ${this.save.bestRoom}`);
    this.player?.setStats(computeStats([], this.save.ownedNodes));
  }

  update(time: number, delta: number) {
    this.rain.update(Math.min(delta, CONFIG.MAX_DT_MS));
    if (this.panel.isOpen) {
      this.player.inputEnabled = false;
      this.player.tick(time);
      if (this.controls.escape() || this.controls.interact()) this.panel.close();
      return;
    }
    this.player.inputEnabled = !this.leaving;
    this.player.tick(time);

    const near = (p: { x: number; y: number }, r: number) => Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y) < r;
    if (near(this.terminal, 30)) {
      this.prompt.setText('[E] terminal').setPosition(this.terminal.x, this.terminal.y - 22);
      if (this.controls.interact()) this.panel.open();
    } else if (near(this.door, 50)) {
      this.prompt.setText('[E] partir en run').setPosition(this.door.x, this.door.y + 30);
      if (this.controls.interact() && !this.leaving) {
        this.leaving = true;
        this.cameras.main.fadeOut(250, 11, 8, 32);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SCENES.Run, { seed: Date.now() >>> 0 }));
      }
    } else {
      this.prompt.setText('');
    }
  }
}
