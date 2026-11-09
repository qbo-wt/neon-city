import type Phaser from 'phaser';
import { COLORS, SCENES } from '../config';
import type { RoomTemplate } from '../data/rooms';
import { HistoryPanel } from '../ui/HistoryPanel';
import { WeaponPanel } from '../ui/WeaponPanel';
import { CodexPanel } from '../ui/CodexPanel';
import { WEAPONS } from '../data/weapons';
import { InteriorScene } from './InteriorScene';

/** Solid furniture: [texture, x, y]. Positions are texture centres in world pixels. */
const FURNITURE: [string, number, number][] = [
  ['desk', 80, 48], ['rack', 44, 132], ['bed', 80, 196], ['couch', 368, 162],
  ['table', 368, 130], ['kitchen', 392, 212], ['plant', 196, 44], ['plant', 436, 50],
];

/** The player's studio. Terminal = run history; the door leads to the building corridor. */
export class HideoutScene extends InteriorScene {
  protected readonly placeName = 'APPART';
  protected readonly grid: RoomTemplate = { id: 'hideout', grid: [
    '#######A#######',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#......P......#',
    '###############',
  ] };
  protected readonly roomOptions = { floorKey: 'floor-home', wallKey: 'wall-home', capKey: 'cap-home', faceVariants: ['wall-home-shelf', 'wall-home-poster'], streetLights: false };
  private history!: HistoryPanel;
  private weapons!: WeaponPanel;
  private codex!: CodexPanel;

  constructor() { super(SCENES.Hideout); }

  protected spawnPoint(data: Record<string, unknown>) {
    return data.from === 'building' ? { x: 240, y: 54 } : this.built.start;
  }

  protected layout() {
    this.built.marks.A[0].obj.setTexture('door');
    this.glow(240, 38, COLORS.cyan, 0.4);
    this.add.image(368, 15, 'window-city').setDepth(1);
    this.glow(368, 50, COLORS.magenta, 0.25, 2.6, 0.9);
    this.add.image(240, 140, 'rug').setDepth(0.5);
    for (const [key, x, y] of FURNITURE) this.solid(key, x, y);
    this.glow(80, 40, COLORS.cyan, 0.35).setDepth(3);
    this.glow(80, 226, COLORS.cyan, 0.3, 1.2, 0.4);
    // The left part of the back wall is kept bare for the weapon rack (no posters there).
    for (const w of this.built.walls.getChildren() as Phaser.Physics.Arcade.Image[]) if (w.y === 16 && w.x < 224) w.setTexture('wall-home');

    this.history = new HistoryPanel(this, () => this.save.history, () => this.save.daily);
    this.modals.push(this.history);
    this.add.image(144, 16, 'gun-rack').setDepth(1.5);
    this.glow(144, 34, COLORS.yellow, 0.25, 1.2, 0.6);
    this.weapons = new WeaponPanel(this, () => this.save, s => this.persistSave(s));
    this.modals.push(this.weapons);
    this.codex = new CodexPanel(this, () => this.save);
    this.modals.push(this.codex);
    this.interactions.push(
      { x: 80, y: 74, r: 30, label: 'Terminal — historique des runs', action: () => this.history.open() },
      { x: 240, y: 40, r: 40, label: 'Sortir dans le couloir', action: () => this.go(SCENES.Building, { from: 'apartment' }) },
      { x: 44, y: 132, r: 26, label: 'Serveur — bestiaire', action: () => this.codex.open() },
      { x: 144, y: 44, r: 24, label: `Râtelier d'armes (${WEAPONS[this.save.weapon].name})`, action: () => this.weapons.open() },
    );
  }

  protected onModalTick() {
    const n = this.controls.numberPressed();
    if (this.weapons.isOpen) { if (n) this.weapons.select(n); if (this.controls.tab()) this.weapons.back(); return; }
    if (n === 1) this.history.setFilter('recent');
    if (n === 2) this.history.setFilter('best');
    if (n === 3) this.history.setFilter('daily');
  }
}
