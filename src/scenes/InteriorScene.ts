import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import { loadSave, writeSave, type SaveData } from '../core/save';
import { getStorage } from '../core/storage';
import type { RoomTemplate } from '../data/rooms';
import { Npc, type NpcActivity, type NpcOpts } from '../entities/Npc';
import { Player } from '../entities/Player';
import { Controls } from '../input/controls';
import { buildRoom, type BuiltRoom, type RoomOptions } from '../systems/roomBuilder';
import { setupCamera } from '../ui/camera';
import { HelpOverlay } from '../ui/HelpOverlay';
import { txt } from '../ui/text';
import { wipeTo } from '../ui/transition';
import { audio } from '../audio/audio';
import { nextLine } from '../core/story';
import type { StoryNpc } from '../data/story';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { floatText } from '../fx/effects';
import { BACK_Y, HEAD_PX, Interior3D, type InteriorStyle } from '../three/Interior3D';
import { showStage, stage, stageOpacity, fadeVisibility } from '../three/stage';
import type { AnimName } from '../three/rigs';

/** Which anime avatar plays which 2D look. Residents cycle through ten faces. */
const modelFor = (look: string) => look === 'npc-lo' ? 'lo' : look === 'npc-doc' ? 'doc' : look === 'npc-nyx' ? 'nyx'
  : look.startsWith('res-') ? `res${Number(look.slice(4)) % 10}` : 'res0';

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
  /** Materials and lighting of the 3D version of the room. */
  protected readonly style3d: InteriorStyle = 'home';
  private view3d?: Interior3D;
  /** Dresses the 3D room (models, lights, screens, signs): see src/three/interior. */
  protected abstract set3d(v: Interior3D): Promise<void>;
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
    audio.setMusic('hub');

    this.built = buildRoom(this, this.grid, 0, this.roomOptions);
    this.npcGroup = this.physics.add.group({ immovable: true });
    // The 3D back wall stands half a tile into the first floor row.
    const top = this.grid.grid.findIndex(r => /[.oP]/.test(r)) * 32;
    if (BACK_Y > top) this.block(0, top, this.built.width, BACK_Y - top);
    this.layout(data);

    this.controls = new Controls(this);
    const p = this.spawnPoint(data);
    this.player = new Player(this, p.x, p.y, this.controls);
    this.physics.add.collider(this.player, this.built.walls);
    this.physics.add.collider(this.player, this.npcGroup);
    this.physics.add.collider(this.npcGroup, this.built.walls);
    this.setup3d();

    this.help = new HelpOverlay(this);
    txt(this, 4, -HUD_H + 3, `NEON CITY — ${this.placeName}`, 7, '#00f0ff');
    this.info = txt(this, CONFIG.WIDTH - 4, -HUD_H + 3, '', 7, '#f5e663').setOrigin(1, 0);
    this.prompt = txt(this, 0, 0, '', 7, '#e8e8ff').setOrigin(0.5).setDepth(50).setStroke('#05030f', 3);
    this.refreshInfo();
  }

  protected refreshInfo() {
    this.info.setText(`${this.save.credits}¢   Runs : ${this.save.runs}   Record : secteur ${this.save.bestRoom}`);
  }

  protected persistSave(s: SaveData) {
    this.save = s;
    writeSave(getStorage(), s);
    this.refreshInfo();
  }

  /**
   * Dialogue for an NPC that remembers you: a reaction to your last run, then their story one beat
   * per run (the last beat gives credits), then their usual lines.
   */
  protected storyTalk(npc: StoryNpc, ambient: string[]): () => string {
    return () => {
      const r = nextLine(npc, this.save, ambient, Math.random, id => ENEMIES[id as EnemyId]?.name);
      if (r.save !== this.save) this.persistSave(r.save);
      if (r.gift) {
        floatText(this, this.player.x, this.player.y - HEAD_PX, `+${r.gift}¢`, '#f5e663', 9);
        audio.sfx('buy');
      }
      return r.line;
    };
  }

  /**
   * The room in 3D under the Phaser scene: anything drawn in 2D is hidden; the shell comes from the
   * grid and the set builder dresses it; the player and NPCs are anime characters following their
   * Phaser bodies. Phaser keeps the logic, the prompts, the speech bubbles and the panels, which
   * stay aligned (same pixel mapping).
   */
  private setup3d() {
    const world = stage(this.game.canvas);
    showStage(true, this.game.canvas);
    const view = new Interior3D(world, this.style3d);
    this.view3d = view;
    for (const o of this.children.list) (o as unknown as { setVisible?: (v: boolean) => void }).setVisible?.(false);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { showStage(false); stageOpacity(1); this.view3d = undefined; });
    void view.build(this.grid.grid, v => this.set3d(v)).then(() => {
      if (this.view3d !== view) return;
      const p = this.player;
      view.character(p, 'player', undefined, () => p.lookDir, () => (Math.hypot((p.body as Phaser.Physics.Arcade.Body).velocity.x, (p.body as Phaser.Physics.Arcade.Body).velocity.y) > 5 ? 'walk' : 'idle'));
      for (const n of this.npcs) {
        const body = n.body as Phaser.Physics.Arcade.Body;
        const moving = () => Math.hypot(body.velocity.x, body.velocity.y) > 3;
        view.character(n, 'npc', modelFor(n.look), () => {
          if (moving()) return { x: body.velocity.x, y: body.velocity.y };
          // Whoever talks turns to the player.
          if (n.speaking && n.activity !== 'cook' && n.activity !== 'play' && n.activity !== 'eat') return { x: this.player.x - n.x, y: this.player.y - n.y };
          const f = n.faceDir;
          return f.facing === 'u' ? { x: 0, y: -1 } : f.facing === 's' ? { x: f.flip ? -1 : 1, y: 0 } : { x: f.flip ? -0.35 : 0.35, y: 1 };
        }, (): AnimName => (moving() ? 'walk' : n.speaking || n.activity === 'talk' || n.activity === 'phone' || n.activity === 'cook' || n.activity === 'dance' ? 'talk' : 'idle'), 0, n.seat);
      }
    }).catch(e => console.error('interior 3D', e));
  }

  /** Invisible solid rectangle (left, top, width, height in world px): furniture footprints. */
  protected block(x: number, y: number, w: number, h: number) {
    const b = this.built.walls.create(x + w / 2, y + h / 2, 'tile-wall') as Phaser.Physics.Arcade.Image;
    b.setDisplaySize(w, h).setVisible(false);
    b.refreshBody();
    return b;
  }

  protected npc(look: string, x: number, y: number, activity: NpcActivity, opts: NpcOpts = {}) {
    const n = new Npc(this, x, y, look, activity, opts.bounds ?? new Phaser.Geom.Rectangle(48, 96, 384, 100), opts);
    this.npcGroup.add(n);
    this.npcs.push(n);
    if (opts.name) this.interactions.push({ x, y, r: 26, follow: n, label: `Parler à ${opts.name}`, action: () => n.speak() });
    return n;
  }

  protected go(key: string, data: Record<string, unknown> = {}, banner?: string) {
    if (this.leaving) return;
    this.leaving = true;
    audio.sfx('door');
    if (banner) txt(this, CONFIG.WIDTH / 2, 120, banner, 10, '#f5e663').setOrigin(0.5).setDepth(300).setStroke('#05030f', 4);
    // With a banner, leave it on screen a moment before the wipe.
    this.time.delayedCall(banner ? 350 : 0, () => wipeTo(this, key, data));
  }

  update(time: number, delta = 16) {
    if (this.view3d) {
      this.view3d.update(Math.min(delta, 50) / 1000);
      stageOpacity(fadeVisibility(this.cameras.main.fadeEffect));
      stage(this.game.canvas).frame();
    }
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
      this.prompt.setText(`[E] ${near.label}`).setPosition(Phaser.Math.Clamp(this.player.x, 60, CONFIG.WIDTH - 60), this.player.y + 1 - HEAD_PX);
      if (this.controls.interact() && !this.leaving) { audio.sfx('ui'); near.action(); }
    } else {
      this.prompt.setText('');
    }
  }
}

export const NEON = COLORS;
