import { SCENES } from '../config';
import type { RoomTemplate } from '../data/rooms';
import { floatText } from '../fx/effects';
import { NET_THEME, SkillTreePanel } from '../ui/SkillTreePanel';
import { txt } from '../ui/text';
import { InteriorScene } from './InteriorScene';

/** Dark den full of servers and cables. Sells the MIND branches (psychosis resistance, implant load, network). */
export class NetrunnerScene extends InteriorScene {
  protected readonly placeName = 'REPAIRE DE NYX';
  protected readonly grid: RoomTemplate = { id: 'den', grid: [
    '###############',
    '#.............#',
    '#.............#',
    'X.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '###############',
  ] };
  protected readonly roomOptions = { floorKey: 'floor-net', wallKey: 'wall-net', streetLights: false };

  constructor() { super(SCENES.Netrunner); }

  protected spawnPoint() { return { x: 52, y: 112 }; }

  protected layout() {
    this.built.marks.X[0].obj.setTexture('door-exit-left');
    [96, 120, 144, 360, 384, 408].forEach(x => this.solid('server', x, 52));
    this.solid('server', 432, 200);
    this.solid('server', 432, 160);
    this.solid('net-desk', 252, 46);
    this.add.image(190, 170, 'cables').setDepth(0.5);
    this.add.image(320, 196, 'cables').setDepth(0.5).setFlipX(true);
    this.glow(252, 70, 0x39ff88, 0.35, 2.6, 1);
    this.glow(252, 130, 0x39ff88, 0.18, 2, 2);
    this.solid('net-chair', 252, 112);
    // Falling green code on the back wall.
    for (let i = 0; i < 10; i++) {
      const t = txt(this, 170 + i * 16, 4, '', 5, '#0f3d24').setDepth(3);
      this.time.addEvent({ delay: 120 + i * 13, loop: true, callback: () => {
        t.setText(Array.from({ length: 3 }, () => String.fromCharCode(48 + Math.floor(Math.random() * 42))).join('\n'));
      } });
    }

    const nyx = this.npc('npc-netrunner', 252, 104, 'sit', { faceUp: true });
    nyx.setDepth(9);
    const shop = new SkillTreePanel(this, () => this.save, s => this.persistSave(s), [4, 5], NET_THEME);
    this.modals.push(shop);
    this.time.delayedCall(500, () => floatText(this, nyx.x, nyx.y - 16, 'Ton cerveau grésille. Branche-toi.', '#39ff88', 7));
    this.interactions.push(
      { x: 252, y: 142, r: 34, label: 'Parler à Nyx', action: () => shop.open() },
      { x: 24, y: 112, r: 30, label: 'Retourner dans le couloir', action: () => this.go(SCENES.Building, { from: 'net' }) },
    );
  }
}
