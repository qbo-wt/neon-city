import Phaser from 'phaser';
import { CONFIG } from '../config';
import type { SaveData } from '../core/save';
import { WEAPONS, WEAPON_IDS, type WeaponId } from '../data/weapons';
import { MAX_ASPECT_RANK, aspectRank, aspectsOf, defaultAspect, equip } from '../data/aspects';
import { baseStats } from '../core/stats';
import { spellBits, zoneIcon, zoneLabel } from './spellInfo';
import { hex, title } from './text';
import { audio } from '../audio/audio';
import { txt } from './text';
import { SPELLS } from '../data/spells';
import { Button, C, Card, T, bold, chip, drawPanel, heading, hints, keycap, pinToCamera, pips, screenFrame } from './kit';

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
    const label = this.view === 'weapons' ? 'RÂTELIER — CHOISIS TON ARME' : `${WEAPONS[this.current].name.toUpperCase()} — ASPECTS`;
    root.add(screenFrame(s, label, C.yellow, this.view === 'weapons' ? 'ARSENAL // PLANQUE' : 'MODIFICATIONS // RANG I-III'));
    // Banked credits, top right.
    root.add(title(s, W - 16, 19, `${save.credits}¢`, 16, T.yellow).setFontStyle('600').setOrigin(1, 0.5));
    if (this.view === 'weapons') this.renderWeapons(root, save); else this.renderAspects(root, save);
    if (this.msg) root.add(bold(s, W / 2, H - 21, this.msg, 6, T.yellow).setOrigin(0.5));
    root.add(hints(s, W / 2, H - 12, this.view === 'weapons' ? [['1-5', 'Acheter / équiper'], ['ÉCHAP', 'Fermer']] : [['1-3', 'Débloquer / équiper / améliorer'], ['TAB', 'Armes'], ['ÉCHAP', 'Fermer']]));
    pinToCamera(root);
  }

  private renderWeapons(root: Phaser.GameObjects.Container, save: SaveData) {
    const s = this.scene, W = CONFIG.WIDTH;
    WEAPON_IDS.forEach((id, i) => {
      const w = WEAPONS[id], owned = save.weapons.includes(id), equipped = save.weapon === id, y = 30 + i * 41;
      const afford = save.credits >= w.cost;
      const card = new Card(s, 16, y, W - 32, 37, { accent: equipped ? C.yellow : owned ? C.cyan : afford ? C.magenta : C.line, state: equipped ? 'sel' : 'idle', hoverSfx: true, onClick: () => this.select(i + 1) });
      const asp = aspectsOf(id).find(a => a.id === (save.aspect[id] ?? defaultAspect(id)))!;
      card.add(keycap(s, 8, 10, `${i + 1}`, equipped ? C.yellow : C.line, 5));
      const name = title(s, 22, 10.5, w.name.toUpperCase(), 13, owned ? T.text : T.mute).setFontStyle('600').setOrigin(0, 0.5);
      card.add(name);
      if (owned) card.add(chip(s, 22 + name.width + 6, 10, `${asp.name.toUpperCase()} ${ROMAN[aspectRank(save.aspects, asp.id)]}`, C.magenta, { size: 4.5 }));
      card.add(txt(s, 22, 18, w.description, 6, T.dim));
      card.add(bold(s, 22, 31, 'SORTS', 4.5, T.mute).setOrigin(0, 0.5));
      card.add(txt(s, 42, 31, w.spells.map(sid => SPELLS[sid].name).join('  ·  '), 5.5, T.cyan).setOrigin(0, 0.5));
      const right = W - 32 - 12;
      if (equipped) card.add(chip(s, right, 12, 'ÉQUIPÉE', C.yellow, { filled: true, size: 6, originX: 1 }));
      else if (owned) card.add(chip(s, right, 12, 'ÉQUIPER', C.green, { size: 6, originX: 1 }));
      else card.add(title(s, right, 13, `${w.cost}¢`, 14, afford ? T.magenta : T.off).setFontStyle('600').setOrigin(1, 0.5));
      if (!owned) card.add(bold(s, right, 25, afford ? 'ACHETER' : 'TROP CHER', 4.5, afford ? T.magenta : T.off).setOrigin(1, 0.5));
      root.add(card);
    });
  }

  /** The weapon's four spells as cards, with the equipped aspect applied: cost, range, zone picture, effect. */
  private renderSpells(root: Phaser.GameObjects.Container, save: SaveData) {
    const s = this.scene, W = CONFIG.WIDTH, id = this.current;
    const eq = save.aspect[id] ?? defaultAspect(id);
    const spells = equip(id, baseStats(), eq, aspectRank(save.aspects, eq)).spells;
    const cw = (W - 32) / 4, top = 172;
    root.add(heading(s, 16, top - 6, 'SORTS DE L\'ARME — AVEC L\'ASPECT ÉQUIPÉ', C.cyan, W - 32, 8));
    spells.forEach((sp, i) => {
      const x = 16 + i * cw;
      root.add(drawPanel(s.add.graphics(), x + 1, top, cw - 4, 64, { accent: sp.color, cut: 5, marks: false, shadow: false, alpha: 0.9 }));
      root.add(title(s, x + 6, top + 6.5, sp.name.toUpperCase(), 10, hex(sp.color)).setFontStyle('600').setOrigin(0, 0.5));
      root.add(txt(s, x + 6, top + 13, spellBits(sp).replace(/ · ligne de vue| · sans ligne de vue/, ''), 5, T.dim).setWordWrapWidth(cw - 44));
      root.add(txt(s, x + 6, top + 29, `${sp.zone.shape === 'cell' ? '' : `Zone : ${zoneLabel(sp)}. `}${sp.desc}`, 5, T.text).setWordWrapWidth(cw - 12).setLineSpacing(1));
      root.add(zoneIcon(s, x + cw - 20, top + 15, sp, sp.color));
    });
  }

  private renderAspects(root: Phaser.GameObjects.Container, save: SaveData) {
    this.renderSpells(root, save);
    const s = this.scene, W = CONFIG.WIDTH, id = this.current;
    root.add(txt(s, 16, 23, 'Un aspect modifie les sorts de cette arme. Chacun monte jusqu\'au rang III.', 5.5, T.mute).setOrigin(0, 0.5));
    root.add(new Button(s, W - 150, 15, 64, 11, '◄ ARMES', { accent: C.cyan, font: 'ui', size: 5.5, onClick: () => this.back() }));
    const eq = save.aspect[id] ?? defaultAspect(id);
    aspectsOf(id).forEach((a, i) => {
      const rank = aspectRank(save.aspects, a.id), equipped = eq === a.id, y = 31 + i * 43;
      const cost = !rank ? a.costs[0] : equipped && rank < MAX_ASPECT_RANK ? a.costs[rank] : 0;
      const card = new Card(s, 16, y, W - 32, 39, { accent: equipped ? C.magenta : rank ? C.cyan : C.line, state: equipped ? 'sel' : 'idle', hoverSfx: true, onClick: () => this.select(i + 1) });
      card.add(keycap(s, 8, 9, `${i + 1}`, equipped ? C.magenta : C.line, 5));
      const name = title(s, 22, 9.5, `${a.name.toUpperCase()}`, 13, rank ? T.text : T.mute).setFontStyle('600').setOrigin(0, 0.5);
      card.add(name);
      if (i === 0) card.add(chip(s, 22 + name.width + 5, 9, 'DE BASE', C.line, { size: 4.5, text: T.mute }));
      const g = s.add.graphics();
      pips(g, W - 32 - 40, 5, rank, MAX_ASPECT_RANK, C.magenta, 8, 4.5);
      card.add(g);
      card.add(txt(s, 22, 17, rank ? `Rang ${ROMAN[rank]} : ${a.describe(rank)}` : `Rang I : ${a.describe(1)}`, 6, rank ? T.yellow : T.dim).setWordWrapWidth(W - 150));
      if (rank > 0 && rank < MAX_ASPECT_RANK) card.add(txt(s, 22, 28, `Rang ${ROMAN[rank + 1]} : ${a.describe(rank + 1)}`, 5.5, T.off).setWordWrapWidth(W - 150));
      const status = !rank ? `DÉBLOQUER — ${a.costs[0]}¢` : !equipped ? 'ÉQUIPER' : rank < MAX_ASPECT_RANK ? `RANG ${ROMAN[rank + 1]} — ${a.costs[rank]}¢` : 'RANG MAX';
      const col = equipped ? C.magenta : cost > save.credits ? C.line : C.green;
      card.add(chip(s, W - 32 - 12, 30, status, col, { size: 5, originX: 1, filled: equipped && rank < MAX_ASPECT_RANK && cost <= save.credits, text: cost > save.credits ? T.off : undefined }));
      root.add(card);
    });
  }
}
