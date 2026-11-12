import Phaser from 'phaser';
import { CONFIG } from '../config';
import { bestFirst, formatTime, recentFirst, type RunRecord } from '../core/history';
import type { DailyRecord } from '../core/save';
import { txt } from './text';
import { C, T, bold, chip, hints, pinToCamera, screenFrame, tabs } from './kit';

type Filter = 'recent' | 'best' | 'daily';
const ROWS = 11;
const COLS: [label: string, x: number][] = [
  ['#', 18], ['DATE', 32], ['RÉSULTAT', 96], ['ENNEMIS', 170], ['DÉGÂTS', 222], ['SOINS', 272], ['CRÉDITS', 318], ['TEMPS', 372],
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

  /** Header row with a rule under it. */
  private header(root: Phaser.GameObjects.Container, cols: [string, number][]) {
    const s = this.scene, W = CONFIG.WIDTH;
    const g = s.add.graphics();
    g.fillStyle(C.magenta, 0.12).fillRect(12, 44, W - 24, 10);
    g.lineStyle(0.5, C.magenta, 0.7).lineBetween(12, 54, W - 12, 54);
    root.add(g);
    cols.forEach(([l, x]) => root.add(bold(s, x, 49, l, 5, T.magenta).setOrigin(0, 0.5)));
  }

  private row(root: Phaser.GameObjects.Container, i: number) {
    const W = CONFIG.WIDTH, y = 58 + i * 15;
    if (i % 2 === 0) root.add(this.scene.add.rectangle(W / 2, y + 5, W - 24, 14, C.white, 0.035));
    return y;
  }

  /** One line per day: the best attempt at that day's shared run. */
  private renderDaily(root: Phaser.GameObjects.Container) {
    const s = this.scene, W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const cols: [string, number][] = [['JOUR', 30], ['RÉSULTAT', 120], ['SECTEUR', 220], ['ENNEMIS', 290], ['TEMPS', 360]];
    this.header(root, cols);
    const list = [...this.getDaily()].reverse();
    if (!list.length) root.add(txt(s, W / 2, 130, 'Aucune run du jour pour l\'instant.\nL\'ascenseur propose la même ville à tout le monde, chaque jour.', 8, T.mute).setOrigin(0.5).setAlign('center').setLineSpacing(3));
    list.forEach((d, i) => {
      const y = this.row(root, i);
      [d.date, '', `${d.sector} / 10`, String(d.kills), formatTime(d.timeMs)]
        .forEach((c, k) => { if (c) root.add(txt(s, cols[k][1], y + 5, c, 7, T.text).setOrigin(0, 0.5)); });
      root.add(chip(s, cols[1][1], y + 5, d.victory ? 'VICTOIRE' : 'MORT', d.victory ? C.yellow : C.magenta, { size: 5, filled: d.victory }));
    });
    root.add(hints(s, W / 2, H - 12, [['1-3', 'Onglets'], ['ÉCHAP', 'Fermer']], C.cyan));
    pinToCamera(root);
  }

  private render() {
    this.root?.destroy();
    const s = this.scene, W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const root = s.add.container(0, 0).setDepth(200);
    this.root = root;
    root.add(screenFrame(s, 'TERMINAL — HISTORIQUE DES RUNS', C.cyan, 'JOURNAL // NEON//OS'));
    const filters: Filter[] = ['recent', 'best', 'daily'];
    root.add(tabs(s, W / 2, 31, ['[1] Plus récentes', '[2] Meilleures runs', '[3] Runs du jour'], filters.indexOf(this.filter), i => this.setFilter(filters[i]), C.cyan, 116, 13));
    if (this.filter === 'daily') { this.renderDaily(root); return; }

    this.header(root, COLS);
    const all = this.getHistory();
    const list = (this.filter === 'recent' ? recentFirst(all) : bestFirst(all)).slice(0, ROWS);
    if (!list.length) {
      root.add(txt(s, W / 2, 130, 'Aucune run pour l\'instant.\nPrends l\'ascenseur de l\'immeuble pour descendre dans la rue.', 8, T.mute).setOrigin(0.5).setAlign('center').setLineSpacing(3));
    }
    list.forEach((r, i) => {
      const y = this.row(root, i);
      const cells = [String(i + 1), fmtDate(r.date), '', String(r.kills), String(r.damageDealt), String(r.hpHealed), `${r.credits}¢`, formatTime(r.timeMs)];
      cells.forEach((c, k) => { if (c) root.add(txt(s, COLS[k][1], y + 5, c, 7, k === 0 ? T.mute : k === 6 ? T.yellow : T.text).setOrigin(0, 0.5)); });
      root.add(chip(s, COLS[2][1], y + 5, r.victory ? 'VICTOIRE' : `MORT — S${r.sector}`, r.victory ? C.yellow : C.magenta, { size: 5, filled: r.victory }));
    });

    root.add(txt(s, W - 16, H - 12, `${all.length} run(s) enregistrée(s)`, 5, T.off).setOrigin(1, 0.5));
    root.add(hints(s, W / 2, H - 12, [['1-3', 'Onglets'], ['ÉCHAP', 'Fermer']], C.cyan));
    pinToCamera(root);
  }
}
