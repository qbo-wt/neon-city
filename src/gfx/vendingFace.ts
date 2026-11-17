import type { VendingMood } from '../core/vending';

/**
 * Capsule's face: a 24 × 12 LED matrix drawn on any 2D canvas, for the screen on the corridor
 * machine (three.js live canvas) and the portrait in its dialogue panel (Phaser canvas texture).
 */

/** What the corridor scene tells the 3D screen: the current mood, and until when the mouth moves (performance.now ms). */
export const vendingLive: { mood: VendingMood; talkUntil: number } = { mood: 'neutral', talkUntil: 0 };

const GW = 24, GH = 12;
const COLOR: Record<VendingMood, string> = {
  neutral: '#00f0ff', happy: '#39ff88', sad: '#8a9cff', angry: '#ff2a6d', glitch: '#00f0ff', love: '#ff6fb0',
};

type Glyph = string[];
const EYES: Record<VendingMood, Glyph> = {
  neutral: ['###', '###', '###', '###'],
  glitch: ['###', '###', '###', '###'],
  happy: ['.....', '..#..', '.#.#.', '#...#'],
  sad: ['.....', '...##', '.##..', '#....'],
  angry: ['#....', '.##..', '..###', '.####'],
  love: ['.#.#.', '#####', '.###.', '..#..'],
};
const BLINK: Glyph = ['...', '...', '###', '...'];
const MOUTH: Record<VendingMood, Glyph> = {
  neutral: ['......', '######'],
  glitch: ['#.##.#', '.#..#.'],
  happy: ['#......#', '.######.'],
  sad: ['.######.', '#......#'],
  angry: ['#.#.#.#.', '.#.#.#.#'],
  love: ['#......#', '.######.'],
};
const OPEN: Glyph = ['.####.', '#....#', '.####.'];

/** Draws the face filling `w` × `h`. `t` in seconds drives blinks, tears and glitches. */
export function drawVendingFace(c: CanvasRenderingContext2D, w: number, h: number, t: number, mood: VendingMood, talking: boolean) {
  const cs = Math.max(1, Math.floor(Math.min(w / GW, h / GH)));
  const ox = Math.floor((w - GW * cs) / 2), oy = Math.floor((h - GH * cs) / 2);
  const gap = cs >= 4 ? 1 : 0;
  c.fillStyle = '#07040f';
  c.fillRect(0, 0, w, h);
  // The unlit LEDs.
  c.fillStyle = '#140c26';
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) c.fillRect(ox + x * cs, oy + y * cs, cs - gap, cs - gap);
  const glitch = mood === 'glitch';
  const jitter = (row: number) => (glitch && Math.sin(t * 37 + row * 3.1) > 0.7 ? Math.round(Math.sin(t * 91 + row) * 2) : 0);
  let color = COLOR[mood];
  if (glitch) color = Math.sin(t * 23) > 0 ? '#00f0ff' : '#ff2a6d';
  if (mood === 'love') color = Math.sin(t * 5) > 0 ? '#ff6fb0' : '#ff2a6d';
  const lit = (x: number, y: number, col = color) => {
    if (x < 0 || x >= GW || y < 0 || y >= GH) return;
    c.fillStyle = col;
    c.fillRect(ox + (x + jitter(y)) * cs, oy + y * cs, cs - gap, cs - gap);
  };
  const glyph = (g: Glyph, cx: number, top: number, mirror = false) => {
    const gw = g[0].length, left = cx - Math.floor(gw / 2);
    g.forEach((row, y) => { for (let x = 0; x < gw; x++) if (row[mirror ? gw - 1 - x : x] === '#') lit(left + x, top + y); });
  };
  const blink = mood !== 'angry' && mood !== 'love' && t % 4.3 < 0.14;
  const eye = blink ? BLINK : EYES[mood];
  glyph(eye, 7, 2);
  glyph(eye, 16, 2, true);
  const mouth = talking && Math.floor(t * 8) % 2 === 0 ? OPEN : MOUTH[mood];
  glyph(mouth, 12, 7);
  // A tear runs down from the left eye.
  if (mood === 'sad') lit(5, 6 + Math.floor((t * 3) % 6), '#c8d8ff');
  // Static over a glitch.
  if (glitch) for (let i = 0; i < 6; i++) lit(Math.floor((Math.sin(t * 53 + i * 7.7) * 0.5 + 0.5) * GW), Math.floor((Math.cos(t * 41 + i * 3.3) * 0.5 + 0.5) * GH), '#e8e8ff');
  // Scanlines.
  c.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < h; y += 2) c.fillRect(0, y, w, 1);
}
