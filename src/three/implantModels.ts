import * as THREE from 'three';
import type Phaser from 'phaser';

/**
 * Procedural 3D pictures of the implants for the interface (offer cards, HUD): each implant is one of a
 * handful of family shapes (`SHAPES`) with its own neon colour and one distinguishing detail (`SPECS`).
 * Cel-shaded (3-step toon ramp) with an inverted-hull ink outline, rendered lazily on demand by a small
 * shared offscreen renderer and cached, like `portraits.ts`. No asset files.
 */
export type Shape = 'plate' | 'arm' | 'shield' | 'shell' | 'chip' | 'eye' | 'lens' | 'heart' | 'gland' | 'legs' | 'launcher' | 'bones' | 'brain' | 'spine';
export interface ModelSpec { shape: Shape; color: number; /** Distinguishing detail, read by the shape builder (0 = base). */ detail: number }

export const CY = 0x00f0ff, MG = 0xff2a6d, YL = 0xf5e663, GR = 0x39ff88, VI = 0xb84dff, OR = 0xff8c2a, RD = 0xff3b3b;

/** One spec per implant id (a test checks every id of `data/implants.ts` is here). Tweak shape, colour or detail here. */
export const SPECS: Record<string, ModelSpec> = {
  'dermal-armor': { shape: 'plate', color: CY, detail: 0 },
  'subdermal-plate': { shape: 'plate', color: VI, detail: 1 },
  'gorilla-servos': { shape: 'arm', color: OR, detail: 1 },
  'arm-blades': { shape: 'arm', color: MG, detail: 2 },
  'kinetic-shield': { shape: 'shield', color: CY, detail: 0 },
  'titan-shell': { shape: 'shell', color: MG, detail: 0 },
  'neural-coproc': { shape: 'chip', color: GR, detail: 0 },
  'psy-dampener': { shape: 'chip', color: CY, detail: 1 },
  'shortcircuit': { shape: 'chip', color: YL, detail: 2 },
  'turret-link': { shape: 'chip', color: OR, detail: 3 },
  'predator-chip': { shape: 'chip', color: RD, detail: 4 },
  'overclock-chip': { shape: 'chip', color: MG, detail: 5 },
  'adrenal-pump': { shape: 'heart', color: RD, detail: 0 },
  'leech-glands': { shape: 'gland', color: GR, detail: 1 },
  'hemo-recycler': { shape: 'heart', color: CY, detail: 1 },
  'nano-blood': { shape: 'gland', color: CY, detail: 2 },
  'stim-gland': { shape: 'gland', color: YL, detail: 0 },
  'berserk-gland': { shape: 'gland', color: MG, detail: 3 },
  'aim-optics': { shape: 'eye', color: YL, detail: 0 },
  'tracer-eye': { shape: 'eye', color: RD, detail: 1 },
  'long-lens': { shape: 'lens', color: CY, detail: 0 },
  'reinforced-legs': { shape: 'legs', color: GR, detail: 0 },
  'smart-link': { shape: 'lens', color: GR, detail: 1 },
  'wrist-launcher': { shape: 'launcher', color: OR, detail: 0 },
  'berserker-os': { shape: 'spine', color: RD, detail: 0 },
  'glass-bones': { shape: 'bones', color: CY, detail: 0 },
  'neuro-leak': { shape: 'brain', color: GR, detail: 0 },
  'blood-pact': { shape: 'heart', color: MG, detail: 2 },
  'overdrive': { shape: 'spine', color: YL, detail: 1 },
};

// ---------- cel-shaded building blocks ----------
let ramp: THREE.DataTexture | undefined;
function toonRamp() {
  if (!ramp) {
    ramp = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
  }
  return ramp;
}
export const toon = (color: number) => new THREE.MeshToonMaterial({ color, gradientMap: toonRamp() });
const INK = new THREE.MeshBasicMaterial({ color: 0x0b0820, side: THREE.BackSide });
export const METAL = () => toon(0x6a5fb0);
export const DARK = () => toon(0x2a1a5a);
export const NEON = (c: number) => new THREE.MeshBasicMaterial({ color: c });

export type V3 = [number, number, number];
export class Builder {
  g = new THREE.Group();
  constructor(readonly c: number) {}
  add(geo: THREE.BufferGeometry, mat: THREE.Material, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], outline = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...p); m.rotation.set(...r);
    this.g.add(m);
    if (outline) { const o = new THREE.Mesh(geo, INK); o.position.copy(m.position); o.rotation.copy(m.rotation); o.scale.setScalar(1.09); this.g.add(o); }
    return m;
  }
  box(w: number, h: number, d: number, p: V3, mat: THREE.Material = METAL(), r: V3 = [0, 0, 0]) { return this.add(new THREE.BoxGeometry(w, h, d), mat, p, r); }
  cyl(rt: number, rb: number, h: number, p: V3, mat: THREE.Material = METAL(), r: V3 = [0, 0, 0], seg = 10) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, p, r); }
  sph(rad: number, p: V3, mat: THREE.Material = METAL(), s: V3 = [1, 1, 1]) { const m = this.add(new THREE.SphereGeometry(rad, 14, 10), mat, p); m.scale.set(...s); return m; }
  cone(rad: number, h: number, p: V3, r: V3 = [0, 0, 0]) { return this.add(new THREE.ConeGeometry(rad, h, 4), NEON(this.c), p, r, false); }
  neonBox(w: number, h: number, d: number, p: V3, r: V3 = [0, 0, 0]) { return this.add(new THREE.BoxGeometry(w, h, d), NEON(this.c), p, r, false); }
  neonRing(rad: number, tube: number, p: V3, r: V3 = [0, 0, 0]) { return this.add(new THREE.TorusGeometry(rad, tube, 6, 20), NEON(this.c), p, r, false); }
}

export const HALF = Math.PI / 2;
const SHAPES: Record<Shape, (b: Builder, d: number) => void> = {
  plate(b, d) {
    b.box(1.5, 1.0, 0.18, [0, 0, 0]);
    b.box(1.3, 0.8, 0.1, [0, 0, 0.12], DARK());
    for (const x of [-0.55, 0.55]) for (const y of [-0.32, 0.32]) b.cyl(0.07, 0.07, 0.1, [x, y, 0.2], METAL(), [HALF, 0, 0], 8);
    if (d === 0) b.neonBox(1.0, 0.07, 0.05, [0, 0, 0.19]); else { b.neonBox(0.07, 0.6, 0.05, [-0.3, 0, 0.19]); b.neonBox(0.07, 0.6, 0.05, [0.3, 0, 0.19]); }
  },
  arm(b, d) {
    b.cyl(0.28, 0.2, 1.1, [-0.35, 0, 0], METAL(), [0, 0, HALF]);
    b.box(0.5, 0.5, 0.55, [0.4, 0, 0], DARK());
    for (const z of [-0.18, 0, 0.18]) b.box(0.4, 0.09, 0.08, [0.8, 0, z]);
    b.neonRing(0.27, 0.035, [-0.35, 0, 0], [0, HALF, 0]);
    if (d === 1) for (const y of [-0.34, 0.34]) b.cyl(0.07, 0.07, 0.9, [-0.3, y, 0], NEON(b.c), [0, 0, HALF], 8); // hydraulic pistons
    if (d === 2) for (const z of [-0.12, 0.12]) b.cone(0.1, 1.1, [0.55, 0, z], [0, 0, -HALF]); // blades
  },
  shield(b) {
    b.cyl(0.8, 0.8, 0.14, [0, 0, 0], DARK(), [HALF, 0, 0], 6);
    b.cyl(0.55, 0.55, 0.2, [0, 0, 0.02], METAL(), [HALF, 0, 0], 6);
    b.neonRing(0.7, 0.04, [0, 0, 0.1]);
    b.add(new THREE.OctahedronGeometry(0.22), NEON(b.c), [0, 0, 0.16], [0, 0, 0], false);
  },
  shell(b) {
    b.add(new THREE.SphereGeometry(0.85, 16, 10, 0, Math.PI * 2, 0, HALF), METAL(), [0, -0.3, 0]);
    b.box(1.7, 0.1, 1.7, [0, -0.3, 0], DARK());
    b.neonBox(0.08, 0.7, 0.05, [0, 0, 0.82]);
    for (const x of [-0.45, 0.45]) b.neonBox(0.06, 0.5, 0.05, [x, -0.05, 0.7], [0, x * 0.5, 0]);
    b.cyl(0.1, 0.1, 0.35, [0, 0.62, 0], DARK(), [0, 0, 0], 8);
  },
  chip(b, d) {
    b.box(1.1, 0.14, 1.1, [0, 0, 0], DARK());
    b.box(0.6, 0.18, 0.6, [0, 0.1, 0]);
    b.neonBox(0.3, 0.2, 0.3, [0, 0.12, 0]);
    for (let i = -2; i <= 2; i++) for (const s of [-1, 1]) { b.box(0.07, 0.05, 0.22, [i * 0.2, -0.02, s * 0.66]); b.box(0.22, 0.05, 0.07, [s * 0.66, -0.02, i * 0.2]); }
    if (d === 1) b.neonRing(0.45, 0.03, [0, 0.22, 0], [HALF, 0, 0]);                                   // dampener: ring
    if (d === 2) b.cone(0.1, 0.45, [0, 0.45, 0]);                                                       // spark
    if (d === 3) b.cyl(0.07, 0.07, 0.5, [0.3, 0.4, 0.3]);                                               // antenna
    if (d === 4) for (const x of [-0.25, 0.25]) b.cone(0.08, 0.35, [x, 0.35, -0.2]);                    // fangs
    if (d === 5) { b.neonRing(0.42, 0.03, [0, 0.22, 0], [HALF, 0, 0]); b.neonRing(0.3, 0.03, [0, 0.26, 0], [HALF, 0, 0]); } // overclock rings
    b.g.rotation.x = 0.6;
  },
  eye(b, d) {
    b.sph(0.6, [0, 0, 0], toon(0xe8e4ff));
    b.cyl(0.36, 0.36, 0.12, [0, 0, 0.5], NEON(b.c), [HALF, 0, 0], 16);
    b.cyl(0.17, 0.17, 0.14, [0, 0, 0.52], DARK(), [HALF, 0, 0], 12);
    b.neonRing(0.64, 0.035, [0, 0, 0], [0, HALF, 0]);
    if (d === 1) b.cone(0.14, 0.5, [0, -0.78, 0.1], [Math.PI, 0, 0]);                                     // tracer tear
    else for (const a of [0, HALF, Math.PI, -HALF]) b.neonBox(0.05, 0.22, 0.05, [Math.sin(a) * 0.52, Math.cos(a) * 0.52, 0.28], [0, 0, -a]); // reticle
  },
  lens(b, d) {
    b.cyl(0.32, 0.32, 1.1, [0, 0, 0], METAL(), [HALF, 0, 0], 14);
    b.cyl(0.42, 0.42, 0.35, [0, 0, 0.5], DARK(), [HALF, 0, 0], 14);
    b.cyl(0.3, 0.3, 0.06, [0, 0, 0.7], NEON(b.c), [HALF, 0, 0], 14);
    b.neonRing(0.33, 0.03, [0, 0, -0.1]);
    if (d === 1) { b.box(0.3, 0.3, 0.5, [0, 0.42, -0.2], DARK()); b.neonBox(0.1, 0.1, 0.1, [0, 0.62, -0.2]); } // ballistic link box
    b.g.rotation.set(0.2, -0.7, 0);
  },
  heart(b, d) {
    b.sph(0.55, [0, 0, 0], toon(b.c));
    b.sph(0.38, [0.3, 0.2, 0.1], toon(b.c));
    b.cyl(0.12, 0.12, 0.6, [-0.1, 0.65, 0], METAL(), [0, 0, 0.3]);
    b.cyl(0.12, 0.12, 0.55, [0.35, 0.6, 0], METAL(), [0, 0, -0.3]);
    b.box(0.5, 0.3, 0.3, [0, -0.1, 0.5], DARK());
    b.neonBox(0.3, 0.07, 0.1, [0, -0.1, 0.67]);
    if (d === 1) b.neonRing(0.7, 0.04, [0, 0, 0], [HALF, 0, 0]);   // recycler loop
    if (d === 2) b.cone(0.12, 0.6, [0, -0.78, 0], [Math.PI, 0, 0]); // pact drop
    b.g.rotation.y = -0.5;
  },
  gland(b, d) {
    b.sph(0.5, [0, -0.1, 0], toon(b.c), [1, 1.2, 1]);
    b.cyl(0.14, 0.14, 0.5, [0, 0.65, 0]);
    b.cyl(0.2, 0.2, 0.1, [0, 0.4, 0], DARK());
    b.neonBox(0.7, 0.06, 0.06, [0, -0.1, 0.5]);
    if (d === 1) for (const x of [-0.7, 0.7]) b.sph(0.22, [x, -0.3, 0], toon(b.c));                        // twin leech sacs
    if (d === 2) for (const a of [0, 2.1, 4.2]) b.sph(0.08, [Math.cos(a) * 0.75, 0.1 + Math.sin(a) * 0.4, 0], NEON(b.c)); // nanites
    if (d === 3) for (const x of [-0.25, 0.25]) b.cone(0.1, 0.4, [x, 0.95, 0]);                            // rage horns
  },
  legs(b) {
    b.cyl(0.14, 0.14, 0.35, [0, 0.8, 0]);
    for (let i = 0; i < 5; i++) b.add(new THREE.TorusGeometry(0.26, 0.055, 6, 14), NEON(b.c), [0, 0.45 - i * 0.2, 0], [HALF, 0, 0], false);
    b.cyl(0.08, 0.08, 1.2, [0.38, 0.1, 0], METAL(), [0, 0, 0], 8);
    b.box(0.7, 0.16, 0.5, [0.1, -0.6, 0.1], DARK());
    b.g.position.y = -0.1;
  },
  launcher(b) {
    b.box(0.9, 0.4, 0.55, [-0.1, 0, 0], DARK());
    b.cyl(0.19, 0.19, 0.9, [0.5, 0.05, 0], METAL(), [0, 0, HALF], 12);
    b.neonRing(0.2, 0.035, [0.95, 0.05, 0], [0, HALF, 0]);
    b.cyl(0.12, 0.12, 0.08, [0.98, 0.05, 0], NEON(b.c), [0, 0, HALF], 10);
    b.neonBox(0.5, 0.06, 0.06, [-0.15, 0.22, 0.2]);
    b.box(0.3, 0.14, 0.7, [-0.5, -0.25, 0]);
  },
  bones(b) {
    const glass = toon(0xcfe9ff), a = 0.7, h = Math.cos(a) * 0.75, v = Math.sin(a) * 0.75;
    for (const s of [-1, 1]) {
      b.cyl(0.1, 0.1, 1.5, [0, 0, 0], glass, [0, 0, s * a], 8);
      for (const e of [-1, 1]) for (const k of [-1, 1]) b.sph(0.16, [e * h, s * e * v, k * 0.08], glass);
    }
    b.neonRing(0.3, 0.03, [0, 0, 0.05]);
  },
  brain(b) {
    const m = toon(0xff9ab8);
    b.sph(0.45, [-0.3, 0.15, 0], m, [1, 0.9, 1]);
    b.sph(0.45, [0.3, 0.15, 0], m, [1, 0.9, 1]);
    b.sph(0.3, [0, -0.2, -0.1], m);
    for (const x of [-0.2, 0.15]) b.add(new THREE.CapsuleGeometry(0.06, 0.4, 4, 8), NEON(b.c), [x, -0.45, 0.2], [0, 0, 0], false); // drips
    b.sph(0.07, [-0.2, -0.85, 0.2], NEON(b.c), [1, 1.4, 1]);
    b.g.rotation.y = -0.5;
  },
  spine(b, d) {
    for (let i = 0; i < 6; i++) {
      const y = 0.75 - i * 0.3, s = 1 - i * 0.04;
      b.cyl(0.26 * s, 0.26 * s, 0.17, [0, y, 0], i % 2 ? METAL() : DARK(), [0, 0, 0], 8);
      b.box(0.55 * s, 0.07, 0.07, [0, y, -0.28], DARK());
    }
    b.neonBox(0.07, 1.7, 0.05, [0, 0, 0.3]);
    if (d === 1) for (const s of [-1, 1]) b.cone(0.1, 0.5, [s * 0.5, 0.2, 0], [0, 0, -s * 1.1]); // overdrive sparks
    else for (const s of [-1, 1]) b.cyl(0.05, 0.05, 1.6, [s * 0.42, 0, -0.05], NEON(b.c), [0, 0, 0], 6); // berserk rails
    b.g.rotation.set(0, -0.5, 0.25);
  },
};

// ---------- offscreen rendering (lazy, one at a time, cached) ----------
const SIZE = 128;
let renderer: THREE.WebGLRenderer | undefined;
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const cache = new Map<string, Promise<HTMLCanvasElement | null>>();

function getRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

function releaseRenderer() {
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer = undefined;
}

/** Builds the 3D model of an implant (about 2 units wide, centred on the origin). Null for an unknown id. */
export function buildImplantModel(id: string): THREE.Group | null {
  const spec = SPECS[id];
  if (!spec) return null;
  const b = new Builder(spec.color);
  SHAPES[spec.shape](b, spec.detail);
  const root = new THREE.Group();
  root.add(b.g);
  return root;
}

/** Renders any model to a picture, framed on its bounding sphere; `halo` adds a soft coloured disc behind (cursed relics). */
export function renderModel(model: THREE.Group, rimColor: number, halo?: number): HTMLCanvasElement {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xd8d0ff, 0x2a1a5a, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(-1.5, 2.5, 3);
  const rim = new THREE.DirectionalLight(rimColor, 2.2); rim.position.set(2.5, 1, -2);
  scene.add(key, rim);
  model.rotation.set(0.25, -0.5, 0);
  scene.add(model);
  model.updateMatrixWorld(true);
  // Frame on the bounding sphere so every shape fills the picture the same way.
  const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
  let haloMat: THREE.Material | undefined;
  if (halo !== undefined) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(sphere.radius * 0.98, 24, 16), haloMat = new THREE.MeshBasicMaterial({ color: halo, transparent: true, opacity: 0.3, depthWrite: false }));
    h.position.copy(sphere.center).z -= sphere.radius * 0.5;
    scene.add(h);
  }
  const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(12)) * 1.02;
  cam.position.set(sphere.center.x, sphere.center.y, sphere.center.z + dist);
  cam.lookAt(sphere.center);
  const r = getRenderer();
  r.render(scene, cam);
  const out = document.createElement('canvas');
  out.width = out.height = SIZE;
  out.getContext('2d')!.drawImage(r.domElement, 0, 0);
  scene.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
  haloMat?.dispose();
  return out;
}

/** Queues a render (one at a time) and caches it under `key`; null if the model is unknown or rendering fails. */
export function cachedPicture(key: string, make: () => HTMLCanvasElement | null): Promise<HTMLCanvasElement | null> {
  let p = cache.get(key);
  if (!p) {
    pending++;
    clearTimeout(idleTimer);
    p = queue.then(make).catch(() => null).finally(() => {
      // Idle for a few seconds: give the second WebGL context (and every program it compiled) back.
      if (--pending === 0) idleTimer = setTimeout(releaseRenderer, 4000);
    });
    queue = p;
    cache.set(key, p);
  }
  return p;
}

/** Registers a rendered picture as a Phaser texture; resolves with the key, or null on failure (callers keep their text fallback). */
export async function registerPicture(scene: Phaser.Scene, key: string, pic: Promise<HTMLCanvasElement | null>): Promise<string | null> {
  if (scene.textures.exists(key)) return key;
  const c = await pic;
  if (!c || !scene.sys?.textures) return null;
  if (!scene.textures.exists(key)) {
    scene.textures.addCanvas(key, c);
    scene.textures.get(key).setFilter(0);
  }
  return key;
}

/** The picture of an implant, rendered on first request and cached; null if rendering fails. */
export function implantPicture(id: string): Promise<HTMLCanvasElement | null> {
  return cachedPicture('implant:' + id, () => {
    const model = buildImplantModel(id);
    return model ? renderModel(model, SPECS[id].color) : null;
  });
}

/** Registers `implant-3d-<id>` as a Phaser texture once rendered; resolves with the key, or null on any failure (callers keep their text-only fallback). */
export function implantTexture(scene: Phaser.Scene, id: string): Promise<string | null> {
  return registerPicture(scene, `implant-3d-${id}`, implantPicture(id));
}
