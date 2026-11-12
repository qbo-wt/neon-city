import Phaser from 'phaser';
import { CONFIG } from '../config';
import type { Offer } from '../core/implantOffer';
import { implantLoad } from '../core/stats';
import type { Implant } from '../core/types';
import { FAMILY_COLORS, FAMILY_NAMES, RARITY_COLORS, RARITY_NAMES } from '../data/implants';
import { SYNERGIES, familyCounts } from '../data/synergies';
import type { Controls } from '../input/controls';
import { hex, title, txt } from './text';
import { C, Card, GlitchText, T, backdrop, bold, chip, cutPoly, halftone, keycap, pinToCamera } from './kit';

const ROMAN = ['', 'I', 'II', 'III'];

/**
 * Modal: pick one of up to 3 implant cards with the mouse or keys 1-3. Each card shows its rarity,
 * family, level, psychosis load and how it advances that family's synergy. Camera-fixed.
 */
export class ImplantChoice {
  private root: Phaser.GameObjects.Container;
  private done = false;

  constructor(private scene: Phaser.Scene, readonly options: Offer[], private controls: Controls, owned: readonly Implant[],
    private onPick: (o: Offer) => void, heading = 'CLINIQUE CLANDESTINE — CHOISIS UN IMPLANT') {
    const { WIDTH: W, HEIGHT: H } = CONFIG;
    const counts = familyCounts(owned);
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(5000);
    this.root.add(backdrop(scene, 0.86, C.cyan));
    this.root.add(new GlitchText(scene, W / 2, 30, heading, 17, T.cyan, { every: 3500 }));
    this.root.add(txt(scene, W / 2, 46, 'Chaque implant augmente ta charge de psychose. 2 et 3 implants d\'une famille débloquent une synergie.', 6, T.mute).setOrigin(0.5));

    const cw = 140, ch = 176, gap = 12, total = options.length * cw + (options.length - 1) * gap;
    options.forEach((o, i) => {
      const imp = o.implant, rarity = imp.rarity ?? 'common';
      const border = RARITY_COLORS[rarity], fam = imp.family ? Phaser.Display.Color.HexStringToColor(FAMILY_COLORS[imp.family]).color : border;
      const x = W / 2 - total / 2 + i * (cw + gap), y = 60;
      const card = new Card(scene, x, y, cw, ch, { accent: rarity === 'common' ? C.cyan : border, cut: 8, hoverSfx: true, fill: rarity === 'black' ? 0x0a1a12 : undefined, onClick: () => this.pick(o), bar: false });
      // Rarity band across the top, family on the right.
      const g = scene.add.graphics();
      g.fillStyle(border, 1).fillPoints(cutPoly(0, 0, cw * 0.62, 10, [8, 0, 0, 0]), true);
      g.fillStyle(border, 0.5).fillTriangle(cw * 0.62, 0, cw * 0.62 + 6, 0, cw * 0.62, 10);
      // The implant on a halftone disc, ringed by its family colour.
      halftone(g, cw / 2 - 26, 18, 52, 40, fam, 0.22, 'bl', 3, 1.2);
      g.fillStyle(C.deep, 0.9).fillCircle(cw / 2, 40, 15);
      g.lineStyle(0.75, fam, 0.9).strokeCircle(cw / 2, 40, 15);
      g.lineStyle(0.25, fam, 0.5).strokeCircle(cw / 2, 40, 18.5);
      if (rarity === 'epic' || rarity === 'black') g.lineStyle(0.5, border, 0.6).strokePoints(cutPoly(3, 3, cw - 6, ch - 6, 6), true);
      card.add(g);
      card.add(bold(scene, 9, 5, RARITY_NAMES[rarity], 5, T.dark).setOrigin(0, 0.5));
      if (imp.family) card.add(chip(scene, cw - 6, 5.5, FAMILY_NAMES[imp.family], fam, { size: 4.5, originX: 1 }));
      const icon = scene.add.image(cw / 2, 40, 'implant-pickup').setScale(2);
      if (imp.family) icon.setTint(fam);
      if (rarity === 'black') icon.setTint(0x39ff88);
      card.add(icon);
      if (o.upgrade) card.add(chip(scene, cw / 2, 62, '▲ AMÉLIORATION', C.yellow, { filled: true, size: 4.5, originX: 0.5 }));
      card.add(title(scene, cw / 2, 76, `${imp.name}${o.level > 1 ? ' ' + ROMAN[o.level] : ''}`, 13, T.text).setFontStyle('600').setOrigin(0.5).setWordWrapWidth(cw - 10).setAlign('center'));
      const desc = imp.describe?.(o.level) ?? imp.description;
      card.add(txt(scene, cw / 2, 88, desc, 6, rarity === 'black' ? T.green : T.yellow).setOrigin(0.5, 0).setWordWrapWidth(cw - 14).setAlign('center').setLineSpacing(1));
      const load = Math.round(implantLoad({ ...imp, level: o.level }) - (o.upgrade ? implantLoad({ ...imp, level: o.level - 1 }) : 0));
      card.add(chip(scene, cw / 2, 136, `CHARGE PSY +${load}`, C.magenta, { size: 5, originX: 0.5 }));
      // How this card moves its family toward the next synergy.
      if (imp.family && !o.upgrade) {
        const now = counts[imp.family], next = SYNERGIES[imp.family].tiers.find(t => t.count > now);
        const line = next ? `${FAMILY_NAMES[imp.family]} ${now + 1}/${next.count}${now + 1 >= next.count ? ' → ' + next.name : ''}` : `${FAMILY_NAMES[imp.family]} au maximum`;
        const ready = now + 1 >= (next?.count ?? 99);
        card.add(bold(scene, cw / 2, 149, line, 5, ready ? T.green : hex(fam)).setOrigin(0.5));
      }
      card.add(keycap(scene, cw / 2, 164, `${i + 1}`, C.yellow, 5, 0.5));
      this.root.add(card);
    });
    // Children must be camera-fixed too, or their hit areas are offset by the camera scroll.
    pinToCamera(this.root);
  }

  /** Call every frame while open. */
  tick() {
    const n = this.controls.numberPressed();
    if (n && this.options[n - 1]) this.pick(this.options[n - 1]);
  }

  pick(o: Offer) {
    if (this.done) return;
    this.done = true;
    this.root.destroy();
    this.onPick(o);
  }
}
