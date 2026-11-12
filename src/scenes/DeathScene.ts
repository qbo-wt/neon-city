import Phaser from 'phaser';
import { CONFIG, SCENES } from '../config';
import { Rain } from '../fx/effects';
import { title, txt } from '../ui/text';
import { setupCamera } from '../ui/camera';
import { Button, C, GlitchText, T, bold, chip, drawPanel, halftone, pips, scanlines, skewPoly, stripes } from '../ui/kit';
import { wipeTo } from '../ui/transition';
import { audio } from '../audio/audio';
import { fadeVisibility, showStage, stage, stageOpacity } from '../three/stage';

export class DeathScene extends Phaser.Scene {
  private rain!: Rain;
  private leaving = false;
  constructor() { super(SCENES.Death); }

  create(data: { victory: boolean; creditsEarned: number; roomReached: number; heat?: number; recordBonus?: number; daily?: string; dailyBest?: boolean; killer?: string }) {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT, win = data.victory;
    const accent = win ? C.yellow : C.magenta;
    this.leaving = false;
    setupCamera(this).fadeIn(300, 11, 8, 32);
    audio.setMusic(win ? 'hub' : 'off');
    if (win) audio.sfx('relic');
    this.rain = new Rain(this, W, H, 80);
    // The street of the last sector, darkened, behind the results.
    showStage(true, this.game.canvas);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { showStage(false); stageOpacity(1); });
    const veil = this.add.graphics();
    veil.fillStyle(C.deep, 0.78).fillRect(0, 0, W, H);
    scanlines(veil, 0, 0, W, H, 0, 0x000000, 0.2, 1);

    // A huge slanted band across the screen carries the verdict.
    const band = this.add.graphics();
    band.fillStyle(C.deep, 0.8).fillPoints(skewPoly(-30, 46, W + 60, 56, 14).map(p => new Phaser.Math.Vector2(p.x + 4, p.y + 4)), true);
    band.fillStyle(accent, 1).fillPoints(skewPoly(-30, 46, W + 60, 56, 14), true);
    halftone(band, W - 170, 48, 170, 52, C.deep, 0.25, 'tr', 4, 1.8);
    halftone(band, 0, 48, 150, 52, 0xffffff, 0.18, 'bl', 4, 1.6);
    band.fillStyle(C.deep, 1).fillPoints(skewPoly(-30, 104, W + 60, 2.5, 1), true);
    band.fillStyle(win ? C.cyan : C.yellow, 1).fillPoints(skewPoly(40, 106, 120, 2, 1), true);
    stripes(band, W - 140, 38, 110, 5, accent, 0.7, 5, 2);
    bold(this, 40, 40, win ? 'CONTRAT REMPLI // RAPPORT DE MISSION' : 'LIAISON PERDUE // RAPPORT POST-MORTEM', 5, win ? T.yellow : T.magenta).setOrigin(0, 0.5);
    new GlitchText(this, W / 2, 75, win ? 'DISTRICT NETTOYÉ' : 'SIGNAL VITAL PERDU', 50, T.dark, { every: win ? 4000 : 1600 });
    txt(this, W / 2, 117, win ? 'Le contrat est rempli.' : data.killer ? `Abattu par ${data.killer}. Ton chrome reste sur le trottoir.` : 'Ton corps a lâché, ton chrome reste sur le trottoir.', 8, T.dim).setOrigin(0.5);

    // Two stat cards: how deep you went, what you brought home.
    const cw = 150, ch = 44, gx = 10, x0 = W / 2 - cw - gx / 2, y0 = 132;
    const g = this.add.graphics();
    drawPanel(g, x0, y0, cw, ch, { accent: C.cyan, cut: 6, dots: 'br' });
    drawPanel(g, x0 + cw + gx, y0, cw, ch, { accent: C.yellow, cut: 6, dots: 'br' });
    bold(this, x0 + 8, y0 + 8, 'SECTEUR ATTEINT', 5, T.cyan).setOrigin(0, 0.5);
    title(this, x0 + 8, y0 + 25, `${data.roomReached} / ${CONFIG.ROOMS_PER_RUN}`, 22, T.text).setFontStyle('600').setOrigin(0, 0.5);
    pips(g, x0 + 8, y0 + 36, data.roomReached, CONFIG.ROOMS_PER_RUN, C.cyan, 9.5, 3.5);
    bold(this, x0 + cw + gx + 8, y0 + 8, 'CRÉDITS RAPATRIÉS', 5, T.yellow).setOrigin(0, 0.5);
    title(this, x0 + cw + gx + 8, y0 + 26, `${data.creditsEarned}¢`, 26, T.yellow).setFontStyle('600').setOrigin(0, 0.5);

    const extra: [string, number][] = [];
    if (data.heat) extra.push([`NOTORIÉTÉ ${data.heat} : CRÉDITS x${(1 + data.heat * 0.1).toFixed(1)}`, C.magenta]);
    if (data.recordBonus) extra.push([`NOUVEAU RECORD DE NOTORIÉTÉ ! PRIME +${data.recordBonus}¢`, C.yellow]);
    if (data.daily) extra.push([`RUN DU JOUR ${data.daily}${data.dailyBest ? ' — NOUVEAU RECORD DU JOUR !' : ''}`, C.cyan]);
    const chips = extra.map(([s, col], i) => chip(this, 0, 0, s, col, { size: 5, filled: i === 1 && !!data.recordBonus }));
    const total = chips.reduce((s, c) => s + c.width, 0) + (chips.length - 1) * 5;
    let cx = W / 2 - total / 2;
    chips.forEach(c => { c.setPosition(cx, 186); cx += c.width + 5; });

    const back = new Button(this, W / 2 - 80, 200, 160, 20, 'REVENIR À LA PLANQUE', { accent: C.cyan, solid: true, size: 12, hoverSfx: true, onClick: () => this.leave() });
    this.tweens.add({ targets: back, alpha: 0.75, yoyo: true, repeat: -1, duration: 700 });
    txt(this, W / 2, 230, 'Clique n\'importe où pour continuer', 6, T.mute).setOrigin(0.5);
    this.time.delayedCall(500, () => this.input.once('pointerdown', () => this.leave()));
  }

  private leave() {
    if (this.leaving) return;
    this.leaving = true;
    wipeTo(this, SCENES.Hideout);
  }

  update(_t: number, dt: number) {
    this.rain.update(dt);
    stageOpacity(fadeVisibility(this.cameras.main.fadeEffect));
    stage(this.game.canvas).frame();
  }
}
