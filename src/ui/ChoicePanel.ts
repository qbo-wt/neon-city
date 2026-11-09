import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import type { Controls } from '../input/controls';
import { audio } from '../audio/audio';
import { txt } from './text';

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
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT, h = 64 + options.length * 34;
    const top = (H - h) / 2;
    const hex = '#' + accent.toString(16).padStart(6, '0');
    this.root = scene.add.container(0, 0).setDepth(5000);
    this.root.add(scene.add.rectangle(W / 2, H / 2, W, H, 0x05030f, 0.7));
    this.root.add(scene.add.rectangle(W / 2, H / 2, 360, h, 0x0b0820, 0.97).setStrokeStyle(1, accent));
    this.root.add(txt(scene, W / 2 - 170, top + 8, speaker.toUpperCase(), 8, hex));
    this.root.add(txt(scene, W / 2 - 170, top + 22, line, 7, '#e8e8ff').setWordWrapWidth(340));
    options.forEach((o, i) => {
      const y = top + 52 + i * 34, on = o.enabled !== false;
      const row = scene.add.rectangle(W / 2, y + 12, 344, 30, 0x140f2b).setStrokeStyle(1, on ? 0x3a3550 : 0x221d35);
      if (on) {
        row.setInteractive({ useHandCursor: true });
        row.on('pointerover', () => { row.setStrokeStyle(1, accent); audio.sfx('ui'); });
        row.on('pointerout', () => row.setStrokeStyle(1, 0x3a3550));
        row.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.button === 0) this.choose(i); });
      }
      this.root.add(row);
      this.root.add(txt(scene, W / 2 - 166, y + 2, `[${i + 1}] ${o.label}`, 7, on ? '#f5e663' : '#5a5578'));
      this.root.add(txt(scene, W / 2 - 166, y + 13, o.desc, 6, on ? '#a8a6d8' : '#5a5578').setWordWrapWidth(280));
      if (o.cost) this.root.add(txt(scene, W / 2 + 166, y + 2, o.cost, 7, on ? '#ff2a6d' : '#5a5578').setOrigin(1, 0));
    });
    this.root.add(txt(scene, W / 2, top + h - 9, '[ÉCHAP] Partir', 6, '#8a86b0').setOrigin(0.5));
    this.root.setScrollFactor(0, 0, true);
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
