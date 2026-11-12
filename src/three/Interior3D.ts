import * as THREE from 'three';
import type { World3D } from './World3D';
import { CAST, CharacterRig } from './characters';
import { MannequinRig, type AnimName, type Rig } from './rigs';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { kitModel, type ModelOpts } from './interior/kit';
import { Animator, dust, flicker, liveCanvas, steam, sway } from './interior/fx';
import { beam, canvasTex, concreteFloor, linoFloor, neonText, plateText, radial, tileFloor, wallTex, woodFloor } from './interior/paint';

/**
 * Interiors in 3D (apartment, corridor, clinic, den) drawn under the Phaser scene that still runs
 * them (physics, NPCs, interactions, panels). The camera looks north, 45° down, orthographic, and
 * the mapping keeps Phaser's pixels exact: a ground point (px, py) is world (px·K, 0, py·K / sin 45°),
 * and a height h rises h·cos 45° / K pixels on screen. So 2D positions, prompts and speech bubbles
 * stay where they are. At K = 3 cm per pixel a 1.7 m character is 40 px tall (a sixth of the
 * screen): rooms read as cosy dioramas, not as halls.
 *
 * The shell (floor, back wall, cut side walls, lights) comes from the room grid; everything else is
 * dressed by the room's set builder (src/three/interior/*) with the helpers below.
 */
export const K = 0.03;
const PITCH = THREE.MathUtils.degToRad(45);
const SIN = Math.sin(PITCH), COS = Math.cos(PITCH);
export const TILE = 32;
export const WALL_H = 4.0;
/**
 * Screen y of the back wall's foot in every room: half a tile below the first floor row, so the
 * wall shows 3.4 m under the HUD (doors and big signs above them). Scenes block the strip.
 */
export const BACK_Y = 80;
/** Pixels on screen per metre of height. */
export const PX_PER_M = COS / K;
/** Screen px per metre across (x) and per metre of depth (ground y). */
export const MX = 1 / K, MY = SIN / K;
export const at = (px: number, py: number, h = 0) => new THREE.Vector3(px * K, h, (py * K) / SIN);
/** Metres of depth (z) for a number of screen pixels of ground. */
export const depthOf = (py: number) => (py * K) / SIN;
/** Character height on screen (px): where bubbles and prompts go above the feet. */
export const HEAD_PX = Math.round(1.75 * PX_PER_M);
/** Global scale of the room lights (point lights are in candela: a little goes a long way). */
const LIGHT_K = 0.75;

export type InteriorStyle = 'home' | 'corridor' | 'clinic' | 'den';

interface Look {
  floor: () => THREE.Texture; floorTint: number;
  wall: () => THREE.Texture; wallTint: number;
  skirt: number;
  sides: 'cut' | 'open';
  hemi: [number, number, number];
  key: [number, number];
  bloom: number; exposure: number;
}

const LOOKS: Record<InteriorStyle, Look> = {
  home: { floor: woodFloor, floorTint: 0xffffff, wall: () => wallTex('plaster', '#4a3a66', '#ff2a6d'), wallTint: 0xffffff, skirt: 0xff2a6d, sides: 'cut', hemi: [0x6a5ad8, 0x1a0a24, 0.35], key: [0x9888ff, 0.5], bloom: 0.6, exposure: 1.15 },
  corridor: { floor: linoFloor, floorTint: 0xffffff, wall: () => wallTex('panel', '#3a3456', '#f5e663', 4), wallTint: 0xffffff, skirt: 0x00f0ff, sides: 'open', hemi: [0x7a8ad8, 0x2a1438, 0.85], key: [0xc8c0ff, 0.6], bloom: 0.6, exposure: 1.15 },
  clinic: { floor: () => tileFloor('#c8dce0', '#a8c4cc', '#6a8088', 0.45), floorTint: 0xffffff, wall: () => wallTex('tile', '#9ab8c0', '#ff3b3b', 8), wallTint: 0xffffff, skirt: 0xff3b3b, sides: 'cut', hemi: [0x9ad8e8, 0x302838, 0.8], key: [0xd8f4ff, 0.75], bloom: 0.5, exposure: 1.05 },
  den: { floor: () => concreteFloor('#2a3432'), floorTint: 0xffffff, wall: () => wallTex('concrete', '#232a2c', '#39ff88', 12), wallTint: 0xffffff, skirt: 0x39ff88, sides: 'cut', hemi: [0x2a8a6a, 0x101a20, 0.7], key: [0x88ffd0, 0.35], bloom: 0.75, exposure: 1.1 },
};

type Follow = { x: number; y: number; body?: unknown };
interface Char { rig: Rig; holder: THREE.Group; src: Follow; face: () => { x: number; y: number } | null; anim: () => AnimName; offsetY: number; blob: THREE.Mesh; seat: number }

export interface Placement extends ModelOpts {
  /** Base height (m). */
  h?: number;
  yaw?: number;
  /** Fit: width along x (m) after the turn, or height (m), or plain scale. */
  w?: number; height?: number; s?: number;
  /** Extra depth offset (m, + = towards the camera). */
  dz?: number;
  /** Non-uniform stretch after the fit (x, y, z). */
  stretch?: [number, number, number];
}

export class Interior3D {
  private chars: Char[] = [];
  readonly anim = new Animator();
  /** Screen y of the back wall's foot. */
  backY = 64;
  /** z of the back wall's face. */
  wallZ = 0;
  readonly look: Look;

  constructor(private world: World3D, readonly style: InteriorStyle) { this.look = LOOKS[style]; }

  /** This room's own group: what loads after the player left goes nowhere. */
  group = new THREE.Group();
  add<T extends THREE.Object3D>(o: T) { this.group.add(o); return o; }

  /** Shell (floor, back wall, side cuts, lights), then the room's set. */
  async build(grid: string[], set?: (v: Interior3D) => Promise<void>) {
    const w = this.world, L = this.look;
    this.group = w.resetBoard();
    w.scene.fog = null;
    w.scene.background = new THREE.Color(0x05030c);
    w.scene.environmentIntensity = 0;
    w.renderer.toneMappingExposure = L.exposure;
    w.bloom.strength = L.bloom;
    const floorAt = (tx: number, ty: number) => '.oP'.includes(grid[ty]?.[tx] ?? '#');
    const firstFloor = grid.findIndex((row, ty) => [...row].some((_, tx) => floorAt(tx, ty)));
    this.backY = Math.max(BACK_Y, firstFloor * TILE);
    this.wallZ = depthOf(this.backY);
    const cols = grid[0].length;

    // Floor: one painted plane from the back wall to below the screen, world-space UVs (2 m per repeat).
    const fw = cols * TILE * K, fd = depthOf(300 - this.backY);
    const floorTex = L.floor().clone(); floorTex.needsUpdate = true;
    floorTex.repeat.set(fw / 2, fd / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), new THREE.MeshStandardMaterial({ map: floorTex, color: L.floorTint, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(fw / 2, 0, this.wallZ + fd / 2);
    floor.receiveShadow = true;
    this.add(floor);

    // Back wall: a thick slab whose face is the room's backdrop.
    const wallTexture = L.wall().clone(); wallTexture.needsUpdate = true;
    wallTexture.repeat.set(fw / 2, 1);
    wallTexture.offset.set(0, 0);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture, color: L.wallTint, roughness: 0.95 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(fw, WALL_H), wallMat);
    back.position.set(fw / 2, WALL_H / 2, this.wallZ);
    back.receiveShadow = true;
    this.add(back);
    const behind = new THREE.Mesh(new THREE.BoxGeometry(fw, WALL_H, 0.4), new THREE.MeshBasicMaterial({ color: 0x05030c }));
    behind.position.set(fw / 2, WALL_H / 2, this.wallZ - 0.21);
    this.add(behind);
    // Skirting board with a thin neon line.
    this.add(this.box(new THREE.Vector3(fw / 2, 0, this.wallZ + 0.03), fw, 0.12, 0.06, this.mat(0x1a1428)));
    const line = this.add(new THREE.Mesh(new THREE.BoxGeometry(fw, 0.02, 0.01), this.glow(L.skirt, 1.4)));
    line.position.set(fw / 2, 0.125, this.wallZ + 0.055);

    // Side walls of a closed room: thick cuts, dark tops edged with a neon line (a diorama frame).
    if (L.sides === 'cut') {
      for (const side of [0, cols - 1]) {
        if (grid.every(r => r[side] !== '#')) continue;
        const x0 = side === 0 ? 0 : (cols - 1) * TILE, cx = (x0 + TILE / 2) * K;
        const d = depthOf(420);
        const cut = new THREE.Mesh(new THREE.BoxGeometry(TILE * K, WALL_H, d), [this.mat(0x120c20), this.mat(0x120c20), new THREE.MeshBasicMaterial({ color: 0x0a0716 }), this.mat(0x120c20), this.mat(0x120c20), this.mat(0x120c20)]);
        cut.position.set(cx, WALL_H / 2, this.wallZ + d / 2 - 0.2);
        cut.castShadow = true;
        this.add(cut);
        const edgeX = side === 0 ? (x0 + TILE) * K - 0.03 : x0 * K + 0.03;
        const edge = this.add(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, d), this.glow(L.skirt, 1.2)));
        edge.position.set(edgeX, WALL_H + 0.01, this.wallZ + d / 2 - 0.2);
      }
    }

    // Ambient fill and a soft key light from the front-top, for shadows that ground everything.
    this.add(new THREE.HemisphereLight(L.hemi[0], L.hemi[1], L.hemi[2]));
    const key = new THREE.DirectionalLight(L.key[0], L.key[1]);
    const mid = at(240, 150);
    key.position.copy(mid).add(new THREE.Vector3(-3, 12, 8));
    key.target.position.copy(mid);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
    key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03;
    this.add(key); this.add(key.target);
    this.framePhaser();
    if (set) await set(this);
  }

  /** Orthographic camera covering exactly what the Phaser camera shows (x 0-480, y -14-256). */
  framePhaser(scrollY = -14, viewW = 480, viewH = 270) {
    const cam = this.world.camera;
    const centre = at(viewW / 2, scrollY + viewH / 2);
    const fwd = new THREE.Vector3(0, -SIN, -COS);
    cam.position.copy(centre).addScaledVector(fwd, -40);
    cam.up.set(0, 1, 0);
    cam.lookAt(centre);
    cam.zoom = 1;
    cam.left = (-viewW / 2) * K; cam.right = (viewW / 2) * K;
    cam.top = (viewH / 2) * K; cam.bottom = (-viewH / 2) * K;
    cam.near = 0.1; cam.far = 120;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  // ------------------------------------------------------------------ dressing helpers

  at(px: number, py: number, h = 0) { return at(px, py, h); }
  /** A point on the back wall face at screen x `px`, height `h` (m), `d` metres out from it. */
  onWall(px: number, h: number, d = 0) { return new THREE.Vector3(px * K, h, this.wallZ + d); }
  /** Screen y (px) of a point on the back wall at height h. */
  wallScreenY(h: number) { return this.backY - h * PX_PER_M; }

  private mats = new Map<string, THREE.MeshStandardMaterial>();
  /** A lit, flat-coloured material (cached). */
  mat(color: number, o: { rough?: number; metal?: number; emissive?: number; ei?: number } = {}) {
    const k = `${color}:${o.rough}:${o.metal}:${o.emissive}:${o.ei}`;
    let m = this.mats.get(k);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0 });
      if (o.emissive !== undefined) { m.emissive.setHex(o.emissive); m.emissiveIntensity = o.ei ?? 1; }
      this.mats.set(k, m);
    }
    return m;
  }
  /** Unlit glowing colour (neon tubes, LEDs), `k` > 1 makes it bloom. */
  glow(color: number, k = 1.5) {
    const m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    m.color.multiplyScalar(k);
    return m;
  }

  /** A box with its base centred on `base`. */
  box(base: THREE.Vector3, w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], o: { yaw?: number; shadow?: boolean } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.copy(base); m.position.y += h / 2;
    m.rotation.y = o.yaw ?? 0;
    m.castShadow = o.shadow !== false; m.receiveShadow = true;
    return this.add(m);
  }

  cyl(base: THREE.Vector3, rTop: number, rBottom: number, h: number, mat: THREE.Material, seg = 12) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), mat);
    m.position.copy(base); m.position.y += h / 2;
    m.castShadow = true; m.receiveShadow = true;
    return this.add(m);
  }

  /** A vertical plane facing the camera (+z), centred on `centre`. */
  plane(centre: THREE.Vector3, w: number, h: number, mat: THREE.Material, yaw = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.copy(centre); m.rotation.y = yaw;
    m.receiveShadow = true;
    return this.add(m);
  }

  /** A flat decal on the floor (rug, puddle, markings). `w`, `d` in metres. */
  decal(px: number, py: number, w: number, d: number, mat: THREE.Material, lift = 0.004, yaw = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.set(-Math.PI / 2, 0, yaw);
    m.position.copy(at(px, py, lift));
    m.receiveShadow = true;
    return this.add(m);
  }

  /** A pool of coloured light on the floor (additive). */
  pool(px: number, py: number, r: number, color: number, strength = 0.5, sz = 1) {
    const m = new THREE.MeshBasicMaterial({ map: radial(0.35), color, transparent: true, opacity: strength, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const d = this.decal(px, py, r * 2, r * 2 * sz, m, 0.012);
    d.renderOrder = 2;
    return m;
  }

  /** A wash of light on the back wall (sconces, screens, signs). */
  wash(px: number, h: number, w: number, hh: number, color: number, strength = 0.4, d = 0.02) {
    const m = new THREE.MeshBasicMaterial({ map: radial(0.3), color, transparent: true, opacity: strength, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const p = this.plane(this.onWall(px, h, d), w, hh, m);
    p.renderOrder = 2;
    return m;
  }

  /** A volumetric cone of light pointing down from `top` (operating lamp, ceiling spot). */
  cone(top: THREE.Vector3, rTop: number, rBottom: number, h: number, color: number, strength = 0.25) {
    const m = new THREE.MeshBasicMaterial({ map: beam(), color, transparent: true, opacity: strength, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const c = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 24, 1, true), m);
    c.position.copy(top); c.position.y -= h / 2;
    c.renderOrder = 3;
    this.add(c);
    return m;
  }

  light(px: number, py: number, h: number, color: number, intensity = 4, distance = 6, decay = 1.6) {
    const l = new THREE.PointLight(color, intensity * LIGHT_K, distance, decay);
    l.position.copy(at(px, py, h));
    return this.add(l);
  }

  /** A kit model placed on the ground at (px, py). */
  async model(id: string, px: number, py: number, o: Placement = {}) {
    const m = await kitModel(id, o);
    m.rotation.y = o.yaw ?? 0;
    const size = m.userData.size as THREE.Vector3;
    const turned = Math.abs(Math.sin(o.yaw ?? 0)) > 0.7 ? size.z : size.x;
    const s = o.s ?? (o.w ? o.w / Math.max(0.01, turned) : o.height ? o.height / Math.max(0.01, size.y) : 1);
    m.scale.setScalar(s);
    if (o.stretch) m.scale.multiply(new THREE.Vector3(...o.stretch));
    m.position.copy(at(px, py, o.h ?? 0));
    if (o.dz) m.position.z += o.dz;
    return this.add(m);
  }

  /** The same model against the back wall (its back touching the wall face). */
  async wallModel(id: string, px: number, o: Placement & { out?: number } = {}) {
    const m = await this.model(id, px, this.backY, o);
    const bb = new THREE.Box3().setFromObject(m);
    m.position.z += this.wallZ - bb.min.z + (o.out ?? 0.01);
    return m;
  }

  /**
   * Neon lettering: a dark backing plate and the glowing text, standing out of the back wall at
   * screen x `px`, centred at height `h`, `hh` metres tall. Flickers now and then.
   */
  neon(text: string, px: number, h: number, hh: number, color: number, o: { font?: string; sub?: string; frame?: boolean; backing?: boolean; d?: number; broken?: boolean; washK?: number; light?: number; centre?: THREE.Vector3 } = {}) {
    const { tex, aspect } = neonText(text, color, { font: o.font, sub: o.sub, frame: o.frame });
    const w = hh * aspect;
    const g = new THREE.Group();
    g.position.copy(o.centre ?? this.onWall(px, h, o.d ?? 0.16));
    if (o.backing !== false) {
      const back = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, hh * 0.86, 0.05), this.mat(0x0c0818, { rough: 0.6 }));
      back.position.z = -0.03; back.castShadow = true;
      g.add(back);
    }
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false });
    mat.color.setScalar(1.6);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), mat);
    p.position.z = 0.005; p.renderOrder = 4;
    g.add(p);
    this.add(g);
    const washM = this.wash(px, h, w * 1.8, hh * 3, color, (o.washK ?? 1) * 0.35, (o.d ?? 0.06) - 0.04);
    let l: THREE.PointLight | undefined;
    if (o.light) { l = new THREE.PointLight(color, o.light * LIGHT_K, 4.5, 1.6); l.position.copy(g.position).add(new THREE.Vector3(0, -0.2, 0.6)); this.add(l); }
    flicker(this.anim, mat, 1.6, l, { broken: o.broken });
    return { group: g, mat, w, washM };
  }

  /** A printed plate (door numbers, names), `hh` metres tall, on the wall. */
  plate(text: string, px: number, h: number, hh: number, fg = '#e8e8ff', bg = '#141020', d = 0.07) {
    const { tex, aspect } = plateText(text, fg, bg);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 });
    return this.plane(this.onWall(px, h, d), hh * aspect, hh, m);
  }

  /** A screen that redraws itself (`fps`), glowing; optional bezel. */
  screen(centre: THREE.Vector3, w: number, h: number, draw: Parameters<typeof liveCanvas>[4], o: { fps?: number; res?: number; yaw?: number; bezel?: number; k?: number; tilt?: number } = {}) {
    const res = o.res ?? 160;
    const tex = liveCanvas(this.anim, res, Math.max(8, Math.round((res * h) / w)), o.fps ?? 8, draw);
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    mat.color.setScalar(o.k ?? 1.25);
    const g = new THREE.Group();
    g.position.copy(centre); g.rotation.y = o.yaw ?? 0; g.rotation.x = o.tilt ?? 0;
    if (o.bezel !== undefined) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.04), this.mat(o.bezel, { rough: 0.5 }));
      b.position.z = -0.022; b.castShadow = true;
      g.add(b);
    }
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    g.add(p);
    this.add(g);
    return { group: g, mat, tex };
  }

  /** A cable or pipe through points (m). `sag`: hangs between them. */
  cable(points: THREE.Vector3[], r = 0.025, color = 0x0c0a12, o: { glow?: number } = {}) {
    const curve = new THREE.CatmullRomCurve3(points);
    const mat = o.glow !== undefined ? this.glow(o.glow, 1.3) : this.mat(color, { rough: 0.5 });
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, points.length * 8), r, 6), mat);
    m.castShadow = true;
    return this.add(m);
  }

  /** A cable hanging between two points with some slack, swaying. */
  hang(a: THREE.Vector3, b: THREE.Vector3, slack = 0.4, r = 0.02, color = 0x0c0a12, swayAmp = 0.04) {
    const pts = Array.from({ length: 9 }, (_, i) => {
      const k = i / 8;
      return new THREE.Vector3().lerpVectors(a, b, k).add(new THREE.Vector3(0, -Math.sin(k * Math.PI) * slack, 0));
    });
    const pivot = new THREE.Group();
    pivot.position.copy(a).lerp(b, 0.5);
    const local = pts.map(p => p.clone().sub(pivot.position));
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(local), 32, r, 5), this.mat(color, { rough: 0.5 }));
    m.castShadow = true;
    pivot.add(m);
    this.add(pivot);
    // Swing about the line between the anchors.
    const axis = new THREE.Vector3().subVectors(b, a).normalize();
    const ph = Math.random() * 6;
    this.anim.add(t => { pivot.quaternion.setFromAxisAngle(axis, Math.sin(t * 0.9 + ph) * swayAmp); });
    return pivot;
  }

  steam(px: number, py: number, h: number, o: Parameters<typeof steam>[3] = {}) { steam(this.anim, this.group, at(px, py, h), o); }
  dust(centre: THREE.Vector3, size: THREE.Vector3, color = 0xffffff, n = 40) { dust(this.anim, this.group, centre, size, color, n); }
  sway(o: THREE.Object3D, amp = 0.05, speed = 1, axis: 'x' | 'z' = 'z') { sway(this.anim, o, amp, speed, axis); }

  /**
   * A door in the back wall at screen x: frame, sliding panel, light strip, keypad, a light pool on
   * the floor in front. `wide` for the elevator.
   */
  door(px: number, color: number, o: { wide?: boolean; panel?: number; open?: boolean; strip?: boolean } = {}) {
    const g = new THREE.Group();
    const W = o.wide ? 1.9 : 1.0, H = 2.15, frameM = this.mat(0x221a34, { rough: 0.5, metal: 0.3 });
    g.position.copy(this.onWall(px, 0, 0));
    const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; g.add(b); return b;
    };
    add(0.12, H + 0.12, 0.14, -W / 2 - 0.06, (H + 0.12) / 2, 0.07, frameM);
    add(0.12, H + 0.12, 0.14, W / 2 + 0.06, (H + 0.12) / 2, 0.07, frameM);
    add(W + 0.24, 0.14, 0.16, 0, H + 0.07, 0.08, frameM);
    const panelM = this.mat(o.panel ?? 0x2c2440, { rough: 0.45, metal: 0.4 });
    if (o.wide) {
      add(W / 2 - 0.01, H, 0.05, -W / 4, H / 2, 0.03, panelM);
      add(W / 2 - 0.01, H, 0.05, W / 4, H / 2, 0.03, panelM);
    } else if (o.open) {
      add(W, H, 0.02, 0, H / 2, 0.01, new THREE.MeshBasicMaterial({ color: 0x020104 }));
    } else {
      add(W, H, 0.05, 0, H / 2, 0.03, panelM);
      // A small window and a horizontal groove.
      add(W * 0.5, 0.03, 0.01, 0, H * 0.45, 0.06, this.mat(0x120e1c));
      add(W * 0.36, 0.22, 0.01, 0, H * 0.72, 0.06, this.glow(color, 0.5));
    }
    // Light strips on the frame (the colour of the place behind).
    if (o.strip !== false) {
      const sm = this.glow(color, 1.8);
      add(0.03, H, 0.02, -W / 2 - 0.005, H / 2, 0.15, sm);
      add(0.03, H, 0.02, W / 2 + 0.005, H / 2, 0.15, sm);
      add(W + 0.02, 0.03, 0.02, 0, H + 0.005, 0.17, sm);
    }
    // Keypad with a blinking LED.
    add(0.14, 0.22, 0.04, W / 2 + 0.26, 1.15, 0.02, this.mat(0x15101e));
    const led = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    add(0.04, 0.04, 0.01, W / 2 + 0.26, 1.21, 0.045, led);
    const ph = Math.random() * 5;
    this.anim.add(t => led.color.setHex(color).multiplyScalar(Math.sin(t * 2 + ph) > 0.6 ? 2 : 0.4));
    this.add(g);
    this.pool(px, this.backY + 14, o.wide ? 1.4 : 0.9, color, 0.35, 0.8);
    this.wash(px, H * 0.5, W * 2.2, H * 1.6, color, 0.18);
    return g;
  }

  /** A soft dark blob on the floor (under characters and furniture that floats on cel shadows). */
  blob(px: number, py: number, w: number, d: number, k = 0.45) {
    const m = new THREE.MeshBasicMaterial({ map: radial(0.55), color: 0x000000, transparent: true, opacity: k, depthWrite: false });
    const b = this.decal(px, py, w, d, m, 0.008);
    b.renderOrder = 1;
    return b;
  }

  canvas = canvasTex;

  // ------------------------------------------------------------------ characters

  /** A character following a Phaser sprite (player, NPC): position, facing and animation. */
  character(src: Follow, kind: string, model: string | undefined, face: () => { x: number; y: number } | null, anim: () => AnimName, offsetY = 0, seat = 0) {
    const holder = new THREE.Group();
    let rig: Rig = new MannequinRig(kind === 'player' ? 'player' : 'npc');
    holder.add(rig.root);
    this.add(holder);
    const blobM = new THREE.MeshBasicMaterial({ map: radial(0.5), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.55), blobM);
    blob.rotation.x = -Math.PI / 2; blob.renderOrder = 1;
    this.add(blob);
    const c: Char = { rig, holder, src, face, anim, offsetY, blob, seat };
    this.chars.push(c);
    const real = new CharacterRig(model ?? CAST[kind] ?? 'res0');
    void real.ready.then(loaded => { if (!loaded) return; holder.remove(rig.root); holder.add(real.root); rig = real; c.rig = real; });
  }

  /**
   * Seated pose on top of the clip (there is no sitting animation): thighs forward, shins down,
   * hips lowered onto the seat. Works on the VRM normalized bones, then re-syncs the skeleton.
   */
  private tmp = new THREE.Vector3();
  private sit(c: Char) {
    const vrm = (c.rig as unknown as { vrm?: VRM }).vrm;
    if (!vrm) { c.holder.position.y = c.seat + 0.06 - 0.86; return; }
    const flip = vrm.meta?.metaVersion === '0' ? -1 : 1, h = vrm.humanoid;
    const set = (name: VRMHumanBoneName, x: number, z = 0) => h.getNormalizedBoneNode(name)?.quaternion.setFromEuler(new THREE.Euler(x * flip, 0, z * flip));
    set('leftUpperLeg', -1.45, 0.1); set('rightUpperLeg', -1.45, -0.1);
    set('leftLowerLeg', 1.5); set('rightLowerLeg', 1.5);
    set('leftFoot', -0.05); set('rightFoot', -0.05);
    // The clip may turn or lift the hips (talking): keep them square on the seat.
    const hips = h.getNormalizedBoneNode('hips');
    if (hips) {
      hips.quaternion.identity();
      c.holder.updateMatrixWorld(true);
      const rel = hips.getWorldPosition(this.tmp).y - c.holder.position.y;
      c.holder.position.y = c.seat + 0.1 - rel;
    }
    h.update();
  }

  update(dt: number) {
    for (const c of this.chars) {
      c.holder.position.copy(at(c.src.x, c.src.y + 7 + c.offsetY));
      c.blob.position.copy(c.holder.position).setY(0.01);
      const f = c.face();
      if (f && (f.x || f.y)) {
        const target = Math.atan2(f.x, f.y / SIN);
        let d = target - c.holder.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        c.holder.rotation.y += d * Math.min(1, dt * 12);
      }
      c.rig.play(c.anim());
      c.rig.update(dt);
      if (c.seat) this.sit(c);
    }
    this.anim.update(dt);
  }
}
