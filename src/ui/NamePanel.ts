import Phaser from 'phaser';
import { CONFIG } from '../config';
import { audio } from '../audio/audio';
import { playerName, setPlayerName, typing } from '../core/player';
import { NAME_MAX, NAME_MIN } from '../core/ranking';
import { txt } from './text';
import { Button, C, T, backdrop, bold, hints, panel, pinToCamera } from './kit';

const PW = 230, PH = 100;
const ALLOWED = /^[A-Za-z0-9À-ÖØ-öø-ÿ _-]$/;

/**
 * Asks for the leaderboard name: a text box fed by the keyboard. Entrée validates, Échap (or the
 * second button) leaves it for later. `onDone` gets the stored name, or null if skipped.
 */
export class NamePanel {
  private root?: Phaser.GameObjects.Container;
  private value = '';
  private shown?: Phaser.GameObjects.Text;
  private note?: Phaser.GameObjects.Text;
  private onDone?: (name: string | null) => void;
  private keyHandler?: (e: KeyboardEvent) => void;
  private openedFrame = -1;

  constructor(private scene: Phaser.Scene, private skipLabel = 'PLUS TARD') {
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.release());
  }

  get isOpen() { return !!this.root; }

  open(onDone: (name: string | null) => void) {
    if (this.root) return;
    this.onDone = onDone;
    this.value = playerName();
    this.openedFrame = this.scene.game.loop.frame;
    this.render();
    typing.active = true;
    audio.sfx('uiOpen');
    this.keyHandler = (e: KeyboardEvent) => this.onKey(e);
    this.scene.input.keyboard?.on('keydown', this.keyHandler);
  }

  private release() {
    if (this.keyHandler) this.scene.input.keyboard?.off('keydown', this.keyHandler);
    this.keyHandler = undefined;
    typing.active = false;
  }

  private finish(name: string | null) {
    if (!this.root) return;
    this.root.destroy();
    this.root = undefined;
    this.release();
    const done = this.onDone;
    this.onDone = undefined;
    done?.(name);
  }

  private confirm() {
    const n = setPlayerName(this.value);
    if (!n) {
      audio.sfx('deny');
      this.note?.setText(`${NAME_MIN} à ${NAME_MAX} caractères : lettres, chiffres, espace, - et _`).setColor(T.magenta);
      return;
    }
    audio.sfx('ui');
    this.finish(n);
  }

  private onKey(e: KeyboardEvent) {
    if (!this.root || this.scene.game.loop.frame === this.openedFrame) return;
    if (e.code === 'Escape') { if (!e.repeat) this.finish(null); return; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { if (!e.repeat) this.confirm(); return; }
    if (e.code === 'Backspace') this.value = this.value.slice(0, -1);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && ALLOWED.test(e.key) && this.value.length < NAME_MAX) this.value += e.key;
    else return;
    e.preventDefault();
    this.note?.setText('');
    this.paintValue();
  }

  private paintValue() {
    this.shown?.setText(this.value + '_');
  }

  private render() {
    const s = this.scene, W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const left = (W - PW) / 2, top = (H - PH) / 2;
    const root = s.add.container(0, 0).setDepth(7000);
    this.root = root;
    root.add(s.add.zone(W / 2, H / 2, W, H).setInteractive());
    root.add(backdrop(s, 0.78, C.yellow));
    root.add(panel(s, left, top, PW, PH, { accent: C.yellow, title: 'TON PSEUDO', titleSize: 11, code: 'CLASSEMENT // ENTRÉE', dots: 'br' }));
    root.add(txt(s, W / 2, top + 22, 'Le classement montre la meilleure run de chaque joueur.\nTape le nom que tes potes verront.', 6, T.dim).setOrigin(0.5, 0).setAlign('center').setLineSpacing(2));
    const g = s.add.graphics();
    g.fillStyle(C.deep, 0.9).fillRect(left + 40, top + 44, PW - 80, 16);
    g.lineStyle(0.75, C.yellow, 0.9).strokeRect(left + 40, top + 44, PW - 80, 16);
    root.add(g);
    this.shown = bold(s, W / 2, top + 52, '', 10, T.yellow).setOrigin(0.5);
    root.add(this.shown);
    s.tweens.add({ targets: this.shown, alpha: 0.7, yoyo: true, repeat: -1, duration: 500 });
    this.note = txt(s, W / 2, top + 64, '', 5.5, T.mute).setOrigin(0.5, 0);
    root.add(this.note);
    root.add(new Button(s, left + PW / 2 - 78, top + PH - 28, 74, 12, 'VALIDER', { accent: C.yellow, font: 'ui', size: 6, solid: true, onClick: () => this.confirm() }));
    root.add(new Button(s, left + PW / 2 + 4, top + PH - 28, 74, 12, this.skipLabel, { accent: C.cyan, font: 'ui', size: 6, onClick: () => this.finish(null) }));
    root.add(hints(s, W / 2, top + PH - 10, [['ENTRÉE', 'Valider'], ['ÉCHAP', this.skipLabel === 'PLUS TARD' ? 'Plus tard' : 'Annuler']], C.yellow));
    pinToCamera(root);
    this.paintValue();
  }
}
