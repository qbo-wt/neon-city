import Phaser from 'phaser';
import { CONFIG } from '../config';
import { audio } from '../audio/audio';
import {
  COMBAT_SPEEDS, QUALITIES, QUALITY_LABEL, SPEED_LABEL, VOLUME_STEPS, defaultSettings, onSettingsChange, settings, updateSettings, type Settings,
} from '../core/settings';
import { resetTutorial } from '../core/tutorial';
import { isOptedOut, playerName, setOptOut, typing } from '../core/player';
import { NamePanel } from './NamePanel';
import { txt } from './text';
import { Button, C, Card, T, backdrop, bold, drawBar, hints, markPanelClosed, panel, pinToCamera, skewPoly } from './kit';

type Row =
  | { kind: 'slider'; label: string; desc: string; key: 'music' | 'sfx' }
  | { kind: 'toggle'; label: string; desc: string; key: 'muted' | 'reduceFx' | 'fullscreen' | 'ranked' }
  | { kind: 'name'; label: string; desc: string }
  | { kind: 'choice'; label: string; desc: string; key: 'speed' | 'quality' };

/** The values of a choice row, in order, and their labels. */
const CHOICES = {
  speed: { values: COMBAT_SPEEDS, label: SPEED_LABEL },
  quality: { values: QUALITIES, label: QUALITY_LABEL },
} as const;
const choiceIndex = (key: 'speed' | 'quality') => (CHOICES[key].values as readonly string[]).indexOf(settings()[key]);
const choicePatch = (key: 'speed' | 'quality', i: number): Partial<Settings> => ({ [key]: CHOICES[key].values[i] });

const ROWS: Row[] = [
  { kind: 'slider', key: 'music', label: 'MUSIQUE', desc: 'Volume des morceaux (appart, rue, boss), par paliers de 10 %.' },
  { kind: 'slider', key: 'sfx', label: 'EFFETS SONORES', desc: 'Volume des coups, des sorts et de l\'interface.' },
  { kind: 'toggle', key: 'muted', label: 'COUPER LE SON', desc: 'Coupe tout le son. La touche M fait la même chose, partout.' },
  { kind: 'choice', key: 'speed', label: 'VITESSE DES COMBATS', desc: 'Accélère les animations des combats (déplacements, coups, tours ennemis). Les menus ne changent pas.' },
  { kind: 'toggle', key: 'fullscreen', label: 'PLEIN ÉCRAN', desc: 'Le jeu occupe tout l\'écran. Échap le quitte aussi.' },
  { kind: 'toggle', key: 'reduceFx', label: 'EFFETS D\'ÉCRAN RÉDUITS', desc: 'Accessibilité : plus de tremblements de caméra, de flashs plein écran ni d\'image négative sur les gros coups.' },
  { kind: 'choice', key: 'quality', label: 'QUALITÉ GRAPHIQUE', desc: 'BASSE pour un PC portable ou une puce graphique intégrée : reflets et ombres redessinés une image sur deux. AUTO passe en BASSE si le jeu rame.' },
  { kind: 'name', label: 'PSEUDO DU CLASSEMENT', desc: 'Le nom sous lequel ta meilleure run apparaît au classement des potes (terminal de l’appart). Entrée ou clic pour le changer.' },
  { kind: 'toggle', key: 'ranked', label: 'CLASSEMENT EN LIGNE', desc: 'OUI : tes runs terminées sont envoyées au classement. NON : rien ne part, tu restes hors classement.' },
];

/** Browser fullscreen, either through the Fullscreen API (ours) or the browser's own (F11). */
function fullscreenState(): 'api' | 'browser' | 'off' {
  if (document.fullscreenElement) return 'api';
  try { if (window.matchMedia('(display-mode: fullscreen)').matches) return 'browser'; } catch { /* old browser */ }
  return 'off';
}

const PW = 300, PH = 250, ROW_H = 17, ROW_STEP = 20;
/** Where the value controls sit inside a row (local x). */
const CTRL_X = 128, CTRL_END = PW - 20 - 14;

/**
 * The options menu: music and effects volumes, mute, fight animation speed, fullscreen, reduced
 * screen effects, graphics quality, replay the tutorial, back to defaults. Mouse, or keys: ↑ ↓ choose, ← → adjust, Entrée toggles or
 * presses, Échap closes. Opened from the main menu, and in game with Échap (see HelpOverlay).
 */
export class OptionsPanel {
  private root?: Phaser.GameObjects.Container;
  /** focused item: ROWS first, then the buttons at the bottom */
  private focus = 0;
  private cards: Card[] = [];
  private buttons: { b: Button; run: () => void }[] = [];
  private desc?: Phaser.GameObjects.Text;
  private note = '';
  private keyHandler?: (e: KeyboardEvent) => void;
  /** the frame it opened in: the key press that opened it is not read again as a command */
  private openedFrame = -1;
  private unsubscribe?: () => void;
  private namePanel: NamePanel;
  private onScreenChange = () => { if (this.root) this.render(); };

  constructor(private scene: Phaser.Scene, private opts: { onGuide?: () => void; onQuit?: () => void } = {}) {
    this.namePanel = new NamePanel(scene, 'ANNULER');
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.detach());
  }

  get isOpen() { return !!this.root; }

  open() {
    if (this.root) return;
    this.focus = 0;
    this.note = '';
    this.openedFrame = this.scene.game.loop.frame;
    this.render();
    audio.sfx('uiOpen');
    this.keyHandler ??= (e: KeyboardEvent) => this.onKey(e);
    this.scene.input.keyboard?.on('keydown', this.keyHandler);
    // The M key (or another panel) may change the settings while this is open.
    this.unsubscribe = onSettingsChange(() => { if (this.root) this.render(); });
    document.addEventListener('fullscreenchange', this.onScreenChange);
    window.addEventListener('resize', this.onScreenChange);
  }

  close() {
    if (!this.root) return;
    this.root.destroy();
    this.root = undefined;
    this.cards = []; this.buttons = [];
    this.detach();
    markPanelClosed(this.scene);
  }

  private detach() {
    if (this.keyHandler) this.scene.input.keyboard?.off('keydown', this.keyHandler);
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    document.removeEventListener('fullscreenchange', this.onScreenChange);
    window.removeEventListener('resize', this.onScreenChange);
  }

  private get count() { return ROWS.length + this.buttons.length; }

  private onKey(e: KeyboardEvent) {
    if (!this.root || typing.active || this.scene.game.loop.frame === this.openedFrame) return;
    const once = !e.repeat;
    if (e.code === 'Escape') { if (once) this.close(); return; }
    if (e.code === 'ArrowUp') this.setFocus((this.focus - 1 + this.count) % this.count, true);
    else if (e.code === 'ArrowDown') this.setFocus((this.focus + 1) % this.count, true);
    else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      const d = e.code === 'ArrowLeft' ? -1 : 1;
      if (this.focus < ROWS.length) this.adjust(ROWS[this.focus], d);
      else this.setFocus(ROWS.length + Phaser.Math.Clamp(this.focus - ROWS.length + d, 0, this.buttons.length - 1), true);
    } else if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') && once) {
      if (this.focus < ROWS.length) this.activate(ROWS[this.focus]);
      else this.buttons[this.focus - ROWS.length]?.run();
    }
  }

  private setFocus(i: number, sound = false) {
    if (i === this.focus) return;
    this.focus = i;
    this.note = '';
    if (sound) audio.sfx('ui');
    this.paintFocus();
  }

  private paintFocus() {
    this.cards.forEach((c, i) => c.setHover(i === this.focus));
    this.buttons.forEach(({ b }, i) => b.setHover(ROWS.length + i === this.focus));
    const row = ROWS[this.focus];
    this.desc?.setText(this.note || (row ? row.desc : ''));
  }

  // ---------- values ----------

  private value(r: Row): number | boolean {
    const s = settings();
    if (r.kind === 'slider') return s[r.key];
    if (r.kind === 'choice') return choiceIndex(r.key);
    if (r.kind === 'name') return false;
    return r.key === 'fullscreen' ? fullscreenState() !== 'off' : r.key === 'ranked' ? !isOptedOut() : s[r.key];
  }

  private set(patch: Partial<Omit<Settings, 'version'>>) {
    this.note = '';
    updateSettings(patch);
    // Heard at the new level (and silent once muted).
    audio.sfx('ui');
  }

  private adjust(r: Row, d: number) {
    if (r.kind === 'name') return;
    if (r.kind === 'slider') {
      const v = Phaser.Math.Clamp(settings()[r.key] + d, 0, VOLUME_STEPS);
      if (v !== settings()[r.key]) this.set(r.key === 'music' ? { music: v } : { sfx: v });
    } else if (r.kind === 'choice') {
      const i = Phaser.Math.Clamp(choiceIndex(r.key) + d, 0, CHOICES[r.key].values.length - 1);
      if (i !== choiceIndex(r.key)) this.set(choicePatch(r.key, i));
    } else this.toggle(r.key);
  }

  private activate(r: Row) {
    if (r.kind === 'name') this.editName();
    else if (r.kind === 'toggle') this.toggle(r.key);
    else if (r.kind === 'choice') this.set(choicePatch(r.key, (choiceIndex(r.key) + 1) % CHOICES[r.key].values.length));
  }

  private editName() {
    audio.sfx('ui');
    this.namePanel.open(() => { if (this.root) this.render(); });
  }

  private toggle(key: 'muted' | 'reduceFx' | 'fullscreen' | 'ranked') {
    if (key === 'ranked') { setOptOut(!isOptedOut()); audio.sfx('ui'); this.render(); return; }
    if (key === 'muted') { this.set({ muted: !settings().muted }); return; }
    if (key === 'reduceFx') { this.set({ reduceFx: !settings().reduceFx }); return; }
    const st = fullscreenState();
    if (st === 'browser') {
      // The browser's own fullscreen (F11) can only be left with F11.
      this.note = 'Plein écran du navigateur : F11 pour en sortir.';
      audio.sfx('deny');
      this.paintFocus();
      return;
    }
    audio.sfx('ui');
    const fail = () => { this.note = 'Le navigateur a refusé le plein écran.'; audio.sfx('deny'); if (this.root) this.paintFocus(); };
    try {
      // The whole page goes fullscreen: the 3D canvas sits under the Phaser one, in the same parent.
      const p = st === 'api' ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
      void p?.catch(fail);
    } catch { fail(); }
    // The panel redraws on 'fullscreenchange'.
  }

  private reset() {
    const d = defaultSettings();
    updateSettings({ music: d.music, sfx: d.sfx, muted: d.muted, speed: d.speed, reduceFx: d.reduceFx, quality: d.quality });
    audio.sfx('ui');
    this.note = 'Réglages par défaut rétablis (le plein écran ne change pas).';
    this.paintFocus();
  }

  /** The guided tutorial starts over: its bubbles come back, from the apartment and the first fight. */
  private replayTutorial() {
    resetTutorial();
    audio.sfx('ui');
    this.note = 'Tutoriel réinitialisé : ses bulles reviennent (appart, couloir, premier combat) et les rappels aussi.';
    this.paintFocus();
  }

  // ---------- drawing ----------

  private render() {
    this.root?.destroy();
    const s = this.scene, W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const left = (W - PW) / 2, top = (H - PH) / 2;
    const root = s.add.container(0, 0).setDepth(6500);
    this.root = root;
    this.cards = []; this.buttons = [];
    // Swallows clicks so nothing under the panel reacts.
    root.add(s.add.zone(W / 2, H / 2, W, H).setInteractive());
    root.add(backdrop(s, 0.72, C.cyan));
    root.add(panel(s, left, top, PW, PH, { accent: C.cyan, title: 'OPTIONS', titleSize: 11, code: 'RÉGLAGES // ÉCHAP', dots: 'br' }));

    ROWS.forEach((r, i) => {
      const w = PW - 20, y = top + 16 + i * ROW_STEP;
      const card = new Card(s, left + 10, y, w, ROW_H, { accent: C.cyan, cut: 4 });
      card.add(bold(s, 8, ROW_H / 2, r.label, 6, T.text).setOrigin(0, 0.5));
      this.drawControl(card, r);
      const z = s.add.zone(w / 2, ROW_H / 2, w, ROW_H).setInteractive({ useHandCursor: true });
      z.on('pointerover', () => this.setFocus(i));
      z.on('pointerdown', (p: Phaser.Input.Pointer, lx: number, _ly: number, e: Phaser.Types.Input.EventData) => {
        if (p.button !== 0) return;
        e.stopPropagation();
        this.setFocus(i);
        this.click(r, lx);
      });
      card.add(z);
      root.add(card);
      this.cards.push(card);
    });

    this.desc = txt(s, left + 14, top + 16 + ROWS.length * ROW_STEP + 1, '', 5.5, T.dim).setWordWrapWidth(PW - 28).setLineSpacing(1);
    root.add(this.desc);

    const items: [string, () => void, number][] = [];
    // With QUITTER (in a run) the labels are shorter so five buttons fit.
    const quit = !!this.opts.onQuit;
    if (this.opts.onGuide) items.push([quit ? 'GUIDE' : 'GUIDE DU RUNNER', () => { this.close(); this.opts.onGuide!(); }, C.magenta]);
    items.push([quit ? 'TUTO' : 'REJOUER LE TUTO', () => this.replayTutorial(), C.green]);
    items.push([quit ? 'DÉFAUT' : 'PAR DÉFAUT', () => this.reset(), C.cyan]);
    if (quit) items.push(['QUITTER', () => { this.close(); this.opts.onQuit!(); }, C.magenta]);
    items.push(['FERMER', () => this.close(), C.yellow]);
    // Five buttons in a run: 5 x 50 + 4 x 5 = 270, inside the 300 px panel.
    const bw = quit ? 50 : items.length > 3 ? 66 : 92, gap = quit ? 5 : 6, total = items.length * bw + (items.length - 1) * gap;
    items.forEach(([label, run, accent], i) => {
      const b = new Button(s, left + (PW - total) / 2 + i * (bw + gap), top + PH - 32, bw, 12, label, {
        accent, font: 'ui', size: 5.5, solid: label === 'FERMER', onClick: run,
        onHover: over => { if (over) this.setFocus(ROWS.length + i); },
      });
      root.add(b);
      this.buttons.push({ b, run });
    });

    root.add(hints(s, W / 2, top + PH - 10, [['↑ ↓', 'Choisir'], ['← →', 'Régler'], ['ENTRÉE', 'Valider'], ['ÉCHAP', 'Fermer']], C.cyan));
    pinToCamera(root);
    this.focus = Math.min(this.focus, this.count - 1);
    this.paintFocus();
  }

  /** A click on a row at local x `lx`: on the gauge sets the volume, on a segment picks it. */
  private click(r: Row, lx: number) {
    if (r.kind === 'name') { this.editName(); return; }
    if (r.kind === 'slider') {
      if (lx < CTRL_X - 3 || lx > CTRL_X + SLIDER_W + 3) return;
      const v = Phaser.Math.Clamp(Math.round((lx - CTRL_X) / SLIDER_W * VOLUME_STEPS), 0, VOLUME_STEPS);
      if (v !== settings()[r.key]) this.set(r.key === 'music' ? { music: v } : { sfx: v });
    } else if (r.kind === 'choice') {
      const i = segAt(lx, CTRL_X, CTRL_END, CHOICES[r.key].values.length);
      if (i < 0) this.activate(r);
      else if (i !== choiceIndex(r.key)) this.set(choicePatch(r.key, i));
    } else this.toggle(r.key);
  }

  private drawControl(card: Card, r: Row) {
    const s = this.scene, g = s.add.graphics();
    card.add(g);
    const v = this.value(r);
    if (r.kind === 'name') {
      const n = playerName();
      card.add(bold(s, CTRL_END, ROW_H / 2, n || 'À CHOISIR', 6, n ? T.yellow : T.magenta).setOrigin(1, 0.5));
    } else if (r.kind === 'slider') {
      const n = v as number;
      drawBar(g, CTRL_X, ROW_H / 2 - 3, SLIDER_W, 6, n / VOLUME_STEPS, settings().muted ? C.line : C.cyan, { seg: VOLUME_STEPS });
      card.add(bold(s, CTRL_END, ROW_H / 2, `${n * 10} %`, 6, settings().muted ? T.off : T.yellow).setOrigin(1, 0.5));
    } else if (r.kind === 'choice') {
      const c = CHOICES[r.key];
      segments(s, card, g, c.values.map(k => (c.label as Record<string, string>)[k]), v as number, CTRL_X, CTRL_END, C.yellow);
    } else {
      const on = v as boolean;
      segments(s, card, g, ['NON', 'OUI'], on ? 1 : 0, CTRL_END - 62, CTRL_END, on ? C.green : C.magenta);
    }
  }
}

const SLIDER_W = 96;

/** Index of the segment under local x (or -1), for `n` segments laid from x0 to x1. */
function segAt(lx: number, x0: number, x1: number, n: number) {
  if (lx < x0 || lx > x1) return -1;
  return Math.min(n - 1, Math.floor((lx - x0) / ((x1 - x0) / n)));
}

/** A row of skewed segments, the active one filled with the accent. */
function segments(s: Phaser.Scene, card: Card, g: Phaser.GameObjects.Graphics, labels: string[], active: number, x0: number, x1: number, accent: number) {
  const n = labels.length, sw = (x1 - x0) / n, h = 9, y = ROW_H / 2 - h / 2;
  labels.forEach((l, i) => {
    const p = skewPoly(x0 + i * sw, y, sw - 1.5, h, 2.5), on = i === active;
    g.fillStyle(on ? accent : C.deep, on ? 1 : 0.85).fillPoints(p, true);
    g.lineStyle(0.5, on ? accent : C.line, on ? 1 : 0.9).strokePoints(p, true);
    card.add(bold(s, x0 + i * sw + (sw - 1.5) / 2, ROW_H / 2, l, 4.8, on ? T.dark : T.mute).setOrigin(0.5));
  });
}
