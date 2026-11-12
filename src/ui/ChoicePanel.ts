import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import type { Controls } from '../input/controls';
import { audio } from '../audio/audio';
import { txt } from './text';
import { C, Card, T, backdrop, bold, chip, hints, keycap, panel, pinToCamera } from './kit';

export interface ChoiceOption {
  label: string;
  desc: string;
  /** shown on the right, e.g. "25¢" or "-15 PV" */
  cost?: string;
  enabled?: boolean;
  pick: () => void;
}

/**
 * Generic camera-fixed dialog: a speaker, a line, up to 4 options (mouse or keys 1-4) and a way out
 * (Esc). Used by the street events.
 */
export class ChoicePanel {
  private root: Phaser.GameObjects.Container;
  private done = false;

  constructor(private scene: Phaser.Scene, private controls: Controls, speaker: string, line: string,
    readonly options: ChoiceOption[], private onClose: () => void, accent: number = COLORS.cyan) {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT, pw = 364;
    const lineT = txt(scene, 0, 0, line, 7, T.text).setWordWrapWidth(pw - 28).setLineSpacing(2);
    const rowH = 28, gap = 4;
    const ph = 22 + lineT.height + 8 + options.length * (rowH + gap) + 16;
    const left = (W - pw) / 2, top = Math.max(14, (H - ph) / 2);
    this.root = scene.add.container(0, 0).setDepth(5000);
    this.root.add(backdrop(scene, 0.72, accent));
    this.root.add(panel(scene, left, top, pw, ph, { accent, title: speaker.toUpperCase(), titleSize: 11, code: 'RENCONTRE // RUE', dots: 'br' }));
    lineT.setPosition(left + 14, top + 13);
    this.root.add(lineT);
    const y0 = top + 13 + lineT.height + 9;
    options.forEach((o, i) => {
      const y = y0 + i * (rowH + gap), on = o.enabled !== false;
      const card = new Card(scene, left + 10, y, pw - 20, rowH, { accent, state: on ? 'idle' : 'off', hoverSfx: true, onClick: on ? () => this.choose(i) : undefined });
      card.add(keycap(scene, 7, 9, `${i + 1}`, on ? C.yellow : C.line, 5));
      card.add(bold(scene, 22, 9, o.label, 7, on ? T.yellow : T.off).setOrigin(0, 0.5));
      card.add(txt(scene, 22, 16, o.desc, 6, on ? T.dim : T.off).setWordWrapWidth(pw - 120));
      if (o.cost) card.add(chip(scene, pw - 32, 9, o.cost, on ? C.magenta : C.line, { size: 5, originX: 1, text: on ? T.magenta : T.off }));
      this.root.add(card);
    });
    this.root.add(hints(scene, W / 2, top + ph - 8, [['ÉCHAP', 'Partir'], ['1-4', 'Choisir']], C.yellow));
    pinToCamera(this.root);
    audio.sfx('uiOpen');
  }

  tick() {
    if (this.controls.escape()) { this.close(); return; }
    const n = this.controls.numberPressed();
    if (n) this.choose(n - 1);
  }

  choose(i: number) {
    const o = this.options[i];
    if (this.done || !o) return;
    if (o.enabled === false) { audio.sfx('deny'); return; }
    this.close();
    o.pick();
  }

  close() {
    if (this.done) return;
    this.done = true;
    this.root.destroy();
    this.onClose();
  }
}
