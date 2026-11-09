import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import { bestFirst, formatTime, recentFirst, type RunRecord } from '../core/history';
import type { DailyRecord } from '../core/save';
import { txt } from './text';

type Filter = 'recent' | 'best' | 'daily';
const ROWS = 11;
const COLS: [label: string, x: number][] = [
  ['#', 12], ['DATE', 30], ['RÉSULTAT', 96], ['ENNEMIS', 170], ['DÉGÂTS', 222], ['SOINS', 272], ['CRÉDITS', 318], ['TEMPS', 372],
];

const fmtDate = (ms: number) => {
  const d = new Date(ms), p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Apartment terminal: log of past runs, sorted by date or ranked. Keys 1/2 or click the tabs. */
export class HistoryPanel {
  private root?: Phaser.GameObjects.Container;
  private filter: Filter = 'recent';

  constructor(private scene: Phaser.Scene, private getHistory: () => RunRecord[], private getDaily: () => DailyRecord[] = () => []) {}

  get isOpen() { return !!this.root; }
  open() { this.render(); }
  close() { this.root?.destroy(); this.root = undefined; }

  setFilter(f: Filter) { if (this.root && f !== this.filter) { this.filter = f; this.render(); } }

  /** One line per day: the best attempt at that day's shared run. */
  private renderDaily(root: Phaser.GameObjects.Container) {
    const s = this.scene, W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const cols: [string, number][] = [['JOUR', 30], ['RÉSULTAT', 120], ['SECTEUR', 220], ['ENNEMIS', 290], ['TEMPS', 360]];
    cols.forEach(([l, x]) => root.add(txt(s, x, 48, l, 6, '#ff2a6d')));
    const list = [...this.getDaily()].reverse();
    if (!list.length) root.add(txt(s, W / 2, 130, 'Aucune run du jour pour l\'instant.\nL\'ascenseur propose la même ville à tout le monde, chaque jour.', 8, '#8a86b0').setOrigin(0.5).setAlign('center'));
    list.forEach((d, i) => {
      const y = 64 + i * 15;
      if (i % 2 === 0) root.add(s.add.rectangle(W / 2, y + 4, W - 16, 14, 0x140f2b, 0.6));
      [d.date, d.victory ? 'Victoire' : 'Mort', `${d.sector} / 10`, String(d.kills), formatTime(d.timeMs)]
        .forEach((c, k) => root.add(txt(s, cols[k][1], y, c, 7, k === 1 ? (d.victory ? '#f5e663' : '#ff2a6d') : '#e8e8ff')));
    });
    root.add(txt(s, W / 2, H - 10, '[ÉCHAP] Fermer', 7, '#8a86b0').setOrigin(0.5));
    root.setScrollFactor(0, 0, true);
  }

  private render() {
    this.root?.destroy();
    const s = this.scene, W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const root = s.add.container(0, 0).setDepth(200);
    this.root = root;
    root.add(s.add.rectangle(W / 2, H / 2, W, H, 0x05030f, 0.95).setStrokeStyle(1, COLORS.cyan));
    root.add(txt(s, W / 2, 12, 'TERMINAL — HISTORIQUE DES RUNS', 9, '#00f0ff').setOrigin(0.5));

    (['recent', 'best', 'daily'] as Filter[]).forEach((f, i) => {
      const active = f === this.filter;
      const x = W / 2 + (i - 1) * 116;
      const tab = s.add.rectangle(x, 32, 110, 14, active ? 0x06303a : 0x140f2b).setStrokeStyle(1, active ? COLORS.cyan : 0x3a3550)
        .setInteractive({ useHandCursor: true });
      tab.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.button === 0) this.setFilter(f); });
      root.add(tab);
      root.add(txt(s, x, 32, `[${i + 1}] ${f === 'recent' ? 'Plus récentes' : f === 'best' ? 'Meilleures runs' : 'Runs du jour'}`, 7, active ? '#00f0ff' : '#8a86b0').setOrigin(0.5));
    });
    if (this.filter === 'daily') { this.renderDaily(root); return; }

    COLS.forEach(([l, x]) => root.add(txt(s, x, 48, l, 6, '#ff2a6d')));
    const g = s.add.graphics();
    g.lineStyle(1, 0x3a3550).lineBetween(8, 58, W - 8, 58);
    root.add(g);

    const all = this.getHistory();
    const list = (this.filter === 'recent' ? recentFirst(all) : bestFirst(all)).slice(0, ROWS);
    if (!list.length) {
      root.add(txt(s, W / 2, 130, 'Aucune run pour l\'instant.\nPrends l\'ascenseur de l\'immeuble pour descendre dans la rue.', 8, '#8a86b0').setOrigin(0.5).setAlign('center'));
    }
    list.forEach((r, i) => {
      const y = 64 + i * 15;
      if (i % 2 === 0) root.add(s.add.rectangle(W / 2, y + 4, W - 16, 14, 0x140f2b, 0.6));
      const cells = [
        String(i + 1), fmtDate(r.date), r.victory ? 'Victoire' : `Mort — S${r.sector}`,
        String(r.kills), String(r.damageDealt), String(r.hpHealed), `${r.credits}¢`, formatTime(r.timeMs),
      ];
      cells.forEach((c, k) => root.add(txt(s, COLS[k][1], y, c, 7, k === 2 ? (r.victory ? '#f5e663' : '#ff2a6d') : '#e8e8ff')));
    });

    root.add(txt(s, W / 2, H - 22, `${all.length} run(s) enregistrée(s)`, 6, '#5a5578').setOrigin(0.5));
    root.add(txt(s, W / 2, H - 10, '[ÉCHAP] Fermer', 7, '#8a86b0').setOrigin(0.5));
    root.setScrollFactor(0, 0, true);
  }
}
