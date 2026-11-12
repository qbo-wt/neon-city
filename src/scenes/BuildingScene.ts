import Phaser from 'phaser';
import { SCENES } from '../config';
import type { RoomTemplate } from '../data/rooms';
import { InteriorScene } from './InteriorScene';
import type { NpcActivity, NpcOpts } from '../entities/Npc';
import { NAMES, RUMORS, SPECIAL_LINES } from '../data/dialogue';
import { RESIDENTS } from '../gfx/npcArt';
import { DescentPanel } from '../ui/DescentPanel';
import type { Interior3D } from '../three/Interior3D';
import { HALL, buildCorridor } from '../three/interior/corridor';

/**
 * Floor 37 of the megabuilding: home, the clinic, Nyx's den and the elevator down to the street,
 * all on the back wall under their signs; Lo's ramen stand and the residents in between.
 * The set is in three/interior/corridor.
 */
export class BuildingScene extends InteriorScene {
  protected readonly placeName = 'IMMEUBLE H-12, ÉTAGE 37';
  protected readonly style3d = 'corridor' as const;
  protected readonly grid: RoomTemplate = { id: 'building', grid: HALL.grid };
  protected readonly roomOptions = { floorKey: null, wallKey: null, streetLights: false };

  private descent!: DescentPanel;

  constructor() { super(SCENES.Building); }

  protected set3d(v: Interior3D) { return buildCorridor(v); }

  protected onModalTick() {
    const n = this.controls.numberPressed();
    if (n && this.descent.isOpen) this.descent.select(n);
  }

  protected spawnPoint(data: Record<string, unknown>) {
    if (data.from === 'doc') return HALL.spawn.doc;
    if (data.from === 'net') return HALL.spawn.net;
    return HALL.spawn.apartment;
  }

  protected layout() {
    this.descent = new DescentPanel(this, () => this.save, s => this.persistSave(s), daily =>
      this.go(SCENES.Run, daily ? { seed: 0, daily: true } : { seed: Date.now() >>> 0 }, daily ? '▼ RUN DU JOUR — NEON CITY' : '▼ REZ-DE-CHAUSSÉE — NEON CITY'));
    this.modals.push(this.descent);
    for (const [x, y, w, h] of HALL.blockers) this.block(x, y, w, h);

    // Residents: the floor never sleeps. Each one has a name and something to say.
    const lane = new Phaser.Geom.Rectangle(60, 118, 360, 56);
    let r = 0;
    const res = (x: number, y: number, activity: NpcActivity, extra: NpcOpts = {}) => {
      const i = r++;
      const lines = extra.lines ?? [RUMORS[(i * 7) % RUMORS.length], RUMORS[(i * 7 + 3) % RUMORS.length]];
      return this.npc(`res-${i % RESIDENTS}`, x, y, activity, {
        name: NAMES[i % NAMES.length], ...extra, lines, talk: this.storyTalk('resident', lines),
      });
    };
    res(120, 130, 'wander', { bounds: lane });
    res(300, 160, 'wander', { bounds: lane });
    res(380, 126, 'wander', { bounds: lane });
    res(185, 108, 'eat', { faceUp: true, seat: 0.66 });
    res(225, 108, 'eat', { faceUp: true, seat: 0.66 });
    res(293, 104, 'play', { faceUp: true, lines: SPECIAL_LINES.gamer });
    res(116, 92, 'phone', { flip: true });
    res(386, 94, 'lean', { flip: true });
    res(80, 197, 'sit', { seat: 0.42 });
    res(166, 199, 'sit', { seat: 0.46 });
    res(302, 199, 'talk', { flip: true, seat: 0.46 });
    res(278, 199, 'talk', { seat: 0.46 });
    res(160, 150, 'talk');
    res(176, 150, 'talk', { flip: true });
    res(452, 160, 'smoke', { flip: true });
    res(60, 162, 'dance', { lines: SPECIAL_LINES.dancer });
    const lo = this.npc('npc-lo', HALL.lo.x, HALL.lo.y, 'cook', { name: 'Mamie Lo', lines: SPECIAL_LINES.lo, talk: this.storyTalk('lo', SPECIAL_LINES.lo) });
    // Lo stands behind her counter: a longer reach than the default.
    this.interactions = this.interactions.filter(i => i.follow !== lo);
    this.interactions.push({ x: HALL.lo.x, y: HALL.lo.y + 22, r: 30, label: 'Parler à Mamie Lo', action: () => lo.speak() });

    this.interactions.push(
      { ...HALL.home, r: 26, label: 'Rentrer à l\'appart', action: () => this.go(SCENES.Hideout, { from: 'building' }) },
      { ...HALL.clinic, r: 28, label: 'Clinique du Doc Kessler (corps)', action: () => this.go(SCENES.Ripperdoc) },
      { ...HALL.den, r: 28, label: 'Repaire de Nyx, netrunneuse (esprit)', action: () => this.go(SCENES.Netrunner) },
      { ...HALL.elevator, r: 34, label: 'Ascenseur — descendre dans la rue', action: () => this.descent.open() },
    );
  }
}
