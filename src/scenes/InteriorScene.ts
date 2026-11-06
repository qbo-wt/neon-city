import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import { loadSave, writeSave, type SaveData } from '../core/save';
import { computeStats } from '../core/stats';
import { getStorage } from '../core/storage';
import type { RoomTemplate } from '../data/rooms';
import { Npc, type NpcActivity, type NpcOpts } from '../entities/Npc';
import { Player } from '../entities/Player';
import { Controls } from '../input/controls';
import { buildRoom, type BuiltRoom, type RoomOptions } from '../systems/roomBuilder';
import { setupCamera } from '../ui/camera';
import { HelpOverlay } from '../ui/HelpOverlay';
import { txt } from '../ui/text';

export const HUD_H = 14;

export interface Interaction {
  x: number; y: number; r: number;
  label: string;
  action: () => void;
  /** Moving target (NPC): its live position is used instead of x/y. */
  follow?: { x: number; y: number };
}

export interface Modal { isOpen: boolean; close(): void }

/**
 * Shared base for walkable, non-combat places (apartment, corridor, shops):
 * explore-mode player, NPCs, "[E]" interactions, modal panels and fade transitions.
 */
export abstract class InteriorScene extends Phaser.Scene {
  protected save!: SaveData;
  protected player!: Player;
  protected controls!: Controls;
  protected built!: BuiltRoom;
  protected interactions: Interaction[] = [];
  protected modals: Modal[] = [];
  protected leaving = false;
  private npcs: Npc[] = [];
  private npcGroup!: Phaser.Physics.Arcade.Group;
  private prompt!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private help!: HelpOverlay;

  protected abstract readonly grid: RoomTemplate;
  protected abstract readonly roomOptions: RoomOptions;
  protected abstract readonly placeName: string;
  /** Build props, NPCs and interactions. Called before the player exists. */
  protected abstract layout(data: Record<string, unknown>): void;
  /** Where the player appears, depending on where they came from. */
  protected abstract spawnPoint(data: Record<string, unknown>): { x: number; y: number };
  /** Extra per-frame handling while a modal is open (e.g. tab keys). */
  protected onModalTick(): void {}

  create(data: Record<string, unknown> = {}) {
    this.leaving = false;
    this.interactions = [];
    this.modals = [];
    this.npcs = [];
    this.save = loadSave(getStorage());
    setupCamera(this, -HUD_H).fadeIn(250, 11, 8, 32);

    this.built = buildRoom(this, this.grid, 0, this.roomOptions);
    this.npcGroup = this.physics.add.group({ immovable: true });
    this.layout(data);

    this.controls = new Controls(this);
    const p = this.spawnPoint(data);
    this.player = new Player(this, p.x, p.y, computeStats([], this.save.ownedNodes), this.controls, 'explore');
    this.physics.add.collider(this.player, this.built.walls);
    this.physics.add.collider(this.player, this.npcGroup);
    this.physics.add.collider(this.npcGroup, this.built.walls);

    this.help = new HelpOverlay(this);
    txt(this, 4, -HUD_H + 3, `NEON CITY — ${this.placeName}`, 7, '#00f0ff');
    this.info = txt(this, CONFIG.WIDTH - 4, -HUD_H + 3, '', 7, '#f5e663').setOrigin(1, 0);
    this.prompt = txt(this, 0, 0, '', 7, '#e8e8ff').setOrigin(0.5).setDepth(50).setStroke('#05030f', 3);
    this.refreshInfo();
  }

  protected refreshInfo() {
    this.info.setText(`${this.save.credits}¢   Runs : ${this.save.runs}   Record : secteur ${this.save.bestRoom}`);
    this.player?.setStats(computeStats([], this.save.ownedNodes));
  }

  protected persistSave(s: SaveData) {
    this.save = s;
    writeSave(getStorage(), s);
    this.refreshInfo();
  }

  /** Static, solid prop centred at (x, y). */
  protected solid(key: string, x: number, y: number, depth = 2) {
    const f = this.built.walls.create(x, y, key) as Phaser.Physics.Arcade.Image;
    f.setDepth(depth);
    (f.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    return f;
  }

  protected glow(x: number, y: number, color: number, alpha = 0.3, sx = 1, sy = 1) {
    return this.add.image(x, y, 'glow').setTint(color).setAlpha(alpha).setScale(sx, sy).setBlendMode(Phaser.BlendModes.ADD).setDepth(1);
  }

  protected npc(look: string, x: number, y: number, activity: NpcActivity, opts: NpcOpts = {}) {
    const n = new Npc(this, x, y, look, activity, opts.bounds ?? new Phaser.Geom.Rectangle(48, 48, 384, 160), opts);
    this.npcGroup.add(n);
    this.npcs.push(n);
    if (opts.name) this.interactions.push({ x, y, r: 24, follow: n, label: `Parler à ${opts.name}`, action: () => n.speak() });
    return n;
  }

  /** Neon sign on a wall: boxed label plus a light pool. */
  protected sign(x: number, y: number, label: string, color: number, size = 7) {
    const hexc = '#' + color.toString(16).padStart(6, '0');
    const t = txt(this, x, y, label, size, hexc).setOrigin(0.5).setDepth(4);
    this.add.rectangle(x, y, t.width + 8, t.height + 2, 0x05030f, 0.85).setStrokeStyle(1, color).setDepth(3.9);
    this.tweens.add({ targets: t, alpha: 0.45, yoyo: true, repeat: -1, duration: 70, repeatDelay: 2500 + Math.random() * 3000 });
    return t;
  }

  protected go(key: string, data: Record<string, unknown> = {}, banner?: string) {
    if (this.leaving) return;
    this.leaving = true;
    if (banner) txt(this, CONFIG.WIDTH / 2, 120, banner, 10, '#f5e663').setOrigin(0.5).setDepth(300).setStroke('#05030f', 4);
    this.cameras.main.fadeOut(banner ? 600 : 250, 11, 8, 32);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(key, data));
  }

  update(time: number) {
    const open = this.modals.find(m => m.isOpen);
    this.npcs.forEach(n => n.tick(time));
    if (open || this.help.isOpen) {
      this.player.inputEnabled = false;
      this.player.tick(time);
      this.prompt.setText('');
      if (open) {
        this.onModalTick();
        if (this.controls.escape() || this.controls.interact()) open.close();
      }
      return;
    }
    this.player.inputEnabled = !this.leaving;
    this.player.tick(time);

    const near = this.interactions
      .map(i => ({ i, d: Phaser.Math.Distance.Between(this.player.x, this.player.y, i.follow?.x ?? i.x, i.follow?.y ?? i.y) }))
      .filter(o => o.d < o.i.r)
      .sort((a, b) => a.d - b.d)[0]?.i;
    if (near) {
      this.prompt.setText(`[E] ${near.label}`).setPosition(Phaser.Math.Clamp(this.player.x, 60, CONFIG.WIDTH - 60), this.player.y - 18);
      if (this.controls.interact() && !this.leaving) near.action();
    } else {
      this.prompt.setText('');
    }
  }
}

export const NEON = COLORS;
