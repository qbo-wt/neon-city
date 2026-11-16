import * as THREE from 'three';
import type { HazardKind } from '../../tactics/hazards';
import type { Pt } from '../../tactics/types';
import { canvas, glowTexture } from './paint';

/** One hazard to draw; `state` for vents: 0 dormant, 1 erupts next round, 2 erupting. */
export interface HazardView { p: Pt; kind: HazardKind; state: 0 | 1 | 2 }

const COLOR: Record<HazardKind, string> = { shock: '#00f0ff', acid: '#b84dff', steam: '#ff8c2a', medkit: '#39ff88', relay: '#f5e663' };

/** The ground mark of a kind, drawn once: a neon frame with the kind's symbol, ink-outlined. */
const marks = new Map<HazardKind, THREE.Texture>();
function markTexture(kind: HazardKind): THREE.Texture {
  const cached = marks.get(kind);
  if (cached) return cached;
  const S = 128, { c, g } = canvas(S, S), col = COLOR[kind];
  g.lineCap = 'round'; g.lineJoin = 'round';
  const stroke = (w: number, color: string, draw: () => void) => { g.lineWidth = w; g.strokeStyle = color; g.beginPath(); draw(); g.stroke(); };
  // Corner brackets: reads as a marked cell from far away.
  const bracket = () => {
    for (const [x, y, dx, dy] of [[8, 8, 1, 1], [120, 8, -1, 1], [8, 120, 1, -1], [120, 120, -1, -1]]) {
      g.moveTo(x, y + dy * 26); g.lineTo(x, y); g.lineTo(x + dx * 26, y);
    }
  };
  stroke(12, 'rgba(10,6,20,0.9)', bracket);
  stroke(6, col, bracket);
  switch (kind) {
    case 'shock': {
      const bolt = () => { g.moveTo(74, 18); g.lineTo(44, 68); g.lineTo(70, 66); g.lineTo(52, 112); g.lineTo(88, 56); g.lineTo(62, 58); g.closePath(); };
      g.fillStyle = 'rgba(0,240,255,0.18)'; g.fillRect(14, 14, 100, 100);
      stroke(10, 'rgba(10,6,20,0.95)', bolt);
      g.fillStyle = '#e8ffff'; g.beginPath(); bolt(); g.fill();
      stroke(3, col, bolt);
      break;
    }
    case 'acid': {
      const blob = () => {
        g.moveTo(30, 64);
        g.bezierCurveTo(22, 30, 60, 18, 78, 30); g.bezierCurveTo(104, 34, 112, 70, 96, 90);
        g.bezierCurveTo(84, 112, 44, 110, 34, 92); g.bezierCurveTo(28, 82, 34, 74, 30, 64);
      };
      g.fillStyle = 'rgba(184,77,255,0.55)'; g.beginPath(); blob(); g.fill();
      stroke(4, col, blob);
      g.fillStyle = '#f0d8ff';
      for (const [x, y, r] of [[56, 52, 7], [76, 70, 5], [50, 82, 4], [84, 48, 3]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'steam': {
      g.fillStyle = 'rgba(20,14,30,0.85)'; g.beginPath(); g.arc(64, 64, 40, 0, Math.PI * 2); g.fill();
      stroke(6, col, () => g.arc(64, 64, 42, 0, Math.PI * 2));
      g.fillStyle = col;
      for (let i = -2; i <= 2; i++) g.fillRect(40, 62 + i * 12 - 3, 48, 5);
      break;
    }
    case 'medkit': {
      g.fillStyle = 'rgba(57,255,136,0.22)'; g.fillRect(18, 18, 92, 92);
      g.fillStyle = 'rgba(10,6,20,0.95)'; g.fillRect(46, 24, 36, 80); g.fillRect(24, 46, 80, 36);
      g.fillStyle = col; g.fillRect(51, 29, 26, 70); g.fillRect(29, 51, 70, 26);
      break;
    }
    case 'relay': {
      g.fillStyle = 'rgba(245,230,99,0.16)'; g.fillRect(18, 18, 92, 92);
      stroke(5, col, () => { g.rect(38, 38, 52, 52); });
      g.fillStyle = col;
      for (let i = 0; i < 4; i++) { g.fillRect(46 + i * 10, 26, 4, 12); g.fillRect(46 + i * 10, 90, 4, 12); g.fillRect(26, 46 + i * 10, 12, 4); g.fillRect(90, 46 + i * 10, 12, 4); }
      g.fillRect(56, 56, 16, 16);
      break;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  marks.set(kind, t);
  return t;
}

interface Item { key: string; root: THREE.Group; mark: THREE.Mesh; extra: THREE.Object3D[]; kind: HazardKind; state: number; t: number }

/**
 * The arena's hazards on the ground: glowing marks (they bloom), each kind with its own life: live
 * cables crackle, chemicals breathe, vents glow hotter as they get close to erupting and blow steam
 * while they do, the medkit and the terminal float a small hologram above their cell.
 */
export class HazardDecals {
  private items = new Map<string, Item>();
  private geo: THREE.PlaneGeometry;

  constructor(private parent: THREE.Object3D, private cellPos: (p: Pt, y?: number) => THREE.Vector3, private CELL: number) {
    this.geo = new THREE.PlaneGeometry(CELL * 0.94, CELL * 0.94).rotateX(-Math.PI / 2);
  }

  /** Shows exactly these hazards (adds, updates and removes marks). */
  sync(list: HazardView[]) {
    const keep = new Set<string>();
    for (const h of list) {
      const key = `${h.p.x},${h.p.y}`;
      keep.add(key);
      const old = this.items.get(key);
      if (old && old.kind === h.kind) { old.state = h.state; continue; }
      if (old) this.drop(old);
      this.items.set(key, this.make(key, h));
    }
    for (const it of [...this.items.values()]) if (!keep.has(it.key)) this.drop(it);
  }

  private drop(it: Item) {
    this.parent.remove(it.root);
    (it.mark.material as THREE.Material).dispose();
    this.items.delete(it.key);
  }

  private make(key: string, h: HazardView): Item {
    const root = new THREE.Group();
    root.position.copy(this.cellPos(h.p, 0.018));
    const mat = new THREE.MeshBasicMaterial({ map: markTexture(h.kind), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    const mark = new THREE.Mesh(this.geo, mat);
    mark.renderOrder = 1;
    root.add(mark);
    const extra: THREE.Object3D[] = [];
    const col = new THREE.Color(COLOR[h.kind]);
    const glow = (size: number, y: number, opacity: number) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity }));
      s.scale.setScalar(size); s.position.y = y;
      root.add(s); extra.push(s);
      return s;
    };
    if (h.kind === 'shock') {
      glow(this.CELL * 1.1, 0.1, 0.35);
      // A few sparks that jump around the cell.
      for (let i = 0; i < 3; i++) glow(0.22, 0.15, 0.9);
    } else if (h.kind === 'acid') {
      glow(this.CELL * 1.2, 0.05, 0.3);
    } else if (h.kind === 'steam') {
      glow(this.CELL * 1.1, 0.1, 0.2);
      // The steam column (only seen while it erupts).
      const white = new THREE.Color(0xfff0e0);
      for (let i = 0; i < 6; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: i % 2 ? white : col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: 0 }));
        s.userData.puff = i / 6;
        root.add(s); extra.push(s);
      }
    } else {
      glow(this.CELL * 0.9, 0.1, 0.3);
      // Hologram above the cell: a cross for the medkit, a ring for the terminal.
      const holo = new THREE.Group();
      const hm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
      if (h.kind === 'medkit') {
        holo.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.06), hm), new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.06), hm));
      } else {
        holo.add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 6, 24), hm));
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), hm);
        holo.add(core);
      }
      holo.position.y = 0.95;
      holo.userData.holo = true;
      root.add(holo); extra.push(holo);
    }
    this.parent.add(root);
    return { key, root, mark, extra, kind: h.kind, state: h.state, t: Math.random() * 10 };
  }

  tick(dt: number) {
    for (const it of this.items.values()) {
      it.t += dt;
      const m = it.mark.material as THREE.MeshBasicMaterial, t = it.t;
      if (it.kind === 'shock') {
        // Crackle: mostly steady, with sudden flickers.
        m.opacity = Math.random() < 0.08 ? 0.35 : 0.85 + Math.sin(t * 20) * 0.1;
        it.extra.forEach((s, i) => {
          if (i === 0) { (s as THREE.Sprite).material.opacity = 0.25 + Math.random() * 0.15; return; }
          if (Math.random() < 0.15) s.position.set((Math.random() - 0.5) * this.CELL * 0.8, 0.05 + Math.random() * 0.3, (Math.random() - 0.5) * this.CELL * 0.8);
          (s as THREE.Sprite).material.opacity = Math.random() < 0.5 ? 0.9 : 0.1;
        });
      } else if (it.kind === 'acid') {
        m.opacity = 0.7 + Math.sin(t * 2.2) * 0.2;
        (it.extra[0] as THREE.Sprite).material.opacity = 0.22 + Math.sin(t * 2.2) * 0.1;
      } else if (it.kind === 'steam') {
        // Dormant: dim. Next round: pulsing warning. Erupting: bright, with a column of steam.
        const s = it.state;
        m.opacity = s === 2 ? 1 : s === 1 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 5)) : 0.35;
        (it.extra[0] as THREE.Sprite).material.opacity = s === 2 ? 0.6 : s === 1 ? 0.3 * Math.abs(Math.sin(t * 5)) : 0.08;
        for (const p of it.extra.slice(1)) {
          const sp = p as THREE.Sprite, k = (t * 0.7 + (sp.userData.puff as number)) % 1;
          sp.position.set(Math.sin(t + k * 6) * 0.12, 0.2 + k * 2.6, Math.cos(t * 0.8 + k * 5) * 0.12);
          sp.scale.setScalar(0.5 + k * 1.4);
          sp.material.opacity = s === 2 ? (1 - k) * 0.5 : 0;
        }
      } else {
        m.opacity = 0.75 + Math.sin(t * 3) * 0.2;
        for (const o of it.extra) if (o.userData.holo) { o.rotation.y = t * 1.6; o.position.y = 0.95 + Math.sin(t * 2) * 0.08; }
      }
    }
  }

  clear() { for (const it of [...this.items.values()]) this.drop(it); }
}

/** The "incoming" mark: diagonal hazard stripes in a thick frame, an exclamation mark in the middle. Drawn white, tinted per attack. */
let warnTex: THREE.Texture | undefined;
function warnTexture(): THREE.Texture {
  if (warnTex) return warnTex;
  const S = 128, { c, g } = canvas(S, S);
  g.save();
  g.beginPath(); g.rect(10, 10, 108, 108); g.clip();
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(10, 10, 108, 108);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = -128; i < 256; i += 28) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 14, 0); g.lineTo(i + 14 - 128, 128); g.lineTo(i - 128, 128); g.closePath(); g.fill(); }
  g.restore();
  g.lineJoin = 'round';
  g.lineWidth = 12; g.strokeStyle = 'rgba(10,6,20,0.9)'; g.strokeRect(8, 8, 112, 112);
  g.lineWidth = 7; g.strokeStyle = '#ffffff'; g.strokeRect(8, 8, 112, 112);
  // The exclamation mark, ink-outlined.
  g.fillStyle = 'rgba(10,6,20,0.95)'; g.fillRect(52, 26, 24, 52); g.fillRect(52, 86, 24, 20);
  g.fillStyle = '#ffffff'; g.fillRect(57, 31, 14, 42); g.fillRect(57, 91, 14, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  warnTex = t;
  return t;
}

/** One cell where a boss's announced attack will land. */
export interface WarningView { p: Pt; color: number }

/**
 * Danger cells of the bosses' announced attacks: a striped mark that throbs fast and a glow over
 * the cell, so the zone reads at a glance from anywhere on the board.
 */
export class WarningDecals {
  private items = new Map<string, { root: THREE.Group; mat: THREE.MeshBasicMaterial; glow: THREE.Sprite; color: number }>();
  private geo: THREE.PlaneGeometry;
  private t = 0;

  constructor(private parent: THREE.Object3D, private cellPos: (p: Pt, y?: number) => THREE.Vector3, private CELL: number) {
    this.geo = new THREE.PlaneGeometry(CELL * 0.96, CELL * 0.96).rotateX(-Math.PI / 2);
  }

  sync(list: WarningView[]) {
    const keep = new Set<string>();
    for (const w of list) {
      const key = `${w.p.x},${w.p.y}`;
      keep.add(key);
      const old = this.items.get(key);
      if (old && old.color === w.color) continue;
      if (old) this.drop(key);
      const root = new THREE.Group();
      root.position.copy(this.cellPos(w.p, 0.03));
      const mat = new THREE.MeshBasicMaterial({ map: warnTexture(), color: w.color, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
      const mark = new THREE.Mesh(this.geo, mat);
      mark.renderOrder = 3;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: w.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: 0.3 }));
      glow.scale.setScalar(this.CELL * 1.2); glow.position.y = 0.2;
      root.add(mark, glow);
      this.parent.add(root);
      this.items.set(key, { root, mat, glow, color: w.color });
    }
    for (const k of [...this.items.keys()]) if (!keep.has(k)) this.drop(k);
  }

  private drop(key: string) {
    const it = this.items.get(key);
    if (!it) return;
    this.parent.remove(it.root);
    it.mat.dispose();
    it.glow.material.dispose();
    this.items.delete(key);
  }

  tick(dt: number) {
    this.t += dt;
    const k = Math.abs(Math.sin(this.t * 4.5));
    for (const it of this.items.values()) { it.mat.opacity = 0.45 + 0.55 * k; it.glow.material.opacity = 0.12 + 0.3 * k; }
  }
}
