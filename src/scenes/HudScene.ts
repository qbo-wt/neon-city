import Phaser from 'phaser';
import { CONFIG, COLORS, SCENES } from '../config';
import { psyTier } from '../core/psychosis';
import type { HudData } from '../systems/runState';
import { txt } from '../ui/text';
import { setupCamera } from '../ui/camera';

/** Top bar + psychosis screen effects, drawn over the RunScene. */
export class HudScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private psyText!: Phaser.GameObjects.Text;
  private rightText!: Phaser.GameObjects.Text;
  private implantsText!: Phaser.GameObjects.Text;
  private bossText!: Phaser.GameObjects.Text;
  private crisisText!: Phaser.GameObjects.Text;
  private glitchUntil = 0;
  private nextGlitchAt = 0;

  constructor() { super(SCENES.Hud); }

  create() {
    setupCamera(this);
    this.fx = this.add.graphics();
    this.g = this.add.graphics();
    this.hpText = txt(this, 6, 3, '', 6);
    this.psyText = txt(this, 126, 3, '', 6);
    this.rightText = txt(this, CONFIG.WIDTH - 4, 3, '', 6).setOrigin(1, 0);
    this.implantsText = txt(this, 4, CONFIG.HEIGHT - 10, '', 6, '#8a86b0');
    this.bossText = txt(this, CONFIG.WIDTH / 2, CONFIG.HEIGHT - 28, '', 7, '#ff2a6d').setOrigin(0.5);
    this.crisisText = txt(this, CONFIG.WIDTH / 2, 30, 'CYBERPSYCHOSE', 14, '#ff2a6d').setOrigin(0.5).setVisible(false);
  }

  update(time: number) {
    const d = this.registry.get('hud') as HudData | undefined;
    const g = this.g;
    g.clear();
    if (!d) return;
    const W = CONFIG.WIDTH, tier = psyTier(d.psy);

    g.fillStyle(0x05030f, 0.9).fillRect(0, 0, W, 14);
    g.lineStyle(1, COLORS.cyan, 0.5).lineBetween(0, 14, W, 14);

    // HP
    this.hpText.setText('PV');
    bar(g, 20, 4, 96, 6, d.hp / d.maxHp, COLORS.magenta);
    // Psychosis
    this.psyText.setText(`PSY ${Math.floor(d.psy)}%`);
    const psyCol = tier === 'stable' ? COLORS.cyan : tier === 'glitch' ? COLORS.yellow : COLORS.magenta;
    bar(g, 178, 4, 80, 6, d.psy / 100, psyCol);
    g.lineStyle(1, 0xffffff, 0.4);
    [0.5, 0.75].forEach(f => g.lineBetween(178 + 80 * f, 3, 178 + 80 * f, 11));
    // Dash pips
    for (let i = 0; i < d.dashMax; i++) {
      g.fillStyle(i < d.dash ? COLORS.cyan : 0x221d35).fillRect(268 + i * 8, 4, 6, 6);
    }
    this.rightText.setText(`NEURO[F] ${d.blockers}   ${d.credits}¢   SECTEUR ${d.room}/${d.rooms}`);
    this.implantsText.setText(d.implants.length ? 'IMPLANTS : ' + d.implants.join(' · ') : '');

    if (d.boss) {
      this.bossText.setText(d.boss.name.toUpperCase());
      bar(g, W / 2 - 100, CONFIG.HEIGHT - 20, 200, 5, d.boss.hp / d.boss.max, COLORS.magenta);
    } else this.bossText.setText('');

    this.drawPsychosisFx(time, tier);
  }

  private drawPsychosisFx(time: number, tier: ReturnType<typeof psyTier>) {
    const fx = this.fx, W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    fx.clear();
    this.crisisText.setVisible(tier === 'crisis' && Math.floor(time / 300) % 2 === 0);
    if (tier === 'stable') return;

    // Glitch from 50%: brief RGB tearing bars and micro-shake, more often as it climbs.
    if (time >= this.nextGlitchAt) {
      this.glitchUntil = time + 90 + Math.random() * 90;
      this.nextGlitchAt = time + (tier === 'glitch' ? 2500 : tier === 'drain' ? 1400 : 700) * (0.5 + Math.random());
      const run = this.scene.get(SCENES.Run);
      run?.cameras?.main?.shake(80, tier === 'crisis' ? 0.006 : 0.002);
    }
    if (time < this.glitchUntil) {
      for (let i = 0; i < 4; i++) {
        const y = Math.random() * H, h = 1 + Math.random() * 4;
        fx.fillStyle(Math.random() < 0.5 ? COLORS.cyan : COLORS.magenta, 0.25).fillRect(Math.random() * 20 - 10, y, W, h);
      }
    }

    // Vignette from 75%: pulsing red edges, deeper in crisis.
    if (tier === 'drain' || tier === 'crisis') {
      const pulse = 0.5 + 0.5 * Math.sin(time / (tier === 'crisis' ? 120 : 300));
      const col = tier === 'crisis' ? COLORS.magenta : 0xff3b3b;
      for (let i = 0; i < 10; i++) {
        fx.lineStyle(4, col, (0.28 - i * 0.028) * (0.6 + 0.4 * pulse)).strokeRect(i * 4, i * 4, W - i * 8, H - i * 8);
      }
      if (tier === 'crisis') fx.fillStyle(COLORS.magenta, 0.06 + 0.04 * pulse).fillRect(0, 0, W, H);
    }
  }
}

function bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, f: number, col: number) {
  g.fillStyle(0x221d35).fillRect(x, y, w, h);
  g.fillStyle(col).fillRect(x, y, Math.max(0, Math.min(1, f)) * w, h);
  g.lineStyle(1, 0x05030f).strokeRect(x, y, w, h);
}
