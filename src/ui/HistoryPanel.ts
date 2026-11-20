import Phaser from 'phaser';
import { CONFIG } from '../config';
import { dateKey } from '../core/daily';
import { bestCombo, bestFirst, formatTime, recentFirst, recordModeLabel, type RunRecord } from '../core/history';
import { fetchBoard, type Board } from '../core/leaderboard';
import { canRank, playerName } from '../core/player';
import { MAX_SECTOR, RANK_MODES, RANK_MODE_LABEL, ordinal, sameRunner, type RankMode } from '../core/ranking';
import type { DailyRecord } from '../core/save';
import { implantTexture, relicTexture } from '../three/iconModels';
import { txt } from './text';
import { C, T, bold, chip, hints, pinToCamera, screenFrame, tabs } from './kit';

type Filter = 'recent' | 'best' | 'daily' | 'board';
const ROWS = 11;
const COLS: [label: string, x: number][] = [
  ['#', 14], ['DATE', 24], ['MODE', 68], ['RÉSULTAT', 104], ['ENN.', 158], ['DÉGÂTS', 184], ['SOINS', 216], ['CRÉDITS', 244], ['TEMPS', 276], ['DÉFIS', 304], ['ÉQUIPEMENT', 332],
];
const ICON = 8, ICON_STEP = 9, ICON_MAX = 15;

const fmtDate = (ms: number) => {
  const d = new Date(ms), p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * Apartment terminal: log of past runs (by date, ranked, daily) and the friends' leaderboard: each
 * player's best run per mode (tab 4, from /api/scores). Keys 1-4 or click the tabs; on the leaderboard
 * ← → switch the mode, ↑ ↓ or the wheel scroll, R refreshes.
 */
export class HistoryPanel {
  private root?: Phaser.GameObjects.Container;
  private filter: Filter = 'recent';
  private boardMode: RankMode = 'normal';
  private scroll = 0;
  /** boards fetched since the terminal was opened, by mode and day */
  private boards = new Map<string, Board | 'loading'>();
  private keyHandler?: (e: KeyboardEvent) => void;
  private wheelHandler?: (p: unknown, o: unknown, dx: number, dy: number) => void;

  constructor(private scene: Phaser.Scene, private getHistory: () => RunRecord[], private getDaily: () => DailyRecord[] = () => [],
    private fetcher: typeof fetchBoard = fetchBoard) {}

  get isOpen() { return !!this.root; }

  open() {
    this.boards.clear();
    this.scroll = 0;
    this.keyHandler ??= (e: KeyboardEvent) => this.onKey(e);
    this.wheelHandler ??= (_p, _o, _dx, dy) => this.scrollBy(dy > 0 ? 3 : -3);
    this.scene.input.keyboard?.on('keydown', this.keyHandler);
    this.scene.input.on('wheel', this.wheelHandler);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.detach());
    this.render();
  }

  close() { this.root?.destroy(); this.root = undefined; this.detach(); }

  private detach() {
    if (this.keyHandler) this.scene.input.keyboard?.off('keydown', this.keyHandler);
    if (this.wheelHandler) this.scene.input.off('wheel', this.wheelHandler);
  }

  setFilter(f: Filter) { if (this.root && f !== this.filter) { this.filter = f; this.scroll = 0; this.render(); } }

  private onKey(e: KeyboardEvent) {
    if (!this.root || this.filter !== 'board') return;
    const n = RANK_MODES.length;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') this.setBoardMode((RANK_MODES.indexOf(this.boardMode) + (e.code === 'ArrowLeft' ? -1 : 1) + n) % n);
    else if (e.code === 'ArrowUp') this.scrollBy(-1);
    else if (e.code === 'ArrowDown') this.scrollBy(1);
    else if (e.code === 'KeyR' && !e.repeat) { this.boards.clear(); this.render(); }
  }

  private setBoardMode(i: number) {
    this.boardMode = RANK_MODES[i];
    this.scroll = 0;
    if (this.root) this.render();
  }

  private scrollBy(d: number) {
    if (!this.root || this.filter !== 'board') return;
    const b = this.boards.get(this.boardKey());
    const n = b && b !== 'loading' && b.status === 'ok' ? b.entries.length : 0;
    const next = Math.max(0, Math.min(Math.max(0, n - ROWS), this.scroll + d));
    if (next !== this.scroll) { this.scroll = next; this.render(); }
  }

  private boardKey() { return this.boardMode === 'daily' ? `daily:${dateKey()}` : this.boardMode; }

  /** Header row with a rule under it. */
  private header(root: Phaser.GameObjects.Container, cols: [string, number][], y0 = 44) {
    const s = this.scene, W = CONFIG.WIDTH;
    const g = s.add.graphics();
    g.fillStyle(C.magenta, 0.12).fillRect(12, y0, W - 24, 10);
    g.lineStyle(0.5, C.magenta, 0.7).lineBetween(12, y0 + 10, W - 12, y0 + 10);
    root.add(g);
    cols.forEach(([l, x]) => root.add(bold(s, x, y0 + 5, l, 5, T.magenta).setOrigin(0, 0.5)));
  }

  /** Relic then implant pictures in a line; a short text (R3 I5) stands in until they are drawn or if a render fails. */
  private icons(root: Phaser.GameObjects.Container, x: number, y: number, relics: readonly string[], implants: readonly string[]) {
    const s = this.scene;
    const items: { id: string; relic: boolean }[] = [
      ...relics.map(id => ({ id, relic: true })), ...implants.map(id => ({ id, relic: false }))];
    if (!items.length) { root.add(txt(s, x, y, '—', 6, T.off).setOrigin(0, 0.5)); return; }
    const fallback = txt(s, x, y, `R${relics.length} I${implants.length}`, 6, T.dim).setOrigin(0, 0.5);
    root.add(fallback);
    const shown = items.slice(0, ICON_MAX);
    if (items.length > shown.length) root.add(txt(s, x + shown.length * ICON_STEP, y, `+${items.length - shown.length}`, 5, T.mute).setOrigin(0, 0.5));
    shown.forEach((it, n) => (it.relic ? relicTexture(s, it.id) : implantTexture(s, it.id)).then(tex => {
      if (!tex || this.root !== root || !s.sys?.isActive()) return;
      fallback.setVisible(false);
      const img = s.add.image(x + ICON / 2 + n * ICON_STEP, y, tex).setDisplaySize(ICON, ICON);
      root.add(img);
      pinToCamera(img);
    }).catch(() => {}));
  }

  private row(root: Phaser.GameObjects.Container, i: number, y0 = 58) {
    const W = CONFIG.WIDTH, y = y0 + i * 15;
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
    root.add(hints(s, W / 2, H - 12, [['1-4', 'Onglets'], ['ÉCHAP', 'Fermer']], C.cyan));
    pinToCamera(root);
  }

  /** The friends' leaderboard of the chosen mode: every player's best run. */
  private renderBoard(root: Phaser.GameObjects.Container) {
    const s = this.scene, W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    root.add(tabs(s, W / 2, 49, RANK_MODES.map(m => RANK_MODE_LABEL[m]), RANK_MODES.indexOf(this.boardMode), i => this.setBoardMode(i), C.magenta, 70, 11));
    const heat = this.boardMode === 'cyberhard';
    const cols: [string, number][] = [['#', 16], ['JOUEUR', 34], ['RÉSULTAT', 150], ['SECTEUR', 232]];
    if (heat) cols.push(['NOTORIÉTÉ', 284]);
    cols.push(['TEMPS', 344], ['CRÉDITS', 392]);
    this.header(root, cols, 60);

    const key = this.boardKey(), b = this.boards.get(key);
    const day = this.boardMode === 'daily' ? dateKey() : undefined;
    const msg = (t: string) => root.add(txt(s, W / 2, 140, t, 8, T.mute).setOrigin(0.5).setAlign('center').setLineSpacing(3));
    let note = '';
    if (!b) {
      this.boards.set(key, 'loading');
      void this.fetcher(this.boardMode, day).then(r => {
        this.boards.set(key, r);
        if (this.root && this.filter === 'board' && this.boardKey() === key) this.render();
      });
      msg('Chargement du classement…');
    } else if (b === 'loading') msg('Chargement du classement…');
    else if (b.status === 'offline') msg('Classement hors ligne.\nImpossible de joindre le serveur : réessaie avec R.');
    else if (b.status === 'unconfigured') msg('Le classement n\'est pas encore installé sur ce serveur.\n(Stockage Redis non relié au projet.)');
    else if (!b.entries.length) msg(this.boardMode === 'daily' ? 'Personne n\'a encore fait la run du jour.\nSois le premier !' : 'Personne au classement pour l\'instant.\nTermine une run pour y entrer.');
    else {
      const me = playerName();
      b.entries.slice(this.scroll, this.scroll + ROWS).forEach((e, i) => {
        const y = this.row(root, i, 74), mine = !!me && sameRunner(e.player, me);
        if (mine) root.add(s.add.rectangle(W / 2, y + 5, W - 24, 14, C.cyan, 0.2));
        const col = mine ? T.yellow : T.text;
        const cells = [String(this.scroll + i + 1), e.player, '', `${e.sector} / ${MAX_SECTOR}`];
        if (heat) cells.push(e.heat ? String(e.heat) : '—');
        cells.push(formatTime(e.timeMs), `${e.credits}¢`);
        cells.forEach((c, k) => { if (c) root.add(txt(s, cols[k][1], y + 5, c, 7, k === 0 ? T.mute : col).setOrigin(0, 0.5)); });
        root.add(chip(s, cols[2][1], y + 5, e.victory ? 'VICTOIRE' : `MORT — S${e.sector}`, e.victory ? C.yellow : C.magenta, { size: 5, filled: e.victory }));
      });
      const at = b.entries.findIndex(e => !!me && sameRunner(e.player, me));
      note = `${b.total} joueur(s)${at >= 0 ? ` — toi : ${ordinal(at + 1)}` : ''}`;
    }
    if (this.boardMode === 'daily') note = `${dateKey()}${note ? ` — ${note}` : ''}`;
    root.add(txt(s, 16, H - 12, note || (canRank() ? '' : 'Pas de pseudo : runs non envoyées'), 5, T.off).setOrigin(0, 0.5));
    root.add(hints(s, W / 2, H - 12, [['← →', 'Mode'], ['↑ ↓', 'Défiler'], ['R', 'Actualiser'], ['ÉCHAP', 'Fermer']], C.cyan));
    pinToCamera(root);
  }

  private render() {
    this.root?.destroy();
    const s = this.scene, W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const root = s.add.container(0, 0).setDepth(200);
    this.root = root;
    root.add(screenFrame(s, 'TERMINAL — HISTORIQUE DES RUNS', C.cyan, 'JOURNAL // NEON//OS'));
    const filters: Filter[] = ['recent', 'best', 'daily', 'board'];
    root.add(tabs(s, W / 2, 31, ['[1] Plus récentes', '[2] Meilleures runs', '[3] Runs du jour', '[4] Classement'], filters.indexOf(this.filter), i => this.setFilter(filters[i]), C.cyan, 110, 13));
    if (this.filter === 'daily') { this.renderDaily(root); return; }
    if (this.filter === 'board') { this.renderBoard(root); return; }

    this.header(root, COLS);
    const all = this.getHistory();
    const list = (this.filter === 'recent' ? recentFirst(all) : bestFirst(all)).slice(0, ROWS);
    if (!list.length) {
      root.add(txt(s, W / 2, 130, 'Aucune run pour l\'instant.\nPrends l\'ascenseur de l\'immeuble pour descendre dans la rue.', 8, T.mute).setOrigin(0.5).setAlign('center').setLineSpacing(3));
    }
    list.forEach((r, i) => {
      const y = this.row(root, i);
      const defis = r.challengesTried ? `${r.challengesWon ?? 0}/${r.challengesTried}` : '';
      const cells = [String(i + 1), fmtDate(r.date), '', '', String(r.kills), String(r.damageDealt), String(r.hpHealed), `${r.credits}¢`, formatTime(r.timeMs), defis];
      cells.forEach((c, k) => { if (c) root.add(txt(s, COLS[k][1], y + 5, c, 7, k === 0 ? T.mute : k === 7 ? T.yellow : T.text).setOrigin(0, 0.5)); });
      const mode = recordModeLabel(r);
      root.add(bold(s, COLS[2][1], y + 5, mode, 5, mode === 'NORMALE' ? T.cyan : mode === 'CYBERHARD' ? T.magenta : T.dim).setOrigin(0, 0.5));
      root.add(chip(s, COLS[3][1], y + 5, r.victory ? 'VICTOIRE' : `MORT — S${r.sector}`, r.victory ? C.yellow : C.magenta, { size: 5, filled: r.victory }));
      if (r.relics || r.implants) this.icons(root, COLS[10][1], y + 5, r.relics ?? [], r.implants ?? []);
    });

    const combo = bestCombo(all);
    if (combo) {
      root.add(bold(s, 14, 238, 'MEILLEURE COMBINAISON', 5, T.magenta).setOrigin(0, 0.5));
      root.add(txt(s, 104, 238, `${combo.synergies} synergie(s), secteur ${combo.sector}${combo.victory ? ' (victoire)' : ''}`, 6, T.text).setOrigin(0, 0.5));
      this.icons(root, 220, 238, combo.relics ?? [], combo.implants ?? []);
    }
    root.add(txt(s, W - 16, H - 12, `${all.length} run(s) enregistrée(s)`, 5, T.off).setOrigin(1, 0.5));
    root.add(hints(s, W / 2, H - 12, [['1-4', 'Onglets'], ['ÉCHAP', 'Fermer']], C.cyan));
    pinToCamera(root);
  }
}
