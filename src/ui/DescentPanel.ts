import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import { dateKey } from '../core/daily';
import type { SaveData } from '../core/save';
import { formatTime } from '../core/history';
import { HEAT_PACTS, heatCreditMult, heatPoints } from '../data/heat';
import { WEAPONS } from '../data/weapons';
import { audio } from '../audio/audio';
import { txt } from './text';

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
    root.add(s.add.rectangle(W / 2, H / 2, W, H, 0x05030f, 0.95).setStrokeStyle(1, COLORS.magenta));
    const pts = heatPoints(save.heat);
    if (this.view === 'menu') {
      root.add(txt(s, W / 2, 14, 'ASCENSEUR — DESCENTE VERS LA RUE', 9, '#ff2a6d').setOrigin(0.5));
      const today = dateKey(), best = save.daily.find(d => d.date === today);
      const rows: [string, string, string, boolean][] = [
        ['Descendre', `Run normale avec ${WEAPONS[save.weapon].name}${pts ? ` — notoriété ${pts} (+${pts * 10} % de crédits)` : ''}.`, '#e8e8ff', true],
        [`Run du jour — ${today}`, `Même ville pour tout le monde aujourd'hui : Lame-mono, sans notoriété. ${best ? `Ton record du jour : ${best.victory ? 'victoire' : `secteur ${best.sector}`} en ${formatTime(best.timeMs)}.` : 'Pas encore tentée.'}`, '#00f0ff', true],
        ['Avis de recherche', this.unlocked ? `Règle ta notoriété : des handicaps contre plus de crédits. Record : ${save.bestHeat}.` : 'Termine une run pour débloquer la notoriété.', '#ff2a6d', this.unlocked],
      ];
      rows.forEach(([label, desc, col, on], i) => {
        const y = 44 + i * 60;
        const r = s.add.rectangle(W / 2, y + 20, W - 40, 52, 0x140f2b).setStrokeStyle(1, on ? Phaser.Display.Color.HexStringToColor(col).color : 0x3a3550);
        if (on) { r.setInteractive({ useHandCursor: true }); r.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.button === 0) this.select(i + 1); }); }
        root.add(r);
        root.add(txt(s, 30, y + 2, `[${i + 1}] ${label}`, 9, on ? col : '#5a5578'));
        root.add(txt(s, 30, y + 20, desc, 7, on ? '#a8a6d8' : '#5a5578').setWordWrapWidth(W - 70));
      });
    } else {
      root.add(txt(s, W / 2, 14, 'AVIS DE RECHERCHE — NOTORIÉTÉ', 9, '#ff2a6d').setOrigin(0.5));
      root.add(txt(s, W / 2, 28, `Notoriété ${pts} — crédits x${heatCreditMult(pts).toFixed(1)} — record ${save.bestHeat} (gagner au-dessus de ton record rapporte une prime)`, 6, '#f5e663').setOrigin(0.5));
      HEAT_PACTS.forEach((p, i) => {
        const y = 42 + i * 27, rank = save.heat[p.id] ?? 0;
        const r = s.add.rectangle(W / 2, y + 10, W - 30, 24, rank ? 0x2a0c18 : 0x140f2b).setStrokeStyle(1, rank ? COLORS.magenta : 0x3a3550).setInteractive({ useHandCursor: true });
        r.on('pointerdown', (ptr: Phaser.Input.Pointer) => { if (ptr.button === 0) this.select(i + 1); });
        root.add(r);
        root.add(txt(s, 24, y + 1, `[${i + 1}] ${p.name}`, 7, rank ? '#ff2a6d' : '#e8e8ff'));
        root.add(txt(s, 24, y + 11, `${p.description} — ${p.points} pt${p.points > 1 ? 's' : ''} par rang`, 6, '#a8a6d8'));
        root.add(txt(s, W - 24, y + 4, '■'.repeat(rank) + '□'.repeat(p.max - rank), 9, '#ff2a6d').setOrigin(1, 0));
      });
    }
    root.add(txt(s, W / 2, H - 10, '[ÉCHAP] Fermer', 7, '#8a86b0').setOrigin(0.5));
    root.setScrollFactor(0, 0, true);
  }
}
