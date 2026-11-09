import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import type { Offer } from '../core/implantOffer';
import { implantLoad } from '../core/stats';
import type { Implant } from '../core/types';
import { FAMILY_COLORS, FAMILY_NAMES, RARITY_COLORS, RARITY_NAMES } from '../data/implants';
import { SYNERGIES, familyCounts } from '../data/synergies';
import type { Controls } from '../input/controls';
import { audio } from '../audio/audio';
import { txt } from './text';

const ROMAN = ['', 'I', 'II', 'III'];

/**
 * Modal: pick one of up to 3 implant cards with the mouse or keys 1-3. Each card shows its rarity,
 * family, level, psychosis load and how it advances that family's synergy. Camera-fixed.
 */
export class ImplantChoice {
  private root: Phaser.GameObjects.Container;
  private done = false;

  constructor(private scene: Phaser.Scene, readonly options: Offer[], private controls: Controls, owned: readonly Implant[],
    private onPick: (o: Offer) => void, title = 'CLINIQUE CLANDESTINE — CHOISIS UN IMPLANT') {
    const { WIDTH: W, HEIGHT: H } = CONFIG;
    const counts = familyCounts(owned);
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(5000);
    this.root.add(scene.add.rectangle(W / 2, H / 2, W, H, 0x05030f, 0.86));
    this.root.add(txt(scene, W / 2, 30, title, 10, '#00f0ff').setOrigin(0.5));
    this.root.add(txt(scene, W / 2, 45, 'Chaque implant augmente ta charge de psychose. 2 et 3 implants d\'une famille débloquent une synergie.', 6, '#8a86b0').setOrigin(0.5));

    const cw = 140, gap = 10, total = options.length * cw + (options.length - 1) * gap;
    options.forEach((o, i) => {
      const imp = o.implant, rarity = imp.rarity ?? 'common';
      const x = W / 2 - total / 2 + i * (cw + gap) + cw / 2, y = 146;
      const border = RARITY_COLORS[rarity];
      const card = scene.add.rectangle(x, y, cw, 158, rarity === 'black' ? 0x0a1a12 : 0x140f2b).setStrokeStyle(rarity === 'epic' ? 2 : 1, border).setInteractive({ useHandCursor: true });
      card.on('pointerover', () => { card.setStrokeStyle(2, COLORS.white); audio.sfx('ui'); });
      card.on('pointerout', () => card.setStrokeStyle(rarity === 'epic' ? 2 : 1, border));
      card.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.button === 0) this.pick(o); });
      this.root.add(card);
      const top = y - 72;
      const hex = '#' + border.toString(16).padStart(6, '0');
      this.root.add(txt(scene, x - cw / 2 + 6, top, RARITY_NAMES[rarity], 6, hex));
      if (imp.family) this.root.add(txt(scene, x + cw / 2 - 6, top, FAMILY_NAMES[imp.family], 6, FAMILY_COLORS[imp.family]).setOrigin(1, 0));
      const icon = scene.add.image(x, top + 26, 'implant-pickup').setScale(2);
      if (imp.family) icon.setTint(Phaser.Display.Color.HexStringToColor(FAMILY_COLORS[imp.family]).color);
      if (rarity === 'black') icon.setTint(0x39ff88);
      this.root.add(icon);
      if (o.upgrade) this.root.add(txt(scene, x, top + 44, '▲ AMÉLIORATION', 6, '#f5e663').setOrigin(0.5));
      this.root.add(txt(scene, x, top + 56, `${imp.name}${o.level > 1 ? ' ' + ROMAN[o.level] : ''}`, 8, '#e8e8ff').setOrigin(0.5).setWordWrapWidth(cw - 10).setAlign('center'));
      const desc = imp.describe?.(o.level) ?? imp.description;
      this.root.add(txt(scene, x, top + 80, desc, 6, rarity === 'black' ? '#39ff88' : '#f5e663').setOrigin(0.5, 0).setWordWrapWidth(cw - 12).setAlign('center'));
      const load = Math.round(implantLoad({ ...imp, level: o.level }) - (o.upgrade ? implantLoad({ ...imp, level: o.level - 1 }) : 0));
      this.root.add(txt(scene, x, top + 122, `Charge psy +${load}`, 6, '#ff2a6d').setOrigin(0.5));
      // How this card moves its family toward the next synergy.
      if (imp.family && !o.upgrade) {
        const now = counts[imp.family], next = SYNERGIES[imp.family].tiers.find(t => t.count > now);
        const line = next ? `${FAMILY_NAMES[imp.family]} ${now + 1}/${next.count}${now + 1 >= next.count ? ' → ' + next.name : ''}` : `${FAMILY_NAMES[imp.family]} au maximum`;
        this.root.add(txt(scene, x, top + 134, line, 6, now + 1 >= (next?.count ?? 99) ? '#39ff88' : FAMILY_COLORS[imp.family]).setOrigin(0.5));
      }
      this.root.add(txt(scene, x, top + 147, `[${i + 1}]`, 6, '#8a86b0').setOrigin(0.5));
    });
    // Children must be camera-fixed too, or their hit areas are offset by the camera scroll.
    this.root.setScrollFactor(0, 0, true);
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
