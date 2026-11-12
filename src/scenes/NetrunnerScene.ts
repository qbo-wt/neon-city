import { SCENES } from '../config';
import type { RoomTemplate } from '../data/rooms';
import { floatText } from '../fx/effects';
import { NET_THEME, SkillTreePanel } from '../ui/SkillTreePanel';
import { InteriorScene } from './InteriorScene';
import { SPECIAL_LINES } from '../data/dialogue';
import { HEAD_PX, type Interior3D } from '../three/Interior3D';
import { DEN, buildDen } from '../three/interior/den';

/** Dark den full of servers and cables. Sells the MIND branches (psychosis resistance, implant load, network). */
export class NetrunnerScene extends InteriorScene {
  protected readonly placeName = 'REPAIRE DE NYX';
  protected readonly style3d = 'den' as const;
  protected readonly grid: RoomTemplate = { id: 'den', grid: DEN.grid };
  protected readonly roomOptions = { floorKey: null, wallKey: null, streetLights: false };

  constructor() { super(SCENES.Netrunner); }

  protected set3d(v: Interior3D) { return buildDen(v); }

  protected spawnPoint() { return DEN.spawn; }

  protected layout() {
    for (const [x, y, w, h] of DEN.blockers) this.block(x, y, w, h);
    // Nyx sits jacked in at her screens, back to the room; she turns to talk.
    const nyx = this.npc('npc-nyx', DEN.nyx.x, DEN.nyx.y, 'idle', { faceUp: true, seat: 0.5, name: 'Nyx', lines: SPECIAL_LINES.nyx, talk: this.storyTalk('nyx', SPECIAL_LINES.nyx) });
    const shop = new SkillTreePanel(this, () => this.save, s => this.persistSave(s), [4, 5], NET_THEME);
    this.modals.push(shop);
    this.interactions = this.interactions.filter(i => i.follow !== nyx);
    this.time.delayedCall(500, () => floatText(this, nyx.x, nyx.y + 4 - HEAD_PX, 'Ton cerveau grésille. Branche-toi.', '#39ff88', 7));
    this.interactions.push(
      { ...DEN.talk, r: 34, label: 'Parler à Nyx — calibrage neural', action: () => { nyx.speak(); shop.open(); } },
      { ...DEN.exit, r: 30, label: 'Retourner dans le couloir', action: () => this.go(SCENES.Building, { from: 'net' }) },
    );
  }
}
