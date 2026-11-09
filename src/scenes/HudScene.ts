import Phaser from 'phaser';
import { CONFIG, COLORS, SCENES } from '../config';
import { psyTier } from '../core/psychosis';
import { audio } from '../audio/audio';
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
  private psyBonusText!: Phaser.GameObjects.Text;
  private synergyText!: Phaser.GameObjects.Text;
  private noticeText!: Phaser.GameObjects.Text;
  private tagText!: Phaser.GameObjects.Text;
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
    // Above the tactical bar of the RunScene (38 px).
    this.implantsText = txt(this, 4, CONFIG.HEIGHT - 47, '', 5, '#8a86b0').setStroke('#05030f', 2);
    this.bossText = txt(this, CONFIG.WIDTH / 2, 21, '', 7, '#ff2a6d').setOrigin(0.5).setStroke('#05030f', 3);
    this.crisisText = txt(this, CONFIG.WIDTH / 2, 48, 'CYBERPSYCHOSE', 14, '#ff2a6d').setOrigin(0.5).setVisible(false);
    this.psyBonusText = txt(this, 178, 15, '', 5, '#f5e663');
    this.synergyText = txt(this, 4, CONFIG.HEIGHT - 54, '', 5, '#39ff88').setStroke('#05030f', 2);
    this.noticeText = txt(this, CONFIG.WIDTH - 4, 46, '', 6, '#f5e663').setOrigin(1, 0).setStroke('#05030f', 3);
    this.tagText = txt(this, CONFIG.WIDTH / 2, 24, '', 6, '#ff2a6d').setOrigin(0.5, 0).setStroke('#05030f', 3);
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
    this.psyBonusText.setText(d.psyBonus).setColor(tier === 'crisis' ? '#ff2a6d' : tier === 'drain' ? '#ff3b3b' : '#f5e663');
    const psyCol = tier === 'stable' ? COLORS.cyan : tier === 'glitch' ? COLORS.yellow : COLORS.magenta;
    bar(g, 178, 4, 80, 6, d.psy / 100, psyCol);
    g.lineStyle(1, 0xffffff, 0.4);
    [0.5, 0.75].forEach(f => g.lineBetween(178 + 80 * f, 3, 178 + 80 * f, 11));
    this.rightText.setText(`NEURO[F] ${d.blockers}   ${d.credits}¢   SECTEUR ${d.room}/${d.rooms}`);
    const parts = [d.weapon.toUpperCase(), d.implants.length ? 'IMPLANTS : ' + d.implants.join(' · ') : '', d.relics.length ? 'RELIQUES : ' + d.relics.join(' · ') : ''];
    this.implantsText.setText(parts.filter(Boolean).join('   |   '));
    this.synergyText.setText(d.synergies.length ? 'SYNERGIES : ' + d.synergies.join(' · ') : '');
    this.tagText.setText(d.tag);
    this.noticeText.setText(d.notice ?? '').setColor(d.notice?.includes('ÉCHOUÉ') ? '#ff2a6d' : d.notice?.startsWith('ÉLITE') ? '#ff2a6d' : '#f5e663');

    if (d.boss) {
      this.bossText.setText(d.boss.name.toUpperCase());
      // Boss bar across the top of the screen, under the HUD strip.
      g.fillStyle(0x05030f, 0.75).fillRect(W / 2 - 124, 15, 248, 20);
      bar(g, W / 2 - 120, 27, 240, 5, d.boss.hp / d.boss.max, COLORS.magenta);
    } else this.bossText.setText('');

    this.drawPsychosisFx(time, tier);
    this.drawImpactFx();
  }

  /** Parry: the frame splits into cyan / magenta edges for a moment. Hurt: a quick red edge. */
  private drawImpactFx() {
    const fx = this.fx, W = CONFIG.WIDTH, H = CONFIG.HEIGHT, now = this.game.loop.time;
    const parry = now - ((this.registry.get('parryAt') as number | undefined) ?? -1e9);
    if (parry < 220) {
      const a = 1 - parry / 220, o = 2 + 3 * a;
      fx.lineStyle(3, COLORS.cyan, 0.6 * a).strokeRect(o, o, W - 2 * o, H - 2 * o);
      fx.lineStyle(3, COLORS.magenta, 0.5 * a).strokeRect(-o + 4, o + 1, W - 2 * o, H - 2 * o);
      for (let i = 0; i < 3; i++) fx.fillStyle(i % 2 ? COLORS.magenta : COLORS.cyan, 0.12 * a).fillRect(0, Math.random() * H, W, 2);
    }
    const hurt = now - ((this.registry.get('hurtAt') as number | undefined) ?? -1e9);
    if (hurt < 180) for (let i = 0; i < 4; i++) fx.lineStyle(4, 0xff3b3b, (0.35 - i * 0.08) * (1 - hurt / 180)).strokeRect(i * 4, i * 4, W - i * 8, H - i * 8);
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
      audio.sfx('glitch', { vol: tier === 'crisis' ? 1 : 0.6 });
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
