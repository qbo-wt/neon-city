import * as THREE from 'three';
import type { Rng } from '../../core/rng';
import type { Board } from '../../tactics/types';
import { canvas, css, tex, graffiti } from './paint';
import type { Theme } from './styles';

/**
 * The painted ground of a street: one canvas over the board (asphalt, tiles or concrete, road
 * markings, stains, cracks, puddles) plus a wetness mask the ground shader uses for reflections,
 * and an emissive layer for glowing inlays (plaza rings, scan lines). Drawn in metres.
 */
export interface GroundPaint { map: THREE.Texture; wet: THREE.Texture; glow: THREE.Texture | null }

const PX = 40; // pixels per metre on the board

interface Pen {
  g: CanvasRenderingContext2D; wg: CanvasRenderingContext2D; eg: CanvasRenderingContext2D | null;
  W: number; H: number; cell: number; rng: Rng;
}

const M = (m: number) => m * PX;

function speckle(p: Pen, n: number, light: string, dark: string) {
  const { g, W, H, rng } = p;
  for (let i = 0; i < n; i++) {
    g.fillStyle = rng() < 0.5 ? light : dark;
    const s = 1 + rng() * 2.5;
    g.fillRect(rng() * W, rng() * H, s, s);
  }
}

function cracks(p: Pen, n: number, color = 'rgba(8,4,24,0.55)') {
  const { g, W, H, rng } = p;
  g.strokeStyle = color; g.lineWidth = 1.5;
  for (let i = 0; i < n; i++) {
    let x = rng() * W, y = rng() * H, a = rng() * Math.PI * 2;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6 + rng() * 8; k++) { a += (rng() - 0.5) * 1.2; x += Math.cos(a) * 10; y += Math.sin(a) * 10; g.lineTo(x, y); }
    g.stroke();
  }
}

function stains(p: Pen, n: number, color: [number, number, number], alpha = 0.35) {
  const { g, W, H, rng } = p;
  for (let i = 0; i < n; i++) {
    const x = rng() * W, y = rng() * H, r = M(0.3 + rng() * 1.1);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${color.join(',')},${alpha})`); gr.addColorStop(1, `rgba(${color.join(',')},0)`);
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * (0.5 + rng() * 0.5), rng() * 3, 0, Math.PI * 2); g.fill();
  }
}

/** Puddles: blobs in the wet mask, slightly darker and bluer in the colour. */
function puddles(p: Pen, n: number, size = 1) {
  const { g, wg, W, H, rng } = p;
  for (let i = 0; i < n; i++) {
    const cx = rng() * W, cy = rng() * H, r = M(0.35 + rng() * 0.9) * size;
    for (let k = 0; k < 4; k++) {
      const x = cx + (rng() - 0.5) * r, y = cy + (rng() - 0.5) * r * 0.6, rr = r * (0.4 + rng() * 0.6);
      wg.fillStyle = '#ffffff'; wg.beginPath(); wg.ellipse(x, y, rr, rr * (0.45 + rng() * 0.3), rng() * 3, 0, Math.PI * 2); wg.fill();
      g.fillStyle = 'rgba(12,8,40,0.45)'; g.beginPath(); g.ellipse(x, y, rr, rr * 0.6, 0, 0, Math.PI * 2); g.fill();
    }
  }
}

/** A worn painted line (metres), dashed if `dash` > 0. */
function line(p: Pen, x0: number, y0: number, x1: number, y1: number, w: number, color: string, dash = 0, gap = 0) {
  const { g, rng } = p;
  g.save();
  g.strokeStyle = color; g.lineWidth = M(w); g.lineCap = 'butt';
  if (dash) g.setLineDash([M(dash), M(gap)]);
  g.globalAlpha = 0.85;
  g.beginPath(); g.moveTo(M(x0), M(y0)); g.lineTo(M(x1), M(y1)); g.stroke();
  // Wear: dark specks over the paint.
  g.setLineDash([]); g.globalAlpha = 1;
  g.fillStyle = 'rgba(30,26,50,0.6)';
  const len = Math.hypot(x1 - x0, y1 - y0);
  for (let i = 0; i < len * 14; i++) {
    const t = rng(), o = (rng() - 0.5) * w;
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    g.fillRect(M(x0 + (x1 - x0) * t + nx * o), M(y0 + (y1 - y0) * t + ny * o), 2, 2);
  }
  g.restore();
}

/** Zebra crossing: stripes across a band from (x0, y0) along a direction. */
function zebra(p: Pen, x: number, y: number, len: number, along: 'x' | 'y', width = 2.2) {
  for (let s = 0; s < len; s += 0.9) {
    if (along === 'x') line(p, x + s, y, x + s, y + width, 0.5, '#d8d4f0');
    else line(p, x, y + s, x + width, y + s, 0.5, '#d8d4f0');
  }
}

function paintText(p: Pen, text: string, x: number, y: number, size: number, rot: number, color = '#d8d4f0') {
  const { g } = p;
  g.save(); g.translate(M(x), M(y)); g.rotate(rot);
  g.font = `600 ${M(size)}px "Teko", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.globalAlpha = 0.75; g.fillStyle = color; g.fillText(text, 0, 0);
  g.restore();
}

function tiles(p: Pen, size: number, base: string, alt: string[], grout: string) {
  const { g, W, H, rng } = p;
  g.fillStyle = grout; g.fillRect(0, 0, W, H);
  const s = M(size);
  for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) {
    g.fillStyle = rng() < 0.75 ? base : alt[Math.floor(rng() * alt.length)];
    g.fillRect(x + 1.5, y + 1.5, s - 3, s - 3);
  }
}

/** The board's ground for a theme. `raised` cells (back edge) are pavement. */
export function paintGround(b: Board, theme: Theme, rng: Rng, CELL: number, raised: Set<string>): GroundPaint {
  const W = M(b.w * CELL), H = M(b.h * CELL);
  const { c, g } = canvas(W, H);
  const { c: wc, g: wg } = canvas(W, H);
  wg.fillStyle = '#000'; wg.fillRect(0, 0, W, H);
  const glowing = theme.ground === 'plaza' || theme.ground === 'checkpoint' || theme.ground === 'crossroad';
  const ec = glowing ? canvas(W, H) : null;
  if (ec) { ec.g.fillStyle = '#000'; ec.g.fillRect(0, 0, W, H); }
  const p: Pen = { g, wg, eg: ec?.g ?? null, W, H, cell: CELL, rng };
  const bw = b.w * CELL, bh = b.h * CELL;
  const asphalt = (col: string) => { g.fillStyle = col; g.fillRect(0, 0, W, H); speckle(p, W * H / 260, 'rgba(160,150,220,0.10)', 'rgba(8,4,24,0.22)'); };

  switch (theme.ground) {
    case 'avenue': {
      asphalt('#3a3654');
      // Patches of newer asphalt.
      for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(20,16,40,0.35)'; g.fillRect(M(rng() * bw), M(rng() * bh), M(1.5 + rng() * 3), M(1 + rng() * 2)); }
      const mid = bh / 2;
      line(p, 0, mid, bw, mid, 0.14, '#f5e663', 1.4, 1.1);
      line(p, 0, mid - 0.25, bw, mid - 0.25, 0.1, '#f5e663', 1.4, 1.1);
      line(p, 0, CELL * 1.25, bw, CELL * 1.25, 0.12, '#d8d4f0');
      line(p, 0, bh - CELL * 1.2, bw, bh - CELL * 1.2, 0.12, '#d8d4f0');
      zebra(p, CELL * 6.2, CELL * 1.3, 2.4, 'x', bh - CELL * 2.6);
      paintText(p, 'BUS', CELL * 11.5, bh - CELL * 2, 1.1, -Math.PI / 2);
      paintText(p, 'TAXI', CELL * 2.5, CELL * 2, 1.0, Math.PI / 2, '#f5e663');
      cracks(p, 14); stains(p, 10, [10, 6, 30]); puddles(p, 9);
      break;
    }
    case 'alley': {
      asphalt('#3c3650');
      for (let i = 0; i < 12; i++) { g.fillStyle = rng() < 0.5 ? 'rgba(80,70,110,0.35)' : 'rgba(10,6,28,0.4)'; g.fillRect(M(rng() * bw), M(rng() * bh), M(0.8 + rng() * 2.5), M(0.6 + rng() * 2)); }
      // Drain channel down the middle.
      g.fillStyle = '#1c1830'; g.fillRect(M(bw * 0.45), 0, M(0.35), H);
      g.fillStyle = '#4a4466'; for (let y = 0; y < H; y += M(0.25)) g.fillRect(M(bw * 0.45), y, M(0.35), M(0.06));
      cracks(p, 30); stains(p, 18, [6, 4, 20], 0.5); stains(p, 6, [40, 60, 20], 0.25);
      // Paper scraps.
      for (let i = 0; i < 40; i++) { g.save(); g.translate(rng() * W, rng() * H); g.rotate(rng() * 6); g.fillStyle = ['#b8b0d0', '#d0c090', '#8a8aa8'][i % 3]; g.globalAlpha = 0.7; g.fillRect(0, 0, 6 + rng() * 8, 4 + rng() * 6); g.restore(); }
      for (let i = 0; i < 3; i++) graffiti(g, rng, rng() * W, rng() * H, M(2.4));
      puddles(p, 14, 1.2);
      break;
    }
    case 'market': {
      tiles(p, 0.5, '#5a4a5a', ['#6a5462', '#4e4258', '#6e5a50'], '#2e2638');
      speckle(p, W * H / 400, 'rgba(255,220,180,0.06)', 'rgba(8,4,24,0.2)');
      // Painted stall zones.
      for (const [x, y] of [[1.6, 2.6], [5.6, 2.6], [8.6, 2.6], [1.6, 7.6], [4.6, 7.6], [8.6, 7.6]]) {
        g.save(); g.strokeStyle = '#f5e663'; g.globalAlpha = 0.55; g.lineWidth = M(0.08); g.setLineDash([M(0.3), M(0.2)]);
        g.strokeRect(M(x * CELL), M(y * CELL), M(CELL * 2.8), M(CELL * 1.8)); g.restore();
      }
      // Fallen leaves and peel.
      for (let i = 0; i < 60; i++) { g.fillStyle = ['#ff8c2a', '#39ff88', '#f5e663', '#c04a3a'][i % 4]; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(rng() * W, rng() * H, 3, 5, rng() * 3, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
      stains(p, 10, [10, 6, 30]); puddles(p, 6);
      break;
    }
    case 'crossroad': {
      asphalt('#383452');
      const c0 = 3 * CELL, c1 = 10 * CELL;
      // Kerb corners: the void corners are not drawn; lane lines on the arms.
      line(p, bw / 2, 0, bw / 2, c0 - 0.6, 0.12, '#f5e663', 1, 0.8);
      line(p, bw / 2, c1 + 0.6, bw / 2, bh, 0.12, '#f5e663', 1, 0.8);
      line(p, 0, bh / 2, c0 - 0.6, bh / 2, 0.12, '#f5e663', 1, 0.8);
      line(p, c1 + 0.6, bh / 2, bw, bh / 2, 0.12, '#f5e663', 1, 0.8);
      zebra(p, c0, c0 - 2.6, c1 - c0, 'x', 2.2);
      zebra(p, c0, c1 + 0.4, c1 - c0, 'x', 2.2);
      zebra(p, c0 - 2.6, c0, c1 - c0, 'y', 2.2);
      zebra(p, c1 + 0.4, c0, c1 - c0, 'y', 2.2);
      // Yellow box junction.
      g.save(); g.strokeStyle = '#f5e663'; g.globalAlpha = 0.7; g.lineWidth = M(0.1);
      g.strokeRect(M(c0 + 0.6), M(c0 + 0.6), M(c1 - c0 - 1.2), M(c1 - c0 - 1.2));
      g.beginPath();
      for (let k = -c1; k < c1; k += 1.4) { g.moveTo(M(c0 + 0.6 + Math.max(0, k)), M(c0 + 0.6 + Math.max(0, -k))); g.lineTo(M(Math.min(c1 - 0.6, c1 - 0.6 + k)), M(Math.min(c1 - 0.6, c1 - 0.6 - k))); }
      g.globalAlpha = 0.35; g.stroke(); g.restore();
      if (p.eg) { const e = p.eg; e.strokeStyle = '#00c8ff'; e.lineWidth = M(0.06); e.beginPath(); e.arc(M(bw / 2), M(bh / 2), M(2.6), 0, Math.PI * 2); e.stroke(); }
      cracks(p, 12); stains(p, 12, [10, 6, 30]); puddles(p, 8);
      break;
    }
    case 'parking': {
      g.fillStyle = '#4c4a62'; g.fillRect(0, 0, W, H);
      speckle(p, W * H / 300, 'rgba(200,200,255,0.07)', 'rgba(8,4,24,0.18)');
      // Concrete slabs.
      g.fillStyle = 'rgba(10,6,30,0.4)'; for (let x = 0; x < W; x += M(4.5)) g.fillRect(x, 0, 2, H); for (let y = 0; y < H; y += M(4.5)) g.fillRect(0, y, W, 2);
      // Bays: rows along y = 1 and y = 10 (the cars), and middle rows.
      for (const row of [[0.2, 3.0], [4.2, 7.0], [8.6, 11.6]]) for (let x = 0; x <= b.w; x += 2) line(p, x * CELL, row[0] * CELL, x * CELL, row[1] * CELL, 0.1, '#e8e4ff');
      for (let x = 0, n = 1; x < b.w; x += 2, n++) paintText(p, `${String(n).padStart(2, '0')}`, (x + 1) * CELL, 2.6 * CELL, 0.9, 0, '#e8e4ff');
      line(p, 0, 3.6 * CELL, bw, 3.6 * CELL, 0.14, '#f5e663', 1.2, 0.8);
      line(p, 0, 8.1 * CELL, bw, 8.1 * CELL, 0.14, '#f5e663', 1.2, 0.8);
      paintText(p, '→ SORTIE', bw * 0.6, 5.85 * CELL, 1.0, 0, '#f5e663');
      stains(p, 16, [6, 4, 20], 0.55); puddles(p, 4, 0.8);
      break;
    }
    case 'plaza': {
      g.fillStyle = '#2e2a44'; g.fillRect(0, 0, W, H);
      const cx = bw / 2, cy = bh / 2;
      // Concentric rings of stone.
      for (let r = 0.75; r < Math.max(bw, bh); r += 0.75) {
        const n = Math.max(6, Math.round(2 * Math.PI * r / 0.9));
        for (let k = 0; k < n; k++) {
          const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
          g.fillStyle = rng() < 0.8 ? '#5c5678' : rng() < 0.5 ? '#6a6488' : '#4e4a6a';
          g.beginPath(); g.arc(M(cx), M(cy), M(r - 0.04), a0 + 0.01, a1 - 0.01); g.arc(M(cx), M(cy), M(r - 0.71), a1 - 0.01, a0 + 0.01, true); g.closePath(); g.fill();
        }
      }
      speckle(p, W * H / 400, 'rgba(255,255,255,0.05)', 'rgba(8,4,24,0.15)');
      if (p.eg) {
        const e = p.eg;
        for (const [r, col] of [[3.0, '#b84dff'], [6.0, '#00f0ff'], [8.6, '#b84dff']] as [number, string][]) {
          e.strokeStyle = col; e.lineWidth = M(0.07); e.beginPath(); e.arc(M(cx), M(cy), M(r), 0, Math.PI * 2); e.stroke();
          g.strokeStyle = col; g.lineWidth = M(0.07); g.beginPath(); g.arc(M(cx), M(cy), M(r), 0, Math.PI * 2); g.stroke();
        }
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; e.strokeStyle = '#00f0ff'; e.lineWidth = M(0.05); e.beginPath(); e.moveTo(M(cx + Math.cos(a) * 3), M(cy + Math.sin(a) * 3)); e.lineTo(M(cx + Math.cos(a) * 6), M(cy + Math.sin(a) * 6)); e.stroke(); }
      }
      stains(p, 6, [10, 6, 30]); puddles(p, 7);
      break;
    }
    case 'docks': {
      g.fillStyle = '#46465a'; g.fillRect(0, 0, W, H);
      speckle(p, W * H / 260, 'rgba(200,200,255,0.07)', 'rgba(8,4,24,0.2)');
      g.fillStyle = 'rgba(10,6,30,0.45)'; for (let x = 0; x < W; x += M(3)) g.fillRect(x, 0, 3, H); for (let y = 0; y < H; y += M(3)) g.fillRect(0, y, W, 3);
      // Rails, quay edge, a hatched loading area.
      for (const y of [4.6, 5.6]) { g.fillStyle = '#22203a'; g.fillRect(0, M(y * CELL) - 4, W, 8); g.fillStyle = '#8a88a8'; g.fillRect(0, M(y * CELL) - 2, W, 3); }
      g.fillStyle = '#2a2640'; for (let x = 0; x < W; x += M(0.6)) g.fillRect(x, M(4.6 * CELL) - 6, M(0.18), M(CELL) + 12);
      for (const y of [4.6, 5.6]) { g.fillStyle = '#9a98b8'; g.fillRect(0, M(y * CELL) - 2, W, 3); }
      line(p, 0, 10.85 * CELL, bw, 10.85 * CELL, 0.25, '#f5e663');
      for (let x = 0.2; x < bw; x += 0.8) line(p, x, 10.85 * CELL + 0.25, x + 0.4, 10.85 * CELL + 0.25, 0.12, '#1a1430');
      paintText(p, 'QUAI 7', CELL * 3, CELL * 8.8, 1.6, 0, '#f5e663');
      stains(p, 14, [40, 20, 10], 0.3); stains(p, 10, [6, 4, 20], 0.5); cracks(p, 10); puddles(p, 10);
      break;
    }
    case 'checkpoint': {
      g.fillStyle = '#44425a'; g.fillRect(0, 0, W, H);
      speckle(p, W * H / 260, 'rgba(200,200,255,0.07)', 'rgba(8,4,24,0.2)');
      g.fillStyle = 'rgba(10,6,30,0.45)'; for (let x = 0; x < W; x += M(3)) g.fillRect(x, 0, 3, H); for (let y = 0; y < H; y += M(3)) g.fillRect(0, y, W, 3);
      const cx = bw / 2, cy = bh / 2;
      // Hazard band around the centre, stop lines, a big STOP.
      g.save(); g.translate(M(cx), M(cy)); g.rotate(Math.PI / 4);
      for (let k = -7; k < 7; k++) { g.fillStyle = k % 2 ? '#f5e663' : '#1a1430'; g.globalAlpha = 0.65; g.fillRect(M(k * 0.6), M(-5.2), M(0.6), M(0.35)); g.fillRect(M(k * 0.6), M(4.85), M(0.6), M(0.35)); }
      g.restore();
      paintText(p, 'STOP', cx, cy - 4.2, 1.8, 0, '#ff2a6d');
      paintText(p, 'CONTRÔLE PSY-SEC', cx, cy + 4.6, 0.9, 0, '#e8e4ff');
      line(p, cx - 4, cy + 3.4, cx + 4, cy + 3.4, 0.3, '#e8e4ff');
      if (p.eg) {
        const e = p.eg;
        e.fillStyle = '#ff2a6d'; e.fillRect(0, M(cy) - 2, W, 4); e.fillRect(M(cx) - 2, 0, 4, H);
        g.fillStyle = '#ff2a6d'; g.fillRect(0, M(cy) - 2, W, 4); g.fillRect(M(cx) - 2, 0, 4, H);
      }
      stains(p, 10, [6, 4, 20], 0.5); cracks(p, 10); puddles(p, 8);
      break;
    }
  }
  // Pavement on the raised back cells, with a bright kerb line at its edge.
  for (const k of raised) {
    const [x, y] = k.split(',').map(Number);
    const x0 = M(x * CELL), y0 = M(y * CELL), s = M(CELL);
    g.fillStyle = '#2c2840'; g.fillRect(x0, y0, s, s);
    for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) { g.fillStyle = rng() < 0.85 ? '#5e5878' : '#6c6688'; g.fillRect(x0 + tx * s / 3 + 1.5, y0 + ty * s / 3 + 1.5, s / 3 - 3, s / 3 - 3); }
    const open = (dx: number, dy: number) => !raised.has(`${x + dx},${y + dy}`) && x + dx >= 0 && y + dy >= 0 && x + dx < b.w && y + dy < b.h && b.cells[(y + dy) * b.w + x + dx] !== 'void';
    g.fillStyle = '#8a86aa';
    if (open(1, 0)) g.fillRect(x0 + s - 5, y0, 5, s);
    if (open(0, 1)) g.fillRect(x0, y0 + s - 5, s, 5);
    if (open(-1, 0)) g.fillRect(x0, y0, 5, s);
    if (open(0, -1)) g.fillRect(x0, y0, s, 5);
  }
  // Wet everywhere a little; the mask is blurred a bit for soft edges.
  const blur = canvas(W, H);
  blur.g.filter = 'blur(3px)';
  blur.g.drawImage(wc, 0, 0);
  blur.g.filter = 'none';
  blur.g.globalCompositeOperation = 'lighter';
  blur.g.fillStyle = `rgba(255,255,255,${0.12 * theme.wet})`; blur.g.fillRect(0, 0, W, H);
  const map = tex(c);
  const wet = new THREE.CanvasTexture(blur.c);
  return { map, wet, glow: ec ? tex(ec.c) : null };
}

/** Ground around the board: pavements under and between the buildings, the road going on. */
export function paintOuter(theme: Theme, rng: Rng, size: number) {
  const S = 1024;
  const { c, g } = canvas(S, S);
  const base = theme.ground === 'plaza' ? '#4a4664' : theme.ground === 'market' ? '#4a3e50' : theme.ground === 'parking' ? '#3a3850' : '#34304a';
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  const px = S / size;
  // Pavement tiles everywhere, darker further away.
  g.fillStyle = 'rgba(10,6,30,0.35)';
  for (let x = 0; x < S; x += px * 1.5) g.fillRect(x, 0, 1.5, S);
  for (let y = 0; y < S; y += px * 1.5) g.fillRect(0, y, S, 1.5);
  for (let i = 0; i < S * S / 300; i++) { g.fillStyle = rng() < 0.5 ? 'rgba(160,150,220,0.08)' : 'rgba(8,4,24,0.2)'; g.fillRect(rng() * S, rng() * S, 2, 2); }
  void css;
  return tex(c);
}
