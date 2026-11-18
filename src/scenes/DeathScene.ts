import Phaser from 'phaser';
import { CONFIG, SCENES } from '../config';
import { Rain } from '../fx/effects';
import { title, txt } from '../ui/text';
import { setupCamera } from '../ui/camera';
import { Button, C, GlitchText, T, bold, chip, drawPanel, halftone, pips, scanlines, skewPoly, stripes } from '../ui/kit';
import { wipeTo } from '../ui/transition';
import { audio } from '../audio/audio';
import { fadeVisibility, showStage, stage, stageOpacity } from '../three/stage';
import { canRank, isOptedOut, playerName } from '../core/player';
import { rankLine, submitScore } from '../core/leaderboard';
import type { RankMode, Score } from '../core/ranking';
import { NamePanel } from '../ui/NamePanel';
import { UNLOCK_LINES, UNLOCK_TITLES, type UnlockId } from '../core/mode';

/** What the leaderboard gets from a finished run. */
export type RunScore = Score & { mode: RankMode; day?: string };

export class DeathScene extends Phaser.Scene {
  private rain!: Rain;
  private leaving = false;
  private names!: NamePanel;
  private rankText?: Phaser.GameObjects.Text;
  constructor() { super(SCENES.Death); }

  /** `mode`: the run tier's name (not for the daily run); `unlocked`: elevator tiers this run opened. */
  create(data: { victory: boolean; creditsEarned: number; roomReached: number; heat?: number; recordBonus?: number; daily?: string; dailyBest?: boolean; killer?: string;
    mode?: string; modeBonus?: number; unlocked?: UnlockId[]; score?: RunScore }) {
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
    txt(this, x0 + cw + gx + 8, y0 + 37, 'Versés sur ton compte à la planque.', 5, T.mute).setOrigin(0, 0.5);

    const extra: [string, number][] = [];
    if (data.mode) extra.push([data.modeBonus ? `${data.mode} : CRÉDITS +${data.modeBonus} %` : data.mode, data.modeBonus ? C.magenta : C.cyan]);
    if (data.heat) extra.push([`NOTORIÉTÉ ${data.heat} : CRÉDITS x${(1 + data.heat * 0.1).toFixed(1)}`, C.magenta]);
    if (data.recordBonus) extra.push([`NOUVEAU RECORD DE NOTORIÉTÉ ! PRIME +${data.recordBonus}¢`, C.yellow]);
    if (data.daily) extra.push([`RUN DU JOUR ${data.daily}${data.dailyBest ? ' — NOUVEAU RECORD DU JOUR !' : ''}`, C.cyan]);
    const chips = extra.map(([s, col]) => chip(this, 0, 0, s, col, { size: 5, filled: s.startsWith('NOUVEAU RECORD') }));
    const total = chips.reduce((s, c) => s + c.width, 0) + (chips.length - 1) * 5;
    let cx = W / 2 - total / 2;
    chips.forEach(c => { c.setPosition(cx, 186); cx += c.width + 5; });

    // A new tier of the elevator: announced at the top, over the street.
    const fresh = data.unlocked ?? [];
    if (fresh.length) {
      const top = this.add.graphics();
      top.fillStyle(C.deep, 0.9).fillPoints(skewPoly(W / 2 - 170, 6, 340, 30, 8), true);
      top.lineStyle(0.75, C.magenta, 1).strokePoints(skewPoly(W / 2 - 170, 6, 340, 30, 8), true);
      stripes(top, W / 2 - 160, 8, 40, 4, C.magenta, 0.6, 4, 1.5);
      new GlitchText(this, W / 2, 16, fresh.map(u => UNLOCK_TITLES[u]).join(' · '), 13, T.magenta, { every: 2200 });
      txt(this, W / 2, 28, fresh.map(u => UNLOCK_LINES[u]).join(' '), 5.5, T.text).setOrigin(0.5).setAlign('center').setWordWrapWidth(330);
      audio.sfx('relic');
    }

    const back = new Button(this, W / 2 - 80, 200, 160, 20, 'REVENIR À LA PLANQUE', { accent: C.cyan, solid: true, size: 12, hoverSfx: true, onClick: () => this.leave() });
    this.tweens.add({ targets: back, alpha: 0.75, yoyo: true, repeat: -1, duration: 700 });
    this.rankText = txt(this, W / 2, 227, '', 6.5, T.cyan).setOrigin(0.5);
    txt(this, W / 2, 241, 'Clique n\'importe où pour continuer', 6, T.mute).setOrigin(0.5);
    this.time.delayedCall(500, () => this.input.on('pointerdown', () => this.leave()));
    this.names = new NamePanel(this);
    if (data.score && !isOptedOut()) this.time.delayedCall(700, () => this.ranked(data.score!));
  }

  /** Leaderboard: ask for a pseudo the first time, send the run, show the rank. Never blocks, never throws. */
  private ranked(run: RunScore) {
    if (!this.sys.isActive()) return;
    if (canRank()) { this.send(run); return; }
    this.say('Choisis un pseudo pour entrer au classement des potes.', T.dim);
    this.names.open(name => {
      if (name) this.send(run);
      else this.say('Pas de pseudo : cette run n\'est pas au classement (réglable dans les options).', T.mute);
    });
  }

  private say(text: string, color: string) {
    if (this.rankText?.active) this.rankText.setText(text).setColor(color);
  }

  private send(run: RunScore) {
    this.say('Envoi au classement…', T.mute);
    const { mode, day, ...score } = run;
    void submitScore({ ...score, player: playerName(), mode, day }).then(r => {
      if (r) this.say(rankLine(r, mode), r.record ? T.yellow : T.cyan);
      else this.say('Classement hors ligne : cette run n\'a pas été envoyée.', T.mute);
    });
  }

  private leave() {
    if (this.leaving || this.names.isOpen) return;
    this.leaving = true;
    wipeTo(this, SCENES.Hideout);
  }

  update(_t: number, dt: number) {
    this.rain.update(dt);
    stageOpacity(fadeVisibility(this.cameras.main.fadeEffect));
    stage(this.game.canvas).frame();
  }
}
