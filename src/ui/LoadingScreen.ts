import Phaser from 'phaser';
import { CONFIG } from '../config';
import { FineRain, Skyline } from './cityArt';
import { C, GlitchText, T, bold, chip, drawBar, scanlines, skewPoly, stripes } from './kit';
import { title, txt } from './text';
import { randomTip } from './tips';

const LOG = [
  [0, '> NEON//OS 4.2 — démarrage à froid'],
  [0.04, '> liaison neurale ............ OK'],
  [0.2, '> montage du chrome ........... OK'],
  [0.4, '> calibrage optique ........... OK'],
  [0.6, '> cartographie du district .... OK'],
  [0.8, '> pare-feu mental ............. OK'],
  [0.97, '> psychose : sous contrôle (pour l\'instant)'],
] as const;

/**
 * The boot loading screen: the city at night in parallax under fine rain, the title with a
 * chromatic glitch, a boot log, rotating tips and an angled progress bar. Pure 2D.
 */
export class LoadingScreen {
  private sky: Skyline;
  private rain: FineRain;
  private fx: Phaser.GameObjects.Graphics;
  private barG: Phaser.GameObjects.Graphics;
  private pct: Phaser.GameObjects.Text;
  private status: Phaser.GameObjects.Text;
  private bytes: Phaser.GameObjects.Text;
  private tip: Phaser.GameObjects.Text;
  private tipChip: Phaser.GameObjects.Container;
  private log: Phaser.GameObjects.Text;
  private clock: Phaser.GameObjects.Text;
  private titleText: GlitchText;
  private target = 0;
  private shown = 0;
  private tipAt = 0;
  private tipFull = '';
  private tipShownAt = 0;
  private glitchUntil = 0;
  private nextGlitch = 0;

  constructor(private scene: Phaser.Scene) {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    this.sky = new Skyline(scene, 0);
    this.rain = new FineRain(scene, 170, 1);

    // Darken the left side and the bottom so the texts read over the city.
    const shade = scene.add.graphics().setDepth(2);
    shade.fillGradientStyle(C.deep, C.deep, C.deep, C.deep, 0.85, 0, 0.85, 0).fillRect(0, 0, 300, H);
    shade.fillGradientStyle(C.deep, C.deep, C.deep, C.deep, 0, 0, 0.9, 0.9).fillRect(0, 150, W, H - 150);

    const ui = scene.add.container(0, 0).setDepth(3);
    // Top strip: system name, clock, corner brackets.
    const top = scene.add.graphics();
    top.lineStyle(0.5, C.cyan, 0.6).lineBetween(30, 22, W - 30, 22);
    top.fillStyle(C.cyan, 1).fillRect(30, 21, 30, 2);
    stripes(top, W - 90, 18, 60, 3, C.magenta, 0.6, 4, 1.5);
    for (const [x, y, sx, sy] of [[8, 8, 1, 1], [W - 8, 8, -1, 1], [8, H - 8, 1, -1], [W - 8, H - 8, -1, -1]]) {
      top.lineStyle(0.5, C.white, 0.5).beginPath();
      top.moveTo(x, y + sy * 10); top.lineTo(x, y); top.lineTo(x + sx * 10, y); top.strokePath();
    }
    ui.add(top);
    ui.add(bold(scene, 30, 13, 'NEON//OS 4.2', 5, T.cyan).setOrigin(0, 0.5));
    ui.add(txt(scene, 82, 13, 'SÉQUENCE DE DÉMARRAGE', 5, T.mute).setOrigin(0, 0.5));
    this.clock = bold(scene, W - 30, 13, '', 5, T.magenta).setOrigin(1, 0.5);
    ui.add(this.clock);

    // Title block.
    ui.add(chip(scene, 30, 44, 'ROGUELITE TACTIQUE', C.magenta, { filled: true, size: 5 }));
    ui.add(txt(scene, 112, 44, 'DISTRICT 0 // NUIT PERMANENTE', 5, T.mute).setOrigin(0, 0.5));
    this.titleText = new GlitchText(scene, 0, 82, 'NEON CITY', 78, '#f4f1ff', { every: 2200 });
    this.titleText.setX(28 + this.titleText.main.width / 2);
    const deco = scene.add.graphics();
    deco.fillStyle(C.yellow, 1).fillPoints(skewPoly(30, 112, 120, 3, 2), true);
    deco.fillStyle(C.yellow, 0.5).fillPoints(skewPoly(154, 112, 12, 3, 2), true);
    deco.fillStyle(C.yellow, 0.25).fillPoints(skewPoly(170, 112, 6, 3, 2), true);
    ui.add([this.titleText, deco]);
    ui.add(txt(scene, 30, 124, 'Plus de chrome. Moins d\'humain.', 9, T.yellow).setOrigin(0, 0.5));

    // Boot log (top right).
    this.log = txt(scene, W - 30, 32, '', 5, '#39ff88').setOrigin(1, 0).setAlign('right').setLineSpacing(2).setAlpha(0.85);
    ui.add(this.log);

    // Tip.
    this.tipChip = chip(scene, 30, 184, 'ASTUCE', C.cyan, { filled: true, size: 5 });
    ui.add(this.tipChip);
    this.tip = txt(scene, 30, 192, '', 7, T.text).setWordWrapWidth(300).setLineSpacing(2);
    ui.add(this.tip);

    // Bottom band with the progress bar.
    const band = scene.add.graphics();
    band.fillStyle(C.deep, 0.88).fillPoints(skewPoly(-10, 222, W + 20, 60, 0), true);
    band.fillStyle(C.night, 0.9).fillPoints([new Phaser.Math.Vector2(0, 226), new Phaser.Math.Vector2(W, 226), new Phaser.Math.Vector2(W, H), new Phaser.Math.Vector2(0, H)], true);
    scanlines(band, 0, 226, W, H - 226, 0, C.white, 0.03);
    band.lineStyle(0.5, C.yellow, 0.7).lineBetween(0, 226, W, 226);
    band.fillStyle(C.yellow, 1).fillPoints(skewPoly(24, 224.5, 60, 3, 1.5), true);
    stripes(band, W - 120, 262, 90, 4, C.yellow, 0.25, 4, 1.5);
    ui.add(band);
    ui.add(title(scene, 30, 236, 'CHARGEMENT', 12, T.yellow).setFontStyle('600').setOrigin(0, 0.5));
    this.status = bold(scene, 92, 236, '', 5, T.text).setOrigin(0, 0.5);
    ui.add(this.status);
    this.barG = scene.add.graphics();
    ui.add(this.barG);
    this.bytes = txt(scene, 30, 258, '', 5, T.mute).setOrigin(0, 0.5);
    ui.add(this.bytes);
    ui.add(txt(scene, 400, 258, 'Ne débranche pas ton implant.', 5, T.off).setOrigin(1, 0.5));
    this.pct = title(scene, W - 28, 246, '0%', 34, T.yellow).setFontStyle('600').setOrigin(1, 0.5);
    ui.add(this.pct);

    this.fx = scene.add.graphics().setDepth(4);
    scanlines(scene.add.graphics().setDepth(4), 0, 0, W, H, 0, 0x000000, 0.18, 1);
    this.nextTip();
  }

  private nextTip() {
    this.tipFull = randomTip();
    this.tipShownAt = this.scene.time.now;
    this.tipAt = this.scene.time.now + 5200;
    this.tipChip.setAlpha(0.4);
  }

  /** `progress` 0..1; `label` what is loading; `detail` e.g. the megabytes. */
  setProgress(progress: number, label: string, detail = '') {
    this.target = Math.max(this.target, Phaser.Math.Clamp(progress, 0, 1));
    this.status.setText(label);
    this.bytes.setText(detail);
  }

  get done() { return this.shown > 0.999; }

  update(time: number, dtMs: number) {
    const dt = dtMs / 1000, W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    this.sky.update(dt);
    this.rain.update(dtMs);
    this.shown += (this.target - this.shown) * Math.min(1, dt * 6);
    if (this.target - this.shown < 0.002) this.shown = this.target;

    const g = this.barG;
    g.clear();
    drawBar(g, 30, 243, 370, 6, this.shown, C.yellow, { seg: 46, skew: 3 });
    // A bright head on the fill.
    const hx = 30 + 3 + (370 - 3) * this.shown;
    if (this.shown > 0 && this.shown < 1) g.fillStyle(0xffffff, 0.7 + 0.3 * Math.sin(time / 60)).fillRect(hx - 2.5, 242.5, 1, 7);
    this.pct.setText(`${Math.floor(this.shown * 100)}%`);

    // Boot log lines appear with the progress.
    const lines = LOG.filter(([at]) => this.shown >= at).map(([, s]) => s);
    const cursor = Math.floor(time / 400) % 2 ? '█' : ' ';
    const logText = lines.join('\n') + (this.shown < 1 ? `\n> ${cursor}` : '');
    if (this.log.text !== logText) this.log.setText(logText);
    const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
    const clock = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} // PLUIE ACIDE 92 %`;
    if (this.clock.text !== clock) this.clock.setText(clock);

    // Tips type themselves in, then change every few seconds.
    if (time > this.tipAt) this.nextTip();
    const n = Math.min(this.tipFull.length, Math.floor((time - this.tipShownAt) / 14));
    const shownTip = this.tipFull.slice(0, n);
    if (this.tip.text !== shownTip) this.tip.setText(shownTip);
    this.tipChip.setAlpha(Math.min(1, 0.4 + (time - this.tipShownAt) / 300));

    // Now and then the whole screen glitches: torn colour bars.
    const fx = this.fx;
    fx.clear();
    if (time > this.nextGlitch) { this.glitchUntil = time + 80 + Math.random() * 120; this.nextGlitch = time + 1800 + Math.random() * 2600; }
    if (time < this.glitchUntil) {
      for (let i = 0; i < 5; i++) {
        const y = Math.random() * H, h = 0.5 + Math.random() * 3;
        fx.fillStyle(Math.random() < 0.5 ? C.cyan : C.magenta, 0.12 + Math.random() * 0.15).fillRect(Math.random() * 40 - 20, y, W, h);
      }
    }
  }
}
