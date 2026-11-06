import Phaser from 'phaser';
import { CONFIG } from '../config';
import { buyNode, canBuy } from '../core/skillTree';
import type { SaveData } from '../core/save';
import type { SkillNode } from '../core/types';
import { BRANCH_NAMES, SKILL_NODES } from '../data/skillNodes';
import { txt } from './text';

export interface ShopTheme {
  title: string;
  subtitle: string;
  bg: number; frame: number; accent: string;
  box: number; boxOwned: number; lockedStroke: number;
  text: string; dim: string; owned: string;
  /** extra drawing behind the nodes (ECG trace, scanlines…) */
  decorate: (s: Phaser.Scene, root: Phaser.GameObjects.Container) => void;
}

/** Ripperdoc: sterile white and surgical red, with a heartbeat trace. */
export const CLINIC_THEME: ShopTheme = {
  title: 'CLINIQUE DU DOC KESSLER', subtitle: 'Chirurgie corporelle — paiement d\'avance',
  bg: 0x16070b, frame: 0xff3b3b, accent: '#ff3b3b',
  box: 0x2a0d12, boxOwned: 0x6a1424, lockedStroke: 0x4a2a30,
  text: '#f2f2f2', dim: '#7a5a60', owned: '#ffffff',
  decorate: (s, root) => {
    const g = s.add.graphics();
    g.lineStyle(1, 0xff3b3b, 0.5).beginPath();
    const ecg = [0, 0, 0, -2, 10, -14, 0, 0, 2, 0];
    for (let x = 0; x <= CONFIG.WIDTH; x += 4) {
      const y = 36 + (ecg[(x / 4) % ecg.length] ?? 0) * 0.6;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokePath();
    g.fillStyle(0xff3b3b).fillRect(16, 8, 4, 12).fillRect(12, 12, 12, 4); // red cross
    g.fillRect(CONFIG.WIDTH - 20, 8, 4, 12).fillRect(CONFIG.WIDTH - 24, 12, 12, 4);
    root.add(g);
  },
};

/** Netrunner: black screen, green phosphor, scanlines and scrolling hex. */
export const NET_THEME: ShopTheme = {
  title: '> NYX@DEN:~$ calibrage_neural', subtitle: 'Pare-feu mental, gestion de la charge, réseau de contacts',
  bg: 0x020b06, frame: 0x39ff88, accent: '#39ff88',
  box: 0x04140b, boxOwned: 0x0f3d24, lockedStroke: 0x123326,
  text: '#b8ffd8', dim: '#2a6a46', owned: '#39ff88',
  decorate: (s, root) => {
    const g = s.add.graphics();
    for (let y = 0; y < CONFIG.HEIGHT; y += 3) g.fillStyle(0x39ff88, 0.035).fillRect(0, y, CONFIG.WIDTH, 1);
    root.add(g);
    const hex = () => Array.from({ length: 18 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join('\n');
    root.add(txt(s, 8, 44, hex(), 6, '#0f3d24'));
    root.add(txt(s, CONFIG.WIDTH - 22, 44, hex(), 6, '#0f3d24'));
  },
};

const ROW_Y = [86, 124, 162, 200];

/** A shop overlay over some branches of the skill tree. Hover for details, click to buy, Esc or E closes. */
export class SkillTreePanel {
  private root?: Phaser.GameObjects.Container;
  private detail?: Phaser.GameObjects.Text;

  constructor(private scene: Phaser.Scene, private getSave: () => SaveData, private persist: (s: SaveData) => void,
    private branches: number[], private theme: ShopTheme) {}

  get isOpen() { return !!this.root; }

  open() { this.render(); }
  close() { this.root?.destroy(); this.root = undefined; }

  private render() {
    this.root?.destroy();
    const s = this.scene, save = this.getSave(), W = CONFIG.WIDTH, H = CONFIG.HEIGHT, th = this.theme;
    const root = s.add.container(0, 0).setDepth(200);
    this.root = root;
    root.add(s.add.rectangle(W / 2, H / 2, W, H, th.bg, 0.97).setStrokeStyle(2, th.frame));
    th.decorate(s, root);
    root.add(txt(s, W / 2, 12, th.title, 9, th.accent).setOrigin(0.5));
    root.add(txt(s, W / 2, 24, th.subtitle, 6, th.dim).setOrigin(0.5));
    root.add(txt(s, W / 2, 48, `Crédits : ${save.credits}¢`, 8, '#f5e663').setOrigin(0.5));

    const boxW = this.branches.length > 2 ? 90 : 120;
    const gap = this.branches.length > 2 ? 100 : 140;
    const colX = this.branches.map((_, i) => W / 2 + (i - (this.branches.length - 1) / 2) * gap);
    this.branches.forEach((b, i) => root.add(txt(s, colX[i], 64, BRANCH_NAMES[b], 7, th.accent).setOrigin(0.5)));

    const lines = s.add.graphics();
    root.add(lines);
    const nodes = SKILL_NODES.filter(n => this.branches.includes(n.branch));
    const pos = (n: SkillNode) => {
      const i = SKILL_NODES.filter(m => m.branch === n.branch).indexOf(n);
      return { x: colX[this.branches.indexOf(n.branch)], y: ROW_Y[i] };
    };

    nodes.forEach(n => {
      const { x, y } = pos(n);
      if (n.requires) {
        lines.lineStyle(1, save.ownedNodes.includes(n.requires) ? th.frame : th.lockedStroke).lineBetween(x, y - 23, x, y - 15);
      }
      const owned = save.ownedNodes.includes(n.id);
      const buyable = canBuy(n.id, save.ownedNodes, save.credits);
      const stroke = owned ? th.frame : buyable ? 0xffffff : th.lockedStroke;
      const box = s.add.rectangle(x, y, boxW, 30, owned ? th.boxOwned : th.box).setStrokeStyle(1, stroke)
        .setInteractive({ useHandCursor: buyable });
      root.add(box);
      root.add(txt(s, x, y - 6, n.name, 6, owned ? th.owned : buyable ? th.text : th.dim)
        .setOrigin(0.5).setAlign('center').setWordWrapWidth(boxW - 6));
      root.add(txt(s, x, y + 9, owned ? 'INSTALLÉ' : `${n.cost}¢`, 6, owned ? th.owned : buyable ? '#f5e663' : th.dim).setOrigin(0.5));

      box.on('pointerover', () => {
        box.setStrokeStyle(2, buyable ? th.frame : stroke);
        const state = owned ? 'Déjà installé' : buyable ? `Clique pour acheter (${n.cost}¢)`
          : n.requires && !save.ownedNodes.includes(n.requires) ? 'Débloque d\'abord l\'amélioration au-dessus' : `Il te faut ${n.cost}¢`;
        this.detail?.setText(`${n.name} — ${n.description}\n${state}`);
      });
      box.on('pointerout', () => { box.setStrokeStyle(1, stroke); this.detail?.setText(''); });
      if (buyable) box.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.button !== 0) return;
        const cur = this.getSave();
        if (!canBuy(n.id, cur.ownedNodes, cur.credits)) return;
        const r = buyNode(n.id, cur.ownedNodes, cur.credits);
        this.persist({ ...cur, ownedNodes: r.owned, credits: r.credits });
        const c = Phaser.Display.Color.IntegerToRGB(th.frame);
        this.scene.cameras.main.flash(140, c.r, c.g, c.b);
        this.render();
      });
    });

    this.detail = txt(s, W / 2, 232, '', 7, th.text).setOrigin(0.5).setAlign('center');
    root.add(this.detail);
    root.add(txt(s, W / 2, H - 9, '[ÉCHAP] Partir', 7, th.dim).setOrigin(0.5));
    // Children must be camera-fixed too, or their hit areas are offset by the camera scroll.
    root.setScrollFactor(0, 0, true);
  }
}
