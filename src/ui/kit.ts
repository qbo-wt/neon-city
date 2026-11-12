import Phaser from 'phaser';
import { CONFIG } from '../config';
import { audio } from '../audio/audio';
import { TITLE_FONT, UI_FONT, hex, title, txt } from './text';

/**
 * The interface kit: one visual language for every panel, button and bar.
 * Sharp cut corners, double strokes, skewed buttons, scanlines and halftone dots, on the game's
 * night palette with yellow / cyan / magenta accents. Coordinates are the 480x270 logical grid;
 * a line width of 0.25 is one screen pixel at 1080p.
 */
export const C = {
  night: 0x0b0820, deep: 0x05030f, ink: 0x080520, panel: 0x0e0a28, panel2: 0x161036, raised: 0x1f1648,
  line: 0x3a3550, line2: 0x262046,
  cyan: 0x00f0ff, magenta: 0xff2a6d, yellow: 0xf5e663, green: 0x39ff88, violet: 0xb84dff, orange: 0xff8c2a, red: 0xff3b3b,
  white: 0xe8e8ff,
} as const;

/** Text colours. */
export const T = {
  text: '#e8e8ff', dim: '#a8a6d8', mute: '#8a86b0', off: '#5a5578', dark: '#0b0820',
  cyan: '#00f0ff', magenta: '#ff2a6d', yellow: '#f5e663', green: '#39ff88', violet: '#b84dff', orange: '#ff8c2a', red: '#ff3b3b',
} as const;

export const PX = 1 / CONFIG.ZOOM;

const v = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

/** Cut size per corner: one number cuts top-left and bottom-right; or [tl, tr, br, bl]. */
export type Cuts = number | readonly [number, number, number, number];
const cuts = (c: Cuts) => (typeof c === 'number' ? [c, 0, c, 0] : c);

/** A rectangle with chamfered corners. */
export function cutPoly(x: number, y: number, w: number, h: number, cut: Cuts = 4): Phaser.Math.Vector2[] {
  const [a, b, c, d] = cuts(cut);
  const p = [v(x + a, y), v(x + w - b, y)];
  if (b) p.push(v(x + w, y + b));
  p.push(v(x + w, y + h - c));
  if (c) p.push(v(x + w - c, y + h));
  p.push(v(x + d, y + h));
  if (d) p.push(v(x, y + h - d));
  if (a) p.push(v(x, y + a));
  return p;
}

/** A parallelogram leaning right by `s`. */
export function skewPoly(x: number, y: number, w: number, h: number, s: number): Phaser.Math.Vector2[] {
  return [v(x + s, y), v(x + w, y), v(x + w - s, y + h), v(x, y + h)];
}

/** Horizontal scanlines clipped to a cut-corner rectangle. */
export function scanlines(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, cut: Cuts = 0, color: number = C.white, alpha = 0.035, step = 2) {
  const [a, b, c, d] = cuts(cut);
  g.lineStyle(PX, color, alpha);
  for (let yy = y + 1; yy < y + h - 0.5; yy += step) {
    const top = yy - y, bot = y + h - yy;
    const l = Math.max(0, a - top, d - bot), r = Math.max(0, b - top, c - bot);
    g.lineBetween(x + l + 0.5, yy, x + w - r - 0.5, yy);
  }
}

/**
 * Halftone dots fading away from a corner (print-shadow look). `corner`: which corner the dots grow from.
 */
export function halftone(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, alpha = 0.22,
  corner: 'tl' | 'tr' | 'bl' | 'br' = 'br', step = 2.5, maxR = 0.95) {
  const R = Math.hypot(w, h);
  g.fillStyle(color, alpha);
  for (let j = 0; j * step <= h; j++) for (let i = 0; i * step <= w; i++) {
    const ox = i * step + (j % 2 ? step / 2 : 0), oy = j * step;
    if (ox > w) continue;
    const dx = corner === 'tr' || corner === 'br' ? w - ox : ox, dy = corner === 'bl' || corner === 'br' ? h - oy : oy;
    const r = maxR * (1 - Math.hypot(dx, dy) / R * 1.15);
    if (r < 0.18) continue;
    g.fillCircle(x + ox, y + oy, r);
  }
}

/** Diagonal hazard stripes inside a rectangle. */
export function stripes(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, alpha = 0.12, gap = 4, width = 1.5) {
  g.fillStyle(color, alpha);
  for (let s = -h; s < w; s += gap) {
    const x0 = Math.max(x, x + s), x1 = Math.min(x + w, x + s + width);
    if (x1 <= x0 - h) continue;
    const pts = [v(x + s, y + h), v(x + s + width, y + h), v(x + s + width + h, y), v(x + s + h, y)]
      .map(p => v(Phaser.Math.Clamp(p.x, x, x + w), p.y));
    g.fillPoints(pts, true);
  }
}

export interface PanelOpts {
  accent?: number;
  fill?: number;
  alpha?: number;
  cut?: Cuts;
  /** hard drop shadow (default on) */
  shadow?: boolean;
  scan?: boolean;
  /** halftone dots in a corner */
  dots?: false | 'tl' | 'tr' | 'bl' | 'br';
  /** second, inner stroke (default on) */
  inner?: boolean;
  /** accent notch on the top edge and slashes at the bottom right (default on) */
  marks?: boolean;
  strokeAlpha?: number;
}

/** Draws an angled panel into a Graphics. */
export function drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, o: PanelOpts = {}) {
  const accent = o.accent ?? C.cyan, cut = o.cut ?? Math.min(8, h / 3);
  const [a, , c] = cuts(cut);
  if (o.shadow !== false) g.fillStyle(C.deep, 0.6).fillPoints(cutPoly(x + 2.5, y + 2.5, w, h, cut), true);
  g.fillStyle(o.fill ?? C.panel, o.alpha ?? 0.95).fillPoints(cutPoly(x, y, w, h, cut), true);
  // A faint wash of the accent along the top, like light catching the glass.
  g.fillStyle(accent, 0.05).fillPoints(cutPoly(x, y, w, Math.min(h, 18), [a, 0, 0, 0]), true);
  if (o.scan !== false) scanlines(g, x, y, w, h, cut);
  if (o.dots) halftone(g, o.dots.endsWith('l') ? x + 3 : x + w - Math.min(70, w * 0.4) - 3, o.dots.startsWith('t') ? y + 3 : y + h - Math.min(34, h * 0.5) - 3,
    Math.min(70, w * 0.4), Math.min(34, h * 0.5), accent, 0.16, o.dots);
  g.lineStyle(0.5, accent, o.strokeAlpha ?? 0.9).strokePoints(cutPoly(x, y, w, h, cut), true);
  if (o.inner !== false && w > 12 && h > 12) {
    const k = typeof cut === 'number' ? Math.max(0, cut - 0.8) : cuts(cut).map(q => Math.max(0, q - 0.8)) as unknown as Cuts;
    g.lineStyle(PX, accent, 0.28).strokePoints(cutPoly(x + 2, y + 2, w - 4, h - 4, k), true);
  }
  if (o.marks !== false) {
    // A thick notch on the top edge, after the cut corner.
    g.fillStyle(accent, 1).fillPoints(skewPoly(x + a + 3, y - 0.75, Math.min(26, w * 0.25), 1.75, 1), true);
    // Three slashes by the bottom-right cut.
    g.fillStyle(accent, 0.85);
    for (let i = 0; i < 3; i++) g.fillPoints(skewPoly(x + w - c - 14 + i * 3.5, y + h - 2.6, 2.2, 1.6, 1), true);
  }
  return g;
}

/** A Teko title on a filled, skewed tab. Returns the container; `width` is its width. */
export function tabTitle(scene: Phaser.Scene, x: number, y: number, label: string, accent: number = C.cyan, size = 10, dark = T.dark) {
  const t = title(scene, 7, 0, label, size, dark).setFontStyle('600').setOrigin(0, 0.5);
  t.setY(size * 0.08);
  const w = t.width + 14, h = size * 0.95;
  const g = scene.add.graphics();
  g.fillStyle(C.deep, 0.7).fillPoints(skewPoly(2, -h / 2 + 1.5, w, h, h * 0.45), true);
  g.fillStyle(accent, 1).fillPoints(skewPoly(0, -h / 2, w, h, h * 0.45), true);
  g.fillStyle(0xffffff, 0.25).fillRect(h * 0.45, -h / 2, w - h * 0.45, PX * 2);
  const c = scene.add.container(x, y, [g, t]);
  c.setSize(w, h);
  return c;
}

/** A panel container, optionally with a title tab on its top edge. */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: PanelOpts & { title?: string; titleSize?: number; code?: string } = {}) {
  const c = scene.add.container(0, 0);
  c.add(drawPanel(scene.add.graphics(), x, y, w, h, o));
  if (o.title) {
    const tab = tabTitle(scene, x + 10, y, o.title, o.accent ?? C.cyan, o.titleSize ?? 10);
    c.add(tab);
    if (o.code) c.add(bold(scene, x + 16 + tab.width, y - 4, o.code, 4.5, hex(o.accent ?? C.cyan)).setOrigin(0, 0.5).setAlpha(0.8));
  }
  return c;
}

/** Full-screen dimmer behind a modal: dark veil, scanlines, corner stripes. */
export function backdrop(scene: Phaser.Scene, alpha = 0.82, accent: number = C.magenta) {
  const W = CONFIG.WIDTH, H = CONFIG.HEIGHT, g = scene.add.graphics();
  g.fillStyle(C.deep, alpha).fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++) g.fillStyle(C.deep, 0.08).fillRect(i * 6, i * 6, W - i * 12, H - i * 12);
  scanlines(g, 0, 0, W, H, 0, C.white, 0.025, 2);
  stripes(g, 0, 0, 60, 6, accent, 0.35, 5, 2);
  stripes(g, W - 60, H - 6, 60, 6, accent, 0.35, 5, 2);
  return g;
}

/** Makes every object of a tree camera-fixed (hit areas included). */
export function pinToCamera(o: Phaser.GameObjects.GameObject) {
  (o as unknown as { setScrollFactor?: (x: number, y: number) => void }).setScrollFactor?.(0, 0);
  if (o instanceof Phaser.GameObjects.Container) o.list.forEach(pinToCamera);
  return o;
}

/** Bold interface text. */
export function bold(scene: Phaser.Scene, x: number, y: number, s: string, size = 7, color: string = T.text) {
  return txt(scene, x, y, s, size, color).setFontStyle('bold');
}

/** A small label in a box: filled (dark text on colour) or outlined. */
export function chip(scene: Phaser.Scene, x: number, y: number, label: string, color: number = C.cyan, o: { filled?: boolean; size?: number; originX?: number; text?: string } = {}) {
  const size = o.size ?? 5, filled = o.filled ?? false;
  const t = bold(scene, 3, 0, label, size, filled ? T.dark : (o.text ?? hex(color))).setOrigin(0, 0.5);
  const w = t.width + 6, h = size + 3;
  const g = scene.add.graphics();
  if (filled) g.fillStyle(color, 1).fillPoints(cutPoly(0, -h / 2, w, h, [0, 0, 2, 0]), true);
  else {
    g.fillStyle(C.deep, 0.75).fillPoints(cutPoly(0, -h / 2, w, h, [0, 0, 2, 0]), true);
    g.lineStyle(PX * 2, color, 0.9).strokePoints(cutPoly(0, -h / 2, w, h, [0, 0, 2, 0]), true);
  }
  const c = scene.add.container(x - (o.originX ?? 0) * w, y, [g, t]);
  c.setSize(w, h);
  return c;
}

/** A keyboard key cap, e.g. [1] or [ÉCHAP]. */
export function keycap(scene: Phaser.Scene, x: number, y: number, key: string, color: number = C.yellow, size = 5, originX = 0) {
  const t = bold(scene, 2.5, -0.4, key, size, hex(color)).setOrigin(0, 0.5);
  const w = Math.max(t.width + 5, size + 4), h = size + 3.5;
  t.setX((w - t.width) / 2);
  const g = scene.add.graphics();
  g.fillStyle(color, 0.35).fillRect(0, -h / 2 + 1, w, h);
  g.fillStyle(C.deep, 1).fillRect(0, -h / 2, w, h - 0.75);
  g.lineStyle(PX * 2, color, 0.9).strokeRect(0, -h / 2, w, h);
  const c = scene.add.container(x - originX * w, y, [g, t]);
  c.setSize(w, h);
  return c;
}

/** A row of key hints, centred on `cx`: [[key, what it does], …]. */
export function hints(scene: Phaser.Scene, cx: number, y: number, items: [string, string][], color: number = C.yellow, size = 5) {
  const c = scene.add.container(0, y);
  let x = 0;
  for (const [k, label] of items) {
    const cap = keycap(scene, x, 0, k, color, size);
    c.add(cap);
    x += cap.width + 3;
    const t = txt(scene, x, 0, label, size + 1, T.mute).setOrigin(0, 0.5);
    c.add(t);
    x += t.width + 10;
  }
  c.setX(cx - (x - 10) / 2);
  return c;
}

/** "// TITLE ———" section heading. */
export function heading(scene: Phaser.Scene, x: number, y: number, label: string, color: number = C.cyan, width = 0, size = 9) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(color, 1).fillPoints(skewPoly(0, -size * 0.32, 2.2, size * 0.64, 1), true);
  g.fillStyle(color, 0.5).fillPoints(skewPoly(3.2, -size * 0.32, 1.2, size * 0.64, 1), true);
  const t = title(scene, 7, size * 0.06, label, size, hex(color)).setFontStyle('600').setOrigin(0, 0.5);
  c.add([g, t]);
  if (width > t.width + 16) {
    const x0 = t.width + 11;
    g.lineStyle(PX * 2, color, 0.45).lineBetween(x0, 0, width - 3, 0);
    g.fillStyle(color, 0.9).fillRect(width - 3, -1, 2, 2);
  }
  c.setSize(Math.max(width, t.width + 8), size);
  return c;
}

export interface BarOpts {
  bg?: number;
  /** lean of the parallelogram */
  skew?: number;
  /** number of segments (separator ticks) */
  seg?: number;
  /** a lagging value drawn behind the fill (damage trail) */
  ghost?: number;
  ghostColor?: number;
  /** fractions where a marker line is drawn */
  marks?: number[];
  frame?: number;
}

/** A skewed, segmented gauge drawn into a Graphics. */
export function drawBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, f: number, color: number, o: BarOpts = {}) {
  const s = o.skew ?? h * 0.6, k = Phaser.Math.Clamp(f, 0, 1);
  g.fillStyle(o.bg ?? C.deep, 0.92).fillPoints(skewPoly(x, y, w, h, s), true);
  g.fillStyle(color, 0.12).fillPoints(skewPoly(x, y, w, h, s), true);
  const fillTo = (frac: number, col: number, a: number) => {
    if (frac <= 0) return;
    const fw = Math.max(s + 0.5, (w - s) * frac + s);
    g.fillStyle(col, a).fillPoints(skewPoly(x, y, fw, h, s), true);
  };
  if (o.ghost !== undefined && o.ghost > k) fillTo(Phaser.Math.Clamp(o.ghost, 0, 1), o.ghostColor ?? 0xffffff, 0.75);
  fillTo(k, color, 1);
  if (k > 0) g.fillStyle(0xffffff, 0.35).fillRect(x + s * 0.8, y, Math.max(0, (w - s) * k), Math.min(h * 0.3, 1));
  if (o.seg && o.seg > 1) {
    g.lineStyle(0.4, o.bg ?? C.deep, 0.9);
    for (let i = 1; i < o.seg; i++) { const sx = x + (w - s) * (i / o.seg); g.lineBetween(sx + s, y, sx, y + h); }
  }
  for (const m of o.marks ?? []) {
    const sx = x + (w - s) * m;
    g.lineStyle(PX * 2, 0xffffff, 0.75).lineBetween(sx + s + 0.6, y - 1.2, sx - 0.6, y + h + 1.2);
  }
  g.lineStyle(PX * 2, o.frame ?? color, 0.7).strokePoints(skewPoly(x, y, w, h, s), true);
}

export type CardState = 'idle' | 'sel' | 'off';

export interface CardOpts {
  accent?: number;
  state?: CardState;
  cut?: Cuts;
  /** parallelogram instead of cut corners */
  skew?: number;
  fill?: number;
  /** clickable (default when onClick is given) */
  onClick?: () => void;
  /** clickable even when 'off' (e.g. to play a deny sound) */
  clickOff?: boolean;
  hoverSfx?: boolean;
  /** accent bar along the left edge (default on) */
  bar?: boolean;
  onHover?: (over: boolean) => void;
  /** filled with the accent (primary action) */
  solid?: boolean;
}

/**
 * A clickable surface (list row, card, button background) with idle / hover / pressed / selected /
 * disabled looks. Its top-left is (x, y); children added to it are in its local space.
 */
export class Card extends Phaser.GameObjects.Container {
  readonly g: Phaser.GameObjects.Graphics;
  readonly zone?: Phaser.GameObjects.Zone;
  private over = false;
  private down = false;
  private st: CardState;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly w: number, readonly h: number, readonly o: CardOpts = {}) {
    super(scene, x, y);
    scene.add.existing(this);
    this.st = o.state ?? 'idle';
    this.g = scene.add.graphics();
    this.add(this.g);
    this.setSize(w, h);
    if (o.onClick && (this.st !== 'off' || o.clickOff)) {
      const z = scene.add.zone(w / 2, h / 2, w, h).setInteractive({ useHandCursor: this.st !== 'off' });
      this.zone = z;
      this.add(z);
      z.on('pointerover', () => { this.over = true; this.draw(); if (o.hoverSfx && this.st !== 'off') audio.sfx('ui'); o.onHover?.(true); });
      z.on('pointerout', () => { this.over = false; this.down = false; this.draw(); o.onHover?.(false); });
      z.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        if (p.button !== 0) return;
        e.stopPropagation();
        this.down = true; this.draw();
        o.onClick!();
      });
      z.on('pointerup', () => { this.down = false; this.draw(); });
    }
    this.draw();
  }

  get hovered() { return this.over; }
  get cardState() { return this.st; }
  setCardState(s: CardState) { if (s !== this.st) { this.st = s; this.draw(); } return this; }
  /** Forces the hover look (for keyboard focus or pointer tracking done elsewhere). */
  setHover(on: boolean) { if (on !== this.over) { this.over = on; this.draw(); } return this; }

  protected shape(x: number, y: number, w: number, h: number) {
    return this.o.skew ? skewPoly(x, y, w, h, this.o.skew) : cutPoly(x, y, w, h, this.o.cut ?? Math.min(5, h / 3));
  }

  draw() {
    const g = this.g, { w, h } = this, accent = this.o.accent ?? C.cyan, st = this.st;
    const hot = this.over && st !== 'off';
    g.clear();
    const dy = this.down ? 0.75 : 0;
    if (st !== 'off') g.fillStyle(C.deep, 0.6).fillPoints(this.shape(2, 2, w, h), true);
    const base = this.o.solid && st !== 'off' ? (hot ? 0xffffff : accent) : this.o.fill ?? (st === 'off' ? C.panel : C.panel2);
    g.fillStyle(base, st === 'off' ? 0.8 : this.o.solid ? 1 : 0.95).fillPoints(this.shape(0, dy, w, h), true);
    if (this.o.solid && st !== 'off') g.fillStyle(accent, hot ? 0.25 : 0).fillPoints(this.shape(0, dy, w, h), true);
    if ((st === 'sel' || hot) && !this.o.solid) g.fillStyle(accent, this.down ? 0.5 : st === 'sel' ? (hot ? 0.24 : 0.16) : 0.1).fillPoints(this.shape(0, dy, w, h), true);
    if (st !== 'off') scanlines(g, 0, dy, w, h, this.o.skew ? 0 : (this.o.cut ?? Math.min(5, h / 3)), C.white, 0.03);
    const stroke = st === 'off' ? C.line2 : st === 'sel' || hot ? accent : C.line;
    g.lineStyle(st === 'sel' || hot ? 0.5 : PX * 2, stroke, 1).strokePoints(this.shape(0, dy, w, h), true);
    if (this.o.bar !== false && !this.o.skew && st !== 'off') {
      g.fillStyle(accent, st === 'sel' || hot ? 1 : 0.55).fillRect(0, dy + Math.min(5, h / 3) + 1, 1.5, h - Math.min(5, h / 3) - 3);
    }
    if (hot && !this.o.skew && w > 40) {
      // Chevrons on the right edge while hovered.
      g.fillStyle(accent, 0.9);
      for (let i = 0; i < 2; i++) g.fillTriangle(w - 9 + i * 3, dy + h / 2 - 2.5, w - 7 + i * 3, dy + h / 2, w - 9 + i * 3, dy + h / 2 + 2.5);
    }
    if (st === 'sel' && !this.o.skew) {
      // Corner bracket on a selected card.
      g.lineStyle(0.75, accent, 1).beginPath();
      g.moveTo(w - 8, dy - 1.5); g.lineTo(w + 1.5, dy - 1.5); g.lineTo(w + 1.5, dy + 8); g.strokePath();
    }
  }
}

/** A button: a card with a centred label (and an optional key cap). */
export class Button extends Card {
  readonly label: Phaser.GameObjects.Text;
  private cap?: Phaser.GameObjects.Container;
  private labelColor?: string;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, text: string,
    o: CardOpts & { size?: number; key?: string; font?: 'title' | 'ui'; color?: string } = {}) {
    super(scene, x, y, w, h, { skew: h * 0.4, ...o });
    const size = o.size ?? Math.round(h * 0.42);
    this.label = (o.font === 'ui' ? bold(scene, w / 2, h / 2, text, size) : title(scene, w / 2, h / 2 + size * 0.08, text, size)).setOrigin(0.5);
    if (o.font !== 'ui') this.label.setFontStyle('600');
    this.labelColor = o.color;
    this.add(this.label);
    if (o.key) { this.cap = keycap(scene, h * 0.4 + 4, h / 2, o.key, o.accent ?? C.yellow, 5); this.add(this.cap); }
    this.paint();
  }

  private paint() {
    if (!this.label) return;
    const st = this.cardState, accent = this.o.accent ?? C.cyan;
    this.label.setColor(st === 'off' ? T.off : this.o.solid ? T.dark : this.labelColor ?? (st === 'sel' || this.hovered ? T.text : hex(accent)));
  }

  override draw() {
    super.draw();
    this.paint();
  }

  setText(s: string) { this.label.setText(s); return this; }
}

/** A row of skewed tabs. `onPick(i)` on click. */
export function tabs(scene: Phaser.Scene, cx: number, y: number, labels: string[], active: number, onPick: (i: number) => void, accent: number = C.cyan, w = 112, h = 13) {
  const c = scene.add.container(0, 0);
  const total = labels.length * w + (labels.length - 1) * 2;
  labels.forEach((l, i) => {
    const b = new Button(scene, cx - total / 2 + i * (w + 2), y - h / 2, w, h, l, { accent, state: i === active ? 'sel' : 'idle', font: 'ui', size: 6, onClick: () => onPick(i), color: i === active ? T.yellow : undefined });
    c.add(b);
  });
  return c;
}

export interface GlitchOpts { font?: 'title' | 'ui'; weight?: string; stroke?: number; every?: number; ghosts?: boolean }

/**
 * Text with a chromatic split: cyan and magenta copies offset behind it, and now and then a glitch
 * burst (the copies jump, a slice of the text slides sideways).
 */
export class GlitchText extends Phaser.GameObjects.Container {
  readonly main: Phaser.GameObjects.Text;
  private cy: Phaser.GameObjects.Text;
  private mg: Phaser.GameObjects.Text;
  private slice: Phaser.GameObjects.Text;
  private nextAt = 0;
  private until = 0;
  private onUpdate: (t: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number, s: string, size: number, color: string, o: GlitchOpts = {}) {
    super(scene, x, y);
    scene.add.existing(this);
    const make = (col: string) => {
      const t = o.font === 'ui' ? bold(scene, 0, 0, s, size, col) : title(scene, 0, 0, s, size, col).setFontStyle(o.weight ?? '600');
      return t.setOrigin(0.5);
    };
    this.cy = make(T.cyan).setAlpha(o.ghosts === false ? 0 : 0.75);
    this.mg = make(T.magenta).setAlpha(o.ghosts === false ? 0 : 0.75);
    this.main = make(color);
    if (o.stroke) this.main.setStroke('#05030f', o.stroke);
    this.slice = make(color).setVisible(false);
    this.add([this.cy, this.mg, this.main, this.slice]);
    this.setSize(this.main.width, this.main.height);
    this.nextAt = scene.time.now + 600 + Math.random() * 1500;
    const every = o.every ?? 2600;
    this.onUpdate = (t: number) => {
      const burst = t < this.until;
      if (!burst && t > this.nextAt) { this.until = t + 90 + Math.random() * 140; this.nextAt = t + every * (0.6 + Math.random() * 0.8); }
      const k = burst ? 1 : 0, sz = Math.min(2.2, size * 0.03);
      this.cy.setPosition(-sz - k * Phaser.Math.FloatBetween(0, sz * 1.5), k * Phaser.Math.FloatBetween(-sz, sz));
      this.mg.setPosition(sz + k * Phaser.Math.FloatBetween(0, sz * 1.5), k * Phaser.Math.FloatBetween(-sz, sz));
      this.main.setAlpha(burst && Math.random() < 0.25 ? 0.55 : 1);
      if (burst && Math.random() < 0.6) {
        const r = this.main.style.resolution || 1, fh = this.main.height;
        const sy = Math.random() * fh * 0.8, sh = fh * (0.08 + Math.random() * 0.18);
        // Phaser offsets a cropped high-resolution text by the crop in texture pixels: undo the extra.
        this.slice.setVisible(true).setCrop(0, sy * r, this.main.width * r, sh * r).setPosition(Phaser.Math.FloatBetween(-size * 0.2, size * 0.2), -sy * (r - 1));
      } else this.slice.setVisible(false);
    };
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.wrap, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.wrap, this));
  }

  private wrap(t: number) { if (this.active) this.onUpdate(t); }

  setText(s: string) { [this.cy, this.mg, this.main, this.slice].forEach(t => t.setText(s)); return this; }
  setColor(c: string) { this.main.setColor(c); this.slice.setColor(c); return this; }
  /** Forces a burst now (on an impact). */
  burst(ms = 200) { this.until = this.scene.time.now + ms; }
}

export { TITLE_FONT, UI_FONT };

/**
 * A full-screen modal frame: dark veil, one big angled panel with a title tab, optional code text
 * next to the title. Content goes inside x 14..W-14, y 22..H-20.
 */
export function screenFrame(scene: Phaser.Scene, label: string, accent: number = C.cyan, code = '', o: PanelOpts = {}) {
  const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
  const c = scene.add.container(0, 0);
  c.add(backdrop(scene, 0.96, accent));
  c.add(panel(scene, 6, 10, W - 12, H - 16, { accent, cut: 10, dots: 'br', title: label, titleSize: 13, code, ...o }));
  return c;
}

/** Rank pips: skewed segments, filled up to `n`. */
export function pips(g: Phaser.GameObjects.Graphics, x: number, y: number, n: number, max: number, color: number, w = 7, h = 4) {
  for (let i = 0; i < max; i++) {
    const p = skewPoly(x + i * (w + 1.5), y, w, h, h * 0.5);
    g.fillStyle(i < n ? color : C.deep, 1).fillPoints(p, true);
    g.lineStyle(PX * 2, color, i < n ? 1 : 0.6).strokePoints(p, true);
  }
  return max * (w + 1.5) - 1.5;
}
