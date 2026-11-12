import * as THREE from 'three';
import { canvasTex, FONT_UI, hex, puff, rng } from './paint';

/**
 * Everything that moves in an interior: screens redrawn a few times a second, blinking LEDs,
 * steam and smoke, flickering neon, swaying cables, spinning fans. One `Animator` per room, ticked
 * by Interior3D.update.
 */
export type Tick = (t: number, dt: number) => void;

export class Animator {
  private ticks: Tick[] = [];
  t = 0;
  add(fn: Tick) { this.ticks.push(fn); return fn; }
  update(dt: number) {
    this.t += dt;
    for (const f of this.ticks) f(this.t, dt);
  }
}

/** A canvas redrawn at `fps` (screens, displays). Returns the texture. */
export function liveCanvas(anim: Animator, w: number, h: number, fps: number, draw: (c: CanvasRenderingContext2D, t: number, w: number, h: number) => void) {
  const tex = canvasTex(w, h, (c) => draw(c, 0, w, h));
  const cv = tex.image as HTMLCanvasElement, ctx = cv.getContext('2d')!;
  let acc = Math.random() / fps;
  anim.add((t, dt) => {
    acc += dt;
    if (acc < 1 / fps) return;
    acc = 0;
    draw(ctx, t, w, h);
    tex.needsUpdate = true;
  });
  return tex;
}

// ---------------------------------------------------------------- screen contents

const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF<>/$#';

/** Falling code (den, hacker screens). */
export function codeRain(color = '#39ff88', seed = 1, cols = 16) {
  const r = rng(seed);
  const drops = Array.from({ length: cols }, () => r() * 20);
  return (c: CanvasRenderingContext2D, _t: number, w: number, h: number) => {
    c.fillStyle = 'rgba(2,10,6,0.35)'; c.fillRect(0, 0, w, h);
    const cw = w / cols;
    c.font = `${Math.round(cw * 0.95)}px monospace`;
    drops.forEach((d, i) => {
      const y = d * cw;
      c.fillStyle = '#d8ffe8'; c.fillText(GLYPHS[Math.floor(Math.random() * GLYPHS.length)], i * cw, y);
      c.fillStyle = color; c.fillText(GLYPHS[Math.floor(Math.random() * GLYPHS.length)], i * cw, y - cw);
      drops[i] = y > h + Math.random() * h ? 0 : d + 1;
    });
  };
}

/** Scrolling terminal lines. */
export function terminal(color = '#00f0ff', lines: string[] = [], seed = 2) {
  const r = rng(seed);
  const pool = lines.length ? lines : ['> ping 10.0.37.12', 'ACK 12ms', '> decrypt --key=ICE', '[####------] 41%', 'SECTOR 7 // OK', '> ls /run/log', 'run_0041.dat', 'run_0042.dat', 'WARN: trace', '> nc -lvp 4444', 'conn from 3712'];
  const shown: string[] = [];
  return (c: CanvasRenderingContext2D, t: number, w: number, h: number) => {
    if (r() < 0.6) shown.push(pool[Math.floor(r() * pool.length)]);
    const lh = h / 9;
    while (shown.length > 8) shown.shift();
    c.fillStyle = '#04060e'; c.fillRect(0, 0, w, h);
    c.font = `600 ${Math.round(lh * 0.8)}px ${FONT_UI}`;
    shown.forEach((s, i) => { c.fillStyle = i === shown.length - 1 ? '#ffffff' : color; c.globalAlpha = 0.5 + (i / shown.length) * 0.5; c.fillText(s, 6, lh * (i + 1)); });
    c.globalAlpha = 1;
    if (Math.floor(t * 3) % 2) { c.fillStyle = color; c.fillRect(6, lh * Math.min(8, shown.length) + 4, lh * 0.5, lh * 0.7); }
    c.fillStyle = 'rgba(255,255,255,0.04)'; for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
  };
}

/** Heart-rate monitor: green trace sweeping, BPM number. */
export function ecg(color = '#39ff88', label = 'BPM') {
  let x = 0, last = 0.5;
  return (c: CanvasRenderingContext2D, t: number, w: number, h: number) => {
    if (x === 0) { c.fillStyle = '#020a08'; c.fillRect(0, 0, w, h); }
    const step = w / 40;
    const phase = (t * 1.2) % 1;
    const v = phase < 0.05 ? 0.5 - phase * 8 : phase < 0.1 ? 0.1 + (phase - 0.05) * 16 : phase < 0.14 ? 0.9 - (phase - 0.1) * 10 : 0.5 + Math.sin(phase * 20) * 0.02;
    c.fillStyle = '#020a08'; c.fillRect(x, 0, step * 3, h * 0.78);
    c.strokeStyle = color; c.lineWidth = 3; c.shadowColor = color; c.shadowBlur = 6;
    c.beginPath(); c.moveTo(x - step, h * 0.78 * last); c.lineTo(x, h * 0.78 * v); c.stroke();
    c.shadowBlur = 0;
    last = v; x += step; if (x > w) x = 0;
    c.fillStyle = '#020a08'; c.fillRect(0, h * 0.78, w, h * 0.22);
    c.fillStyle = color; c.font = `600 ${Math.round(h * 0.18)}px ${FONT_UI}`;
    c.fillText(`${label} ${Math.round(72 + Math.sin(t * 0.7) * 6)}`, 6, h * 0.96);
    c.fillStyle = '#ff2a6d'; c.fillText(`SpO2 9${Math.floor(6 + Math.sin(t) * 2)}%`, w * 0.55, h * 0.96);
  };
}

/** Bars and a sine graph (generic "data" screen). */
export function graph(color = '#00f0ff', seed = 4) {
  const r = rng(seed);
  const bars = Array.from({ length: 10 }, () => r());
  return (c: CanvasRenderingContext2D, t: number, w: number, h: number) => {
    c.fillStyle = '#050414'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(120,120,255,0.18)'; c.lineWidth = 1;
    for (let x = 0; x < w; x += w / 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    bars.forEach((b, i) => { bars[i] = Math.min(1, Math.max(0.05, b + (Math.random() - 0.5) * 0.15)); c.fillStyle = i % 3 ? color : '#ff2a6d'; const bw = w / 12; c.fillRect(bw * (i + 1), h * 0.95 - bars[i] * h * 0.45, bw * 0.7, bars[i] * h * 0.45); });
    c.strokeStyle = '#f5e663'; c.lineWidth = 2; c.beginPath();
    for (let x = 0; x <= w; x += 4) c.lineTo(x, h * 0.3 + Math.sin(x * 0.05 + t * 3) * h * 0.12);
    c.stroke();
  };
}

/** Little arcade game: a ship dodging blocks, score. */
export function arcadeGame(seed = 5, hue = 280) {
  const r = rng(seed);
  const blocks = Array.from({ length: 6 }, () => ({ x: r(), y: r() }));
  return (c: CanvasRenderingContext2D, t: number, w: number, h: number) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, `hsl(${hue},80%,18%)`); g.addColorStop(1, `hsl(${hue + 40},90%,30%)`);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (const b of blocks) { b.y += 0.06; if (b.y > 1) { b.y = 0; b.x = Math.random(); } c.fillStyle = '#ff2a6d'; c.fillRect(b.x * w, b.y * h, w * 0.1, w * 0.1); }
    c.fillStyle = '#00f0ff'; const sx = (Math.sin(t * 2) * 0.4 + 0.5) * w; c.beginPath(); c.moveTo(sx, h * 0.8); c.lineTo(sx - 6, h * 0.92); c.lineTo(sx + 6, h * 0.92); c.fill();
    c.fillStyle = '#f5e663'; c.font = `600 ${Math.round(h * 0.13)}px ${FONT_UI}`; c.fillText(String(Math.floor(t * 37) % 99999).padStart(5, '0'), 4, h * 0.14);
  };
}

/** Scrolling advert text. */
export function ticker(text: string, color = '#f5e663', bg = '#05030f') {
  let x = 0;
  return (c: CanvasRenderingContext2D, _t: number, w: number, h: number) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.font = `600 ${Math.round(h * 0.72)}px "Teko", sans-serif`; c.fillStyle = color; c.shadowColor = color; c.shadowBlur = 8;
    const tw = c.measureText(text).width + 40;
    c.fillText(text, -x, h * 0.78); c.fillText(text, -x + tw, h * 0.78);
    c.shadowBlur = 0;
    x = (x + 3) % tw;
    c.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
  };
}

/** LED panel: rows of little lights blinking at random (server fronts). */
export function leds(colors = ['#39ff88', '#00f0ff', '#f5e663'], rows = 12, seed = 6) {
  const r = rng(seed);
  const state = Array.from({ length: rows * 6 }, () => r());
  return (c: CanvasRenderingContext2D, _t: number, w: number, h: number) => {
    c.fillStyle = '#07090c'; c.fillRect(0, 0, w, h);
    const rh = h / rows;
    for (let i = 0; i < rows; i++) {
      c.fillStyle = '#12161c'; c.fillRect(2, i * rh + 1, w - 4, rh - 2);
      c.fillStyle = '#05070a'; c.fillRect(w * 0.55, i * rh + rh * 0.3, w * 0.38, rh * 0.4);
      for (let k = 0; k < 6; k++) {
        const s = i * 6 + k;
        if (Math.random() < 0.12) state[s] = Math.random();
        const on = state[s] > 0.35;
        c.fillStyle = on ? colors[s % colors.length] : '#10241a';
        c.fillRect(4 + k * (w * 0.08), i * rh + rh * 0.35, w * 0.05, rh * 0.3);
      }
    }
  };
}

// ---------------------------------------------------------------- particles

/**
 * Steam or smoke rising from a point: soft puffs that grow, drift and fade.
 * `color`: puff colour; `rate`: puffs per second; `rise`: m/s; `size`: start size (m).
 */
export function steam(anim: Animator, parent: THREE.Object3D, origin: THREE.Vector3, o: { color?: number; rate?: number; rise?: number; size?: number; spread?: number; life?: number; opacity?: number; additive?: boolean } = {}) {
  const { color = 0xe8e8ff, rate = 6, rise = 0.5, size = 0.25, spread = 0.15, life = 2.2, opacity = 0.35 } = o;
  const n = Math.ceil(rate * life) + 1;
  const parts = Array.from({ length: n }, () => {
    const m = new THREE.SpriteMaterial({ map: puff(), color, transparent: true, opacity: 0, depthWrite: false, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const s = new THREE.Sprite(m);
    s.renderOrder = 5;
    parent.add(s);
    return { s, m, age: life + 1, vx: 0, vz: 0, rot: 0 };
  });
  let acc = 0, next = 0;
  anim.add((_t, dt) => {
    acc += dt;
    while (acc > 1 / rate) {
      acc -= 1 / rate;
      const p = parts[next++ % n];
      p.age = 0; p.vx = (Math.random() - 0.5) * 0.12; p.vz = (Math.random() - 0.5) * 0.05;
      p.s.position.copy(origin).add(new THREE.Vector3((Math.random() - 0.5) * spread, 0, (Math.random() - 0.5) * spread * 0.5));
      p.m.rotation = Math.random() * Math.PI * 2; p.rot = (Math.random() - 0.5) * 0.8;
    }
    for (const p of parts) {
      if (p.age > life) { p.m.opacity = 0; continue; }
      p.age += dt;
      const k = p.age / life;
      p.s.position.x += p.vx * dt; p.s.position.y += rise * dt * (1 - k * 0.4); p.s.position.z += p.vz * dt;
      p.m.rotation += p.rot * dt;
      p.s.scale.setScalar(size * (1 + k * 2.2));
      p.m.opacity = opacity * Math.min(1, k * 5) * (1 - k);
    }
  });
}

/** Dust specks floating in a light beam (a box region). */
export function dust(anim: Animator, parent: THREE.Object3D, centre: THREE.Vector3, size: THREE.Vector3, color = 0xffffff, count = 40) {
  const pos = new Float32Array(count * 3), seed = Array.from({ length: count }, () => Math.random() * 100);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  parent.add(pts);
  anim.add(t => {
    for (let i = 0; i < count; i++) {
      const s = seed[i];
      pos[i * 3] = centre.x + Math.sin(s * 3.1 + t * 0.13) * size.x / 2;
      pos[i * 3 + 1] = centre.y + (((s * 0.37 + t * 0.03) % 1) - 0.5) * size.y;
      pos[i * 3 + 2] = centre.z + Math.cos(s * 1.7 + t * 0.11) * size.z / 2;
    }
    geo.attributes.position.needsUpdate = true;
  });
}

// ---------------------------------------------------------------- flicker / sway

/** Neon that stutters now and then (a sign, a tube): scales a material colour and a light. */
export function flicker(anim: Animator, mat: THREE.MeshBasicMaterial | THREE.SpriteMaterial, base: number, light?: THREE.Light, o: { broken?: boolean; seed?: number } = {}) {
  const r = rng(o.seed ?? Math.floor(Math.random() * 1e6));
  let next = 2 + r() * 6, until = 0;
  const l0 = light?.intensity ?? 0;
  anim.add(t => {
    let k = 1;
    if (t > next) { until = t + 0.08 + r() * (o.broken ? 0.9 : 0.25); next = until + (o.broken ? 0.4 + r() * 2.5 : 3 + r() * 8); }
    if (t < until) k = Math.sin(t * 90) > 0 ? 0.25 : 0.9;
    else if (o.broken) k = 0.85 + Math.sin(t * 50) * 0.08;
    mat.color.setScalar(base * k);
    if (light) light.intensity = l0 * k;
  });
}

/** Swings an object gently around its pivot (hanging cables, lamps, signs). */
export function sway(anim: Animator, o: THREE.Object3D, amp = 0.05, speed = 1, axis: 'x' | 'z' = 'z') {
  const ph = Math.random() * 10, r0 = o.rotation[axis];
  anim.add(t => { o.rotation[axis] = r0 + Math.sin(t * speed + ph) * amp + Math.sin(t * speed * 2.3 + ph) * amp * 0.3; });
}

export function spin(anim: Animator, o: THREE.Object3D, speed = 6, axis: 'x' | 'y' | 'z' = 'z') {
  anim.add((_t, dt) => { o.rotation[axis] += speed * dt; });
}

/** A glowing material that pulses softly. */
export function pulse(anim: Animator, mat: { color: THREE.Color } | { opacity: number }, base: number, amp = 0.25, speed = 2) {
  const ph = Math.random() * 6;
  anim.add(t => {
    const k = base * (1 - amp + amp * (0.5 + 0.5 * Math.sin(t * speed + ph)));
    if ('color' in mat) mat.color.setScalar(k); else mat.opacity = k;
  });
}

/** Falling rain streaks (a repeating texture scrolled down). */
export function rainTexture(anim: Animator, color = '#9fb6ff', speed = 1.4) {
  const t = canvasTex(256, 256, (c) => {
    const r = rng(17);
    c.clearRect(0, 0, 256, 256);
    c.strokeStyle = color; c.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const x = r() * 256, y = r() * 256, l = 10 + r() * 22;
      c.globalAlpha = 0.25 + r() * 0.5; c.lineWidth = 1 + r();
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - l * 0.12, y + l); c.stroke();
    }
  }, true);
  anim.add((_t, dt) => { t.offset.y = (t.offset.y + dt * speed) % 1; t.offset.x = (t.offset.x + dt * speed * 0.1) % 1; });
  return t;
}

export { hex };
