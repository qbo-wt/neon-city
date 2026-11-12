import { SCENES } from '../config';
import type { RoomTemplate } from '../data/rooms';
import { floatText } from '../fx/effects';
import { CLINIC_THEME, SkillTreePanel } from '../ui/SkillTreePanel';
import { InteriorScene } from './InteriorScene';
import { SPECIAL_LINES } from '../data/dialogue';
import { HEAD_PX, type Interior3D } from '../three/Interior3D';
import { CLINIC, buildClinic } from '../three/interior/clinic';

/** Back-room clinic: chair, surgical arm, chrome limbs on the wall. Sells the BODY branches. */
export class RipperdocScene extends InteriorScene {
  protected readonly placeName = 'CLINIQUE DU DOC KESSLER';
  protected readonly style3d = 'clinic' as const;
  protected readonly grid: RoomTemplate = { id: 'clinic', grid: CLINIC.grid };
  protected readonly roomOptions = { floorKey: null, wallKey: null, streetLights: false };

  constructor() { super(SCENES.Ripperdoc); }

  protected set3d(v: Interior3D) { return buildClinic(v); }

  protected spawnPoint() { return CLINIC.spawn; }

  protected layout() {
    for (const [x, y, w, h] of CLINIC.blockers) this.block(x, y, w, h);
    const doc = this.npc('npc-doc', CLINIC.doc.x, CLINIC.doc.y, 'idle', { flip: true, name: 'Doc Kessler', lines: SPECIAL_LINES.doc, talk: this.storyTalk('doc', SPECIAL_LINES.doc) });
    const shop = new SkillTreePanel(this, () => this.save, s => this.persistSave(s), [0, 1, 2, 3], CLINIC_THEME);
    this.modals.push(shop);
    // One interaction for the doc: talking to him opens his catalogue.
    this.interactions = this.interactions.filter(i => i.follow !== doc);
    this.time.delayedCall(500, () => floatText(this, doc.x, doc.y + 4 - HEAD_PX, 'Assieds-toi. On va te recâbler.', '#ff3b3b', 7));
    this.interactions.push(
      { ...CLINIC.doc, r: 34, label: 'Parler au Doc Kessler — améliorations', action: () => { doc.speak(); shop.open(); } },
      { ...CLINIC.chair, r: 26, label: 'S\'installer sur le fauteuil', action: () => shop.open() },
      { ...CLINIC.exit, r: 30, label: 'Retourner dans le couloir', action: () => this.go(SCENES.Building, { from: 'doc' }) },
    );
  }
}
