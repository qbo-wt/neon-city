import Phaser from 'phaser';
import { COLORS, SCENES } from '../config';
import type { RoomTemplate } from '../data/rooms';
import { txt } from '../ui/text';
import { InteriorScene } from './InteriorScene';

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

    // Signage: each shop is announced on the wall next to its door.
    this.sign(52, 78, '✚ CLINIQUE', 0xff3b3b, 6);
    this.glow(40, 112, 0xff3b3b, 0.45, 1.2, 1.4);
    this.sign(428, 78, 'NET//DEN', 0x39ff88, 6);
    this.glow(440, 112, 0x39ff88, 0.4, 1.2, 1.4);
    this.sign(352, 40, '▼ RUE', COLORS.yellow, 6);
    txt(this, 144, 3, '3712', 5, '#00f0ff').setOrigin(0.5).setDepth(3);
    txt(this, 400, 222, 'ICI ON NE DEAL PAS', 6, '#ff2a6d').setOrigin(0.5).setDepth(3).setAlpha(0.7).setAngle(-4);

    // Ceiling lights; one of them is dying.
    [96, 192, 288, 384].forEach((x, i) => {
      const g = this.glow(x, 130, 0xe8e8ff, 0.16, 2, 1.6);
      if (i === 2) this.tweens.add({ targets: g, alpha: 0.02, yoyo: true, repeat: -1, duration: 50, repeatDelay: 900 });
    });

    this.solid('vending', 208, 46);
    this.solid('vending', 236, 46);
    this.solid('noticeboard', 272, 16, 1);
    this.solid('bench', 160, 214);
    this.solid('bench', 304, 214);
    this.solid('trashcan', 428, 214);
    this.solid('plant', 64, 44);
    this.solid('plant', 440, 44);

    // Residents going about their night.
    const wanderZone = new Phaser.Geom.Rectangle(80, 80, 320, 100);
    this.npc('npc-0', 120, 150, 'wander', { bounds: wanderZone });
    this.npc('npc-2', 330, 130, 'wander', { bounds: wanderZone });
    this.npc('npc-1', 250, 120, 'talk');
    this.npc('npc-3', 266, 120, 'talk', { flip: true });
    this.npc('npc-4', 160, 204, 'sit');
    this.npc('npc-5', 400, 200, 'smoke', { flip: true });
    this.npc('npc-0', 222, 70, 'phone', { faceUp: true });

    this.interactions.push(
      { x: 144, y: 44, r: 30, label: 'Rentrer à l\'appart', action: () => this.go(SCENES.Hideout, { from: 'building' }) },
      { x: 48, y: 112, r: 32, label: 'Clinique du Doc Kessler (corps)', action: () => this.go(SCENES.Ripperdoc) },
      { x: 432, y: 112, r: 32, label: 'Repaire de Nyx, netrunneuse (esprit)', action: () => this.go(SCENES.Netrunner) },
      { x: 352, y: 46, r: 34, label: 'Ascenseur — descendre dans la rue', action: () => this.go(SCENES.Run, { seed: Date.now() >>> 0 }, '▼ REZ-DE-CHAUSSÉE — NEON CITY') },
    );
  }
}
