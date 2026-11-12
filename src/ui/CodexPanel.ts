import Phaser from 'phaser';
import { CONFIG } from '../config';
import type { SaveData } from '../core/save';
import { CODEX, CODEX_TIERS } from '../data/codex';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { title, txt } from './text';
import { portraitTexture } from '../three/portraits';
import { C, T, bold, chip, cutPoly, hints, pinToCamera, pips, screenFrame, stripes } from './kit';

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
    const known = ORDER.filter(id => (save.codex[id] ?? 0) > 0).length;
    root.add(screenFrame(s, 'BASE DE DONNÉES — BESTIAIRE', C.cyan, `DOSSIERS OUVERTS ${known}/${ORDER.length}`));
    ORDER.forEach((id, i) => {
      const kills = save.codex[id] ?? 0, deaths = save.deaths[id] ?? 0, y = 21 + i * 29.5;
      const g = s.add.graphics();
      if (i % 2 === 0) g.fillStyle(C.white, 0.03).fillRect(12, y, W - 24, 28);
      // Portrait frame.
      g.fillStyle(C.deep, 0.9).fillPoints(cutPoly(14, y + 1, 26, 26, [4, 0, 4, 0]), true);
      g.lineStyle(0.5, kills ? C.cyan : C.line, kills ? 0.9 : 0.7).strokePoints(cutPoly(14, y + 1, 26, 26, [4, 0, 4, 0]), true);
      if (!kills) stripes(g, 15, y + 2, 24, 24, C.white, 0.05, 3, 1);
      root.add(g);
      // The anime character's bust; the old pixel sprite stands in until it is rendered.
      const key = `portrait-${id}${kills ? '' : '-dark'}`;
      const big = id === 'warden' || id === 'boss' || id === 'brute';
      const img = s.textures.exists(key) ? s.add.image(27, y + 14, key).setDisplaySize(25, 25)
        : s.add.image(27, y + 14, `en-${id}`, 'd-idle0').setScale(big ? 0.75 : 1);
      if (!kills && !s.textures.exists(key)) img.setTint(0x000000).setAlpha(0.7);
      if (!s.textures.exists(key)) void portraitTexture(s, id, !kills).then(k => {
        if (k && img.active) img.setTexture(k).setScale(1).setDisplaySize(25, 25).clearTint().setAlpha(1);
      });
      root.add(img);
      const [desc, tip, lore] = CODEX[id];
      if (!kills) {
        root.add(title(s, 46, y + 7.5, '??? — DOSSIER VERROUILLÉ', 10, T.off).setFontStyle('600').setOrigin(0, 0.5));
        root.add(txt(s, 46, y + 15, deaths ? `T'a déjà eu ${deaths} fois. Élimine-en un pour ouvrir son dossier.` : 'Pas encore rencontré.', 6, T.off));
        return;
      }
      root.add(title(s, 46, y + 6.5, ENEMIES[id].name.toUpperCase(), 11, T.text).setFontStyle('600').setOrigin(0, 0.5));
      // Three tiers of the file, as pips: description, tactic, lore.
      const tier = kills >= CODEX_TIERS[2] ? 3 : kills >= CODEX_TIERS[1] ? 2 : 1;
      const pg = s.add.graphics();
      pips(pg, W - 46, y + 3, tier, 3, C.cyan, 8, 4);
      root.add(pg);
      root.add(chip(s, W - 52, y + 5, `${kills} ÉLIMINÉ${kills > 1 ? 'S' : ''}${deaths ? ` · T'A EU ${deaths}×` : ''}`, C.yellow, { size: 4.5, originX: 1 }));
      const text = kills >= CODEX_TIERS[1] ? tip : desc;
      root.add(txt(s, 46, y + 12, text, 6, kills >= CODEX_TIERS[1] ? T.green : T.dim).setWordWrapWidth(W - 64));
      const next = kills >= CODEX_TIERS[2] ? lore : `Dossier suivant à ${kills >= CODEX_TIERS[1] ? CODEX_TIERS[2] : CODEX_TIERS[1]} éliminations.`;
      root.add(txt(s, 46, y + 20.5, next, 5, kills >= CODEX_TIERS[2] ? T.magenta : T.off).setWordWrapWidth(W - 64));
    });
    root.add(hints(s, W / 2, H - 8, [['ÉCHAP', 'Fermer']], C.cyan));
    root.add(bold(s, W - 16, H - 8, 'NEON//OS — accès niveau 2', 4.5, T.off).setOrigin(1, 0.5));
    pinToCamera(root);
  }
}
