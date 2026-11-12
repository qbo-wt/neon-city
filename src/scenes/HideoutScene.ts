import { SCENES } from '../config';
import type { RoomTemplate } from '../data/rooms';
import { HistoryPanel } from '../ui/HistoryPanel';
import { WeaponPanel } from '../ui/WeaponPanel';
import { CodexPanel } from '../ui/CodexPanel';
import { GuidePanel } from '../ui/GuidePanel';
import { isCovered } from '../ui/transition';
import { WEAPONS } from '../data/weapons';
import { InteriorScene } from './InteriorScene';
import type { Interior3D } from '../three/Interior3D';
import { APT, buildApartment } from '../three/interior/apartment';

/**
 * The player's studio. Terminal = run history, server = bestiary, weapon wall = weapon and
 * aspects; the door leads to the building corridor. The set is in three/interior/apartment.
 */
export class HideoutScene extends InteriorScene {
  protected readonly placeName = 'APPART';
  protected readonly grid: RoomTemplate = { id: 'hideout', grid: APT.grid };
  protected readonly roomOptions = { floorKey: null, wallKey: null, streetLights: false };
  private history!: HistoryPanel;
  private weapons!: WeaponPanel;
  private codex!: CodexPanel;
  private guide!: GuidePanel;

  constructor() { super(SCENES.Hideout); }

  protected set3d(v: Interior3D) { return buildApartment(v); }

  protected spawnPoint(data: Record<string, unknown>) {
    return data.from === 'building' ? APT.fromDoor : this.built.start;
  }

  protected layout() {
    for (const [x, y, w, h] of APT.blockers) this.block(x, y, w, h);
    this.history = new HistoryPanel(this, () => this.save.history, () => this.save.daily);
    this.modals.push(this.history);
    this.weapons = new WeaponPanel(this, () => this.save, s => this.persistSave(s));
    this.modals.push(this.weapons);
    this.codex = new CodexPanel(this, () => this.save);
    this.modals.push(this.codex);
    this.guide = new GuidePanel(this);
    this.modals.push(this.guide);
    this.autoGuide();
    this.interactions.push(
      { ...APT.desk, r: 30, label: 'Terminal — historique des runs', action: () => this.history.open() },
      // The datapad lies on the right end of the desk.
      { x: APT.desk.x + 36, y: APT.desk.y, r: 16, label: 'Datapad — guide du runner', action: () => this.guide.open() },
      { ...APT.door, r: 30, label: 'Sortir dans le couloir', action: () => this.go(SCENES.Building, { from: 'apartment' }) },
      { ...APT.server, r: 24, label: 'Serveur — bestiaire', action: () => this.codex.open() },
      { ...APT.rack, r: 30, label: `Râtelier d'armes (${WEAPONS[this.save.weapon].name})`, action: () => this.weapons.open() },
    );
  }

  /** The very first time in the apartment, the guide opens by itself (once the room is shown). */
  private autoGuide() {
    if (this.save.story.flags.includes('guide-seen')) return;
    const tryOpen = () => {
      if (!this.scene.isActive() || this.leaving) return;
      if (isCovered()) { this.time.delayedCall(200, tryOpen); return; }
      this.persistSave({ ...this.save, story: { ...this.save.story, flags: [...this.save.story.flags, 'guide-seen'] } });
      this.guide.open();
    };
    this.time.delayedCall(600, tryOpen);
  }

  protected onModalTick() {
    const n = this.controls.numberPressed();
    if (this.weapons.isOpen) { if (n) this.weapons.select(n); if (this.controls.tab()) this.weapons.back(); return; }
    if (n === 1) this.history.setFilter('recent');
    if (n === 2) this.history.setFilter('best');
    if (n === 3) this.history.setFilter('daily');
  }
}
