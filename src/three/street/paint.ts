import * as THREE from 'three';
import { pick, type Rng } from '../../core/rng';

/**
 * Everything the street draws itself on canvases: neon signs, blade signs, holographic ads,
 * building facades (windows, shopfronts, shutters, graffiti), awnings. Flat colours and ink
 * outlines, like the rest of the look. Teko / Chakra Petch are loaded by the page.
 */

export const TITLE = '"Teko", "Arial Narrow", sans-serif';
export const UI = '"Chakra Petch", "Segoe UI", sans-serif';
export const css = (c: number) => '#' + c.toString(16).padStart(6, '0');
export const INK = '#0b0820';

/** Waits for the sign fonts (canvas text drawn before they load would fall back to Arial). */
export async function fontsReady() {
  try {
    await Promise.all([document.fonts.load(`600 64px ${TITLE}`), document.fonts.load(`500 64px ${TITLE}`), document.fonts.load(`700 32px ${UI}`)]);
  } catch { /* fallback fonts are fine */ }
}

export function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}

export function tex(c: HTMLCanvasElement, opts: { repeat?: boolean; nearest?: boolean } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (opts.nearest) t.magFilter = THREE.NearestFilter;
  return t;
}

/** Lighter / darker version of a colour (k > 1 lighter). */
export function shade(c: number, k: number) {
  const col = new THREE.Color(c);
  if (k >= 1) col.lerp(new THREE.Color(0xffffff), Math.min(1, k - 1));
  else col.multiplyScalar(k);
  return col.getHex();
}

/** Text fitted in a box: the largest size (up to `max`) that fits `w`. */
function fitFont(g: CanvasRenderingContext2D, word: string, family: string, weight: number, w: number, max: number) {
  let s = max;
  g.font = `${weight} ${s}px ${family}`;
  const m = g.measureText(word).width;
  if (m > w) s = Math.floor(s * w / m);
  g.font = `${weight} ${s}px ${family}`;
  return s;
}

/** Glowing tube letters: halo, coloured tube, white-hot core. */
function neonStroke(g: CanvasRenderingContext2D, word: string, x: number, y: number, color: string, size: number, fill = false) {
  g.save();
  g.lineJoin = 'round';
  g.shadowColor = color; g.shadowBlur = size * 0.35;
  g.strokeStyle = color; g.globalAlpha = 0.55; g.lineWidth = size * 0.13;
  g.strokeText(word, x, y);
  g.globalAlpha = 1; g.shadowBlur = size * 0.18; g.lineWidth = size * 0.07;
  g.strokeText(word, x, y);
  if (fill) { g.fillStyle = color; g.fillText(word, x, y); }
  g.shadowBlur = 0; g.strokeStyle = '#ffffff'; g.globalAlpha = 0.85; g.lineWidth = Math.max(1, size * 0.022);
  g.strokeText(word, x, y);
  g.restore();
}

export type SignLook = 'tube' | 'box' | 'led';

/**
 * A horizontal shop sign: `tube` (neon letters on a dark board), `box` (back-lit colour panel with
 * dark letters) or `led` (dot-matrix on black). Returns the texture and its aspect (w / h).
 */
export function signTexture(word: string, color: number, look: SignLook, sub?: string) {
  const W = 512, H = 128;
  const { c, g } = canvas(W, H);
  const col = css(color);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (look === 'box') {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, css(shade(color, 1.35))); grd.addColorStop(1, col);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = INK; g.fillRect(0, 0, W, 8); g.fillRect(0, H - 8, W, 8); g.fillRect(0, 0, 8, H); g.fillRect(W - 8, 0, 8, H);
    const s = fitFont(g, word, TITLE, 600, W - 60, sub ? 92 : 118);
    g.fillStyle = INK; g.fillText(word, W / 2, H / 2 + s * 0.09 - (sub ? 12 : 0));
    if (sub) { g.font = `700 20px ${UI}`; g.fillText(sub, W / 2, H - 22); }
  } else if (look === 'led') {
    g.fillStyle = '#05030c'; g.fillRect(0, 0, W, H);
    const s = fitFont(g, word, UI, 700, W - 40, 84);
    g.fillStyle = col; g.fillText(word, W / 2, H / 2 + 4);
    // Dot matrix: punch a grid of holes into the letters.
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2);
    for (let x = 0; x < W; x += 6) g.fillRect(x, 0, 2, H);
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = '#05030c'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    void s;
  } else {
    g.fillStyle = '#0a0618'; g.fillRect(0, 0, W, H);
    g.strokeStyle = css(shade(color, 0.45)); g.lineWidth = 4; g.strokeRect(10, 10, W - 20, H - 20);
    const s = fitFont(g, word, TITLE, 500, W - 70, sub ? 96 : 116);
    neonStroke(g, word, W / 2, H / 2 + s * 0.08 - (sub ? 10 : 0), col, s);
    if (sub) { g.font = `700 18px ${UI}`; g.fillStyle = css(shade(color, 1.4)); g.fillText(sub, W / 2, H - 20); }
  }
  return tex(c);
}

/** A vertical blade sign: letters stacked top to bottom, a neon frame. */
export function bladeTexture(word: string, color: number, look: 'tube' | 'box') {
  const letters = [...word.replace(/\s/g, '')].slice(0, 7);
  const W = 128, H = 128 * Math.max(3, letters.length) + 32;
  const { c, g } = canvas(W, H);
  const col = css(color);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (look === 'box') {
    g.fillStyle = col; g.fillRect(0, 0, W, H);
    g.fillStyle = INK; g.fillRect(0, 0, W, 8); g.fillRect(0, H - 8, W, 8); g.fillRect(0, 0, 8, H); g.fillRect(W - 8, 0, 8, H);
  } else {
    g.fillStyle = '#0a0618'; g.fillRect(0, 0, W, H);
    g.save(); g.shadowColor = col; g.shadowBlur = 14; g.strokeStyle = col; g.lineWidth = 5; g.strokeRect(10, 10, W - 20, H - 20); g.restore();
  }
  const step = (H - 32) / letters.length;
  letters.forEach((ch, i) => {
    const y = 16 + step * (i + 0.5) + 8;
    g.font = `600 ${Math.min(120, step * 1.05)}px ${TITLE}`;
    if (look === 'box') { g.fillStyle = INK; g.fillText(ch, W / 2, y); }
    else neonStroke(g, ch, W / 2, y, col, Math.min(120, step * 1.05));
  });
  return { texture: tex(c), aspect: W / H };
}

/** Holographic advertising: big translucent picture + slogan, scanlines (scrolled at run time). */
export function holoTexture(kind: number, color: number, color2: number) {
  const W = 512, H = 384;
  const { c, g } = canvas(W, H);
  const a = css(color), b = css(color2);
  g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineCap = 'round';
  const glow = (col: string, blur = 16) => { g.shadowColor = col; g.shadowBlur = blur; };
  const titleTxt = (t: string, y: number, size: number, col: string) => {
    g.font = `600 ${size}px ${TITLE}`; glow(col, 18); g.fillStyle = col; g.fillText(t, W / 2, y); g.shadowBlur = 0;
  };
  switch (kind % 6) {
    case 0: { // a drink can
      glow(a); g.fillStyle = a; g.beginPath(); g.roundRect(196, 60, 120, 200, 18); g.fill();
      g.shadowBlur = 0; g.fillStyle = b; g.fillRect(196, 120, 120, 50);
      g.fillStyle = '#ffffff'; g.font = `600 44px ${TITLE}`; g.fillText('NC', 256, 148);
      titleTxt('NEURO-COLA', 316, 78, b);
      break;
    }
    case 1: { // a koi fish
      glow(a, 24); g.strokeStyle = a; g.lineWidth = 10;
      g.beginPath(); g.moveTo(110, 190); g.bezierCurveTo(170, 90, 320, 90, 380, 170); g.bezierCurveTo(320, 260, 170, 270, 110, 190); g.stroke();
      g.beginPath(); g.moveTo(380, 170); g.lineTo(450, 110); g.lineTo(440, 190); g.lineTo(450, 260); g.closePath(); g.stroke();
      g.fillStyle = b; g.beginPath(); g.arc(160, 175, 10, 0, Math.PI * 2); g.fill();
      g.strokeStyle = b; g.lineWidth = 6; for (const x of [220, 270, 320]) { g.beginPath(); g.arc(x, 180, 26, -0.9, 0.9); g.stroke(); }
      titleTxt('KOI·NET', 320, 70, b);
      break;
    }
    case 2: { // corporate triangle
      glow(a, 20); g.strokeStyle = a; g.lineWidth = 12;
      g.beginPath(); g.moveTo(256, 50); g.lineTo(366, 240); g.lineTo(146, 240); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(256, 120); g.lineTo(310, 214); g.lineTo(202, 214); g.closePath(); g.fillStyle = b; g.fill();
      titleTxt('KESSLER CORP', 310, 66, a);
      break;
    }
    case 3: { // the eye that watches
      glow(a, 22); g.strokeStyle = a; g.lineWidth = 12;
      g.beginPath(); g.moveTo(90, 160); g.quadraticCurveTo(256, 30, 422, 160); g.quadraticCurveTo(256, 290, 90, 160); g.stroke();
      g.fillStyle = b; g.beginPath(); g.arc(256, 160, 52, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000'; g.beginPath(); g.arc(256, 160, 20, 0, Math.PI * 2); g.fill();
      titleTxt('PSY-SEC VEILLE', 318, 62, a);
      break;
    }
    case 4: { // a sake bottle and a cup
      glow(a, 18); g.fillStyle = a;
      g.beginPath(); g.moveTo(220, 60); g.lineTo(250, 60); g.lineTo(250, 110); g.quadraticCurveTo(300, 140, 300, 190); g.lineTo(300, 270); g.lineTo(170, 270); g.lineTo(170, 190); g.quadraticCurveTo(170, 140, 220, 110); g.closePath(); g.fill();
      g.fillStyle = b; g.fillRect(185, 180, 100, 46);
      g.beginPath(); g.moveTo(330, 210); g.lineTo(380, 210); g.lineTo(372, 270); g.lineTo(338, 270); g.closePath(); g.fill();
      titleTxt('SYNTH-SAKÉ', 322, 74, b);
      break;
    }
    default: { // a chip / brain
      glow(a, 20); g.strokeStyle = a; g.lineWidth = 8;
      g.strokeRect(186, 70, 140, 140);
      for (let i = 0; i < 5; i++) { const t = 92 + i * 24; for (const [x1, x2] of [[150, 186], [326, 362]]) { g.beginPath(); g.moveTo(x1, t); g.lineTo(x2, t); g.stroke(); } g.beginPath(); g.moveTo(t + 94, 34); g.lineTo(t + 94, 70); g.stroke(); g.beginPath(); g.moveTo(t + 94, 210); g.lineTo(t + 94, 246); g.stroke(); }
      g.fillStyle = b; g.font = `600 64px ${TITLE}`; g.fillText('Z', 256, 146);
      titleTxt('ZEN-CHIP v9', 312, 70, a);
    }
  }
  g.shadowBlur = 0;
  // Scanlines and a frame.
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = 'rgba(0,0,0,0.45)';
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2);
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = a; g.globalAlpha = 0.6; g.lineWidth = 4; g.strokeRect(6, 6, W - 12, H - 12);
  g.globalAlpha = 1;
  return tex(c);
}

/** A scrolling ticker strip (screens over shops, the totem): repeated text, scrolled by offset. */
export function tickerTexture(words: string[], color: number) {
  const W = 1024, H = 64;
  const { c, g } = canvas(W, H);
  g.fillStyle = '#05030c'; g.fillRect(0, 0, W, H);
  g.font = `700 40px ${UI}`; g.textBaseline = 'middle';
  let x = 10;
  let i = 0;
  while (x < W) {
    const w = words[i++ % words.length] + '  ◆  ';
    g.fillStyle = i % 2 ? css(color) : '#f5e663';
    g.fillText(w, x, H / 2 + 2);
    x += g.measureText(w).width;
  }
  const t = tex(c, { repeat: true });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Diagonal stripes (awnings, hazard bands). */
export function stripeTexture(a: number, b: number, n = 6, diagonal = false) {
  const { c, g } = canvas(128, 128);
  g.fillStyle = css(a); g.fillRect(0, 0, 128, 128);
  g.fillStyle = css(b);
  const w = 128 / n;
  if (diagonal) {
    for (let i = -n; i < n * 2; i += 2) { g.beginPath(); g.moveTo(i * w, 0); g.lineTo(i * w + w, 0); g.lineTo(i * w + w - 128, 128); g.lineTo(i * w - 128, 128); g.closePath(); g.fill(); }
  } else for (let i = 0; i < n; i += 2) g.fillRect(i * w, 0, w, 128);
  return tex(c, { repeat: true });
}

const GRAFFITI = ['NYX', 'R0NIN', 'K-9', 'ZERO', '404', 'GHOST', 'VOID', 'RATS', 'NO FUTUR', 'KAOS', 'CHROME', 'LIBRE'];

/** Spray-painted tag at (x, y), about `w` pixels wide. */
export function graffiti(g: CanvasRenderingContext2D, rng: Rng, x: number, y: number, w: number) {
  const word = pick(rng, GRAFFITI);
  const col = pick(rng, ['#ff2a6d', '#00f0ff', '#f5e663', '#39ff88', '#b84dff', '#ff8c2a']);
  g.save();
  g.translate(x, y); g.rotate((rng() - 0.5) * 0.3);
  g.font = `600 ${Math.round(w / Math.max(2.4, word.length * 0.42))}px ${TITLE}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.strokeStyle = INK; g.lineWidth = 7; g.strokeText(word, 0, 0);
  g.fillStyle = col; g.fillText(word, 0, 0);
  g.strokeStyle = '#ffffff'; g.globalAlpha = 0.5; g.lineWidth = 1.5; g.strokeText(word, -1, -1);
  g.restore();
}

export interface FacadeSpec {
  /** metres */
  w: number; h: number;
  wall: number;
  kind: 'shop' | 'alley' | 'parking' | 'warehouse' | 'bunker' | 'plain';
  /** street level is a shopfront (only on faces that see the board) */
  street: boolean;
  /** ground floor height (m) */
  ground: number;
  lit: number;
}

const PX = 24; // pixels per metre

/** Window rects of a facade (metres, from bottom-left), so 3D details can sit on them. */
export interface FacadeLayout { windows: { x: number; y: number; w: number; h: number; lit: boolean }[]; shops: { x: number; w: number; open: boolean }[] }

/** A building face: wall, floor bands, windows (some lit), street level. Map + emissive map. */
export function facadeTexture(spec: FacadeSpec, rng: Rng) {
  const W = Math.max(8, Math.round(spec.w * PX)), H = Math.max(8, Math.round(spec.h * PX));
  const { c, g } = canvas(W, H);
  const { c: ec, g: e } = canvas(W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  const layout: FacadeLayout = { windows: [], shops: [] };
  const Y = (m: number) => H - m * PX; // metres from the ground -> canvas y
  const wall = css(spec.wall), dark = css(shade(spec.wall, 0.72)), light = css(shade(spec.wall, 1.12));
  g.fillStyle = wall; g.fillRect(0, 0, W, H);
  // Panel seams / bricks, by kind.
  if (spec.kind === 'warehouse') {
    g.fillStyle = dark;
    for (let x = 0; x < W; x += 10) g.fillRect(x, 0, 3, H);
  } else if (spec.kind === 'alley') {
    g.fillStyle = dark;
    for (let y = 0, r = 0; y < H; y += 6, r++) { g.fillRect(0, y, W, 1); for (let x = (r % 2) * 7; x < W; x += 14) g.fillRect(x, y, 1, 6); }
  } else if (spec.kind === 'parking' || spec.kind === 'bunker') {
    g.fillStyle = dark;
    for (let y = 0; y < H; y += 2 * PX) g.fillRect(0, y, W, 2);
    for (let x = 0; x < W; x += 3 * PX) g.fillRect(x, 0, 2, H);
  } else {
    g.fillStyle = light;
    for (let x = 0; x < W; x += PX * 1.5) g.fillRect(x, 0, 1, H);
  }
  // Grime: soft dark streaks from the top and at the base.
  for (let i = 0; i < W / 18; i++) {
    const x = rng() * W, len = H * (0.1 + rng() * 0.35);
    const gr = g.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, 'rgba(10,6,30,0.35)'); gr.addColorStop(1, 'rgba(10,6,30,0)');
    g.fillStyle = gr; g.fillRect(x, 0, 2 + rng() * 6, len);
  }
  const base = g.createLinearGradient(0, H - 1.2 * PX, 0, H);
  base.addColorStop(0, 'rgba(10,6,30,0)'); base.addColorStop(1, 'rgba(10,6,30,0.5)');
  g.fillStyle = base; g.fillRect(0, H - 1.2 * PX, W, 1.2 * PX);

  // Upper floors: a grid of windows.
  const floorH = spec.kind === 'warehouse' ? 4.5 : 3;
  const winW = spec.kind === 'warehouse' ? 2.6 : spec.kind === 'bunker' ? 1.2 : 1.25, winH = spec.kind === 'warehouse' ? 1.0 : spec.kind === 'bunker' ? 0.5 : 1.55;
  const cols = Math.max(1, Math.floor(spec.w / (winW + 0.95)));
  const gap = (spec.w - cols * winW) / cols;
  const litCols = [0xffc46b, 0xffe2a0, 0x7ad8ff, 0xff7ab8, 0xb88aff, 0x9affd8];
  const pattern = rng();
  if (spec.kind !== 'parking') for (let fy = spec.ground; fy + floorH <= spec.h - 0.6; fy += floorH) {
    // Floor band.
    g.fillStyle = dark; g.fillRect(0, Y(fy) - 3, W, 6);
    for (let i = 0; i < cols; i++) {
      const x = gap / 2 + i * (winW + gap), y = fy + (floorH - winH) * 0.55;
      const lit = rng() < spec.lit;
      layout.windows.push({ x, y, w: winW, h: winH, lit });
      const px = x * PX, py = Y(y + winH), pw = winW * PX, ph = winH * PX;
      g.fillStyle = INK; g.fillRect(px - 3, py - 3, pw + 6, ph + 6);
      if (lit) {
        const col = rng() < 0.6 ? litCols[Math.floor(pattern * 2)] : pick(rng, litCols);
        const gr = g.createLinearGradient(0, py, 0, py + ph);
        gr.addColorStop(0, css(shade(col, 1.15))); gr.addColorStop(1, css(shade(col, 0.75)));
        g.fillStyle = gr; g.fillRect(px, py, pw, ph);
        e.fillStyle = css(shade(col, 0.85)); e.fillRect(px, py, pw, ph);
        // Blinds, or a silhouette in the window.
        const r = rng();
        if (r < 0.35) { g.fillStyle = 'rgba(30,15,60,0.45)'; e.fillStyle = 'rgba(0,0,0,0.5)'; for (let by = py + 3; by < py + ph; by += 5) { g.fillRect(px, by, pw, 2); e.fillRect(px, by, pw, 2); } }
        else if (r < 0.55) { g.fillStyle = 'rgba(20,10,40,0.85)'; e.fillStyle = '#000'; const sx = px + pw * (0.2 + rng() * 0.5); g.beginPath(); g.arc(sx, py + ph * 0.42, ph * 0.13, 0, Math.PI * 2); g.fill(); g.fillRect(sx - ph * 0.17, py + ph * 0.56, ph * 0.34, ph * 0.44); e.beginPath(); e.arc(sx, py + ph * 0.42, ph * 0.13, 0, Math.PI * 2); e.fill(); e.fillRect(sx - ph * 0.17, py + ph * 0.56, ph * 0.34, ph * 0.44); }
        else if (r < 0.7) { g.fillStyle = 'rgba(20,60,30,0.8)'; e.fillStyle = 'rgba(0,0,0,0.8)'; for (let k = 0; k < 3; k++) { const lx = px + pw * (0.15 + k * 0.3); g.beginPath(); g.ellipse(lx, py + ph * 0.8, 5, 9, 0, 0, Math.PI * 2); g.fill(); e.beginPath(); e.ellipse(lx, py + ph * 0.8, 5, 9, 0, 0, Math.PI * 2); e.fill(); } }
      } else {
        g.fillStyle = '#17122e'; g.fillRect(px, py, pw, ph);
        g.fillStyle = 'rgba(140,120,255,0.18)'; g.beginPath(); g.moveTo(px + pw * 0.2, py); g.lineTo(px + pw * 0.45, py); g.lineTo(px + pw * 0.15, py + ph); g.lineTo(px - 0, py + ph); g.closePath(); g.fill();
      }
      // Mullion and sill.
      g.fillStyle = INK; g.fillRect(px + pw / 2 - 1, py, 2, ph);
      g.fillStyle = light; g.fillRect(px - 4, py + ph + 3, pw + 8, 3);
    }
  }

  // Street level.
  if (spec.ground > 0) {
    g.fillStyle = dark; g.fillRect(0, Y(spec.ground) - 4, W, 8);
    if (spec.street && (spec.kind === 'shop' || spec.kind === 'alley')) {
      let x = 0.3;
      while (x < spec.w - 1.2) {
        const sw = Math.min(spec.w - x - 0.3, 2.6 + Math.floor(rng() * 3) * 0.8);
        const open = spec.kind === 'shop' ? rng() < 0.7 : rng() < 0.35;
        layout.shops.push({ x, w: sw, open });
        const px = x * PX, pw = sw * PX, top = Y(spec.ground - 0.55), bot = Y(0.08);
        g.fillStyle = INK; g.fillRect(px - 3, top - 3, pw + 6, bot - top + 3);
        if (open) {
          const col = pick(rng, [0xffd08a, 0xff9ad0, 0x8ae8ff, 0xc8a8ff, 0xa8ffd0]);
          const gr = g.createLinearGradient(0, top, 0, bot);
          gr.addColorStop(0, css(shade(col, 1.2))); gr.addColorStop(1, css(shade(col, 0.6)));
          g.fillStyle = gr; g.fillRect(px, top, pw, bot - top);
          e.fillStyle = css(shade(col, 0.5)); e.fillRect(px, top, pw, bot - top);
          // Shelves, a counter, people inside.
          g.fillStyle = 'rgba(40,20,70,0.55)'; e.fillStyle = 'rgba(0,0,0,0.55)';
          for (let sy = top + 10; sy < bot - 20; sy += 14) { g.fillRect(px + 4, sy, pw * 0.4, 3); e.fillRect(px + 4, sy, pw * 0.4, 3); }
          g.fillRect(px + pw * 0.5, bot - 22, pw * 0.45, 22); e.fillRect(px + pw * 0.5, bot - 22, pw * 0.45, 22);
          if (rng() < 0.6) { const sx = px + pw * (0.55 + rng() * 0.3); g.fillStyle = 'rgba(25,12,45,0.9)'; e.fillStyle = '#000'; for (const k of [g, e]) { k.beginPath(); k.arc(sx, bot - 44, 6, 0, Math.PI * 2); k.fill(); k.fillRect(sx - 8, bot - 37, 16, 18); } }
          // Door frame in the middle.
          g.fillStyle = INK; g.fillRect(px + pw * 0.33, top, 3, bot - top);
        } else {
          // Rolling shutter with tags.
          g.fillStyle = '#5a5878'; g.fillRect(px, top, pw, bot - top);
          g.fillStyle = '#3e3c5a'; for (let sy = top; sy < bot; sy += 5) g.fillRect(px, sy, pw, 2);
          if (rng() < 0.85) graffiti(g, rng, px + pw / 2, (top + bot) / 2, pw * 0.8);
        }
        x += sw + 0.35;
      }
    } else if (spec.kind === 'warehouse' && spec.street) {
      // Big loading doors.
      for (let x = 0.6; x + 3.6 < spec.w; x += 5) {
        const px = x * PX, pw = 3.6 * PX, top = Y(Math.min(spec.ground, 4)), bot = Y(0);
        g.fillStyle = INK; g.fillRect(px - 4, top - 4, pw + 8, bot - top + 4);
        g.fillStyle = '#6a6e8a'; g.fillRect(px, top, pw, bot - top);
        g.fillStyle = '#4c4f6a'; for (let sy = top; sy < bot; sy += 6) g.fillRect(px, sy, pw, 2);
        g.fillStyle = '#f5e663'; for (let k = 0; k < pw; k += 16) g.fillRect(px + k, bot - 10, 8, 10);
        if (rng() < 0.5) graffiti(g, rng, px + pw / 2, (top + bot) / 2, pw * 0.7);
      }
    } else {
      // A plain base: a door or two, tags.
      for (let x = 0.8 + rng() * 2; x < spec.w - 1.4; x += 4 + rng() * 4) {
        const px = x * PX, pw = 1.1 * PX, top = Y(2.2), bot = Y(0);
        g.fillStyle = INK; g.fillRect(px - 3, top - 3, pw + 6, bot - top + 3);
        const lit = rng() < 0.4;
        g.fillStyle = lit ? '#ffb070' : '#2a2448'; g.fillRect(px, top, pw, bot - top);
        if (lit) { e.fillStyle = '#ff9a50'; e.fillRect(px, top, pw, bot - top); }
      }
      if (spec.kind !== 'parking' && rng() < 0.7) graffiti(g, rng, W * (0.2 + rng() * 0.6), Y(1.2), Math.min(W * 0.4, 3.2 * PX));
    }
  }
  const map = tex(c), emissive = tex(ec);
  return { map, emissive, layout };
}

/** A roll of corrugated metal (shipping containers). */
export function corrugated(color: number) {
  const { c, g } = canvas(64, 64);
  g.fillStyle = css(color); g.fillRect(0, 0, 64, 64);
  g.fillStyle = css(shade(color, 0.7));
  for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 3, 64);
  g.fillStyle = css(shade(color, 1.15));
  for (let x = 4; x < 64; x += 8) g.fillRect(x, 0, 1, 64);
  return tex(c, { repeat: true });
}

/** Soft round glow (light pools on the ground, halos). */
let glowCache: THREE.Texture | undefined;
export function glowTexture() {
  if (glowCache) return glowCache;
  const { c, g } = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowCache = new THREE.CanvasTexture(c);
  return glowCache;
}

/** A soft puff (steam). */
let puffCache: THREE.Texture | undefined;
export function puffTexture() {
  if (puffCache) return puffCache;
  const { c, g } = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  puffCache = new THREE.CanvasTexture(c);
  return puffCache;
}
