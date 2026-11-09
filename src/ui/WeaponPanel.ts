import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import type { SaveData } from '../core/save';
import { WEAPONS, WEAPON_IDS, type WeaponId } from '../data/weapons';
import { audio } from '../audio/audio';
import { txt } from './text';

/** Apartment weapon rack: buy weapons with banked credits, pick the one you take on the next run. */
export class WeaponPanel {
  private root?: Phaser.GameObjects.Container;
  private msg = '';

  constructor(private scene: Phaser.Scene, private getSave: () => SaveData, private persist: (s: SaveData) => void) {}

  get isOpen() { return !!this.root; }
  open() { this.msg = ''; this.render(); audio.sfx('uiOpen'); }
  close() { this.root?.destroy(); this.root = undefined; }

  /** Keys 1-5: buy or equip that weapon. */
  select(i: number) {
    const id = WEAPON_IDS[i];
    if (!id || !this.root) return;
    const s = this.getSave(), w = WEAPONS[id];
    if (s.weapons.includes(id)) {
      this.persist({ ...s, weapon: id });
      this.msg = `${w.name} équipée.`;
      audio.sfx('ui');
    } else if (s.credits >= w.cost) {
      this.persist({ ...s, credits: s.credits - w.cost, weapons: [...s.weapons, id], weapon: id });
      this.msg = `${w.name} achetée et équipée.`;
      audio.sfx('buy');
    } else {
      this.msg = `Il te manque ${w.cost - s.credits}¢.`;
      audio.sfx('deny');
    }
    this.render();
  }

  private render() {
    this.root?.destroy();
    const s = this.scene, W = CONFIG.WIDTH, H = CONFIG.HEIGHT, save = this.getSave();
    const root = s.add.container(0, 0).setDepth(200);
    this.root = root;
    root.add(s.add.rectangle(W / 2, H / 2, W, H, 0x05030f, 0.95).setStrokeStyle(1, COLORS.yellow));
    root.add(txt(s, W / 2, 12, 'RÂTELIER — CHOISIS TON ARME', 9, '#f5e663').setOrigin(0.5));
    root.add(txt(s, W - 10, 12, `${save.credits}¢`, 8, '#f5e663').setOrigin(1, 0.5));
    WEAPON_IDS.forEach((id: WeaponId, i) => {
      const w = WEAPONS[id], owned = save.weapons.includes(id), equipped = save.weapon === id, y = 32 + i * 42;
      const row = s.add.rectangle(W / 2, y + 17, W - 24, 38, equipped ? 0x2a2410 : 0x140f2b).setStrokeStyle(1, equipped ? COLORS.yellow : 0x3a3550)
        .setInteractive({ useHandCursor: true });
      row.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.button === 0) this.select(i); });
      root.add(row);
      root.add(txt(s, 20, y + 2, `[${i + 1}] ${w.name}`, 8, owned ? '#e8e8ff' : '#8a86b0'));
      root.add(txt(s, 20, y + 14, w.description, 6, '#a8a6d8'));
      root.add(txt(s, 20, y + 24, `Spéciale (E) — ${w.special.name} : ${w.special.description}`, 6, '#00f0ff'));
      const status = equipped ? 'ÉQUIPÉE' : owned ? 'Équiper' : `${w.cost}¢`;
      root.add(txt(s, W - 20, y + 4, status, 8, equipped ? '#f5e663' : owned ? '#39ff88' : save.credits >= w.cost ? '#ff2a6d' : '#5a5578').setOrigin(1, 0));
    });
    if (this.msg) root.add(txt(s, W / 2, H - 24, this.msg, 7, '#f5e663').setOrigin(0.5));
    root.add(txt(s, W / 2, H - 10, '[1-5] Acheter / équiper    [ÉCHAP] Fermer', 7, '#8a86b0').setOrigin(0.5));
    root.setScrollFactor(0, 0, true);
  }
}
