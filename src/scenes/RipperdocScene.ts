import { SCENES } from '../config';
import type { RoomTemplate } from '../data/rooms';
import { floatText } from '../fx/effects';
import { CLINIC_THEME, SkillTreePanel } from '../ui/SkillTreePanel';
import { InteriorScene } from './InteriorScene';
import { SPECIAL_LINES } from '../data/dialogue';

/** Back-room clinic: chair, surgical arm, chrome limbs on the wall. Sells the BODY branches. */
export class RipperdocScene extends InteriorScene {
  protected readonly placeName = 'CLINIQUE DU DOC KESSLER';
  protected readonly grid: RoomTemplate = { id: 'clinic', grid: [
    '###############',
    '#.............#',
    '#.............#',
    '#.............X',
    '#.............#',
    '#.............#',
    '#.............#',
    '###############',
  ] };
  protected readonly roomOptions = { floorKey: 'floor-clinic', wallKey: 'wall-clinic', streetLights: false };

  constructor() { super(SCENES.Ripperdoc); }

  protected spawnPoint() { return { x: 428, y: 112 }; }

  protected layout() {
    this.built.marks.X[0].obj.setTexture('door-exit-right');
    this.glow(190, 120, 0xffffff, 0.45, 2.2, 2.2); // operating light
    this.glow(190, 120, 0xff3b3b, 0.15, 3.4, 3);
    this.solid('surgery-chair', 190, 128);
    this.add.image(190, 96, 'surgical-arm').setDepth(9);
    this.solid('med-monitor', 240, 92);
    this.solid('limb-rack', 96, 46);
    this.solid('med-cabinet', 316, 46);
    this.solid('med-cabinet', 380, 46);
    this.solid('trashcan', 60, 210);
    this.sign(96, 16, 'PROTHÈSES', 0xff3b3b, 6);
    this.sign(348, 16, 'STÉRILE (À PEU PRÈS)', 0xff3b3b, 6);

    const doc = this.npc('npc-doc', 234, 140, 'idle', { flip: true, name: 'Doc Kessler', lines: SPECIAL_LINES.doc });
    const shop = new SkillTreePanel(this, () => this.save, s => this.persistSave(s), [0, 1, 2, 3], CLINIC_THEME);
    this.modals.push(shop);
    // One interaction for the doc: talking to him opens his catalogue.
    this.interactions = this.interactions.filter(i => i.follow !== doc);
    this.time.delayedCall(500, () => floatText(this, doc.x, doc.y - 16, 'Assieds-toi. On va te recâbler.', '#ff3b3b', 7));
    this.interactions.push(
      { x: 234, y: 140, r: 34, label: 'Parler au Doc Kessler — améliorations', action: () => { doc.speak(); shop.open(); } },
      { x: 190, y: 128, r: 30, label: 'S\'installer sur le fauteuil', action: () => shop.open() },
      { x: 456, y: 112, r: 30, label: 'Retourner dans le couloir', action: () => this.go(SCENES.Building, { from: 'doc' }) },
    );
  }
}
