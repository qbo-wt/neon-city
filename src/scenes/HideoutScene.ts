import Phaser from 'phaser';
import { CONFIG, COLORS, SCENES } from '../config';
import { loadSave, writeSave, type SaveData } from '../core/save';
import { computeStats } from '../core/stats';
import { getStorage } from '../core/storage';
import type { RoomTemplate } from '../data/rooms';
import { Player } from '../entities/Player';
import { Controls } from '../input/controls';
import { buildRoom } from '../systems/roomBuilder';
import { SkillTreePanel } from '../ui/SkillTreePanel';
import { HelpOverlay } from '../ui/HelpOverlay';
import { txt } from '../ui/text';
import { setupCamera } from '../ui/camera';
import { HUD_H } from './RunScene';

const HIDEOUT: RoomTemplate = { id: 'hideout', grid: [
  '###############',
  '#.............#',
  '#.............#',
  '#.............#',
  '#.............#',
  '#.............#',
  '#......P......#',
  '###############',
] };

/** Solid furniture: [texture, x, y]. Positions are texture centres in world pixels. */
const FURNITURE: [string, number, number][] = [
  ['desk', 80, 48],
  ['rack', 44, 132],
  ['bed', 80, 196],
  ['couch', 368, 162],
  ['table', 368, 130],
  ['kitchen', 392, 212],
  ['plant', 196, 44],
  ['plant', 436, 50],
];

/** The hub: an original megabuilding studio. Terminal = permanent skill tree, door = start a run. */
export class HideoutScene extends Phaser.Scene {
  private save!: SaveData;
  private player!: Player;
  private controls!: Controls;
  private panel!: SkillTreePanel;
  private help!: HelpOverlay;
  private terminal = { x: 80, y: 74 };
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

    const built = buildRoom(this, HIDEOUT, 1, 'floor-home', false, 'wall-home');
    (built.doorSlots[0].locked as Phaser.GameObjects.Image).setTexture('door');
    this.add.image(this.door.x, this.door.y + 22, 'glow').setTint(COLORS.cyan).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD);

    // Window onto the city, with its glow spilling on the floor.
    this.add.image(368, 15, 'window-city').setDepth(1);
    this.add.image(368, 50, 'glow').setScale(2.6, 0.9).setTint(COLORS.magenta).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD).setDepth(1);
    this.add.image(240, 140, 'rug').setDepth(0.5);

    for (const [key, x, y] of FURNITURE) {
      const f = built.walls.create(x, y, key) as Phaser.Physics.Arcade.Image;
      f.setDepth(2);
      (f.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    }
    this.add.image(this.terminal.x, 40, 'glow').setTint(COLORS.cyan).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(3);
    this.add.image(80, 226, 'glow').setScale(1.2, 0.4).setTint(COLORS.cyan).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(1);

    const sign = txt(this, 150, 16, 'HOME', 9, '#ff2a6d').setOrigin(0.5).setDepth(3);
    this.tweens.add({ targets: sign, alpha: 0.5, yoyo: true, repeat: -1, duration: 90, repeatDelay: 2600 });

    this.controls = new Controls(this);
    this.player = new Player(this, built.start.x, built.start.y, computeStats([], this.save.ownedNodes), this.controls);
    this.physics.add.collider(this.player, built.walls);

    this.panel = new SkillTreePanel(this, () => this.save, s => { this.save = s; writeSave(storage, s); this.refreshInfo(); });
    this.help = new HelpOverlay(this);

    txt(this, 4, -HUD_H + 3, 'NEON CITY — PLANQUE', 7, '#00f0ff');
    this.info = txt(this, CONFIG.WIDTH - 4, -HUD_H + 3, '', 7, '#f5e663').setOrigin(1, 0);
    this.prompt = txt(this, 0, 0, '', 7, '#e8e8ff').setOrigin(0.5).setDepth(50);
    this.refreshInfo();
  }

  private refreshInfo() {
    this.info.setText(`${this.save.credits}¢   runs ${this.save.runs}   record secteur ${this.save.bestRoom}`);
    this.player?.setStats(computeStats([], this.save.ownedNodes));
  }

  update(time: number) {
    if (this.panel.isOpen || this.help.isOpen) {
      this.player.inputEnabled = false;
      this.player.tick(time);
      if (this.panel.isOpen && (this.controls.escape() || this.controls.interact())) this.panel.close();
      return;
    }
    this.player.inputEnabled = !this.leaving;
    this.player.tick(time);

    const near = (p: { x: number; y: number }, r: number) => Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y) < r;
    if (near(this.terminal, 30)) {
      this.prompt.setText('[E] terminal du doc').setPosition(this.terminal.x, this.terminal.y + 14);
      if (this.controls.interact()) this.panel.open();
    } else if (near(this.door, 50)) {
      this.prompt.setText('[E] sortir dans Neon City').setPosition(this.door.x, this.door.y + 30);
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
