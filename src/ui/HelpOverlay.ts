import Phaser from 'phaser';
import { CONFIG } from '../config';
import { C, T, cutPoly, hints, keycap, panel, pinToCamera } from './kit';
import { title, txt } from './text';

const HUB_KEYS: [string, string][] = [
  ['ZQSD / WASD / flèches', 'Se déplacer'],
  ['E', 'Interagir'],
  ['1 / 2 / 3 / 4', 'Choisir une option'],
  ['M', 'Couper / remettre le son'],
  ['I', 'Afficher / cacher cette aide'],
];
const RUN_KEYS: [string, string][] = [
  ['CLIC sur une case', 'Se déplacer (coût en PM affiché)'],
  ['MOLETTE / ZQSD', 'Zoomer / déplacer la caméra'],
  ['1 à 9 ou clic', 'Choisir un sort, puis clic sur la cible'],
  ['CLIC DROIT / ÉCHAP', 'Annuler le sort choisi'],
  ['ESPACE / ENTRÉE', 'Fin du tour (ou PRÊT au placement)'],
  ['F', 'Neuro-bloqueur (2 PA, -30 psychose)'],
  ['SURVOL', 'Infos d\'une créature, portée et dégâts prévus'],
  ['M', 'Couper / remettre le son'],
  ['I', 'Afficher / cacher cette aide'],
];

/** An "i" button in a screen corner; click it (or press I) to toggle the list of controls. */
export class HelpOverlay {
  private panel?: Phaser.GameObjects.Container;

  private keys: [string, string][];

  constructor(private scene: Phaser.Scene, x = CONFIG.WIDTH - 12, y = CONFIG.HEIGHT - 12, mode: 'hub' | 'run' = 'hub') {
    this.keys = mode === 'run' ? RUN_KEYS : HUB_KEYS;
    const g = scene.add.graphics();
    const draw = (hot: boolean) => {
      g.clear();
      g.fillStyle(C.deep, 0.6).fillPoints(cutPoly(-6, -6, 14, 14, 3), true);
      g.fillStyle(hot ? C.cyan : C.panel, hot ? 1 : 0.92).fillPoints(cutPoly(-7, -7, 14, 14, 3), true);
      g.lineStyle(0.5, C.cyan, 1).strokePoints(cutPoly(-7, -7, 14, 14, 3), true);
      label.setColor(hot ? T.dark : T.cyan);
    };
    const label = title(scene, 0, 0.8, 'i', 12, T.cyan).setFontStyle('600').setOrigin(0.5);
    const btn = scene.add.container(x, y, [g, label]).setDepth(2001).setSize(16, 16).setInteractive({ useHandCursor: true });
    draw(false);
    btn.on('pointerover', () => draw(true));
    btn.on('pointerout', () => draw(false));
    btn.setScrollFactor(0, 0, true);
    btn.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      if (p.button !== 0) return;
      e.stopPropagation();
      this.toggle();
    });
    const onKey = () => this.toggle();
    scene.input.keyboard!.on('keydown-I', onKey);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.input.keyboard?.off('keydown-I', onKey));
  }

  get isOpen() { return !!this.panel; }

  toggle() {
    if (this.panel) { this.panel.destroy(); this.panel = undefined; return; }
    const s = this.scene, W = CONFIG.WIDTH, H = CONFIG.HEIGHT, rowH = 13;
    const pw = 300, ph = 34 + this.keys.length * rowH;
    const left = (W - pw) / 2, top = (H - ph) / 2;
    const items: Phaser.GameObjects.GameObject[] = [
      s.add.rectangle(W / 2, H / 2, W, H, C.deep, 0.45),
      panel(s, left, top, pw, ph, { accent: C.cyan, title: 'COMMANDES', code: 'AIDE // I', dots: 'br' }),
    ];
    this.keys.forEach(([k, v], i) => {
      const y = top + 16 + i * rowH;
      if (i % 2 === 0) items.push(s.add.rectangle(W / 2, y, pw - 12, rowH - 1, C.white, 0.035));
      items.push(keycap(s, left + 12, y, k, C.yellow, 5));
      items.push(txt(s, left + 124, y, v, 6, T.text).setOrigin(0, 0.5));
    });
    items.push(hints(s, W / 2, top + ph - 8, [['I', 'Fermer']], C.cyan));
    this.panel = s.add.container(0, 0, items).setDepth(2000);
    pinToCamera(this.panel);
  }
}
