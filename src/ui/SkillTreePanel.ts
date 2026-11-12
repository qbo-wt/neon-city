import Phaser from 'phaser';
import { CONFIG } from '../config';
import { buyNode, canBuy } from '../core/skillTree';
import type { SaveData } from '../core/save';
import type { SkillNode } from '../core/types';
import { BRANCH_NAMES, SKILL_NODES } from '../data/skillNodes';
import { title, txt } from './text';
import { C, T, bold, cutPoly, drawPanel, halftone, hints, pinToCamera, scanlines, skewPoly, tabTitle } from './kit';

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
  text: '#f2f2f2', dim: '#9a7a80', owned: '#ffffff',
  decorate: (s, root) => {
    const g = s.add.graphics();
    g.lineStyle(0.5, 0xff3b3b, 0.55).beginPath();
    const ecg = [0, 0, 0, -2, 10, -14, 0, 0, 2, 0];
    for (let x = 0; x <= CONFIG.WIDTH; x += 4) {
      const y = 40 + (ecg[(x / 4) % ecg.length] ?? 0) * 0.6;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokePath();
    g.fillStyle(0xff3b3b).fillRect(CONFIG.WIDTH - 22, 26, 4, 12).fillRect(CONFIG.WIDTH - 26, 30, 12, 4); // red cross
    halftone(g, 8, 150, 90, 100, 0xff3b3b, 0.12, 'bl', 3, 1.1);
    root.add(g);
  },
};

/** Netrunner: black screen, green phosphor, scanlines and scrolling hex. */
export const NET_THEME: ShopTheme = {
  title: '> NYX@DEN:~$ calibrage_neural', subtitle: 'Pare-feu mental, gestion de la charge, réseau de contacts',
  bg: 0x020b06, frame: 0x39ff88, accent: '#39ff88',
  box: 0x04140b, boxOwned: 0x0f3d24, lockedStroke: 0x123326,
  text: '#b8ffd8', dim: '#3a8a5e', owned: '#39ff88',
  decorate: (s, root) => {
    const g = s.add.graphics();
    for (let y = 0; y < CONFIG.HEIGHT; y += 3) g.fillStyle(0x39ff88, 0.035).fillRect(0, y, CONFIG.WIDTH, 1);
    root.add(g);
    const hex = () => Array.from({ length: 18 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join('\n');
    root.add(txt(s, 14, 46, hex(), 6, '#0f3d24'));
    root.add(txt(s, CONFIG.WIDTH - 26, 46, hex(), 6, '#0f3d24'));
  },
};

const ROW_Y = [90, 128, 166, 204];

/** A shop overlay over some branches of the skill tree. Hover for details, click to buy, Esc or E closes. */
export class SkillTreePanel {
  private root?: Phaser.GameObjects.Container;
  private detail?: Phaser.GameObjects.Text;
  private detailState?: Phaser.GameObjects.Text;

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
    const bg = s.add.graphics();
    bg.fillStyle(th.bg, 0.98).fillRect(0, 0, W, H);
    root.add(bg);
    root.add(drawPanel(s.add.graphics(), 6, 10, W - 12, H - 16, { accent: th.frame, fill: th.bg, cut: 10, dots: false, alpha: 1 }));
    th.decorate(s, root);
    root.add(tabTitle(s, 16, 10, th.title.toUpperCase(), th.frame, 12));
    root.add(txt(s, 16, 23, th.subtitle, 6, th.dim).setOrigin(0, 0.5));
    // Banked credits, top right.
    root.add(title(s, W - 16, 19, `${save.credits}¢`, 16, T.yellow).setFontStyle('600').setOrigin(1, 0.5));

    const boxW = this.branches.length > 2 ? 92 : 124;
    const gap = this.branches.length > 2 ? 102 : 150;
    const colX = this.branches.map((_, i) => W / 2 + (i - (this.branches.length - 1) / 2) * gap);
    this.branches.forEach((b, i) => {
      const lg = s.add.graphics();
      lg.fillStyle(th.frame, 0.18).fillPoints(skewPoly(colX[i] - boxW / 2, 59, boxW, 11, 3), true);
      lg.fillStyle(th.frame, 1).fillPoints(skewPoly(colX[i] - boxW / 2, 59, 3, 11, 3), true);
      root.add(lg);
      root.add(title(s, colX[i], 65, BRANCH_NAMES[b].toUpperCase(), 10, th.accent).setFontStyle('600').setOrigin(0.5));
    });

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
        const lit = save.ownedNodes.includes(n.requires);
        lines.lineStyle(lit ? 0.75 : 0.5, lit ? th.frame : th.lockedStroke, 1).lineBetween(x, y - 23, x, y - 15);
        lines.fillStyle(lit ? th.frame : th.lockedStroke, 1).fillPoints(skewPoly(x - 1.5, y - 19.5, 3, 1.5, 0), true);
      }
      const owned = save.ownedNodes.includes(n.id);
      const buyable = canBuy(n.id, save.ownedNodes, save.credits);
      const stroke = owned ? th.frame : buyable ? 0xffffff : th.lockedStroke;
      const g = s.add.graphics();
      const draw = (hot: boolean) => {
        const pts = cutPoly(x - boxW / 2, y - 15, boxW, 30, [5, 0, 5, 0]);
        g.clear();
        g.fillStyle(C.deep, 0.6).fillPoints(cutPoly(x - boxW / 2 + 2, y - 13, boxW, 30, [5, 0, 5, 0]), true);
        g.fillStyle(owned ? th.boxOwned : th.box, 1).fillPoints(pts, true);
        if (hot) g.fillStyle(th.frame, 0.15).fillPoints(pts, true);
        scanlines(g, x - boxW / 2, y - 15, boxW, 30, [5, 0, 5, 0], 0xffffff, 0.03);
        g.lineStyle(hot ? 0.75 : 0.5, hot && buyable ? th.frame : stroke, owned || buyable || hot ? 1 : 0.8).strokePoints(pts, true);
        if (owned) g.fillStyle(th.frame, 1).fillRect(x - boxW / 2, y - 9, 1.5, 21);
      };
      draw(false);
      root.add(g);
      const box = s.add.zone(x, y, boxW, 30).setInteractive({ useHandCursor: buyable });
      root.add(box);
      root.add(bold(s, x, y - 5, n.name, 6, owned ? th.owned : buyable ? th.text : th.dim)
        .setOrigin(0.5).setAlign('center').setWordWrapWidth(boxW - 8));
      root.add(bold(s, x, y + 9, owned ? '✓ INSTALLÉ' : `${n.cost}¢`, 5.5, owned ? th.owned : buyable ? T.yellow : th.dim).setOrigin(0.5));

      box.on('pointerover', () => {
        draw(true);
        const state = owned ? 'Déjà installé' : buyable ? `Clique pour acheter (${n.cost}¢)`
          : n.requires && !save.ownedNodes.includes(n.requires) ? 'Débloque d\'abord l\'amélioration au-dessus' : `Il te faut ${n.cost}¢`;
        this.detail?.setText(`${n.name} — ${n.description}`);
        this.detailState?.setText(state).setColor(owned ? th.owned : buyable ? T.yellow : th.dim);
      });
      box.on('pointerout', () => { draw(false); this.detail?.setText(''); this.detailState?.setText(''); });
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

    // Detail strip at the bottom.
    const dg = s.add.graphics();
    dg.fillStyle(C.deep, 0.7).fillPoints(skewPoly(40, 224, W - 80, 22, 4), true);
    dg.lineStyle(0.25, th.frame, 0.6).strokePoints(skewPoly(40, 224, W - 80, 22, 4), true);
    root.add(dg);
    this.detail = txt(s, W / 2, 231, '', 6, th.text).setOrigin(0.5).setAlign('center').setWordWrapWidth(W - 100);
    this.detailState = bold(s, W / 2, 240.5, '', 5, th.dim).setOrigin(0.5);
    root.add([this.detail, this.detailState]);
    root.add(hints(s, W / 2, H - 12, [['CLIC', 'Acheter'], ['ÉCHAP', 'Partir']], th.frame));
    // Children must be camera-fixed too, or their hit areas are offset by the camera scroll.
    pinToCamera(root);
  }
}
