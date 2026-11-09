import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import type { SaveData } from '../core/save';
import { CODEX, CODEX_TIERS } from '../data/codex';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { txt } from './text';

const ORDER: EnemyId[] = ['runner', 'gunner', 'brute', 'drone', 'bomber', 'hacker', 'warden', 'boss'];

/** Apartment database: one file per enemy, unlocked by kills (description, tactic, lore). */
export class CodexPanel {
  private root?: Phaser.GameObjects.Container;

  constructor(private scene: Phaser.Scene, private getSave: () => SaveData) {}

  get isOpen() { return !!this.root; }
  close() { this.root?.destroy(); this.root = undefined; }

  open() {
    this.close();
    const s = this.scene, W = CONFIG.WIDTH, H = CONFIG.HEIGHT, save = this.getSave();
    const root = s.add.container(0, 0).setDepth(200);
    this.root = root;
    root.add(s.add.rectangle(W / 2, H / 2, W, H, 0x05030f, 0.96).setStrokeStyle(1, COLORS.cyan));
    const known = ORDER.filter(id => (save.codex[id] ?? 0) > 0).length;
    root.add(txt(s, W / 2, 10, `BASE DE DONNÉES — BESTIAIRE (${known}/${ORDER.length})`, 9, '#00f0ff').setOrigin(0.5));
    ORDER.forEach((id, i) => {
      const kills = save.codex[id] ?? 0, deaths = save.deaths[id] ?? 0, y = 24 + i * 29;
      if (i % 2 === 0) root.add(s.add.rectangle(W / 2, y + 13, W - 12, 28, 0x140f2b, 0.7));
      const big = id === 'warden' || id === 'boss' || id === 'brute';
      const img = s.add.image(22, y + 13, `en-${id}`, 'd-idle0').setScale(big ? 0.75 : 1);
      if (!kills) img.setTint(0x000000).setAlpha(0.7);
      root.add(img);
      const [desc, tip, lore] = CODEX[id];
      if (!kills) {
        root.add(txt(s, 42, y + 3, '???', 8, '#5a5578'));
        root.add(txt(s, 42, y + 15, deaths ? `T'a déjà eu ${deaths} fois. Élimine-en un pour ouvrir son dossier.` : 'Pas encore rencontré.', 6, '#5a5578'));
        return;
      }
      root.add(txt(s, 42, y + 1, `${ENEMIES[id].name}`, 8, '#e8e8ff'));
      root.add(txt(s, W - 12, y + 2, `${kills} éliminé${kills > 1 ? 's' : ''}${deaths ? ` · t'a eu ${deaths} fois` : ''}`, 6, '#f5e663').setOrigin(1, 0));
      const text = kills >= CODEX_TIERS[1] ? tip : desc;
      root.add(txt(s, 42, y + 11, text, 6, kills >= CODEX_TIERS[1] ? '#39ff88' : '#a8a6d8').setWordWrapWidth(W - 60));
      const next = kills >= CODEX_TIERS[2] ? lore : `Dossier suivant à ${kills >= CODEX_TIERS[1] ? CODEX_TIERS[2] : CODEX_TIERS[1]} éliminations.`;
      root.add(txt(s, 42, y + 19, next, 5, kills >= CODEX_TIERS[2] ? '#ff2a6d' : '#5a5578').setWordWrapWidth(W - 60));
    });
    root.add(txt(s, W / 2, H - 7, '[ÉCHAP] Fermer', 6, '#8a86b0').setOrigin(0.5));
    root.setScrollFactor(0, 0, true);
  }
}
