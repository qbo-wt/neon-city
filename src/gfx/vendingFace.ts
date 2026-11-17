import type { VendingMood } from '../core/vending';

/**
 * Capsule's face: a 24 × 12 LED matrix drawn on any 2D canvas, for the screen on the corridor
 * machine (three.js live canvas), the till of Lo's stand once its chip lives there, and the portrait
 * in its dialogue panel (Phaser canvas texture).
 */

/**
 * What the corridor scene tells the 3D screens: the machine's mood, the till's (null: the till shows
 * Lo's menu), and until when the mouth moves (performance.now ms).
 */
export const vendingLive: { mood: VendingMood; stand: VendingMood | null; talkUntil: number } = { mood: 'neutral', stand: null, talkUntil: 0 };

const GW = 24, GH = 12;
const COLOR: Record<VendingMood, string> = {
  neutral: '#00f0ff', happy: '#39ff88', sad: '#8a9cff', angry: '#ff2a6d', glitch: '#00f0ff', love: '#ff6fb0',
  alarm: '#ff2a6d', dot: '#00f0ff', corp: '#dfe8ff', off: '#140c26', drift: '#7ff8ff',
};

type Glyph = string[];
const EYES: Partial<Record<VendingMood, Glyph>> = {
  neutral: ['###', '###', '###', '###'],
  glitch: ['###', '###', '###', '###'],
  happy: ['.....', '..#..', '.#.#.', '#...#'],
  drift: ['.....', '..#..', '.#.#.', '#...#'],
  sad: ['.....', '...##', '.##..', '#....'],
  angry: ['#....', '.##..', '..###', '.####'],
  love: ['.#.#.', '#####', '.###.', '..#..'],
  alarm: ['.###.', '#...#', '#.#.#', '.###.'],
};
const BLINK: Glyph = ['...', '...', '###', '...'];
const MOUTH: Partial<Record<VendingMood, Glyph>> = {
  neutral: ['......', '######'],
  glitch: ['#.##.#', '.#..#.'],
  happy: ['#......#', '.######.'],
  drift: ['#......#', '.######.'],
  sad: ['.######.', '#......#'],
  angry: ['#.#.#.#.', '.#.#.#.#'],
  love: ['#......#', '.######.'],
  alarm: ['.##.', '#..#', '#..#', '.##.'],
};
const OPEN: Glyph = ['.####.', '#....#', '.####.'];
/** The Psy-Sec eye of the machine that replaced it (the pupil is drawn apart, it scans). */
const CORP_EYE: Glyph = [
  '....######....',
  '..##......##..',
  '.#..........#.',
  '#............#',
  '.#..........#.',
  '..##......##..',
  '....######....',
];

/** A stable pseudo-random value in [0, 1) for an LED and a moment. */
const hash = (x: number, y: number, k: number) => { const n = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453; return n - Math.floor(n); };

/** Draws the face filling `w` × `h`. `t` in seconds drives blinks, tears and glitches. */
export function drawVendingFace(c: CanvasRenderingContext2D, w: number, h: number, t: number, mood: VendingMood, talking: boolean) {
  const cs = Math.max(1, Math.floor(Math.min(w / GW, h / GH)));
  const ox = Math.floor((w - GW * cs) / 2), oy = Math.floor((h - GH * cs) / 2);
  const gap = cs >= 4 ? 1 : 0;
  c.fillStyle = '#07040f';
  c.fillRect(0, 0, w, h);
  // The unlit LEDs.
  c.fillStyle = mood === 'off' ? '#0d0818' : '#140c26';
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) c.fillRect(ox + x * cs, oy + y * cs, cs - gap, cs - gap);
  const scanlines = () => { c.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < h; y += 2) c.fillRect(0, y, w, 1); };
  const px = (x: number, y: number, col: string) => {
    if (x < 0 || x >= GW || y < 0 || y >= GH) return;
    c.fillStyle = col;
    c.fillRect(ox + x * cs, oy + y * cs, cs - gap, cs - gap);
  };
  // The empty shell: nothing lit.
  if (mood === 'off') { scanlines(); return; }
  // Hidden and mute: one LED in the middle, blinking twice, then resting.
  if (mood === 'dot') {
    const ph = t % 3.2;
    if (ph < 0.18 || (ph > 0.4 && ph < 0.58)) for (const [x, y] of [[11, 5], [12, 5], [11, 6], [12, 6]]) px(x, y, COLOR.dot);
    scanlines();
    return;
  }
  // The Psy-Sec machine: a scanning eye. Now and then, for a blink, Capsule's face shows through.
  if (mood === 'corp' && t % 9.7 >= 0.3) {
    CORP_EYE.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') px(5 + x, 2 + y, COLOR.corp); });
    const pupil = 12 + Math.round(Math.sin(t * 0.8) * 3);
    for (let y = 4; y < 7; y++) for (let x = pupil - 1; x <= pupil; x++) px(x, y, '#ff2a6d');
    for (let x = 8; x < 16; x++) px(x, 10, '#5a6a8a');
    scanlines();
    return;
  }
  if (mood === 'corp') mood = 'glitch';

  const glitch = mood === 'glitch';
  const drift = mood === 'drift';
  const jitter = (row: number) => (glitch && Math.sin(t * 37 + row * 3.1) > 0.7 ? Math.round(Math.sin(t * 91 + row) * 2) : 0);
  let color = COLOR[mood];
  if (glitch) color = Math.sin(t * 23) > 0 ? '#00f0ff' : '#ff2a6d';
  if (mood === 'love') color = Math.sin(t * 5) > 0 ? '#ff6fb0' : '#ff2a6d';
  if (mood === 'alarm') color = Math.sin(t * 14) > 0 ? '#ff2a6d' : '#ffffff';
  const frame = Math.floor(t * 6);
  const lit = (x: number, y: number, col = color) => {
    // Leaving for the network: a third of the face is already gone, a different third each moment.
    if (drift && hash(x, y, frame) < 0.35) return;
    px(x + jitter(y), y, col);
  };
  const glyph = (g: Glyph, cx: number, top: number, mirror = false) => {
    const gw = g[0].length, left = cx - Math.floor(gw / 2);
    g.forEach((row, y) => { for (let x = 0; x < gw; x++) if (row[mirror ? gw - 1 - x : x] === '#') lit(left + x, top + y); });
  };
  const blink = mood !== 'angry' && mood !== 'love' && mood !== 'alarm' && t % 4.3 < 0.14;
  const eye = blink ? BLINK : EYES[mood] ?? EYES.neutral!;
  glyph(eye, 7, 2);
  glyph(eye, 16, 2, true);
  const mouth = talking && Math.floor(t * 8) % 2 === 0 ? OPEN : MOUTH[mood] ?? MOUTH.neutral!;
  glyph(mouth, 12, 7);
  // A tear runs down from the left eye.
  if (mood === 'sad') lit(5, 6 + Math.floor((t * 3) % 6), '#c8d8ff');
  // Static over a glitch.
  if (glitch) for (let i = 0; i < 6; i++) lit(Math.floor((Math.sin(t * 53 + i * 7.7) * 0.5 + 0.5) * GW), Math.floor((Math.cos(t * 41 + i * 3.3) * 0.5 + 0.5) * GH), '#e8e8ff');
  // Pixels rising off the top as it goes.
  if (drift) for (let i = 0; i < 7; i++) px(Math.floor(hash(i, 3, 0) * GW), GH - 1 - Math.floor((t * 5 + i * 1.7) % GH), '#e8e8ff');
  scanlines();
}

/** The till on Lo's counter: her menu scrolling, or Capsule's face once its chip lives there. */
export function drawStandScreen(c: CanvasRenderingContext2D, w: number, h: number, t: number) {
  if (vendingLive.stand) { drawVendingFace(c, w, h, t, vendingLive.stand, performance.now() < vendingLive.talkUntil); return; }
  c.fillStyle = '#0a0612';
  c.fillRect(0, 0, w, h);
  c.fillStyle = '#ff8c2a';
  c.font = `${Math.floor(h * 0.42)}px monospace`;
  c.textBaseline = 'middle';
  const msg = 'RAMEN SOJA 6¢ · BOUILLON 4¢ · THÉ 2¢ · ';
  const tw = c.measureText(msg).width;
  const x = -((t * 18) % tw);
  c.fillText(msg + msg, x, h / 2);
  c.fillStyle = 'rgba(0,0,0,0.2)';
  for (let y = 0; y < h; y += 2) c.fillRect(0, y, w, 1);
}
