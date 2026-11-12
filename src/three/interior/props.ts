import * as THREE from 'three';
import { at, type Interior3D } from '../Interior3D';
import { canvasTex, poster, radial, rng } from './paint';

/**
 * Small hand-built props shared by the rooms (simple geometry in the low-poly look): plants,
 * fairy lights, cans and cups, cardboard boxes, a sleeping cat, wall posters, weapons.
 */

/** A leafy potted plant (monstera-ish): `size` ≈ height in metres. */
export function plant(v: Interior3D, px: number, py: number, size = 1, o: { h?: number; seed?: number; pot?: number; leaf?: number } = {}) {
  const r = rng(o.seed ?? Math.floor(px * 7 + py));
  const g = new THREE.Group();
  g.position.copy(at(px, py, o.h ?? 0));
  const potH = 0.28 * size, potR = 0.17 * size;
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(potR, potR * 0.78, potH, 10), v.mat(o.pot ?? 0x3a2448));
  pot.position.y = potH / 2; pot.castShadow = true;
  g.add(pot);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(potR * 0.92, potR * 0.92, 0.02, 10), v.mat(0x1a1010));
  soil.position.y = potH; g.add(soil);
  const leafGeo = new THREE.SphereGeometry(1, 8, 5);
  leafGeo.scale(0.2, 0.025, 0.11);
  leafGeo.translate(0.2, 0, 0);
  const leafM = [v.mat(o.leaf ?? 0x1f7a5a), v.mat(0x2a9a6a), v.mat(0x176048)];
  const n = 7 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5, lift = 0.35 + r() * 0.65;
    const stem = new THREE.Group();
    stem.position.y = potH + 0.02;
    const leaf = new THREE.Mesh(leafGeo, leafM[i % 3]);
    leaf.scale.setScalar(size * (0.9 + r() * 0.6));
    leaf.position.set(0, lift * size * 0.75, 0);
    leaf.rotation.set(0, 0, -0.5 - r() * 0.5);
    leaf.castShadow = true;
    stem.add(leaf);
    stem.rotation.y = a;
    g.add(stem);
    v.sway(stem, 0.04, 0.6 + r() * 0.5, 'x');
  }
  v.add(g);
  v.blob(px, py + 2, potR * 3.2, potR * 2.5, 0.4);
  return g;
}

/** Garlands of warm bulbs hanging in arcs on the back wall, from x0 to x1 (px), at height h. */
export function fairyLights(v: Interior3D, x0: number, x1: number, h: number, colors = [0xffc46b, 0xff6fb0, 0x7ad8ff], sag = 0.18) {
  const arcs = Math.max(1, Math.round((x1 - x0) / 40));
  const geo = new THREE.SphereGeometry(0.035, 6, 4);
  const mats = colors.map(c => v.glow(c, 2.2));
  let n = 0;
  for (let a = 0; a < arcs; a++) {
    const ax = x0 + ((x1 - x0) * a) / arcs, bx = x0 + ((x1 - x0) * (a + 1)) / arcs;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const k = i / 10, x = ax + (bx - ax) * k;
      pts.push(v.onWall(x, h - Math.sin(k * Math.PI) * sag, 0.06));
    }
    v.cable(pts, 0.006, 0x1a1018);
    for (let i = 1; i < 10; i += 2) {
      const b = new THREE.Mesh(geo, mats[n++ % mats.length]);
      b.position.copy(pts[i]).add(new THREE.Vector3(0, -0.03, 0.01));
      v.add(b);
      const m = b.material as THREE.MeshBasicMaterial, base = m.color.clone(), ph = Math.random() * 6;
      v.anim.add(t => { m.color.copy(base).multiplyScalar(0.7 + 0.3 * Math.sin(t * 1.5 + ph)); });
    }
  }
  v.wash((x0 + x1) / 2, h - 0.1, ((x1 - x0) * 0.03) * 1.2, 0.8, colors[0], 0.18);
}

/** A cardboard box (taped), w × h × d metres. */
export function carton(v: Interior3D, px: number, py: number, w: number, h: number, d: number, o: { h?: number; yaw?: number; color?: number } = {}) {
  const b = v.box(at(px, py, o.h ?? 0), w, h, d, v.mat(o.color ?? 0x8a5a48), { yaw: o.yaw });
  const tape = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, 0.005, d * 1.01), v.mat(0xc8a070));
  tape.position.y = h / 2 + 0.003;
  b.add(tape);
  return b;
}

/** A few drink cans / cups scattered around a point at height h. */
export function cans(v: Interior3D, px: number, py: number, h: number, n = 3, seed = 1) {
  const r = rng(seed);
  const cols = [0xff2a6d, 0x00f0ff, 0xf5e663, 0x39ff88, 0xe8e8ff];
  for (let i = 0; i < n; i++) {
    const c = v.cyl(at(px + (r() - 0.5) * 14, py + (r() - 0.5) * 5, h), 0.035, 0.035, 0.12, v.mat(cols[Math.floor(r() * cols.length)], { rough: 0.4 }), 8);
    if (r() < 0.3) { c.rotation.z = Math.PI / 2; c.position.y = h + 0.035; }
  }
}

/** Instant-noodle cup with chopsticks. */
export function noodleCup(v: Interior3D, px: number, py: number, h: number) {
  v.cyl(at(px, py, h), 0.06, 0.045, 0.1, v.mat(0xe8e0f0));
  v.cyl(at(px, py, h + 0.07), 0.062, 0.062, 0.02, v.mat(0xff2a6d));
  const s = v.box(at(px + 1, py, h + 0.08), 0.008, 0.22, 0.008, v.mat(0xd8b080));
  s.rotation.z = 0.5;
}

/** A stack of books lying or standing. */
export function books(v: Interior3D, px: number, py: number, h: number, n = 4, standing = false, seed = 2) {
  const r = rng(seed);
  const cols = [0xff2a6d, 0x00b8d0, 0xf5c84a, 0x7a4ad8, 0x2a9a6a, 0xd8d0e8];
  let y = h, x = px;
  for (let i = 0; i < n; i++) {
    const c = v.mat(cols[Math.floor(r() * cols.length)]);
    if (standing) { v.box(at(x, py, h), 0.04 + r() * 0.03, 0.2 + r() * 0.08, 0.16, c); x += 1.7; }
    else { const b = v.box(at(px + (r() - 0.5) * 2, py, y), 0.22 + r() * 0.06, 0.035 + r() * 0.02, 0.16, c); b.rotation.y = (r() - 0.5) * 0.5; y += 0.05; }
  }
}

/** A cat curled up asleep (breathing, tail twitching). */
export function cat(v: Interior3D, px: number, py: number, h: number, color = 0x2a2238) {
  const g = new THREE.Group();
  g.position.copy(at(px, py, h));
  const fur = v.mat(color), inner = v.mat(0xff8ab0);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), fur);
  body.scale.set(1.25, 0.6, 1); body.position.y = 0.09; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), fur);
  head.position.set(0.16, 0.08, 0.06); head.scale.set(1, 0.85, 1);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 4), fur);
    ear.position.set(0.17 + s * 0.01, 0.15, 0.06 + s * 0.045); ear.rotation.x = s * 0.3;
    g.add(ear);
    const inEar = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.035, 4), inner);
    inEar.position.copy(ear.position).add(new THREE.Vector3(0.012, -0.005, 0)); inEar.rotation.copy(ear.rotation);
    g.add(inEar);
  }
  const tail = new THREE.Group();
  tail.position.set(-0.17, 0.04, 0);
  const tm = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.24, 4, 6), fur);
  tm.rotation.x = Math.PI / 2; tm.position.z = 0.13;
  tail.add(tm);
  g.add(body, head, tail);
  v.add(g);
  v.anim.add(t => {
    body.scale.y = 0.6 + Math.sin(t * 1.6) * 0.03;
    tail.rotation.y = Math.sin(t * 0.7) * 0.25 + (Math.sin(t * 0.23) > 0.9 ? Math.sin(t * 9) * 0.2 : 0);
  });
  return g;
}

/** A poster stuck on the back wall. */
export function wallPoster(v: Interior3D, px: number, h: number, w: number, seed: number, title: string, colors: [string, string, string], o: { tilt?: number; glow?: number } = {}) {
  const t = poster(seed, title, colors);
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: o.glow ?? 0.12 });
  const p = v.plane(v.onWall(px, h, 0.012 + Math.random() * 0.004), w, w * 1.4, m);
  p.rotation.z = o.tilt ?? 0;
  return p;
}

/** Blade / gun silhouettes on a rack (simple boxes, dark steel, a glowing edge). */
export function katana(v: Interior3D, centre: THREE.Vector3, len = 1.0, angle = 0, glow = 0x00f0ff) {
  const g = new THREE.Group();
  g.position.copy(centre); g.rotation.z = angle;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(len * 0.7, 0.035, 0.012), v.mat(0xb8c0d8, { rough: 0.3 }));
  blade.position.x = len * 0.15;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(len * 0.7, 0.006, 0.014), v.glow(glow, 1.6));
  edge.position.set(len * 0.15, -0.02, 0);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.04), v.mat(0xf5e663, { rough: 0.4 }));
  guard.position.x = -len * 0.2;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(len * 0.28, 0.04, 0.03), v.mat(0x2a1a30));
  grip.position.x = -len * 0.35;
  g.add(blade, edge, guard, grip);
  g.traverse(o => { o.castShadow = true; });
  v.add(g);
  return g;
}

export function rifle(v: Interior3D, centre: THREE.Vector3, len = 0.9, accent = 0xff2a6d) {
  const g = new THREE.Group();
  g.position.copy(centre);
  const dark = v.mat(0x1c1828, { rough: 0.5 }), mid = v.mat(0x3a3450, { rough: 0.5 });
  const parts: [number, number, number, number, number, THREE.Material][] = [
    [len * 0.5, 0.08, 0.05, 0, 0, dark], [len * 0.35, 0.03, 0.03, len * 0.42, 0.01, mid], [0.06, 0.14, 0.04, -0.05, -0.09, dark],
    [len * 0.22, 0.07, 0.04, -len * 0.33, -0.02, mid], [0.12, 0.05, 0.05, 0.05, 0.06, dark],
  ];
  for (const [w, h, d, x, y, m] of parts) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, 0); b.castShadow = true; g.add(b); }
  const strip = new THREE.Mesh(new THREE.BoxGeometry(len * 0.4, 0.01, 0.052), v.glow(accent, 1.6));
  strip.position.set(0, 0.015, 0);
  g.add(strip);
  v.add(g);
  return g;
}

/** A glow halo sprite (lamp bulbs, LEDs seen from afar). */
export function halo(v: Interior3D, pos: THREE.Vector3, size: number, color: number, opacity = 0.6) {
  const m = new THREE.SpriteMaterial({ map: radial(0.25), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const s = new THREE.Sprite(m);
  s.position.copy(pos); s.scale.setScalar(size); s.renderOrder = 6;
  v.add(s);
  return m;
}

/** A rumpled blanket: a soft slab with lumps, for unmade beds. */
export function blanket(v: Interior3D, centre: THREE.Vector3, w: number, d: number, color: number, seed = 3) {
  const r = rng(seed);
  const geo = new THREE.BoxGeometry(w, 0.09, d, 10, 1, 8);
  const p = geo.attributes.position;
  const bumps = Array.from({ length: 5 }, () => ({ x: (r() - 0.5) * w, z: (r() - 0.5) * d, a: 0.04 + r() * 0.08, s: 0.15 + r() * 0.2 }));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let dy = 0;
    for (const b of bumps) dy += b.a * Math.exp(-((x - b.x) ** 2 + (z - b.z) ** 2) / (b.s * b.s));
    // Sides droop over the edge.
    const edge = Math.max(Math.abs(x) / (w / 2), Math.abs(z) / (d / 2));
    p.setY(i, y + (y > 0 ? dy : 0) - (edge > 0.95 && y < 0 ? 0.1 : 0));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, v.mat(color, { rough: 0.95 }));
  m.position.copy(centre);
  m.castShadow = true; m.receiveShadow = true;
  v.add(m);
  return m;
}

/** Stickers / tags texture for walls and machines. */
export function graffiti(seed: number, colors: string[]) {
  const r = rng(seed);
  return canvasTex(256, 128, (c) => {
    c.clearRect(0, 0, 256, 128);
    for (let i = 0; i < 5; i++) {
      c.strokeStyle = colors[i % colors.length]; c.lineWidth = 6 + r() * 6; c.lineCap = 'round'; c.globalAlpha = 0.8;
      c.beginPath(); let x = 20 + r() * 200, y = 30 + r() * 70; c.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (r() - 0.3) * 50; y += (r() - 0.5) * 50; c.quadraticCurveTo(x + 20, y - 30, x, y); }
      c.stroke();
    }
    c.globalAlpha = 1;
  });
}
