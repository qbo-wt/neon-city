import * as THREE from 'three';

/**
 * Hand-painted canvas textures for the interiors: floors, wall finishes, neon lettering, light
 * pools, posters. Canvas textures are kept as drawn by the stylise pass (it only averages photo
 * textures), so these stay crisp and flat-coloured like an anime background.
 */
export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.userData.keepTexture = true;
  return t;
}

/** Seeded random, so a room looks the same every visit. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

const cache = new Map<string, THREE.Texture>();
const once = (key: string, make: () => THREE.Texture) => { let t = cache.get(key); if (!t) { t = make(); cache.set(key, t); } return t; };

/** Soft round spot, white: tinted by the material (light pools, halos, steam). */
export const radial = (soft = 0.5) => once(`radial${soft}`, () => canvasTex(128, 128, (c) => {
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(soft, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
}));

/** A puff of steam / smoke: lumpy soft blob. */
export const puff = () => once('puff', () => canvasTex(64, 64, (c) => {
  const r = rng(7);
  for (let i = 0; i < 7; i++) {
    const x = 20 + r() * 24, y = 20 + r() * 24, rad = 10 + r() * 12;
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  }
}));

/** Vertical fade, white at the top: light cones, beams. */
export const beam = () => once('beam', () => canvasTex(16, 128, (c) => {
  const g = c.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.6, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 16, 128);
}));

// ---------------------------------------------------------------- floors (1 texture = 2 m × 2 m)

export const woodFloor = () => once('wood', () => canvasTex(512, 512, (c) => {
  const r = rng(11);
  c.fillStyle = '#3b2238'; c.fillRect(0, 0, 512, 512);
  const plankH = 64;
  for (let y = 0; y < 512; y += plankH) {
    let x = -Math.floor(r() * 200);
    while (x < 512) {
      const len = 180 + r() * 160, l = 21 + r() * 8;
      c.fillStyle = `hsl(${325 + r() * 14}, ${26 + r() * 10}%, ${l}%)`;
      c.fillRect(x + 2, y + 2, len - 4, plankH - 4);
      // grain
      c.strokeStyle = 'rgba(30,10,30,0.25)'; c.lineWidth = 2;
      for (let k = 0; k < 3; k++) { const gy = y + 10 + r() * (plankH - 20); c.beginPath(); c.moveTo(x + 8, gy); c.bezierCurveTo(x + len * 0.3, gy + 4, x + len * 0.6, gy - 4, x + len - 8, gy); c.stroke(); }
      c.fillStyle = 'rgba(255,220,255,0.08)'; c.fillRect(x + 2, y + 2, len - 4, 5);
      x += len;
    }
  }
}, true));

export const tileFloor = (a: string, b: string, grout: string, grime = 0.25, seed = 3) => once(`tile${a}${b}${grout}${grime}`, () => canvasTex(512, 512, (c) => {
  const r = rng(seed);
  c.fillStyle = grout; c.fillRect(0, 0, 512, 512);
  const n = 8, s = 512 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    c.fillStyle = (x + y) % 2 ? a : b;
    c.fillRect(x * s + 3, y * s + 3, s - 6, s - 6);
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x * s + 3, y * s + 3, s - 6, 6);
    if (r() < 0.12) { c.strokeStyle = 'rgba(20,10,30,0.35)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x * s + r() * s, y * s + 4); c.lineTo(x * s + r() * s, y * s + s - 4); c.stroke(); }
  }
  // Grime in patches.
  for (let i = 0; i < 26 * grime * 4; i++) {
    const x = r() * 512, y = r() * 512, rad = 20 + r() * 70;
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(30,20,40,${0.25 * grime + 0.1})`); g.addColorStop(1, 'rgba(30,20,40,0)');
    c.fillStyle = g; c.fillRect(0, 0, 512, 512);
  }
}, true));

export const concreteFloor = (base: string, seed = 5) => once(`concrete${base}`, () => canvasTex(512, 512, (c) => {
  const r = rng(seed);
  c.fillStyle = base; c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++) {
    const x = r() * 512, y = r() * 512, rad = 10 + r() * 60;
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() < 0.6;
    g.addColorStop(0, dark ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 512, 512);
  }
  // Slab joints and cracks.
  c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 3;
  c.strokeRect(0, 0, 512, 512); c.beginPath(); c.moveTo(256, 0); c.lineTo(256, 512); c.moveTo(0, 256); c.lineTo(512, 256); c.stroke();
  c.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) { let x = r() * 512, y = r() * 512; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; c.lineTo(x, y); } c.stroke(); }
}, true));

export const linoFloor = () => once('lino', () => canvasTex(512, 512, (c) => {
  const r = rng(21);
  c.fillStyle = '#2a2440'; c.fillRect(0, 0, 512, 512);
  const n = 4, s = 512 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    c.fillStyle = `hsl(${250 + r() * 12}, 20%, ${17 + r() * 5}%)`;
    c.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
  }
  for (let i = 0; i < 60; i++) {
    const x = r() * 512, y = r() * 512, rad = 8 + r() * 50;
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(10,5,20,0.3)'); g.addColorStop(1, 'rgba(10,5,20,0)');
    c.fillStyle = g; c.fillRect(0, 0, 512, 512);
  }
  // Scuffs and chewing gum.
  for (let i = 0; i < 40; i++) { c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.3)' : 'rgba(200,180,255,0.08)'; c.fillRect(r() * 512, r() * 512, 2 + r() * 10, 2 + r() * 3); }
}, true));

// ---------------------------------------------------------------- walls (1 texture = 2 m wide × 4 m tall)

export function wallTex(kind: 'plaster' | 'panel' | 'tile' | 'concrete', base: string, accent: string, seed = 9) {
  return once(`wall${kind}${base}${accent}`, () => canvasTex(256, 512, (c) => {
    const r = rng(seed);
    c.fillStyle = base; c.fillRect(0, 0, 256, 512);
    if (kind === 'panel') {
      for (let y = 0; y < 512; y += 128) for (let x = 0; x < 256; x += 128) {
        c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(x, y, 128, 3); c.fillRect(x, y, 3, 128);
        c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(x + 3, y + 3, 125, 3);
        for (const [rx, ry] of [[8, 8], [116, 8], [8, 116], [116, 116]]) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x + rx, y + ry, 4, 4); }
      }
    } else if (kind === 'tile') {
      for (let y = 0; y < 512; y += 32) for (let x = 0; x < 256; x += 32) {
        c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x, y, 32, 2); c.fillRect(x, y, 2, 32);
        if (r() < 0.06) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x + 2, y + 2, 30, 30); }
      }
    } else if (kind === 'concrete') {
      for (let y = 0; y < 512; y += 64) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, y, 256, 3); for (let x = (y / 64) % 2 ? 0 : 64; x < 256; x += 128) c.fillRect(x, y, 3, 64); }
    }
    for (let i = 0; i < 40; i++) {
      const x = r() * 256, y = r() * 512, rad = 10 + r() * 50;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(0,0,0,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, 256, 512);
    }
    // Dirt running down from the top, darker near the floor.
    const g = c.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.3, 'rgba(0,0,0,0)'); g.addColorStop(0.85, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 512);
    c.fillStyle = accent; c.globalAlpha = 0.9; c.fillRect(0, 500, 256, 12); c.globalAlpha = 1;
  }, true));
}

// ---------------------------------------------------------------- lettering

export const FONT_TITLE = '"Teko", "Arial Narrow", sans-serif';
export const FONT_UI = '"Chakra Petch", "Segoe UI", sans-serif';

/**
 * Neon lettering on a transparent canvas: a wide glow, the tube colour, a white-hot core.
 * Returns the texture and its aspect (width / height).
 */
export function neonText(text: string, color: number, o: { font?: string; weight?: number; px?: number; frame?: boolean; sub?: string } = {}) {
  const px = o.px ?? 120, font = `${o.weight ?? 600} ${px}px ${o.font ?? FONT_TITLE}`;
  const meas = document.createElement('canvas').getContext('2d')!;
  meas.font = font;
  const tw = Math.ceil(meas.measureText(text).width);
  const pad = Math.round(px * 0.45), subH = o.sub ? Math.round(px * 0.42) : 0;
  const w = tw + pad * 2, h = Math.round(px * 1.15) + pad + subH;
  const col = hex(color);
  const t = canvasTex(w, h, (c) => {
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const cy = pad / 2 + px * 0.62;
    if (o.frame) {
      c.strokeStyle = col; c.lineWidth = px * 0.07; c.shadowColor = col; c.shadowBlur = px * 0.3;
      const r = px * 0.18;
      c.beginPath(); c.roundRect(px * 0.12, px * 0.1, w - px * 0.24, h - px * 0.2, r); c.stroke();
    }
    c.font = font;
    c.shadowColor = col; c.shadowBlur = px * 0.35; c.fillStyle = col;
    c.fillText(text, w / 2, cy); c.fillText(text, w / 2, cy);
    c.shadowBlur = px * 0.08; c.fillStyle = mix(col, '#ffffff', 0.65);
    c.fillText(text, w / 2, cy);
    if (o.sub) {
      c.font = `600 ${Math.round(px * 0.3)}px ${FONT_UI}`; c.shadowBlur = px * 0.15; c.fillStyle = col;
      c.fillText(o.sub, w / 2, h - pad / 2 - subH / 2);
    }
  });
  return { tex: t, aspect: w / h };
}

/** Printed (non-glowing) label: name plates, posters. */
export function plateText(text: string, fg: string, bg: string, o: { px?: number; font?: string; w?: number } = {}) {
  const px = o.px ?? 48;
  const meas = document.createElement('canvas').getContext('2d')!;
  meas.font = `600 ${px}px ${o.font ?? FONT_UI}`;
  const w = o.w ?? Math.ceil(meas.measureText(text).width) + px, h = Math.round(px * 1.5);
  const t = canvasTex(w, h, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.strokeStyle = fg; c.globalAlpha = 0.6; c.lineWidth = 3; c.strokeRect(3, 3, w - 6, h - 6); c.globalAlpha = 1;
    c.font = `600 ${px}px ${o.font ?? FONT_UI}`; c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + px * 0.05);
  });
  return { tex: t, aspect: w / h };
}

export function mix(a: string, b: string, k: number) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return '#' + ca.lerp(cb, k).getHexString();
}

/** A gig poster / advert: big shape, title, small print. */
export function poster(seed: number, title: string, colors: [string, string, string]) {
  const r = rng(seed);
  return canvasTex(128, 180, (c) => {
    const [bg, a, b] = colors;
    c.fillStyle = bg; c.fillRect(0, 0, 128, 180);
    const kind = Math.floor(r() * 3);
    if (kind === 0) { c.fillStyle = a; c.beginPath(); c.arc(64, 70, 42, 0, Math.PI * 2); c.fill(); c.fillStyle = bg; c.fillRect(0, 60 + r() * 20, 128, 6); c.fillRect(0, 80 + r() * 10, 128, 3); }
    else if (kind === 1) { for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? a : b; c.beginPath(); c.moveTo(0, 20 + i * 18); c.lineTo(128, 0 + i * 22); c.lineTo(128, 10 + i * 22); c.lineTo(0, 30 + i * 18); c.fill(); } }
    else { c.fillStyle = a; c.fillRect(14, 20, 100, 100); c.fillStyle = b; c.beginPath(); c.moveTo(64, 30); c.lineTo(104, 110); c.lineTo(24, 110); c.fill(); }
    c.fillStyle = '#f4f0ff'; c.font = `600 34px ${FONT_TITLE}`; c.textAlign = 'center';
    c.fillText(title, 64, 152);
    c.fillStyle = b; c.font = `500 10px ${FONT_UI}`;
    c.fillText('NEON CITY · 23H · ENTRÉE LIBRE', 64, 168);
    // Torn, taped corners.
    c.fillStyle = 'rgba(240,230,200,0.6)'; c.fillRect(0, 0, 18, 8); c.fillRect(110, 172, 18, 8);
  });
}
