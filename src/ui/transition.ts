import Phaser from 'phaser';
import { CONFIG, SCENES } from '../config';
import { setupCamera } from './camera';
import { C, T, bold, chip, halftone, scanlines, skewPoly, stripes } from './kit';
import { title, txt } from './text';
import { randomTip } from './tips';

/**
 * Scene transitions and loading cover, drawn by an always-on-top overlay scene.
 *
 * - `wipeTo(scene, key, data)`: angled magenta / yellow / night slabs sweep across the screen, the
 *   next scene starts underneath, and the slabs sweep away once it has been created.
 * - `showLoading(scene, label)` / `hideLoading()`: keeps the screen covered (with a label, a busy
 *   bar and a tip) while a scene still builds its 3D content. Shutting the scene down hides it too.
 *
 * The overlay is launched by the BootScene. If it is not running (a test stopped every scene),
 * `wipeTo` just starts the scene and `showLoading` relaunches the overlay.
 */
type Phase = 'idle' | 'cover' | 'hold' | 'reveal';

const COVER_MS = 320, REVEAL_MS = 380, MIN_LOADING_MS = 300, WAIT_MAX_MS = 6000;
/** Stagger of the three slabs, as a fraction of the sweep. */
const SLABS: [color: number, delay: number][] = [[C.magenta, 0], [C.yellow, 0.1], [C.night, 0.2]];
const SLANT = 80;

const st = {
  phase: 'idle' as Phase,
  t0: 0,
  afterCover: [] as (() => void)[],
  /** covered, waiting for the next scene to be created */
  waiting: false,
  waitSince: 0,
  loading: undefined as undefined | { id: number; label: string; sub: string; since: number; tip: string; hideAt?: number },
};
let loadingId = 0;
const now = () => performance.now();

function overlayOf(game: Phaser.Game): OverlayScene | undefined {
  const s = game.scene.getScene(SCENES.Overlay) as OverlayScene | null;
  return s && s.sys.isActive() ? s : undefined;
}

function ensureOverlay(game: Phaser.Game) {
  if (!overlayOf(game)) game.scene.run(SCENES.Overlay);
}

function cover(cb?: () => void) {
  if (cb) st.afterCover.push(cb);
  if (st.phase === 'idle' || st.phase === 'reveal') { st.phase = 'cover'; st.t0 = now(); }
}

/** Starts (or restarts) a scene behind a stylish wipe. */
export function wipeTo(from: Phaser.Scene, key: string, data?: object) {
  const go = () => (key === from.scene.key ? from.scene.restart(data) : from.scene.start(key, data));
  if (!overlayOf(from.game)) { ensureOverlay(from.game); go(); return; }
  const target = from.scene.get(key);
  cover(() => {
    st.waiting = true;
    st.waitSince = now();
    target.events.once(Phaser.Scenes.Events.CREATE, () => { st.waiting = false; });
    go();
  });
}

/** Covers the screen with a loading card until `hideLoading()` (or the scene shuts down). */
export function showLoading(scene: Phaser.Scene, label: string, sub = '') {
  const id = ++loadingId;
  st.loading = { id, label, sub, since: now(), tip: randomTip() };
  ensureOverlay(scene.game);
  cover();
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { if (st.loading?.id === id) st.loading = undefined; });
}

/** Lets the loading cover sweep away (after a short minimum so it never just flickers). */
export function hideLoading() {
  if (st.loading && st.loading.hideAt === undefined) st.loading.hideAt = Math.max(now(), st.loading.since + MIN_LOADING_MS);
}

/** True while a wipe or a loading cover is on screen. */
export function isCovered() { return st.phase !== 'idle'; }

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const v = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

export class OverlayScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private card!: Phaser.GameObjects.Container;
  private label!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private tip!: Phaser.GameObjects.Text;
  private busy!: Phaser.GameObjects.Graphics;
  private blocker!: Phaser.GameObjects.Zone;

  constructor() { super({ key: SCENES.Overlay }); }

  create() {
    setupCamera(this);
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    // Swallows clicks while the screen is covered.
    this.blocker = this.add.zone(W / 2, H / 2, W, H).setInteractive();
    this.blocker.input!.enabled = false;
    this.g = this.add.graphics();
    this.busy = this.add.graphics();
    this.label = title(this, W / 2, 128, '', 30, T.text).setFontStyle('600').setOrigin(0.5);
    this.sub = bold(this, W / 2, 150, '', 7, T.cyan).setOrigin(0.5).setAlign('center');
    this.tip = txt(this, W / 2, 232, '', 6, T.dim).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(320).setLineSpacing(2);
    const head = chip(this, W / 2, 100, 'CHARGEMENT', C.yellow, { filled: true, size: 5, originX: 0.5 });
    const tipChip = chip(this, W / 2, 224, 'ASTUCE', C.cyan, { size: 5, originX: 0.5 });
    this.card = this.add.container(0, 0, [head, this.label, this.sub, this.busy, tipChip, this.tip]).setAlpha(0);
    if (st.loading) { st.phase = 'hold'; st.t0 = now(); }
  }

  update() {
    const t = now();
    if (st.phase === 'cover' && t - st.t0 >= COVER_MS) {
      st.phase = 'hold'; st.t0 = t;
      const cbs = st.afterCover.splice(0);
      cbs.forEach(cb => cb());
    } else if (st.phase === 'hold') {
      if (st.afterCover.length) st.afterCover.splice(0).forEach(cb => cb());
      if (st.waiting && t - st.waitSince > WAIT_MAX_MS) st.waiting = false;
      if (st.loading?.hideAt !== undefined && t >= st.loading.hideAt) st.loading = undefined;
      if (!st.waiting && !st.loading && t - st.t0 > 40) { st.phase = 'reveal'; st.t0 = t; }
    } else if (st.phase === 'reveal' && t - st.t0 >= REVEAL_MS) {
      st.phase = 'idle';
    }
    this.blocker.input!.enabled = st.phase !== 'idle';
    this.draw(t);
  }

  private draw(t: number) {
    const g = this.g, W = CONFIG.WIDTH, H = CONFIG.HEIGHT, K = SLANT;
    g.clear();
    this.busy.clear();
    const showCard = st.phase === 'hold' && !!st.loading;
    this.card.setAlpha(Phaser.Math.Clamp(this.card.alpha + (showCard ? 0.2 : -0.25), 0, 1));
    if (st.phase === 'idle') return;
    const p = st.phase === 'cover' ? (t - st.t0) / COVER_MS : st.phase === 'reveal' ? (t - st.t0) / REVEAL_MS : 1;
    const span = 1 - SLABS[SLABS.length - 1][1];
    let nightEdge = -K;
    SLABS.forEach(([col, delay], i) => {
      // Covering: the slabs come in from the right, magenta first. Revealing: they leave to the left, night first.
      const d = st.phase === 'reveal' ? SLABS[SLABS.length - 1 - i][1] : delay;
      const q = st.phase === 'hold' ? 1 : ease(Phaser.Math.Clamp((p - d) / span, 0, 1));
      const edge = W - (W + K) * q;
      const pts = st.phase === 'reveal'
        ? [v(-K - 10, 0), v(edge + K, 0), v(edge, H), v(-K - 10, H)]
        : [v(edge + K, 0), v(W + K + 10, 0), v(W + K + 10, H), v(edge, H)];
      if (st.phase === 'reveal' && q >= 1) return;
      g.fillStyle(col, 1).fillPoints(pts, true);
      if (col === C.night) nightEdge = edge;
    });
    // Details on the night slab: a cyan seam and halftone dots along its moving edge.
    if (st.phase !== 'hold') {
      const e = nightEdge, dir = st.phase === 'reveal' ? -1 : 1;
      g.lineStyle(0.5, C.cyan, 0.9).lineBetween(e + K, 0, e, H);
      g.fillStyle(C.magenta, 0.5);
      for (let y = 2; y < H; y += 4) {
        const ex = e + K * (1 - y / H);
        for (let k = 0; k < 7; k++) g.fillCircle(ex + dir * (3 + k * 4), y + (k % 2) * 2, 1.3 - k * 0.17);
      }
    } else {
      // Fully covered: halftone corners, scanlines, stripes; the loading card fades in on top.
      halftone(g, 0, 0, 120, 70, C.violet, 0.18, 'tl', 4, 1.6);
      halftone(g, W - 120, H - 70, 120, 70, C.magenta, 0.16, 'br', 4, 1.6);
      scanlines(g, 0, 0, W, H, 0, C.white, 0.025, 2);
      stripes(g, 0, H - 5, 90, 5, C.yellow, 0.5, 5, 2);
      stripes(g, W - 90, 0, 90, 5, C.yellow, 0.5, 5, 2);
      if (st.loading) {
        if (this.label.text !== st.loading.label) this.label.setText(st.loading.label);
        if (this.sub.text !== st.loading.sub) this.sub.setText(st.loading.sub);
        if (this.tip.text !== st.loading.tip) this.tip.setText(st.loading.tip);
        // Indeterminate busy bar: a bright chunk running along a skewed track.
        const bx = W / 2 - 80, by = 164, bw = 160, bh = 4;
        const b = this.busy;
        b.fillStyle(C.deep, 1).fillPoints(skewPoly(bx, by, bw, bh, 2), true);
        b.lineStyle(0.25, C.yellow, 0.6).strokePoints(skewPoly(bx, by, bw, bh, 2), true);
        const k = ((t / 900) % 1), cx = bx - 30 + (bw + 30) * k;
        const x0 = Math.max(bx + 2, cx), x1 = Math.min(bx + bw - 2, cx + 30);
        if (x1 > x0) b.fillStyle(C.yellow, 1).fillPoints(skewPoly(x0, by + 0.75, x1 - x0, bh - 1.5, 1.5), true);
        for (let i = 0; i < 3; i++) {
          const on = Math.floor(t / 180) % 3 === i;
          b.fillStyle(on ? C.cyan : C.line, 1).fillPoints(skewPoly(W / 2 - 9 + i * 6, 175, 4, 2, 1), true);
        }
      }
    }
  }
}
