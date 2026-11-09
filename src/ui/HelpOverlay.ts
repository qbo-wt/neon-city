import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import { txt } from './text';

const KEYS: [string, string][] = [
  ['ZQSD / WASD / flèches', 'Se déplacer'],
  ['ESPACE', 'Dash (invulnérable)'],
  ['CLIC GAUCHE', 'Frapper vers le curseur (combo x3)'],
  ['CLIC DROIT', 'Parer juste avant l\'impact'],
  ['E / MAJ (en run)', 'Capacité spéciale de l\'arme'],
  ['F', 'Neuro-bloqueur (réduit la psychose)'],
  ['E', 'Interagir'],
  ['1 / 2 / 3 / 4', 'Choisir une option'],
  ['M', 'Couper / remettre le son'],
  ['I', 'Afficher / cacher cette aide'],
];

/** An "i" button in a screen corner; click it (or press I) to toggle the list of controls. */
export class HelpOverlay {
  private panel?: Phaser.GameObjects.Container;

  constructor(private scene: Phaser.Scene, x = CONFIG.WIDTH - 12, y = CONFIG.HEIGHT - 12) {
    const btn = scene.add.container(x, y, [
      scene.add.circle(0, 0, 7, 0x140f2b).setStrokeStyle(1, COLORS.cyan),
      txt(scene, 0, 0, 'i', 9, '#00f0ff').setOrigin(0.5),
    ]).setDepth(300).setSize(16, 16).setInteractive({ useHandCursor: true });
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
    const s = this.scene, W = CONFIG.WIDTH, h = 30 + KEYS.length * 14;
    const top = (CONFIG.HEIGHT - h) / 2;
    const items: Phaser.GameObjects.GameObject[] = [
      s.add.rectangle(W / 2, CONFIG.HEIGHT / 2, 300, h, 0x05030f, 0.95).setStrokeStyle(1, COLORS.cyan),
      txt(s, W / 2, top + 12, 'COMMANDES', 9, '#00f0ff').setOrigin(0.5),
    ];
    KEYS.forEach(([k, v], i) => {
      items.push(txt(s, W / 2 - 138, top + 28 + i * 14, k, 7, '#f5e663'));
      items.push(txt(s, W / 2 - 20, top + 28 + i * 14, v, 7, '#e8e8ff'));
    });
    this.panel = s.add.container(0, 0, items).setDepth(299);
    this.panel.setScrollFactor(0, 0, true);
  }
}
