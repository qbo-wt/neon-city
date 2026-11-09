import Phaser from 'phaser';
import { COLORS, SCENES } from '../config';
import type { RoomTemplate } from '../data/rooms';
import { txt } from '../ui/text';
import { InteriorScene } from './InteriorScene';
import type { NpcActivity, NpcOpts } from '../entities/Npc';
import { NAMES, RUMORS, SPECIAL_LINES } from '../data/dialogue';
import { RESIDENTS } from '../gfx/npcArt';
import { DescentPanel } from '../ui/DescentPanel';

/** Solid props: [texture, x, y]. Walking lanes are kept clear: home door → corridor, corridor ↔ side doors, corridor → elevator. */
// Door centres on the top wall: x = 48, 144 (home), 240, 336-368 (elevator), 432. Nothing is placed in front of them.
const PROPS: [string, number, number][] = [
  ['plant', 80, 44], ['bike', 112, 50], ['vending', 192, 46], ['vending', 216, 46],
  ['arcade-cab', 276, 46], ['arcade-cab', 300, 46], ['boxes', 400, 46],
  ['boxes', 52, 196], ['boxes', 52, 172], ['mop-bucket', 84, 210],
  ['noodle-cart', 236, 168], ['bench', 160, 214], ['bench', 304, 214], ['laundry', 346, 214],
  ['couch-old', 404, 168], ['trashcan', 436, 214], ['trashcan', 120, 214],
];
/** Wall decor (no collision), only on stretches of top wall between doors. */
const WALL_DECOR: [string, number, number][] = [
  ['poster-0', 76, 14], ['noticeboard', 112, 16], ['poster-1', 176, 14], ['poster-2', 208, 12], ['poster-3', 400, 14],
];

/**
 * Megabuilding floor. a = neighbours' doors, A = home, L = elevator (2 tiles),
 * C = ripperdoc clinic (left wall), N = netrunner den (right wall).
 */
export class BuildingScene extends InteriorScene {
  protected readonly placeName = 'IMMEUBLE H-12, ÉTAGE 37';
  protected readonly grid: RoomTemplate = { id: 'building', grid: [
    '#a##A##a##LL#a#',
    '#.............#',
    '#.............#',
    'C.............N',
    '#.............#',
    '#.............#',
    '#.............#',
    '###############',
  ] };
  protected readonly roomOptions = {
    floorKey: 'floor-corridor', wallKey: 'wall-corridor', capKey: 'cap-corridor', streetLights: false,
    faceVariants: ['wall-corridor-sconce', 'wall-corridor-pipe', 'wall-corridor-panel', 'wall-corridor-graffiti'],
  };

  private descent!: DescentPanel;

  constructor() { super(SCENES.Building); }

  protected onModalTick() {
    const n = this.controls.numberPressed();
    if (n && this.descent.isOpen) this.descent.select(n);
  }

  protected spawnPoint(data: Record<string, unknown>) {
    if (data.from === 'doc') return { x: 56, y: 112 };
    if (data.from === 'net') return { x: 424, y: 112 };
    return { x: 144, y: 54 };
  }

  protected layout() {
    this.descent = new DescentPanel(this, () => this.save, s => this.persistSave(s), daily =>
      this.go(SCENES.Run, daily ? { seed: 0, daily: true } : { seed: Date.now() >>> 0 }, daily ? '▼ RUN DU JOUR — NEON CITY' : '▼ REZ-DE-CHAUSSÉE — NEON CITY'));
    this.modals.push(this.descent);
    const m = this.built.marks;
    m.a.forEach(d => d.obj.setTexture('door-apt'));
    m.A[0].obj.setTexture('door-home');
    m.C[0].obj.setTexture('door-doc');
    m.N[0].obj.setTexture('door-net');
    this.add.image(352, 16, 'elevator').setDepth(1);
    this.add.image(144, 38, 'doormat').setDepth(0.5);

    // Pipes along the top wall, interrupted at every door and at the elevator (they go into the wall there).
    const pipes = this.add.graphics().setDepth(1);
    const openings: [number, number][] = [[36, 60], [132, 156], [228, 252], [324, 380], [420, 444]];
    let from = 32;
    for (const [a, b] of [...openings, [448, 448] as [number, number]]) {
      if (a - from >= 6) {
        pipes.lineStyle(2, 0x3d3352).lineBetween(from, 29, a, 29);
        pipes.lineStyle(1, 0x1d1729).lineBetween(from, 26, a, 26);
        // Flanges where the pipe enters the wall, and one clamp in the middle of long runs.
        pipes.fillStyle(0x4a3f60).fillRect(from, 26, 2, 5).fillRect(a - 2, 26, 2, 5);
        if (a - from > 40) pipes.fillRect(Math.round((from + a) / 2) - 2, 27, 4, 4);
      }
      from = b;
    }

    for (const [key, x, y] of WALL_DECOR) this.add.image(x, y, key).setDepth(1.5);
    for (const [key, x, y] of PROPS) this.solid(key, x, y);

    // Signage: each shop is announced on the wall next to its door.
    this.sign(52, 78, '✚ CLINIQUE', 0xff3b3b, 6);
    this.glow(40, 112, 0xff3b3b, 0.45, 1.2, 1.4);
    this.sign(428, 78, 'NET//DEN', 0x39ff88, 6);
    this.glow(440, 112, 0x39ff88, 0.4, 1.2, 1.4);
    this.plate(352, 3, 'RUE ▼', '#f5e663', 0xf5e663);
    this.sign(236, 140, 'RAMEN DE MAMIE LO', 0xff3b3b, 5);
    this.glow(236, 170, 0xff3b3b, 0.3, 1.6, 1);
    this.glow(288, 60, 0x6a2cff, 0.4, 1.4, 1);
    this.plate(144, 3, '3712', '#00f0ff', 0x00f0ff);

    // Advert screen on the bottom wall, scrolling.
    this.add.image(288, 16, 'ad-screen').setDepth(1.5);
    const ad = txt(this, 288, 16, '', 6, '#f5e663').setOrigin(0.5).setDepth(2);
    const msg = '   BIÈRE NEON — GOÛTE LA NUIT   ★   ASSURANCE TRAUMA PLATINE   ★   ';
    let off = 0;
    this.time.addEvent({ delay: 140, loop: true, callback: () => { off = (off + 1) % msg.length; ad.setText((msg + msg).slice(off, off + 14)); } });

    // Ceiling lights; one of them is dying.
    [96, 192, 288, 384].forEach((x, i) => {
      const g = this.glow(x, 130, 0xe8e8ff, 0.14, 2, 1.6);
      if (i === 2) this.tweens.add({ targets: g, alpha: 0.02, yoyo: true, repeat: -1, duration: 50, repeatDelay: 900 });
    });

    // Residents: the floor never sleeps. Each one has a name and something to say.
    const lane = new Phaser.Geom.Rectangle(64, 92, 352, 40);
    let r = 0;
    const res = (x: number, y: number, activity: NpcActivity, extra: NpcOpts = {}) => {
      const i = r++;
      const lines = extra.lines ?? [RUMORS[(i * 7) % RUMORS.length], RUMORS[(i * 7 + 3) % RUMORS.length]];
      return this.npc(`res-${i % RESIDENTS}`, x, y, activity, {
        name: NAMES[i % NAMES.length], ...extra, lines, talk: this.storyTalk('resident', lines),
      });
    };
    res(120, 110, 'wander', { bounds: lane });
    res(330, 104, 'wander', { bounds: lane });
    res(200, 120, 'wander', { bounds: lane });
    res(400, 116, 'wander', { bounds: lane });
    res(260, 100, 'wander', { bounds: lane });
    res(100, 150, 'talk');
    res(116, 150, 'talk', { flip: true });
    res(160, 204, 'sit');
    res(296, 204, 'sit');
    res(312, 204, 'talk', { flip: true });
    this.npc('npc-lo', 236, 146, 'cook', { name: 'Mamie Lo', lines: SPECIAL_LINES.lo, talk: this.storyTalk('lo', SPECIAL_LINES.lo) });
    res(220, 196, 'eat', { faceUp: true });
    res(252, 196, 'eat', { faceUp: true });
    res(276, 72, 'play', { faceUp: true, lines: SPECIAL_LINES.gamer });
    res(300, 72, 'play', { faceUp: true, lines: SPECIAL_LINES.gamer });
    res(222, 72, 'phone', { faceUp: true });
    res(384, 72, 'lean', { flip: true });
    res(440, 190, 'smoke', { flip: true });
    res(396, 160, 'sit');
    res(150, 168, 'dance', { lines: SPECIAL_LINES.dancer });
    res(176, 160, 'dance', { flip: true, lines: SPECIAL_LINES.dancer });

    this.interactions.push(
      { x: 144, y: 44, r: 30, label: 'Rentrer à l\'appart', action: () => this.go(SCENES.Hideout, { from: 'building' }) },
      { x: 48, y: 112, r: 32, label: 'Clinique du Doc Kessler (corps)', action: () => this.go(SCENES.Ripperdoc) },
      { x: 432, y: 112, r: 32, label: 'Repaire de Nyx, netrunneuse (esprit)', action: () => this.go(SCENES.Netrunner) },
      { x: 352, y: 46, r: 34, label: 'Ascenseur — descendre dans la rue', action: () => this.descent.open() },
    );
  }

  /** Small lit label above a door: its own dark plate hides the texture's indicator bar underneath. */
  private plate(x: number, y: number, label: string, color: string, border: number) {
    const t = txt(this, x, y, label, 5, color).setOrigin(0.5).setDepth(3);
    this.add.rectangle(x, y, Math.ceil(t.width) + 6, Math.ceil(t.height) + 1, 0x05030f).setStrokeStyle(1, border, 0.6).setDepth(2.9);
  }
}
