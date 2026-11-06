import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import { buyNode, canBuy } from '../core/skillTree';
import type { SaveData } from '../core/save';
import { SKILL_NODES } from '../data/skillNodes';
import { txt } from './text';

/** Terminal overlay: two columns of nodes (body / mind). Click to buy; Esc or E closes. */
export class SkillTreePanel {
  private root?: Phaser.GameObjects.Container;

  constructor(private scene: Phaser.Scene, private getSave: () => SaveData, private persist: (s: SaveData) => void) {}

  get isOpen() { return !!this.root; }

  open() { this.render(); }
  close() { this.root?.destroy(); this.root = undefined; }

  private render() {
    this.root?.destroy();
    const s = this.scene, save = this.getSave(), W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const root = s.add.container(0, 0).setScrollFactor(0).setDepth(200);
    this.root = root;
    root.add(s.add.rectangle(W / 2, H / 2, W, H, 0x05030f, 0.9));
    root.add(txt(s, W / 2, 14, 'TERMINAL DU DOC — AMÉLIORATIONS PERMANENTES', 9, '#00f0ff').setOrigin(0.5));
    root.add(txt(s, W / 2, 28, `crédits : ${save.credits}¢`, 8, '#f5e663').setOrigin(0.5));
    root.add(txt(s, 120, 44, 'CORPS', 8, '#ff2a6d').setOrigin(0.5));
    root.add(txt(s, 360, 44, 'ESPRIT', 8, '#ff2a6d').setOrigin(0.5));

    const rows = [0, 0];
    const pos = new Map<string, { x: number; y: number }>();
    SKILL_NODES.forEach(n => {
      const x = n.column === 0 ? 120 : 360, y = 72 + rows[n.column]++ * 46;
      pos.set(n.id, { x, y });
    });

    const lines = s.add.graphics();
    root.add(lines);
    SKILL_NODES.forEach(n => {
      if (!n.requires) return;
      const a = pos.get(n.requires)!, b = pos.get(n.id)!;
      lines.lineStyle(1, save.ownedNodes.includes(n.requires) ? COLORS.cyan : 0x3a3550).lineBetween(a.x, a.y + 16, b.x, b.y - 16);
    });

    SKILL_NODES.forEach(n => {
      const { x, y } = pos.get(n.id)!;
      const owned = save.ownedNodes.includes(n.id);
      const buyable = canBuy(n.id, save.ownedNodes, save.credits);
      const stroke = owned ? COLORS.cyan : buyable ? COLORS.white : 0x3a3550;
      const box = s.add.rectangle(x, y, 196, 32, owned ? 0x06303a : 0x140f2b).setStrokeStyle(1, stroke);
      root.add(box);
      root.add(txt(s, x - 92, y - 12, n.name, 7, owned ? '#00f0ff' : buyable ? '#e8e8ff' : '#5a5578'));
      root.add(txt(s, x - 92, y + 1, n.description, 6, '#8a86b0'));
      root.add(txt(s, x + 92, y - 12, owned ? 'ACQUIS' : `${n.cost}¢`, 7, owned ? '#00f0ff' : buyable ? '#f5e663' : '#5a5578').setOrigin(1, 0));
      if (buyable) {
        box.setInteractive({ useHandCursor: true });
        box.on('pointerover', () => box.setStrokeStyle(2, COLORS.magenta));
        box.on('pointerout', () => box.setStrokeStyle(1, stroke));
        box.on('pointerdown', (p: Phaser.Input.Pointer) => {
          if (p.button !== 0) return;
          const cur = this.getSave();
          if (!canBuy(n.id, cur.ownedNodes, cur.credits)) return;
          const r = buyNode(n.id, cur.ownedNodes, cur.credits);
          this.persist({ ...cur, ownedNodes: r.owned, credits: r.credits });
          this.scene.cameras.main.flash(120, 0, 240, 255);
          this.render();
        });
      }
    });
    root.add(txt(s, W / 2, H - 12, '[ÉCHAP] fermer', 7, '#8a86b0').setOrigin(0.5));
    // Children must be camera-fixed too, or their hit areas are offset by the camera scroll.
    root.setScrollFactor(0, 0, true);
  }
}
