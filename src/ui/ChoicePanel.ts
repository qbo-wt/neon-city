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
  /** small picture left of the label (drawn once ready; the row stays text-only if it fails) */
  icon?: () => Promise<string | null>;
}

/**
 * Generic camera-fixed dialog: a speaker, a line, up to 4 options (mouse or keys 1-4) and a way out
 * (Esc). Used by the street events and by Capsule, the corridor's vending machine (with a portrait:
 * a texture key drawn left of the line). Options without a description get compact rows.
 */
export interface ChoicePanelOpts {
  /** small code in the panel's corner */
  code?: string;
  /** texture shown left of the line, 48 × 24 */
  portrait?: string;
  /** square picture (40 px) left of the line, drawn once ready */
  square?: () => Promise<string | null>;
  /** no opening sound (a conversation going on) */
  quiet?: boolean;
}

export class ChoicePanel {
  private root: Phaser.GameObjects.Container;
  private done = false;

  constructor(private scene: Phaser.Scene, private controls: Controls, speaker: string, line: string,
    readonly options: ChoiceOption[], private onClose: () => void, accent: number = COLORS.cyan, o: ChoicePanelOpts = {}) {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT, pw = 364;
    const pic = o.portrait || o.square ? 56 : 0;
    const lineT = txt(scene, 0, 0, line, 7, T.text).setWordWrapWidth(pw - 28 - pic).setLineSpacing(2);
    const lineH = Math.max(lineT.height, o.square ? 42 : pic ? 26 : 0);
    const compact = options.every(op => !op.desc);
    const rowH = compact ? 18 : 28, gap = 4;
    const ph = 22 + lineH + 8 + options.length * (rowH + gap) + 16;
    const left = (W - pw) / 2, top = Math.max(14, (H - ph) / 2);
    this.root = scene.add.container(0, 0).setDepth(5000);
    this.root.add(backdrop(scene, 0.72, accent));
    this.root.add(panel(scene, left, top, pw, ph, { accent, title: speaker.toUpperCase(), titleSize: 11, code: o.code ?? 'RENCONTRE // RUE', dots: 'br' }));
    if (o.portrait) this.root.add(scene.add.image(left + 14, top + 14, o.portrait).setOrigin(0, 0).setDisplaySize(48, 24));
    if (o.square) o.square().then(k => { if (k && !this.done) this.root.add(scene.add.image(left + 14, top + 14, k).setOrigin(0, 0).setDisplaySize(40, 40)); }).catch(() => {});
    lineT.setPosition(left + 14 + pic, top + 13);
    this.root.add(lineT);
    const y0 = top + 13 + lineH + 9;
    options.forEach((op, i) => {
      const y = y0 + i * (rowH + gap), on = op.enabled !== false;
      const card = new Card(scene, left + 10, y, pw - 20, rowH, { accent, state: on ? 'idle' : 'off', hoverSfx: true, onClick: on ? () => this.choose(i) : undefined });
      card.add(keycap(scene, 7, 9, `${i + 1}`, on ? C.yellow : C.line, 5));
      const lx = op.icon ? 42 : 22;
      if (op.icon) op.icon().then(k => { if (k && !this.done) card.add(scene.add.image(24, rowH / 2, k).setDisplaySize(rowH - 6, rowH - 6)); }).catch(() => {});
      card.add(bold(scene, lx, 9, op.label, 7, on ? T.yellow : T.off).setOrigin(0, 0.5));
      if (op.desc) card.add(txt(scene, lx, 16, op.desc, 6, on ? T.dim : T.off).setWordWrapWidth(pw - 120 - (lx - 22)));
      if (op.cost) card.add(chip(scene, pw - 32, 9, op.cost, on ? C.magenta : C.line, { size: 5, originX: 1, text: on ? T.magenta : T.off }));
      this.root.add(card);
    });
    this.root.add(hints(scene, W / 2, top + ph - 8, [['ÉCHAP', 'Partir'], ['1-4', 'Choisir']], C.yellow));
    pinToCamera(this.root);
    if (!o.quiet) audio.sfx('uiOpen');
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
