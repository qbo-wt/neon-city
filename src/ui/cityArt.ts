import Phaser from 'phaser';
import { CONFIG } from '../config';
import { createRng, type Rng } from '../core/rng';

/**
 * Procedural night skyline for the loading screen and the menus, painted once into canvases at
 * screen resolution (1 texel = 1 pixel at 1080p): sky with a huge moon in halftone, three layers of
 * towers with lit windows, neon signs and billboards. No image files, no 3D.
 */
const Z = CONFIG.ZOOM;
export const CITY_W = 2048;

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

const pickOf = <T>(r: Rng, a: readonly T[]) => a[Math.floor(r() * a.length)];
const between = (r: Rng, a: number, b: number) => a + r() * (b - a);

/** Draws `fn` at x and, if it crosses the right edge, again one tile to the left (seamless loop). */
function wrap(x: number, w: number, fn: (x: number) => void) {
  fn(x);
  if (x + w > CITY_W) fn(x - CITY_W);
  if (x < 0) fn(x + CITY_W);
}

function sky(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#05030f');
  g.addColorStop(0.35, '#100a30');
  g.addColorStop(0.62, '#2a0f52');
  g.addColorStop(0.78, '#4a1460');
  g.addColorStop(0.9, '#1a0b35');
  g.addColorStop(1, '#07041a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const r = createRng(77);
  // Stars, thinning toward the horizon glow.
  for (let i = 0; i < 260; i++) {
    const y = Math.pow(r(), 1.6) * h * 0.55;
    ctx.fillStyle = `rgba(232,232,255,${(0.15 + r() * 0.5) * (1 - y / (h * 0.6))})`;
    const s = r() < 0.08 ? 3 : r() < 0.4 ? 2 : 1;
    ctx.fillRect(r() * w, y, s, s);
  }
  // The moon: a big pale disc, halftone shading on its lower left, a magenta halo.
  const mx = w * 0.74, my = h * 0.4, mr = h * 0.24;
  const halo = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 2.6);
  halo.addColorStop(0, 'rgba(255,42,109,0.35)');
  halo.addColorStop(0.4, 'rgba(184,77,255,0.12)');
  halo.addColorStop(1, 'rgba(184,77,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  const disc = ctx.createLinearGradient(mx, my - mr, mx, my + mr);
  disc.addColorStop(0, '#fff1d6');
  disc.addColorStop(0.55, '#ffc2e0');
  disc.addColorStop(1, '#ff7aa8');
  ctx.save();
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = disc;
  ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
  // Halftone shadow: dots growing toward the lower left.
  ctx.fillStyle = 'rgba(184,40,120,0.55)';
  const step = 11;
  for (let y = my - mr; y < my + mr; y += step) for (let x = mx - mr; x < mx + mr; x += step) {
    const ox = ((y - my) / step) % 2 ? step / 2 : 0;
    const dx = (x + ox - mx) / mr, dy = (y - my) / mr;
    const k = Phaser.Math.Clamp((-dx * 0.7 + dy * 0.7 + 0.15) * 1.3, 0, 1);
    if (k <= 0.05) continue;
    ctx.beginPath(); ctx.arc(x + ox, y, k * step * 0.55, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(mx, my, mr, Math.PI * 1.1, Math.PI * 1.75); ctx.stroke();
  // Soft cloud bands drifting across its lower half, fading at both ends.
  for (let i = 0; i < 4; i++) {
    const y = my + mr * (0.05 + i * 0.24), x = mx - mr * (1.9 - r() * 0.6), len = mr * (2.6 + r() * 1.4), th = 14 + r() * 26;
    const cg = ctx.createLinearGradient(x, 0, x + len, 0);
    const col = i % 2 ? '26,11,53' : '48,16,88';
    cg.addColorStop(0, `rgba(${col},0)`); cg.addColorStop(0.3, `rgba(${col},0.85)`); cg.addColorStop(0.75, `rgba(${col},0.85)`); cg.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.roundRect(x, y, len, th, th / 2); ctx.fill();
  }
  // Searchlights sweeping up from the city.
  for (const [bx, ang, col] of [[w * 0.18, -1.32, '0,240,255'], [w * 0.5, -1.86, '255,42,109'], [w * 0.9, -1.6, '0,240,255']] as const) {
    const len = h * 1.1, sp = 0.05;
    const gr = ctx.createLinearGradient(bx, h, bx + Math.cos(ang) * len, h + Math.sin(ang) * len);
    gr.addColorStop(0, `rgba(${col},0.16)`); gr.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(bx, h * 0.92);
    ctx.lineTo(bx + Math.cos(ang - sp) * len, h + Math.sin(ang - sp) * len);
    ctx.lineTo(bx + Math.cos(ang + sp) * len, h + Math.sin(ang + sp) * len);
    ctx.closePath(); ctx.fill();
  }
}

const SIGNS = ['RAMEN', 'HÔTEL', 'BAR', 'CLUB', 'CHROME', 'PHARMA', 'OUVERT', '24/24', 'NÉON', 'KARAOKÉ', 'SUSHI', 'CLINIQUE'];
const NEON = ['#00f0ff', '#ff2a6d', '#f5e663', '#b84dff', '#39ff88', '#ff8c2a'];

function glowText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, col: string) {
  ctx.font = `600 ${size}px Teko, "Arial Narrow", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = col; ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = col; ctx.fillText(s, x, y);
  ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillText(s, x, y);
}

function windows(ctx: CanvasRenderingContext2D, r: Rng, x: number, top: number, w: number, bottom: number, cw: number, ch: number, gap: number, lit: number, palette: string[]) {
  for (let y = top + gap * 2; y < bottom - ch; y += ch + gap) {
    const rowLit = r() < 0.15 ? 0 : lit * (0.5 + r());
    for (let xx = x + gap * 1.5; xx < x + w - cw - gap; xx += cw + gap) {
      if (r() > rowLit) continue;
      ctx.fillStyle = pickOf(r, palette);
      ctx.fillRect(xx, y, cw, ch);
    }
  }
}

function farLayer(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const r = createRng(11);
  for (let x = -40; x < w; x += between(r, 40, 120)) {
    const bw = between(r, 60, 170), bh = between(r, h * 0.35, h * 0.95);
    wrap(x, bw, xx => {
      ctx.fillStyle = '#25174f';
      ctx.fillRect(xx, h - bh, bw, bh);
      ctx.fillStyle = '#2f1d60';
      ctx.fillRect(xx, h - bh, bw * 0.12, bh);
      windows(ctx, createRng(Math.floor(x * 7)), xx, h - bh, bw, h, 3, 5, 6, 0.18, ['rgba(160,140,230,0.45)', 'rgba(0,240,255,0.35)', 'rgba(255,42,109,0.35)']);
    });
    if (r() < 0.35) {
      const ax = x + bw * between(r, 0.3, 0.7), ah = between(r, 30, 90);
      wrap(ax, 2, xx => {
        ctx.fillStyle = '#25174f'; ctx.fillRect(xx, h - bh - ah, 3, ah);
        ctx.fillStyle = '#ff3b3b'; ctx.fillRect(xx - 1, h - bh - ah - 3, 5, 5);
      });
    }
  }
  // Haze over the base of the far towers, glowing with the city below.
  const haze = ctx.createLinearGradient(0, h * 0.35, 0, h);
  haze.addColorStop(0, 'rgba(74,20,96,0)');
  haze.addColorStop(1, 'rgba(110,30,120,0.75)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, w, h);
}

function midLayer(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const r = createRng(23);
  const lit = ['rgba(245,230,99,0.75)', 'rgba(245,230,99,0.5)', 'rgba(0,240,255,0.6)', 'rgba(255,42,109,0.55)', 'rgba(232,232,255,0.4)', 'rgba(184,77,255,0.5)'];
  for (let x = -60; x < w; x += between(r, 110, 210)) {
    const bw = between(r, 100, 230), bh = between(r, h * 0.4, h * 0.92), top = h - bh;
    const seed = Math.floor(r() * 1e6);
    const bill = r() < 0.3, band = r() < 0.45, tank = r() < 0.4, sign = pickOf(r, SIGNS), col = pickOf(r, NEON);
    wrap(x, bw, xx => {
      const rr = createRng(seed);
      ctx.fillStyle = '#150d36';
      ctx.fillRect(xx, top, bw, bh);
      // Rim light on the left edge, darker right face.
      ctx.fillStyle = '#2c1b62'; ctx.fillRect(xx, top, 3, bh);
      ctx.fillStyle = '#0f0928'; ctx.fillRect(xx + bw * 0.72, top, bw * 0.28, bh);
      windows(ctx, rr, xx, top, bw, h, 6, 9, 7, 0.28, lit);
      if (tank) {
        ctx.fillStyle = '#150d36';
        ctx.fillRect(xx + bw * 0.2, top - 34, 40, 26);
        ctx.fillRect(xx + bw * 0.2 + 4, top - 8, 3, 8); ctx.fillRect(xx + bw * 0.2 + 33, top - 8, 3, 8);
      }
      if (band) {
        ctx.shadowColor = col; ctx.shadowBlur = 14;
        ctx.fillStyle = col; ctx.fillRect(xx + 4, top + 10, bw - 8, 3);
        ctx.shadowBlur = 0;
      }
      if (bill) {
        const bx = xx + bw * 0.12, by = top + bh * 0.18, bW = bw * 0.76, bH = Math.min(90, bW * 0.45);
        const gr = ctx.createLinearGradient(bx, by, bx + bW, by + bH);
        gr.addColorStop(0, '#2a0c3a'); gr.addColorStop(1, '#4a0f40');
        ctx.fillStyle = gr; ctx.fillRect(bx, by, bW, bH);
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.shadowColor = col; ctx.shadowBlur = 16;
        ctx.strokeRect(bx, by, bW, bH); ctx.shadowBlur = 0;
        glowText(ctx, sign, bx + bW / 2, by + bH / 2 + 4, Math.min(bH * 0.8, bW / (sign.length * 0.5)), col);
      }
    });
  }
}

function nearLayer(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const r = createRng(41);
  const roofs: [number, number][] = [];
  for (let x = -80; x < w; x += between(r, 170, 300)) {
    const bw = between(r, 150, 290), bh = between(r, h * 0.3, h * 0.85), top = h - bh;
    const seed = Math.floor(r() * 1e6), col = pickOf(r, NEON), sign = pickOf(r, SIGNS), vert = r() < 0.6;
    roofs.push([x + bw * 0.5, top]);
    wrap(x, bw, xx => {
      const rr = createRng(seed);
      ctx.fillStyle = '#0a0620';
      ctx.fillRect(xx, top, bw, bh);
      // Magenta rim light down the left edge, the roof line catching cyan.
      const rim = ctx.createLinearGradient(xx, 0, xx + 10, 0);
      rim.addColorStop(0, 'rgba(255,42,109,0.55)'); rim.addColorStop(1, 'rgba(255,42,109,0)');
      ctx.fillStyle = rim; ctx.fillRect(xx, top, 10, bh);
      ctx.fillStyle = 'rgba(0,240,255,0.35)'; ctx.fillRect(xx, top, bw, 2);
      windows(ctx, rr, xx, top + 20, bw * 0.9, h, 10, 6, 14, 0.12, ['rgba(245,230,99,0.45)', 'rgba(0,240,255,0.35)', 'rgba(255,140,42,0.4)']);
      // AC units and pipes.
      for (let i = 0; i < 3; i++) { ctx.fillStyle = '#120b30'; ctx.fillRect(xx + rr() * (bw - 30), top + 30 + rr() * (bh - 60), 26, 16); }
      if (vert) {
        const letters = [...sign].slice(0, 6), sz = 44, sx = xx + bw - 40, sy = top + 30;
        ctx.fillStyle = '#05030f';
        ctx.fillRect(sx - 26, sy - 8, 52, letters.length * sz + 16);
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.shadowColor = col; ctx.shadowBlur = 18;
        ctx.strokeRect(sx - 26, sy - 8, 52, letters.length * sz + 16); ctx.shadowBlur = 0;
        letters.forEach((ch, i) => glowText(ctx, ch, sx, sy + i * sz + sz / 2 + 2, sz, col));
      }
    });
  }
  // Power lines sagging between the roofs.
  ctx.strokeStyle = 'rgba(5,3,15,0.9)'; ctx.lineWidth = 2;
  for (let i = 0; i < roofs.length - 1; i++) {
    const [x0, y0] = roofs[i], [x1, y1] = roofs[i + 1];
    for (let k = 0; k < 2; k++) {
      ctx.beginPath(); ctx.moveTo(x0, y0 + 6 + k * 10);
      ctx.quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) + 50 + k * 14, x1, y1 + 6 + k * 10); ctx.stroke();
    }
  }
  // Street-level darkness.
  const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
  g.addColorStop(0, 'rgba(5,3,15,0)'); g.addColorStop(1, 'rgba(5,3,15,0.95)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

function vignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w / 2, h * 0.45, h * 0.25, w / 2, h * 0.5, w * 0.62);
  g.addColorStop(0, 'rgba(5,3,15,0)');
  g.addColorStop(1, 'rgba(5,3,15,0.8)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

/** Builds the skyline textures once: ui-sky, ui-city0..2 (far to near), ui-vignette. */
export function cityTextures(scene: Phaser.Scene) {
  const W = CONFIG.WIDTH * Z, H = CONFIG.HEIGHT * Z;
  canvas(scene, 'ui-sky', W, H, ctx => sky(ctx, W, H));
  canvas(scene, 'ui-city0', CITY_W, 620, ctx => farLayer(ctx, CITY_W, 620));
  canvas(scene, 'ui-city1', CITY_W, 700, ctx => midLayer(ctx, CITY_W, 700));
  canvas(scene, 'ui-city2', CITY_W, 560, ctx => nearLayer(ctx, CITY_W, 560));
  canvas(scene, 'ui-vignette', W / 2, H / 2, ctx => vignette(ctx, W / 2, H / 2));
}

/** The skyline as drifting parallax layers. Call `update(dt)` every frame. */
export class Skyline {
  private layers: { imgs: Phaser.GameObjects.Image[]; speed: number }[] = [];
  readonly objects: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, depth = 0) {
    cityTextures(scene);
    const k = 1 / Z, tw = CITY_W / Z;
    const sky = scene.add.image(0, 0, 'ui-sky').setOrigin(0).setScale(k).setDepth(depth);
    this.objects.push(sky);
    const spec: [string, number, number][] = [['ui-city0', 228, 3], ['ui-city1', 250, 7], ['ui-city2', 272, 16]];
    for (const [key, bottom, speed] of spec) {
      const imgs = [0, 1].map(i => scene.add.image(i * tw, bottom, key).setOrigin(0, 1).setScale(k).setDepth(depth));
      this.layers.push({ imgs, speed });
      this.objects.push(...imgs);
    }
    const vig = scene.add.image(0, 0, 'ui-vignette').setOrigin(0).setScale(2 / Z).setDepth(depth);
    this.objects.push(vig);
  }

  update(dt: number) {
    const tw = CITY_W / Z;
    for (const l of this.layers) {
      const x = l.imgs[0].x - l.speed * dt;
      const wrapped = x <= -tw ? x + tw : x;
      l.imgs[0].x = wrapped;
      l.imgs[1].x = wrapped + tw;
    }
  }
}

/** Fine, slanted rain (one-pixel streaks), screen-fixed. */
export class FineRain {
  readonly g: Phaser.GameObjects.Graphics;
  private drops: { x: number; y: number; v: number; l: number; a: number }[] = [];

  constructor(scene: Phaser.Scene, private count = 150, depth = 0) {
    this.g = scene.add.graphics().setDepth(depth).setScrollFactor(0);
    for (let i = 0; i < count; i++) this.drops.push(this.drop(true));
  }

  private drop(anywhere: boolean) {
    const near = Math.random() < 0.2;
    return { x: Math.random() * (CONFIG.WIDTH + 80), y: anywhere ? Math.random() * CONFIG.HEIGHT : -12, v: near ? 420 : 260 + Math.random() * 100, l: near ? 12 : 5 + Math.random() * 5, a: near ? 0.45 : 0.22 };
  }

  update(dtMs: number) {
    const dt = dtMs / 1000, g = this.g;
    g.clear();
    for (const d of this.drops) {
      d.y += d.v * dt; d.x -= d.v * 0.22 * dt;
      if (d.y > CONFIG.HEIGHT + 10) Object.assign(d, this.drop(false));
      g.lineStyle(d.l > 10 ? 0.5 : 0.25, d.l > 10 ? 0x9ff8ff : 0x8a86d0, d.a);
      g.lineBetween(d.x, d.y, d.x + d.l * 0.22, d.y - d.l);
    }
  }
}
