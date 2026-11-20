import Phaser from 'phaser';
import { CONFIG } from '../config';
import { audio } from '../audio/audio';
import { creditLines, type CreditLine } from '../data/credits';
import { txt } from './text';
import { Button, C, T, backdrop, bold, hints, markPanelClosed, panel, pinToCamera } from './kit';

const PW = 330, PH = 236, ROW = 9, VISIBLE = 21;
const STYLE: Record<CreditLine['kind'], { size: number; color: string; bold?: boolean }> = {
  big: { size: 13, color: T.yellow, bold: true }, sub: { size: 7, color: T.cyan, bold: true },
  title: { size: 7, color: T.magenta, bold: true }, use: { size: 5.5, color: T.mute },
  text: { size: 6, color: T.text }, link: { size: 5.5, color: T.cyan }, note: { size: 5.5, color: T.dim }, gap: { size: 4, color: T.text },
};

/** A scrollable list of the game's credits: wheel, arrows or PgUp / PgDn to scroll, Échap to close. */
export class CreditsPanel {
  private root?: Phaser.GameObjects.Container;
  private body?: Phaser.GameObjects.Container;
  private lines = creditLines();
  private top = 0;
  private keyHandler?: (e: KeyboardEvent) => void;
  private wheelHandler?: (p: Phaser.Input.Pointer, o: unknown, dx: number, dy: number) => void;
  private openedFrame = -1;

  constructor(private scene: Phaser.Scene) {
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.detach());
  }

  get isOpen() { return !!this.root; }

  open() {
    if (this.root) return;
    this.top = 0;
    this.openedFrame = this.scene.game.loop.frame;
    this.render();
    audio.sfx('uiOpen');
    this.keyHandler = (e: KeyboardEvent) => this.onKey(e);
    this.wheelHandler = (_p, _o, _dx, dy) => this.scroll(dy > 0 ? 3 : -3);
    this.scene.input.keyboard?.on('keydown', this.keyHandler);
    this.scene.input.on('wheel', this.wheelHandler);
  }

  close() {
    if (!this.root) return;
    this.root.destroy();
    audio.sfx('uiClose');
    this.root = undefined;
    this.body = undefined;
    this.detach();
    markPanelClosed(this.scene);
  }

  private detach() {
    if (this.keyHandler) this.scene.input.keyboard?.off('keydown', this.keyHandler);
    if (this.wheelHandler) this.scene.input.off('wheel', this.wheelHandler);
    this.keyHandler = undefined; this.wheelHandler = undefined;
  }

  private onKey(e: KeyboardEvent) {
    if (!this.root || this.scene.game.loop.frame === this.openedFrame) return;
    if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'NumpadEnter') { if (!e.repeat) this.close(); return; }
    const step = e.code === 'ArrowDown' ? 1 : e.code === 'ArrowUp' ? -1 : e.code === 'PageDown' || e.code === 'Space' ? VISIBLE - 2 : e.code === 'PageUp' ? -(VISIBLE - 2) : 0;
    if (!step) return;
    e.preventDefault();
    this.scroll(step);
  }

  private scroll(d: number) {
    const max = Math.max(0, this.lines.length - VISIBLE);
    const next = Phaser.Math.Clamp(this.top + d, 0, max);
    if (next === this.top) return;
    this.top = next;
    this.paintBody();
  }

  private paintBody() {
    if (!this.body) return;
    this.body.removeAll(true);
    const left = (CONFIG.WIDTH - PW) / 2, y0 = (CONFIG.HEIGHT - PH) / 2 + 20, s = this.scene;
    const max = Math.max(0, this.lines.length - VISIBLE);
    this.lines.slice(this.top, this.top + VISIBLE).forEach((l, i) => {
      if (l.kind === 'gap') return;
      const st = STYLE[l.kind];
      this.body!.add((st.bold ? bold : txt)(s, left + 16, y0 + i * ROW, l.text, st.size, st.color).setOrigin(0, 0.5));
    });
    // A scroll thumb on the right edge.
    const g = s.add.graphics();
    const h = PH - 52, x = left + PW - 8;
    g.fillStyle(C.line2, 0.8).fillRect(x, y0 - 4, 2, h);
    const th = Math.max(10, h * VISIBLE / this.lines.length);
    g.fillStyle(C.cyan, 0.9).fillRect(x, y0 - 4 + (max ? (h - th) * this.top / max : 0), 2, th);
    this.body.add(g);
    pinToCamera(this.body);
  }

  private render() {
    const s = this.scene, W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const left = (W - PW) / 2, top = (H - PH) / 2;
    const root = s.add.container(0, 0).setDepth(7000);
    this.root = root;
    root.add(s.add.zone(W / 2, H / 2, W, H).setInteractive());
    root.add(backdrop(s, 0.82, C.cyan));
    root.add(panel(s, left, top, PW, PH, { accent: C.cyan, title: 'CRÉDITS', titleSize: 11, code: 'NEON CITY // MERCI', dots: 'br' }));
    this.body = s.add.container(0, 0);
    root.add(this.body);
    root.add(new Button(s, left + PW - 76, top + PH - 17, 64, 11, 'FERMER', { accent: C.yellow, font: 'ui', size: 6, solid: true, onClick: () => this.close() }));
    root.add(hints(s, left + 80, top + PH - 11.5, [['MOLETTE / ↑ ↓', 'Défiler'], ['ÉCHAP', 'Fermer']], C.cyan));
    pinToCamera(root);
    this.paintBody();
  }
}
