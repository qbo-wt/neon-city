import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import { buyNode, canBuy } from '../core/skillTree';
import type { SaveData } from '../core/save';
import type { SkillNode } from '../core/types';
import { BRANCH_NAMES, SKILL_NODES } from '../data/skillNodes';
import { txt } from './text';

const BOX_W = 70, BOX_H = 30, ROW_Y = [80, 118, 156, 194];
/** Column centres: 4 body branches, a gap, then 2 mind branches. */
const COL_X = [45, 121, 197, 273, 365, 441];

/** Terminal overlay: 6 branches of 4 chained nodes. Hover for details, click to buy, Esc or E closes. */
export class SkillTreePanel {
  private root?: Phaser.GameObjects.Container;
  private detail?: Phaser.GameObjects.Text;

  constructor(private scene: Phaser.Scene, private getSave: () => SaveData, private persist: (s: SaveData) => void) {}

  get isOpen() { return !!this.root; }

  open() { this.render(); }
  close() { this.root?.destroy(); this.root = undefined; }

  private render() {
    this.root?.destroy();
    const s = this.scene, save = this.getSave(), W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const root = s.add.container(0, 0).setDepth(200);
    this.root = root;
    root.add(s.add.rectangle(W / 2, H / 2, W, H, 0x05030f, 0.94));
    root.add(txt(s, W / 2, 12, 'TERMINAL DU DOC — AMÉLIORATIONS PERMANENTES', 9, '#00f0ff').setOrigin(0.5));
    root.add(txt(s, W / 2, 26, `Crédits : ${save.credits}¢`, 8, '#f5e663').setOrigin(0.5));
    root.add(txt(s, (COL_X[0] + COL_X[3]) / 2, 44, 'CORPS', 8, '#ff2a6d').setOrigin(0.5));
    root.add(txt(s, (COL_X[4] + COL_X[5]) / 2, 44, 'ESPRIT', 8, '#ff2a6d').setOrigin(0.5));
    const sep = s.add.graphics();
    sep.lineStyle(1, 0x3a3550).lineBetween(319, 40, 319, 212);
    root.add(sep);
    BRANCH_NAMES.forEach((n, b) => root.add(txt(s, COL_X[b], 58, n, 6, '#8a86b0').setOrigin(0.5)));

    const lines = s.add.graphics();
    root.add(lines);
    const pos = (n: SkillNode) => {
      const i = SKILL_NODES.filter(m => m.branch === n.branch).indexOf(n);
      return { x: COL_X[n.branch], y: ROW_Y[i] };
    };

    SKILL_NODES.forEach(n => {
      const { x, y } = pos(n);
      if (n.requires) {
        lines.lineStyle(1, save.ownedNodes.includes(n.requires) ? COLORS.cyan : 0x3a3550)
          .lineBetween(x, y - BOX_H / 2 - 8, x, y - BOX_H / 2);
      }
      const owned = save.ownedNodes.includes(n.id);
      const buyable = canBuy(n.id, save.ownedNodes, save.credits);
      const stroke = owned ? COLORS.cyan : buyable ? COLORS.white : 0x3a3550;
      const box = s.add.rectangle(x, y, BOX_W, BOX_H, owned ? 0x06303a : 0x140f2b).setStrokeStyle(1, stroke)
        .setInteractive({ useHandCursor: buyable });
      root.add(box);
      root.add(txt(s, x, y - 6, n.name, 6, owned ? '#00f0ff' : buyable ? '#e8e8ff' : '#5a5578')
        .setOrigin(0.5).setAlign('center').setWordWrapWidth(BOX_W - 4));
      root.add(txt(s, x, y + 9, owned ? 'ACQUIS' : `${n.cost}¢`, 6, owned ? '#00f0ff' : buyable ? '#f5e663' : '#5a5578').setOrigin(0.5));

      box.on('pointerover', () => {
        box.setStrokeStyle(2, buyable ? COLORS.magenta : stroke);
        const state = owned ? 'Acquis' : buyable ? `Clique pour acheter (${n.cost}¢)` : n.requires && !save.ownedNodes.includes(n.requires) ? 'Débloque d\'abord le nœud au-dessus' : `Il te faut ${n.cost}¢`;
        this.detail?.setText(`${n.name} — ${n.description}\n${state}`);
      });
      box.on('pointerout', () => { box.setStrokeStyle(1, stroke); this.detail?.setText(''); });
      if (buyable) box.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.button !== 0) return;
        const cur = this.getSave();
        if (!canBuy(n.id, cur.ownedNodes, cur.credits)) return;
        const r = buyNode(n.id, cur.ownedNodes, cur.credits);
        this.persist({ ...cur, ownedNodes: r.owned, credits: r.credits });
        this.scene.cameras.main.flash(120, 0, 240, 255);
        this.render();
      });
    });

    this.detail = txt(s, W / 2, 226, '', 7, '#e8e8ff').setOrigin(0.5).setAlign('center');
    root.add(this.detail);
    root.add(txt(s, W / 2, H - 10, '[ÉCHAP] Fermer', 7, '#8a86b0').setOrigin(0.5));
    // Children must be camera-fixed too, or their hit areas are offset by the camera scroll.
    root.setScrollFactor(0, 0, true);
  }
}
