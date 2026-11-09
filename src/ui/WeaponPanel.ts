import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import type { SaveData } from '../core/save';
import { WEAPONS, WEAPON_IDS, type WeaponId } from '../data/weapons';
import { MAX_ASPECT_RANK, aspectRank, aspectsOf, defaultAspect, equip } from '../data/aspects';
import { baseStats } from '../core/stats';
import { spellBits, zoneIcon, zoneLabel } from './spellInfo';
import { hex } from './text';
import { audio } from '../audio/audio';
import { txt } from './text';
import { SPELLS } from '../data/spells';

const ROMAN = ['', 'I', 'II', 'III'];

/**
 * Apartment weapon rack. Weapons view: buy with banked credits and equip (keys 1-5).
 * Aspects view (opens on the chosen weapon): unlock, equip and rank up its three aspects (keys 1-3,
 * TAB back to the weapons).
 */
export class WeaponPanel {
  private root?: Phaser.GameObjects.Container;
  private msg = '';
  private view: 'weapons' | 'aspects' = 'weapons';
  private current: WeaponId = 'blade';

  constructor(private scene: Phaser.Scene, private getSave: () => SaveData, private persist: (s: SaveData) => void) {}

  get isOpen() { return !!this.root; }
  open() { this.msg = ''; this.view = 'weapons'; this.render(); audio.sfx('uiOpen'); }
  close() { this.root?.destroy(); this.root = undefined; }
  back() { if (this.root && this.view === 'aspects') { this.view = 'weapons'; this.msg = ''; this.render(); } }

  /** Number key n (1-based) in the current view. */
  select(n: number) {
    if (!this.root) return;
    if (this.view === 'weapons') this.pickWeapon(WEAPON_IDS[n - 1]);
    else this.pickAspect(n - 1);
    this.render();
  }

  private pickWeapon(id?: WeaponId) {
    if (!id) return;
    const s = this.getSave(), w = WEAPONS[id];
    if (s.weapons.includes(id)) {
      this.persist({ ...s, weapon: id });
      this.msg = `${w.name} équipée. Choisis son aspect.`;
      audio.sfx('ui');
    } else if (s.credits >= w.cost) {
      this.persist({ ...s, credits: s.credits - w.cost, weapons: [...s.weapons, id], weapon: id });
      this.msg = `${w.name} achetée et équipée. Choisis son aspect.`;
      audio.sfx('buy');
    } else {
      this.msg = `Il te manque ${w.cost - s.credits}¢.`;
      audio.sfx('deny');
      return;
    }
    this.current = id;
    this.view = 'aspects';
  }

  private pickAspect(i: number) {
    const a = aspectsOf(this.current)[i];
    if (!a) return;
    const s = this.getSave(), rank = aspectRank(s.aspects, a.id);
    const equipped = (s.aspect[this.current] ?? defaultAspect(this.current)) === a.id;
    const pay = (cost: number, next: SaveData, msg: string) => {
      if (s.credits < cost) { this.msg = `Il te manque ${cost - s.credits}¢.`; audio.sfx('deny'); return; }
      this.persist({ ...next, credits: s.credits - cost });
      this.msg = msg;
      audio.sfx('buy');
    };
    if (rank === 0) pay(a.costs[0], { ...s, aspects: { ...s.aspects, [a.id]: 1 }, aspect: { ...s.aspect, [this.current]: a.id } }, `${a.name} débloqué et équipé.`);
    else if (!equipped) { this.persist({ ...s, aspect: { ...s.aspect, [this.current]: a.id } }); this.msg = `${a.name} équipé.`; audio.sfx('ui'); }
    else if (rank < MAX_ASPECT_RANK) pay(a.costs[rank], { ...s, aspects: { ...s.aspects, [a.id]: rank + 1 } }, `${a.name} passe au rang ${ROMAN[rank + 1]}.`);
    else { this.msg = `${a.name} est déjà au rang maximum.`; audio.sfx('deny'); }
  }

  private render() {
    this.root?.destroy();
    const s = this.scene, W = CONFIG.WIDTH, H = CONFIG.HEIGHT, save = this.getSave();
    const root = s.add.container(0, 0).setDepth(200);
    this.root = root;
    root.add(s.add.rectangle(W / 2, H / 2, W, H, 0x05030f, 0.95).setStrokeStyle(1, COLORS.yellow));
    root.add(txt(s, W - 10, 12, `${save.credits}¢`, 8, '#f5e663').setOrigin(1, 0.5));
    if (this.view === 'weapons') this.renderWeapons(root, save); else this.renderAspects(root, save);
    if (this.msg) root.add(txt(s, W / 2, H - 24, this.msg, 7, '#f5e663').setOrigin(0.5));
    root.add(txt(s, W / 2, H - 10, this.view === 'weapons' ? '[1-5] Acheter / équiper    [ÉCHAP] Fermer' : '[1-3] Débloquer / équiper / améliorer    [TAB] Armes    [ÉCHAP] Fermer', 7, '#8a86b0').setOrigin(0.5));
    root.setScrollFactor(0, 0, true);
  }

  private renderWeapons(root: Phaser.GameObjects.Container, save: SaveData) {
    const s = this.scene, W = CONFIG.WIDTH;
    root.add(txt(s, W / 2, 12, 'RÂTELIER — CHOISIS TON ARME', 9, '#f5e663').setOrigin(0.5));
    WEAPON_IDS.forEach((id, i) => {
      const w = WEAPONS[id], owned = save.weapons.includes(id), equipped = save.weapon === id, y = 32 + i * 42;
      const row = s.add.rectangle(W / 2, y + 17, W - 24, 38, equipped ? 0x2a2410 : 0x140f2b).setStrokeStyle(1, equipped ? COLORS.yellow : 0x3a3550)
        .setInteractive({ useHandCursor: true });
      row.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.button === 0) this.select(i + 1); });
      root.add(row);
      const asp = aspectsOf(id).find(a => a.id === (save.aspect[id] ?? defaultAspect(id)))!;
      root.add(txt(s, 20, y + 2, `[${i + 1}] ${w.name}`, 8, owned ? '#e8e8ff' : '#8a86b0'));
      if (owned) root.add(txt(s, 150, y + 3, `${asp.name} ${ROMAN[aspectRank(save.aspects, asp.id)]}`, 6, '#ff2a6d'));
      root.add(txt(s, 20, y + 14, w.description, 6, '#a8a6d8'));
      root.add(txt(s, 20, y + 24, `Sorts : ${w.spells.map(id => SPELLS[id].name).join(' · ')}`, 6, '#00f0ff'));
      const status = equipped ? 'ÉQUIPÉE' : owned ? 'Équiper' : `${w.cost}¢`;
      root.add(txt(s, W - 20, y + 4, status, 8, equipped ? '#f5e663' : owned ? '#39ff88' : save.credits >= w.cost ? '#ff2a6d' : '#5a5578').setOrigin(1, 0));
    });
  }

  /** The weapon's four spells as cards, with the equipped aspect applied: cost, range, zone picture, effect. */
  private renderSpells(root: Phaser.GameObjects.Container, save: SaveData) {
    const s = this.scene, W = CONFIG.WIDTH, id = this.current;
    const eq = save.aspect[id] ?? defaultAspect(id);
    const spells = equip(id, baseStats(), eq, aspectRank(save.aspects, eq)).spells;
    const cw = (W - 24) / 4, top = 177;
    root.add(txt(s, 12, top - 3, 'SORTS DE L\'ARME (avec l\'aspect équipé)', 6, '#00f0ff').setOrigin(0, 1));
    spells.forEach((sp, i) => {
      const x = 12 + i * cw;
      root.add(s.add.rectangle(x + 1, top, cw - 3, 60, 0x0b0820).setOrigin(0).setStrokeStyle(1, sp.color, 0.6));
      root.add(txt(s, x + 5, top + 3, sp.name, 7, hex(sp.color)));
      root.add(txt(s, x + 5, top + 13, spellBits(sp).replace(/ · ligne de vue| · sans ligne de vue/, ''), 5, '#a8a6d8').setWordWrapWidth(cw - 44));
      root.add(txt(s, x + 5, top + 27, `${sp.zone.shape === 'cell' ? '' : `Zone : ${zoneLabel(sp)}. `}${sp.desc}`, 5, '#e8e8ff').setWordWrapWidth(cw - 10).setLineSpacing(1));
      root.add(zoneIcon(s, x + cw - 20, top + 14, sp, sp.color));
    });
  }

  private renderAspects(root: Phaser.GameObjects.Container, save: SaveData) {
    this.renderSpells(root, save);
    const s = this.scene, W = CONFIG.WIDTH, id = this.current;
    root.add(txt(s, W / 2, 12, `${WEAPONS[id].name.toUpperCase()} — ASPECTS`, 9, '#f5e663').setOrigin(0.5));
    root.add(txt(s, W / 2, 24, 'Un aspect modifie les sorts de cette arme. Chacun monte jusqu\'au rang III.', 6, '#8a86b0').setOrigin(0.5));
    const back = txt(s, 12, 12, '◄ Armes', 7, '#00f0ff').setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    back.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.button === 0) this.back(); });
    root.add(back);
    const eq = save.aspect[id] ?? defaultAspect(id);
    aspectsOf(id).forEach((a, i) => {
      const rank = aspectRank(save.aspects, a.id), equipped = eq === a.id, y = 32 + i * 43;
      const row = s.add.rectangle(W / 2, y + 19, W - 24, 40, equipped ? 0x2a0c18 : 0x140f2b).setStrokeStyle(1, equipped ? COLORS.magenta : rank ? 0x3a3550 : 0x221d35)
        .setInteractive({ useHandCursor: true });
      row.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.button === 0) this.select(i + 1); });
      root.add(row);
      root.add(txt(s, 20, y + 2, `[${i + 1}] ${a.name}${i === 0 ? ' (de base)' : ''}`, 8, rank ? '#e8e8ff' : '#8a86b0'));
      root.add(txt(s, W - 20, y + 2, '■'.repeat(rank) + '□'.repeat(MAX_ASPECT_RANK - rank), 9, '#ff2a6d').setOrigin(1, 0));
      root.add(txt(s, 20, y + 13, rank ? `Rang ${ROMAN[rank]} : ${a.describe(rank)}` : `Rang I : ${a.describe(1)}`, 6, rank ? '#f5e663' : '#a8a6d8').setWordWrapWidth(W - 140));
      if (rank > 0 && rank < MAX_ASPECT_RANK) root.add(txt(s, 20, y + 23, `Rang ${ROMAN[rank + 1]} : ${a.describe(rank + 1)}`, 6, '#5a5578').setWordWrapWidth(W - 140));
      const status = !rank ? `Débloquer — ${a.costs[0]}¢` : !equipped ? 'Équiper' : rank < MAX_ASPECT_RANK ? `ÉQUIPÉ — rang ${ROMAN[rank + 1]} : ${a.costs[rank]}¢` : 'ÉQUIPÉ — rang max';
      const cost = !rank ? a.costs[0] : equipped && rank < MAX_ASPECT_RANK ? a.costs[rank] : 0;
      root.add(txt(s, W - 20, y + 29, status, 7, equipped ? '#ff2a6d' : cost > save.credits ? '#5a5578' : '#39ff88').setOrigin(1, 0));
    });
  }
}
