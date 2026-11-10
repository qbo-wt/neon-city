import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import { txt } from './text';

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
    const btn = scene.add.container(x, y, [
      scene.add.circle(0, 0, 7, 0x140f2b).setStrokeStyle(1, COLORS.cyan),
      txt(scene, 0, 0, 'i', 9, '#00f0ff').setOrigin(0.5),
    ]).setDepth(2001).setSize(16, 16).setInteractive({ useHandCursor: true });
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
    const s = this.scene, W = CONFIG.WIDTH, h = 30 + this.keys.length * 14;
    const top = (CONFIG.HEIGHT - h) / 2;
    const items: Phaser.GameObjects.GameObject[] = [
      s.add.rectangle(W / 2, CONFIG.HEIGHT / 2, 330, h, 0x05030f, 0.95).setStrokeStyle(1, COLORS.cyan),
      txt(s, W / 2, top + 12, 'COMMANDES', 9, '#00f0ff').setOrigin(0.5),
    ];
    this.keys.forEach(([k, v], i) => {
      items.push(txt(s, W / 2 - 156, top + 28 + i * 14, k, 7, '#f5e663'));
      items.push(txt(s, W / 2 - 30, top + 28 + i * 14, v, 7, '#e8e8ff'));
    });
    this.panel = s.add.container(0, 0, items).setDepth(2000);
    this.panel.setScrollFactor(0, 0, true);
  }
}
