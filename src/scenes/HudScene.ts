import Phaser from 'phaser';
import { CONFIG, COLORS, SCENES } from '../config';
import { psyTier } from '../core/psychosis';
import { audio } from '../audio/audio';
import type { HudData } from '../systems/runState';
import { RELIC_RARITY_COLORS, RELIC_RARITY_NAMES } from '../core/relics';
import { title, txt } from '../ui/text';
import { setupCamera } from '../ui/camera';
import { C, GlitchText, T, bold, drawBar, scanlines, skewPoly, stripes } from '../ui/kit';

const STRIP = 14;

/** Top bar + psychosis screen effects, drawn over the RunScene. */
export class HudScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private base!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private fx!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private psyText!: Phaser.GameObjects.Text;
  private psyLabel!: Phaser.GameObjects.Text;
  private sectorText!: Phaser.GameObjects.Text;
  private creditsText!: Phaser.GameObjects.Text;
  private neuroText!: Phaser.GameObjects.Text;
  private implantsText!: Phaser.GameObjects.Text;
  private bossText!: Phaser.GameObjects.Text;
  private crisisText!: GlitchText;
  private psyBonusText!: Phaser.GameObjects.Text;
  private synergyText!: Phaser.GameObjects.Text;
  private noticeText!: Phaser.GameObjects.Text;
  private tagText!: Phaser.GameObjects.Text;
  /** carried relics; hovering the line lists what each one does */
  private relicText!: Phaser.GameObjects.Text;
  private relicTip?: Phaser.GameObjects.Container;
  private relicKey = '';
  private relics: HudData['relics'] = [];
  private glitchUntil = 0;
  private nextGlitchAt = 0;
  /** lagging HP fraction: the white damage trail behind the bar */
  private hpGhost = 1;
  private bossGhost = 1;

  constructor() { super(SCENES.Hud); }

  create() {
    setupCamera(this);
    const W = CONFIG.WIDTH;
    this.hpGhost = this.bossGhost = 1;
    this.fx = this.add.graphics();
    // The static part of the strip: background plates, rules, stripes.
    const base = this.add.graphics();
    this.base = base;
    base.fillStyle(C.deep, 0.92).fillRect(0, 0, W, STRIP);
    base.fillStyle(C.night, 0.95).fillPoints(skewPoly(-6, 0, 300, STRIP + 2, 3), true);
    base.fillStyle(C.night, 0.95).fillPoints(skewPoly(W - 170, 0, 176, STRIP + 2, -3), true);
    scanlines(base, 0, 0, W, STRIP, 0, C.white, 0.03);
    base.lineStyle(0.5, COLORS.cyan, 0.55).lineBetween(0, STRIP, W, STRIP);
    base.fillStyle(C.cyan, 1).fillRect(0, STRIP - 0.5, 40, 1.25);
    base.fillStyle(C.magenta, 1).fillRect(W - 40, STRIP - 0.5, 40, 1.25);
    stripes(base, 296, 4, 26, 6, C.white, 0.08, 3, 1);
    this.g = this.add.graphics();
    this.labels = [title(this, 5, STRIP / 2 + 0.9, 'PV', 9, T.magenta).setFontStyle('600').setOrigin(0, 0.5)];
    this.hpText = bold(this, 124, STRIP / 2, '', 5, T.text).setOrigin(0, 0.5);
    this.psyLabel = title(this, 158, STRIP / 2 + 0.9, 'PSY', 9, T.cyan).setFontStyle('600').setOrigin(0, 0.5);
    this.psyText = bold(this, 262, STRIP / 2, '', 5, T.text).setOrigin(0, 0.5);
    this.sectorText = title(this, W - 5, STRIP / 2 + 0.9, '', 9, T.cyan).setFontStyle('600').setOrigin(1, 0.5);
    this.creditsText = bold(this, 0, STRIP / 2, '', 6, T.yellow).setOrigin(1, 0.5);
    this.neuroText = bold(this, 0, STRIP / 2, '', 5, T.text).setOrigin(1, 0.5);
    // Above the tactical bar of the RunScene (38 px).
    this.implantsText = txt(this, 4, CONFIG.HEIGHT - 47, '', 5, T.dim).setStroke('#05030f', 2);
    this.bossText = title(this, W / 2, 21, '', 9, T.magenta).setFontStyle('600').setOrigin(0.5).setStroke('#05030f', 3);
    this.crisisText = new GlitchText(this, W / 2, 50, 'CYBERPSYCHOSE', 26, T.magenta, { every: 500, stroke: 4 }).setVisible(false);
    this.psyBonusText = bold(this, 284, STRIP / 2, '', 5, T.yellow).setOrigin(0, 0.5);
    this.synergyText = txt(this, 4, CONFIG.HEIGHT - 54, '', 5, T.green).setStroke('#05030f', 2);
    this.noticeText = bold(this, W - 4, 46, '', 6, T.yellow).setOrigin(1, 0).setStroke('#05030f', 3);
    this.tagText = bold(this, W / 2, 18, '', 5, T.magenta).setOrigin(0.5, 0).setStroke('#05030f', 3);
    this.relicText = txt(this, 4, CONFIG.HEIGHT - 61, '', 5, T.red).setStroke('#05030f', 2);
    this.relicText.on('pointerover', () => this.showRelicTip(true));
    this.relicText.on('pointerout', () => this.showRelicTip(false));
    this.relicKey = '';
    this.relicTip = undefined;
  }

  /** The list of carried relics and their effects, above the relic line. */
  private showRelicTip(on: boolean) {
    this.relicTip?.destroy();
    this.relicTip = undefined;
    if (!on || !this.relics.length) return;
    const w = 300, rowH = 15, h = 8 + this.relics.length * rowH, x = 4, y = CONFIG.HEIGHT - 64 - h;
    const g = this.add.graphics();
    g.fillStyle(C.deep, 0.94).fillRect(x, y, w, h);
    g.lineStyle(0.5, C.red, 0.8).strokeRect(x, y, w, h);
    const items: Phaser.GameObjects.GameObject[] = [g];
    this.relics.forEach((r, i) => {
      const ry = y + 4 + i * rowH;
      items.push(bold(this, x + 5, ry, r.name.toUpperCase(), 5, RELIC_RARITY_COLORS[r.rarity]));
      items.push(bold(this, x + w - 5, ry, RELIC_RARITY_NAMES[r.rarity], 4.5, RELIC_RARITY_COLORS[r.rarity]).setOrigin(1, 0));
      items.push(txt(this, x + 5, ry + 6.5, r.desc, 5, T.text));
    });
    this.relicTip = this.add.container(0, 0, items).setDepth(50);
  }

  update(time: number, dtMs = 16) {
    const d = this.registry.get('hud') as HudData | undefined;
    const g = this.g;
    g.clear();
    const show = !!d;
    for (const t of [this.base, ...this.labels, this.hpText, this.psyText, this.psyLabel, this.sectorText, this.creditsText, this.neuroText]) t.setVisible(show);
    if (!d) { this.relicText.setVisible(false); this.showRelicTip(false); return; }
    const W = CONFIG.WIDTH, tier = psyTier(d.psy), dt = Math.min(dtMs, 50) / 1000;

    // HP, with a white trail that catches up after a hit.
    const hp = d.maxHp ? d.hp / d.maxHp : 0;
    this.hpGhost = hp >= this.hpGhost ? hp : Math.max(hp, this.hpGhost - dt * 0.6);
    drawBar(g, 18, 4.5, 102, 5, hp, hp < 0.3 ? C.red : C.magenta, { ghost: this.hpGhost, seg: 12, skew: 2.5 });
    this.hpText.setText(`${d.hp}/${d.maxHp}`);

    // Psychosis: colour by tier, markers at 50 % and 75 %.
    const psyCol = tier === 'stable' ? C.cyan : tier === 'glitch' ? C.yellow : C.magenta;
    drawBar(g, 178, 4.5, 80, 5, d.psy / 100, psyCol, { marks: [0.5, 0.75], skew: 2.5 });
    this.psyLabel.setColor(Phaser.Display.Color.IntegerToColor(psyCol).rgba);
    this.psyText.setText(`${Math.floor(d.psy)} %`);
    this.psyBonusText.setText(d.psyBonus).setColor(tier === 'crisis' ? T.magenta : tier === 'drain' ? T.red : T.yellow);
    this.psyBonusText.setX(this.psyText.x + this.psyText.width + 5);

    // Right side: sector, credits, neuro-blockers.
    this.sectorText.setText(`SECTEUR ${d.room}/${d.rooms}`);
    this.creditsText.setText(`${d.credits}¢`).setX(this.sectorText.x - this.sectorText.width - 9);
    this.neuroText.setText(`NEURO [F] ×${d.blockers}`).setX(this.creditsText.x - this.creditsText.width - 9);
    const sep = (x: number) => g.fillStyle(C.line, 1).fillPoints(skewPoly(x - 1, 3.5, 2, 7, 1.5), true);
    sep(this.sectorText.x - this.sectorText.width - 4.5);
    sep(this.creditsText.x - this.creditsText.width - 4.5);

    const modal = !!this.registry.get('modal');
    const parts = [d.weapon.toUpperCase(), d.implants.length ? 'IMPLANTS : ' + d.implants.join(' · ') : ''];
    this.implantsText.setText(parts.filter(Boolean).join('   |   ')).setVisible(!modal);
    // Relics on their own line; the hit area follows the text when the list changes.
    const key = d.relics.map(r => r.name).join('|');
    if (key !== this.relicKey) {
      this.relicKey = key;
      this.relics = d.relics;
      this.relicText.setText(d.relics.length ? `RELIQUES [survol] : ${d.relics.map(r => r.name).join(' · ')}` : '');
      this.relicText.removeInteractive(true);
      if (d.relics.length) this.relicText.setInteractive({ useHandCursor: true });
      this.showRelicTip(false);
    }
    this.relicText.setVisible(!modal && d.relics.length > 0);
    if (modal && this.relicTip) this.showRelicTip(false);
    this.synergyText.setVisible(!this.registry.get('modal'));
    this.synergyText.setText(d.synergies.length ? 'SYNERGIES : ' + d.synergies.join(' · ') : '');
    this.tagText.setText(d.tag).setY(d.boss ? 37 : 18);
    this.noticeText.setText(d.notice ?? '').setColor(d.notice?.includes('ÉCHOUÉ') ? T.magenta : d.notice?.startsWith('ÉLITE') ? T.magenta : T.yellow);

    if (d.boss) {
      this.bossText.setText(d.boss.name.toUpperCase());
      // Boss bar across the top of the screen, under the HUD strip.
      const f = d.boss.max ? d.boss.hp / d.boss.max : 0;
      this.bossGhost = f >= this.bossGhost ? f : Math.max(f, this.bossGhost - dt * 0.4);
      g.fillStyle(C.deep, 0.85).fillPoints(skewPoly(W / 2 - 130, 15, 260, 20, 6), true);
      g.lineStyle(0.25, C.magenta, 0.8).strokePoints(skewPoly(W / 2 - 130, 15, 260, 20, 6), true);
      stripes(g, W / 2 - 120, 16, 30, 3, C.magenta, 0.5, 4, 1.2);
      stripes(g, W / 2 + 90, 16, 30, 3, C.magenta, 0.5, 4, 1.2);
      drawBar(g, W / 2 - 120, 27, 240, 5, f, C.magenta, { ghost: this.bossGhost, seg: 24, skew: 2.5 });
    } else { this.bossText.setText(''); this.bossGhost = 1; }

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
