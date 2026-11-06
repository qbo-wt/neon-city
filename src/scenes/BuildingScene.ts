import Phaser from 'phaser';
import { COLORS, SCENES } from '../config';
import type { RoomTemplate } from '../data/rooms';
import { txt } from '../ui/text';
import { InteriorScene } from './InteriorScene';

/** Solid props: [texture, x, y]. Walking lanes are kept clear: home door → corridor, corridor ↔ side doors, corridor → elevator. */
const PROPS: [string, number, number][] = [
  ['plant', 48, 44], ['bike', 88, 50], ['vending', 208, 46], ['vending', 236, 46],
  ['arcade-cab', 276, 46], ['arcade-cab', 300, 46], ['boxes', 392, 46], ['laundry', 424, 50],
  ['boxes', 52, 196], ['boxes', 52, 172], ['mop-bucket', 84, 210],
  ['noodle-cart', 236, 168], ['bench', 160, 214], ['bench', 304, 214],
  ['couch-old', 404, 168], ['trashcan', 436, 214], ['trashcan', 120, 214],
];
/** Wall decor (no collision). */
const WALL_DECOR: [string, number, number][] = [
  ['poster-0', 60, 14], ['poster-2', 98, 12], ['poster-1', 186, 14], ['poster-3', 318, 12], ['poster-0', 404, 14],
  ['noticeboard', 254, 16], ['poster-1', 120, 242], ['poster-2', 300, 242], ['poster-3', 360, 240],
];

/**
 * Megabuilding floor. a = neighbours' doors, A = home, L = elevator (2 tiles),
 * D = ripperdoc clinic (left wall), N = netrunner den (right wall).
 */
export class BuildingScene extends InteriorScene {
  protected readonly placeName = 'IMMEUBLE H-12, ÉTAGE 37';
  protected readonly grid: RoomTemplate = { id: 'building', grid: [
    '#a##A##a##LL#a#',
    '#.............#',
    '#.............#',
    'D.............N',
    '#.............#',
    '#.............#',
    '#.............#',
    '###############',
  ] };
  protected readonly roomOptions = { floorKey: 'floor-corridor', wallKey: 'wall-corridor', streetLights: false };

  constructor() { super(SCENES.Building); }

  protected spawnPoint(data: Record<string, unknown>) {
    if (data.from === 'doc') return { x: 56, y: 112 };
    if (data.from === 'net') return { x: 424, y: 112 };
    return { x: 144, y: 54 };
  }

  protected layout() {
    const m = this.built.marks;
    m.a.forEach(d => d.obj.setTexture('door-apt'));
    m.A[0].obj.setTexture('door-home');
    m.D[0].obj.setTexture('door-doc');
    m.N[0].obj.setTexture('door-net');
    this.add.image(352, 16, 'elevator').setDepth(1);
    this.add.image(144, 38, 'doormat').setDepth(0.5);

    // Pipes and cable trays along the top wall.
    const pipes = this.add.graphics().setDepth(1);
    pipes.lineStyle(2, 0x3d3352).lineBetween(32, 29, 448, 29);
    pipes.lineStyle(1, 0x1d1729).lineBetween(32, 26, 448, 26);
    for (let x = 48; x < 448; x += 64) pipes.fillStyle(0x4a3f60).fillRect(x, 27, 4, 4);

    for (const [key, x, y] of WALL_DECOR) this.add.image(x, y, key).setDepth(1.5);
    for (const [key, x, y] of PROPS) this.solid(key, x, y);

    // Signage: each shop is announced on the wall next to its door.
    this.sign(52, 78, '✚ CLINIQUE', 0xff3b3b, 6);
    this.glow(40, 112, 0xff3b3b, 0.45, 1.2, 1.4);
    this.sign(428, 78, 'NET//DEN', 0x39ff88, 6);
    this.glow(440, 112, 0x39ff88, 0.4, 1.2, 1.4);
    this.sign(352, 40, '▼ RUE', COLORS.yellow, 6);
    this.sign(236, 140, 'RAMEN DE MAMIE LO', 0xff3b3b, 5);
    this.glow(236, 170, 0xff3b3b, 0.3, 1.6, 1);
    this.glow(288, 60, 0x6a2cff, 0.4, 1.4, 1);
    txt(this, 144, 3, '3712', 5, '#00f0ff').setOrigin(0.5).setDepth(3);
    txt(this, 420, 240, 'ICI ON NE DEAL PAS', 6, '#ff2a6d').setOrigin(0.5).setDepth(3).setAlpha(0.75).setAngle(-4);

    // Advert screen on the bottom wall, scrolling.
    this.add.image(200, 240, 'ad-screen').setDepth(1.5);
    const ad = txt(this, 200, 240, '', 6, '#f5e663').setOrigin(0.5).setDepth(2);
    const msg = '   BIÈRE NEON — GOÛTE LA NUIT   ★   ASSURANCE TRAUMA PLATINE   ★   ';
    let off = 0;
    this.time.addEvent({ delay: 140, loop: true, callback: () => { off = (off + 1) % msg.length; ad.setText((msg + msg).slice(off, off + 14)); } });

    // Ceiling lights; one of them is dying.
    [96, 192, 288, 384].forEach((x, i) => {
      const g = this.glow(x, 130, 0xe8e8ff, 0.14, 2, 1.6);
      if (i === 2) this.tweens.add({ targets: g, alpha: 0.02, yoyo: true, repeat: -1, duration: 50, repeatDelay: 900 });
    });

    // Residents: the floor never sleeps.
    const lane = new Phaser.Geom.Rectangle(64, 92, 352, 40);
    this.npc('npc-0', 120, 110, 'wander', { bounds: lane });
    this.npc('npc-2', 330, 104, 'wander', { bounds: lane });
    this.npc('npc-5', 200, 120, 'wander', { bounds: lane });
    this.npc('npc-3', 400, 116, 'wander', { bounds: lane });
    this.npc('npc-1', 100, 150, 'talk');
    this.npc('npc-4', 116, 150, 'talk', { flip: true });
    this.npc('npc-2', 160, 204, 'sit');
    this.npc('npc-3', 296, 204, 'sit');
    this.npc('npc-1', 312, 204, 'talk', { flip: true });
    this.npc('npc-4', 236, 146, 'cook');
    this.npc('npc-0', 220, 196, 'eat', { faceUp: true });
    this.npc('npc-5', 252, 196, 'eat', { faceUp: true });
    this.npc('npc-2', 276, 72, 'play', { faceUp: true });
    this.npc('npc-1', 300, 72, 'play', { faceUp: true });
    this.npc('npc-0', 222, 72, 'phone', { faceUp: true });
    this.npc('npc-3', 384, 72, 'lean', { flip: true });
    this.npc('npc-5', 440, 190, 'smoke', { flip: true });
    this.npc('npc-4', 396, 160, 'sit');

    this.interactions.push(
      { x: 144, y: 44, r: 30, label: 'Rentrer à l\'appart', action: () => this.go(SCENES.Hideout, { from: 'building' }) },
      { x: 48, y: 112, r: 32, label: 'Clinique du Doc Kessler (corps)', action: () => this.go(SCENES.Ripperdoc) },
      { x: 432, y: 112, r: 32, label: 'Repaire de Nyx, netrunneuse (esprit)', action: () => this.go(SCENES.Netrunner) },
      { x: 352, y: 46, r: 34, label: 'Ascenseur — descendre dans la rue', action: () => this.go(SCENES.Run, { seed: Date.now() >>> 0 }, '▼ REZ-DE-CHAUSSÉE — NEON CITY') },
    );
  }
}
