import Phaser from 'phaser';
import { CONFIG } from '../config';
import { dateKey } from '../core/daily';
import type { SaveData } from '../core/save';
import { formatTime } from '../core/history';
import { HEAT_PACTS, heatCreditMult, heatPoints } from '../data/heat';
import { WEAPONS } from '../data/weapons';
import { audio } from '../audio/audio';
import { title, txt } from './text';
import { C, Card, T, bold, chip, halftone, hints, keycap, pinToCamera, pips, screenFrame, stripes } from './kit';

/**
 * Building elevator: start a normal run, today's daily run, or set the notoriety (after a first
 * victory). Keys 1-3 in the menu; in the notoriety view keys 1-7 cycle each pact's rank.
 */
export class DescentPanel {
  private root?: Phaser.GameObjects.Container;
  private view: 'menu' | 'heat' = 'menu';

  constructor(private scene: Phaser.Scene, private getSave: () => SaveData, private persist: (s: SaveData) => void,
    private start: (daily: boolean) => void) {}

  get isOpen() { return !!this.root; }
  open() { this.view = 'menu'; this.render(); audio.sfx('uiOpen'); }
  close() { this.root?.destroy(); this.root = undefined; }
  private get unlocked() { return this.getSave().history.some(h => h.victory); }

  select(n: number) {
    if (!this.root) return;
    if (this.view === 'menu') {
      if (n === 1) { this.close(); this.start(false); }
      else if (n === 2) { this.close(); this.start(true); }
      else if (n === 3) {
        if (!this.unlocked) { audio.sfx('deny'); return; }
        this.view = 'heat'; audio.sfx('ui'); this.render();
      }
      return;
    }
    const p = HEAT_PACTS[n - 1];
    if (!p) return;
    const s = this.getSave(), cur = s.heat[p.id] ?? 0, next = (cur + 1) % (p.max + 1);
    const heat = { ...s.heat, [p.id]: next };
    if (!next) delete heat[p.id];
    this.persist({ ...s, heat });
    audio.sfx(next ? 'ui' : 'deny', { pitch: 1 + next * 0.15 });
    this.render();
  }

  private render() {
    this.root?.destroy();
    const s = this.scene, W = CONFIG.WIDTH, H = CONFIG.HEIGHT, save = this.getSave();
    const root = s.add.container(0, 0).setDepth(200);
    this.root = root;
    const pts = heatPoints(save.heat);
    if (this.view === 'menu') {
      root.add(screenFrame(s, 'ASCENSEUR — DESCENTE VERS LA RUE', C.magenta, 'NIVEAU -1 // LA RUE'));
      const today = dateKey(), best = save.daily.find(d => d.date === today);
      const rows: [string, string, string, number, boolean, string][] = [
        ['DESCENDRE', `Run normale avec ${WEAPONS[save.weapon].name}${pts ? ` — notoriété ${pts} (+${pts * 10} % de crédits)` : ''}.`, 'RUN', C.white, true, T.text],
        [`RUN DU JOUR — ${today}`, `Même ville pour tout le monde aujourd'hui : Lame-mono, sans notoriété. ${best ? `Ton record du jour : ${best.victory ? 'victoire' : `secteur ${best.sector}`} en ${formatTime(best.timeMs)}.` : 'Pas encore tentée.'}`, 'QUOTIDIEN', C.cyan, true, T.cyan],
        ['AVIS DE RECHERCHE', this.unlocked ? `Règle ta notoriété : des handicaps contre plus de crédits. Record : ${save.bestHeat}.` : 'Termine une run pour débloquer la notoriété.', this.unlocked ? `NOTORIÉTÉ ${pts}` : 'VERROUILLÉ', C.magenta, this.unlocked, T.magenta],
      ];
      rows.forEach(([label, desc, tag, col, on, tcol], i) => {
        const y = 28 + i * 70;
        const card = new Card(s, 18, y, W - 36, 62, { accent: col === C.white ? C.yellow : col, state: on ? 'idle' : 'off', hoverSfx: true, cut: 8, onClick: on ? () => this.select(i + 1) : undefined });
        const g = s.add.graphics();
        if (on) halftone(g, W - 36 - 110, 4, 104, 54, col === C.white ? C.yellow : col, 0.16, 'br', 3, 1.2);
        else stripes(g, 2, 2, W - 40, 58, C.white, 0.03, 4, 1.5);
        // A big level number on the left, like an elevator panel.
        g.fillStyle(C.deep, 0.9).fillRect(8, 8, 34, 46);
        g.lineStyle(0.5, on ? (col === C.white ? C.yellow : col) : C.line, 0.8).strokeRect(8, 8, 34, 46);
        card.add(g);
        card.add(title(s, 25, 33, `${i + 1}`, 34, on ? (col === C.white ? T.yellow : tcol) : T.off).setFontStyle('600').setOrigin(0.5));
        card.add(keycap(s, 52, 13, `${i + 1}`, on ? C.yellow : C.line, 5));
        card.add(title(s, 66, 13.5, label, 15, on ? (i === 0 ? T.text : tcol) : T.off).setFontStyle('600').setOrigin(0, 0.5));
        card.add(chip(s, W - 36 - 12, 12, tag, on ? (col === C.white ? C.yellow : col) : C.line, { size: 5, originX: 1, filled: on && i === 0, text: on ? undefined : T.off }));
        card.add(txt(s, 52, 25, desc, 7, on ? T.dim : T.off).setWordWrapWidth(W - 110).setLineSpacing(2));
        root.add(card);
      });
    } else {
      root.add(screenFrame(s, 'AVIS DE RECHERCHE — NOTORIÉTÉ', C.magenta, 'PRIMES // HANDICAPS'));
      root.add(bold(s, 16, 24, `NOTORIÉTÉ ${pts}`, 6, T.magenta).setOrigin(0, 0.5));
      root.add(txt(s, 70, 24, `crédits x${heatCreditMult(pts).toFixed(1)} — record ${save.bestHeat} (gagner au-dessus de ton record rapporte une prime)`, 6, T.yellow).setOrigin(0, 0.5));
      HEAT_PACTS.forEach((p, i) => {
        const y = 32 + i * 28, rank = save.heat[p.id] ?? 0;
        const card = new Card(s, 16, y, W - 32, 25, { accent: C.magenta, state: rank ? 'sel' : 'idle', onClick: () => this.select(i + 1) });
        card.add(keycap(s, 8, 8, `${i + 1}`, rank ? C.magenta : C.line, 5));
        card.add(title(s, 22, 8.5, p.name.toUpperCase(), 11, rank ? T.magenta : T.text).setFontStyle('600').setOrigin(0, 0.5));
        card.add(txt(s, 22, 15, `${p.description} — ${p.points} pt${p.points > 1 ? 's' : ''} par rang`, 6, T.dim));
        const g = s.add.graphics();
        pips(g, W - 32 - 12 - p.max * 9.5 + 1.5, 6, rank, p.max, C.magenta, 8, 4.5);
        card.add(g);
        root.add(card);
      });
    }
    root.add(hints(s, W / 2, H - 12, this.view === 'menu' ? [['1-3', 'Choisir'], ['ÉCHAP', 'Fermer']] : [['1-7', 'Changer un rang'], ['ÉCHAP', 'Fermer']], C.magenta));
    pinToCamera(root);
  }
}
