import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MToonMaterial, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * Cyberware: procedural augmentations (mechanical arms, visors, implants, ports, armour) bolted
 * onto the VRM avatars so they read as the augmented people of the old pixel-art game.
 *
 * Every part is low-poly geometry built here, fitted to the avatar from its own skin (limb radii,
 * face and back surfaces are measured on the vertices at rest) and parented to a normalized
 * humanoid bone, so it follows the retargeted Mixamo clips. Parts on one bone are merged into a
 * single mesh with three material groups: dark metal (MToon, cel-shaded like the body), neon
 * (unlit) and an ink hull (the black outline). Geometry is built once per avatar and shared by
 * every copy of it; only the metal material is per character (hit flashes and the board's rim
 * light change it).
 *
 * Tuning: the look of each character is the `CYBER` table below. Sizes are in metres of the
 * avatar's own model (about 1.5-1.8 m tall); a part's numbers sit in its builder (`arm`, `visor`…).
 */

type Side = 'L' | 'R';
type Tone = 'chrome' | 'steel' | 'dark' | 'gold' | 'red' | 'white';

export type Part =
  /** Mechanical forearm + hand (the real one is hidden). `upper`: the upper arm is armoured too. */
  | { kind: 'arm'; side: Side; glow: number; tone?: Tone; upper?: boolean; bulk?: number; tool?: 'cannon' | 'surgeon' }
  /** Armoured shell over the sleeve, the real hand kept; `deck`: a cyberdeck on top. */
  | { kind: 'bracer'; side: Side; glow: number; tone?: Tone; deck?: boolean }
  /** Shin plate and knee cap; `spring`: piston and coil behind the calf (runner). */
  | { kind: 'leg'; side: Side; glow: number; tone?: Tone; spring?: boolean }
  /** LED band across the eyes; `goggles`: two lens tubes on a strap. */
  | { kind: 'visor'; glow: number; style?: 'band' | 'goggles' }
  | { kind: 'eye'; side: Side; glow: number; loupe?: boolean }
  /** Glowing implant lines on the cheek. */
  | { kind: 'cheek'; side: Side; glow: number }
  | { kind: 'ear'; side: Side; glow: number }
  /** Ports at the nape. */
  | { kind: 'jack'; glow: number }
  /** Cables from the back of the skull; `crest`: a row of cable spikes over the head. */
  | { kind: 'cables'; glow: number; crest?: boolean }
  | { kind: 'spine'; glow: number }
  /** Chest armour; `core`: a glowing core in the middle. */
  | { kind: 'plate'; glow: number; tone?: Tone; core?: boolean }
  /** A few LEDs on the jacket. */
  | { kind: 'leds'; glow: number }
  | { kind: 'shoulder'; side: Side; glow: number; tone?: Tone }
  /** Pressurised tanks on the back (bomber). */
  | { kind: 'tanks'; glow: number }
  | { kind: 'mask'; glow: number }
  /** Full helmet with a visor slit (Psy-Sec); `horns` for the Executioner. */
  | { kind: 'helmet'; glow: number; tone?: Tone; horns?: boolean }
  | { kind: 'halo'; glow: number };

const C = { cyan: 0x00f0ff, magenta: 0xff2a6d, yellow: 0xf5e663, green: 0x39ff88, violet: 0xb84dff, orange: 0xff8c2a, red: 0xff3b3b };
const TONES: Record<Tone, number> = { chrome: 0x9c9ac4, steel: 0x5c5880, dark: 0x2e2a48, gold: 0xd9a441, red: 0x8a1a34, white: 0xd8d4ea };

/** Who wears what: the identity of each character from the pixel-art game. */
export const CYBER: Record<string, Part[]> = {
  // The player: chrome arm (on the left, as in the sprite), cyber eye, ports, the cyan of the game.
  hero: [
    { kind: 'arm', side: 'L', glow: C.cyan, tone: 'chrome', upper: true },
    { kind: 'shoulder', side: 'L', glow: C.cyan, tone: 'steel' },
    { kind: 'eye', side: 'R', glow: C.cyan },
    { kind: 'cheek', side: 'R', glow: C.cyan },
    { kind: 'jack', glow: C.cyan },
  ],
  // Lo, the ramen grandma: an old kitchen arm and a warm eye.
  lo: [
    { kind: 'arm', side: 'R', glow: C.orange, tone: 'steel' },
    { kind: 'eye', side: 'L', glow: C.orange },
  ],
  // Doc Kessler, ripperdoc: surgical hand, loupe over one eye, implant lines.
  doc: [
    { kind: 'arm', side: 'R', glow: C.green, tone: 'white', tool: 'surgeon' },
    { kind: 'eye', side: 'L', glow: C.green, loupe: true },
    { kind: 'cheek', side: 'R', glow: C.green },
    { kind: 'leds', glow: C.green },
  ],
  // Nyx, netrunner: neuro-interface cables, visor, nape ports, a spine.
  nyx: [
    { kind: 'visor', glow: C.violet },
    { kind: 'cables', glow: C.violet },
    { kind: 'jack', glow: C.violet },
    { kind: 'cheek', side: 'L', glow: C.magenta },
    { kind: 'spine', glow: C.violet },
  ],
  // Enemies: one silhouette each.
  runner: [
    { kind: 'leg', side: 'L', glow: C.magenta, spring: true },
    { kind: 'leg', side: 'R', glow: C.magenta, spring: true },
    { kind: 'cheek', side: 'L', glow: C.magenta },
    { kind: 'eye', side: 'R', glow: C.magenta },
  ],
  gunner: [
    { kind: 'visor', glow: C.orange },
    { kind: 'arm', side: 'R', glow: C.orange, tone: 'steel', tool: 'cannon' },
    { kind: 'shoulder', side: 'R', glow: C.orange, tone: 'dark' },
  ],
  brute: [
    { kind: 'arm', side: 'L', glow: C.red, tone: 'chrome', upper: true, bulk: 1.5 },
    { kind: 'arm', side: 'R', glow: C.red, tone: 'chrome', upper: true, bulk: 1.5 },
    { kind: 'shoulder', side: 'L', glow: C.red, tone: 'chrome' },
    { kind: 'shoulder', side: 'R', glow: C.red, tone: 'chrome' },
    { kind: 'plate', glow: C.red, tone: 'steel' },
    { kind: 'eye', side: 'L', glow: C.red },
  ],
  bomber: [
    { kind: 'tanks', glow: C.yellow },
    { kind: 'mask', glow: C.yellow },
    { kind: 'visor', glow: C.yellow, style: 'goggles' },
  ],
  hacker: [
    { kind: 'cables', glow: C.green, crest: true },
    { kind: 'bracer', side: 'L', glow: C.green, deck: true },
    { kind: 'eye', side: 'L', glow: C.green },
    { kind: 'jack', glow: C.green },
  ],
  warden: [
    { kind: 'helmet', glow: C.magenta, tone: 'dark' },
    { kind: 'plate', glow: C.magenta, tone: 'dark', core: true },
    { kind: 'shoulder', side: 'L', glow: C.magenta, tone: 'dark' },
    { kind: 'shoulder', side: 'R', glow: C.magenta, tone: 'dark' },
    { kind: 'bracer', side: 'L', glow: C.magenta, tone: 'dark' },
    { kind: 'bracer', side: 'R', glow: C.magenta, tone: 'dark' },
  ],
  boss: [
    { kind: 'helmet', glow: C.magenta, tone: 'dark', horns: true },
    { kind: 'halo', glow: C.magenta },
    { kind: 'plate', glow: C.magenta, tone: 'gold', core: true },
    { kind: 'shoulder', side: 'L', glow: C.magenta, tone: 'gold' },
    { kind: 'shoulder', side: 'R', glow: C.magenta, tone: 'gold' },
    { kind: 'arm', side: 'L', glow: C.magenta, tone: 'dark', bulk: 1.2 },
  ],
  // Passers-by: one or two augmentations each.
  res0: [{ kind: 'eye', side: 'L', glow: C.cyan }, { kind: 'jack', glow: C.cyan }],
  res1: [{ kind: 'arm', side: 'R', glow: C.magenta, tone: 'chrome' }],
  res2: [{ kind: 'visor', glow: C.green }, { kind: 'leds', glow: C.green }],
  res3: [{ kind: 'ear', side: 'L', glow: C.violet }, { kind: 'cheek', side: 'L', glow: C.violet }],
  res4: [{ kind: 'leg', side: 'L', glow: C.orange }, { kind: 'eye', side: 'R', glow: C.orange }],
  res5: [{ kind: 'spine', glow: C.yellow }, { kind: 'jack', glow: C.yellow }],
  res6: [{ kind: 'visor', glow: C.cyan, style: 'goggles' }],
  res7: [{ kind: 'arm', side: 'L', glow: C.violet, tone: 'dark' }, { kind: 'cheek', side: 'R', glow: C.violet }],
  res8: [{ kind: 'leds', glow: C.magenta }, { kind: 'ear', side: 'R', glow: C.magenta }],
  res9: [{ kind: 'mask', glow: C.cyan }, { kind: 'bracer', side: 'R', glow: C.cyan }],
};

// ---- Shared geometry and materials --------------------------------------------------------

/** Faceted (flat normals) copy for the surface, smooth-normal copy for the ink hull. */
type Shape = { flat: THREE.BufferGeometry; smooth: THREE.BufferGeometry };
const shapes = new Map<string, Shape>();
function shape(key: string, make: () => THREE.BufferGeometry): Shape {
  let s = shapes.get(key);
  if (!s) {
    const g = make();
    g.deleteAttribute('uv');
    const flat = g.index ? g.toNonIndexed() : g.clone();
    flat.computeVertexNormals();
    const p = new THREE.BufferGeometry();
    p.setAttribute('position', g.getAttribute('position'));
    if (g.index) p.setIndex(g.index);
    const merged = mergeVertices(p, 1e-4);
    merged.computeVertexNormals();
    s = { flat, smooth: merged.index ? merged.toNonIndexed() : merged };
    shapes.set(key, s);
  }
  return s;
}
const BOX = () => shape('box', () => new THREE.BoxGeometry(1, 1, 1));
const CYL = (n = 8) => shape(`cyl${n}`, () => new THREE.CylinderGeometry(0.5, 0.5, 1, n));
/** Cylinder whose top radius is `k` times its bottom one. */
const TAPER = (k: number, n = 8) => shape(`taper${k}-${n}`, () => new THREE.CylinderGeometry(0.5 * k, 0.5, 1, n));
const BALL = () => shape('ball', () => new THREE.IcosahedronGeometry(0.5, 1));
const DOME = () => shape('dome', () => new THREE.SphereGeometry(0.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2));
const CONE = () => shape('cone', () => new THREE.ConeGeometry(0.5, 1, 6));
const RING = (tube = 0.12) => shape(`ring${tube}`, () => new THREE.TorusGeometry(0.5, 0.5 * tube, 4, 14));
/** Open band, `deg` degrees of a cylinder centred on +z (visors, straps). */
const BAND = (deg: number) => shape(`band${deg}`, () => {
  const t = THREE.MathUtils.degToRad(deg);
  return new THREE.CylinderGeometry(1, 1, 1, Math.max(6, Math.round(deg / 18)), 1, true, -t / 2, t);
});

const INK = 0x0a0614;
let glowMat: THREE.MeshBasicMaterial | undefined;
let inkMat: THREE.MeshBasicMaterial | undefined;
let metalBase: MToonMaterial | undefined;

function materials(): [MToonMaterial, THREE.MeshBasicMaterial, THREE.MeshBasicMaterial] {
  glowMat ??= new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  if (!inkMat) {
    // Inverted hull: back faces pushed out along the smoothed normals, a few millimetres.
    inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
    inkMat.onBeforeCompile = s => {
      s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * 0.0105;');
    };
    inkMat.customProgramCacheKey = () => 'cyber-ink';
  }
  if (!metalBase) {
    metalBase = new MToonMaterial({
      vertexColors: true,
      shadingToonyFactor: 0.92,
      shadingShiftFactor: -0.1,
      parametricRimFresnelPowerFactor: 3,
      parametricRimLiftFactor: 0.05,
      rimLightingMixFactor: 0.5,
    });
    metalBase.ignoreVertexColor = false; // MToon ignores them by default (VRM spec)
    metalBase.color.setHex(0xffffff);
    metalBase.shadeColorFactor.setHex(0x3a2f66);
    metalBase.parametricRimColorFactor.setHex(0x7a8cff);
  }
  return [metalBase.clone(), glowMat, inkMat];
}

// ---- Measuring the avatar -----------------------------------------------------------------

const pct = (a: number[], p: number) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
};
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/**
 * The avatar at rest, in world space (after rotateVRM0 every avatar faces +z, its left is +x):
 * bone positions and the skin vertices of each humanoid bone (`name+` = its non-humanoid
 * children: hair under the head, sleeve helpers under an arm…).
 */
class Body {
  private verts = new Map<string, THREE.Vector3[]>();
  constructor(private vrm: VRM) {
    vrm.scene.updateMatrixWorld(true);
    const human = new Map<THREE.Object3D, string>();
    for (const [name, b] of Object.entries(vrm.humanoid.humanBones)) if (b?.node) human.set(b.node, name);
    const owner = new Map<THREE.Object3D, string>();
    const ownerOf = (bone: THREE.Object3D): string => {
      let k = owner.get(bone);
      if (k === undefined) {
        k = human.get(bone);
        if (k === undefined) {
          let p = bone.parent;
          while (p && !human.has(p)) p = p.parent;
          k = p ? `${human.get(p)}+` : '';
        }
        owner.set(bone, k);
      }
      return k;
    };
    const v = new THREE.Vector3();
    vrm.scene.traverse(o => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      const pos = m.geometry.getAttribute('position'), si = m.geometry.getAttribute('skinIndex'), sw = m.geometry.getAttribute('skinWeight');
      if (!pos || !si || !sw) return;
      for (let i = 0; i < pos.count; i++) {
        let best = 0, bw = -1;
        for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (w > bw) { bw = w; best = si.getComponent(i, j); } }
        const bone = m.skeleton.bones[best];
        if (!bone) continue;
        const k = ownerOf(bone);
        if (!k) continue;
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        let list = this.verts.get(k);
        if (!list) this.verts.set(k, (list = []));
        list.push(v.clone());
      }
    });
  }

  node(name: VRMHumanBoneName) { return this.vrm.humanoid.getNormalizedBoneNode(name); }
  pos(name: VRMHumanBoneName) { return this.node(name)?.getWorldPosition(V()); }
  pts(...names: string[]) { return names.flatMap(n => this.verts.get(n) ?? []); }

  /** How far the skin of a limb reaches from its bone line a→b (the `p` percentile). */
  radius(names: string[], a: THREE.Vector3, b: THREE.Vector3, p = 0.85) {
    const ab = b.clone().sub(a), len2 = ab.lengthSq(), d: number[] = [];
    const t = V(), q = V();
    for (const v of this.pts(...names)) {
      const s = t.copy(v).sub(a).dot(ab) / len2;
      if (s < 0.15 || s > 0.85) continue;
      d.push(q.copy(a).addScaledVector(ab, s).distanceTo(v));
    }
    return pct(d, p);
  }

  /** The skin surface along z near (x, y): its front (`dir` 1) or back (`dir` -1). */
  surface(names: string[], x: number, y: number, r: number, dir: 1 | -1) {
    const z: number[] = [];
    for (const v of this.pts(...names)) if (Math.abs(v.x - x) < r && Math.abs(v.y - y) < r) z.push(v.z * dir);
    return z.length ? pct(z, 0.96) * dir : NaN;
  }

  /** How far the skin reaches sideways (toward +x if `dir` is 1) around height y. */
  side(names: string[], y: number, r: number, dir: 1 | -1) {
    const x: number[] = [];
    for (const v of this.pts(...names)) if (Math.abs(v.y - y) < r) x.push(v.x * dir);
    return x.length ? pct(x, 0.97) * dir : NaN;
  }

  /**
   * Where the eyes are: the vertices the blink expression moves most (the eyelids), halfway
   * through their travel. Eye bones and the head box are unreliable on these avatars.
   */
  eyes(cx: number): { y: number; x: number; z: number } | null {
    const ex = this.vrm.expressionManager?.getExpression('blink');
    const found: THREE.Vector3[] = [];
    const v = V(), d = V();
    for (const bind of ex?.binds ?? []) {
      const { primitives, index } = bind as { primitives?: THREE.Mesh[]; index?: number };
      if (!primitives || index === undefined) continue;
      for (const mesh of primitives) {
        const base = mesh.geometry.getAttribute('position'), delta = mesh.geometry.morphAttributes.position?.[index];
        if (!base || !delta) continue;
        const rel = mesh.geometry.morphTargetsRelative;
        let max = 0;
        for (let i = 0; i < delta.count; i++) {
          d.fromBufferAttribute(delta, i);
          if (!rel) d.sub(v.fromBufferAttribute(base, i));
          max = Math.max(max, d.length());
        }
        if (max < 1e-4) continue;
        for (let i = 0; i < delta.count; i++) {
          d.fromBufferAttribute(delta, i);
          v.fromBufferAttribute(base, i);
          if (!rel) d.sub(v);
          if (d.length() < max * 0.5) continue;
          found.push(v.addScaledVector(d, 0.5).applyMatrix4(mesh.matrixWorld).clone());
        }
      }
    }
    if (found.length < 4) return null;
    const ys = found.map(p => p.y), xs = found.map(p => Math.abs(p.x - cx));
    return { y: pct(ys, 0.5), x: pct(xs, 0.5), z: pct(found.map(p => p.z), 0.5) };
  }

  box(...names: string[]) {
    const b = new THREE.Box3();
    for (const v of this.pts(...names)) b.expandByPoint(v);
    return b;
  }
}

// ---- Building -----------------------------------------------------------------------------

type Vec = [number, number, number];
interface Piece { surf: THREE.BufferGeometry[]; glow: THREE.BufferGeometry[]; ink: THREE.BufferGeometry[] }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

/** Collects primitives per bone, in that bone's rest space. */
class Kit {
  pieces = new Map<VRMHumanBoneName, Piece>();
  hide = new Set<VRMHumanBoneName>();
  squeeze?: Squeeze;
  constructor(readonly body: Body) {}

  /**
   * One primitive: `frame` is a world matrix (origin + axes), pos/size/rot are in that frame;
   * `glow` parts are unlit neon and have no ink line unless `ink` says so.
   */
  put(bone: VRMHumanBoneName, frame: THREE.Matrix4, s: Shape, pos: Vec, size: Vec, color: number, o: { rot?: Vec; glow?: boolean; ink?: boolean } = {}) {
    const node = this.body.node(bone);
    if (!node || size.some(x => !(x > 0) || !isFinite(x)) || pos.some(x => !isFinite(x))) return;
    let p = this.pieces.get(bone);
    if (!p) this.pieces.set(bone, (p = { surf: [], glow: [], ink: [] }));
    _q.setFromEuler(_e.set(...(o.rot ?? [0, 0, 0])));
    const m = new THREE.Matrix4().compose(V(...pos), _q, V(...size)).premultiply(frame).premultiply(_m.copy(node.matrixWorld).invert());
    const col = new THREE.Color(color);
    const g = s.flat.clone().applyMatrix4(m);
    const n = g.getAttribute('position').count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    (o.glow ? p.glow : p.surf).push(g);
    if (o.ink ?? !o.glow) {
      const k = s.smooth.clone().applyMatrix4(m);
      k.setAttribute('color', new THREE.BufferAttribute(new Float32Array(k.getAttribute('position').count * 3), 3));
      p.ink.push(k);
    }
  }

  /** A rod between two points of a frame (cables, pistons). */
  rod(bone: VRMHumanBoneName, frame: THREE.Matrix4, a: Vec, b: Vec, r: number, color: number, o: { glow?: boolean; n?: number } = {}) {
    const A = V(...a), B = V(...b), d = B.clone().sub(A), len = d.length();
    if (len < 1e-4) return;
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
    const f = new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, V(1, 1, 1)).premultiply(frame);
    this.put(bone, f, CYL(o.n ?? 6), [0, 0, 0], [r * 2, len, r * 2], color, { glow: o.glow });
  }

  build(): { bone: VRMHumanBoneName; geometry: THREE.BufferGeometry }[] {
    const out: { bone: VRMHumanBoneName; geometry: THREE.BufferGeometry }[] = [];
    for (const [bone, p] of this.pieces) {
      const parts: THREE.BufferGeometry[] = [], slots: number[] = [];
      [p.surf, p.glow, p.ink].forEach((list, slot) => {
        if (!list.length) return;
        parts.push(mergeGeometries(list)!);
        slots.push(slot);
      });
      const g = mergeGeometries(parts, true);
      if (!g) continue;
      g.groups.forEach((gr, i) => { gr.materialIndex = slots[i]; });
      g.computeBoundingSphere();
      out.push({ bone, geometry: g });
    }
    return out;
  }
}

/** A frame at `o` whose y runs along `y` and whose x leans toward `x`. */
function frameOf(o: THREE.Vector3, y: THREE.Vector3, x: THREE.Vector3) {
  const Y = y.clone().normalize(), X = x.clone().addScaledVector(Y, -x.dot(Y)).normalize(), Z = X.clone().cross(Y);
  return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(o);
}
const UP = V(0, 1, 0), FWD = V(0, 0, 1);
const at = (o: THREE.Vector3) => new THREE.Matrix4().setPosition(o);

/**
 * The head, in a frame at its bone's x (x is relative to the middle of the face, y and z are
 * world): eye line, skull box, top of the hair, face surface and sides at a given height.
 */
interface Head { f: THREE.Matrix4; eyeY: number; eyeX: number; eyeZ: number; skull: THREE.Box3; top: number; cz: number; front: (x: number, y: number) => number; sideX: (y: number, dir: 1 | -1) => number; mouthY: number }
const headCache = new WeakMap<Body, Head | null>();
function head(k: Kit): Head | null {
  const b = k.body;
  if (headCache.has(b)) return headCache.get(b)!;
  const hp = b.pos('head');
  let res: Head | null = null;
  if (hp) {
    const skull = b.box('head');
    if (skull.isEmpty()) skull.setFromCenterAndSize(hp.clone().add(V(0, 0.1, 0)), V(0.16, 0.2, 0.18));
    const hair = b.box('head', 'head+');
    const h = skull.max.y - hp.y, eyes = b.eyes(hp.x);
    const eyeY = eyes?.y ?? hp.y + h * 0.35;
    const eyeX = eyes?.x ?? h * 0.14;
    const cz = (skull.min.z + skull.max.z) / 2;
    const front = (x: number, y: number) => { const z = b.surface(['head'], hp.x + x, y, 0.012, 1); return isFinite(z) ? z : skull.max.z; };
    const sideX = (y: number, dir: 1 | -1) => { const x = b.side(['head', 'head+'], y, 0.02, dir); return (isFinite(x) ? x : dir > 0 ? skull.max.x : skull.min.x) - hp.x; };
    // (The hair is skinned to the head bone too, hence the clamp on the top.)
    const eyeZ = eyes?.z ?? skull.max.z - 0.02;
    res = { f: at(V(hp.x, 0, 0)), eyeY, eyeX, eyeZ, skull, top: Math.max(skull.max.y, Math.min(hair.max.y, skull.max.y + 0.06)), cz, front, sideX, mouthY: eyeY - 0.058 };
  }
  headCache.set(b, res);
  return res;
}

const sgn = (s: Side) => (s === 'L' ? 1 : -1);
const bone = (s: Side, n: 'UpperArm' | 'LowerArm' | 'Hand' | 'UpperLeg' | 'LowerLeg' | 'Foot' | 'Shoulder') => `${s === 'L' ? 'left' : 'right'}${n}` as VRMHumanBoneName;

/** Limb frame: y along the bone, x toward the back of the arm (up at rest, palms down). */
function armFrames(k: Kit, s: Side) {
  const b = k.body;
  const ua = b.pos(bone(s, 'UpperArm')), la = b.pos(bone(s, 'LowerArm')), ha = b.pos(bone(s, 'Hand'));
  if (!ua || !la || !ha) return null;
  const tip = b.pos(`${s === 'L' ? 'left' : 'right'}MiddleProximal` as VRMHumanBoneName);
  const n = (x: string) => [x, `${x}+`];
  const rU = b.radius(n(bone(s, 'UpperArm')), ua, la), rF = b.radius(n(bone(s, 'LowerArm')), la, ha);
  const handLen = tip ? tip.distanceTo(ha) * 2 : 0.17;
  return {
    upper: frameOf(ua, la.clone().sub(ua), UP), lower: frameOf(la, ha.clone().sub(la), UP),
    hand: frameOf(ha, (tip ?? ha.clone().add(ha.clone().sub(la))).clone().sub(ha), UP),
    lu: ua.distanceTo(la), lf: la.distanceTo(ha),
    rU: THREE.MathUtils.clamp(isFinite(rU) ? rU : 0.045, 0.03, 0.08), rF: THREE.MathUtils.clamp(isFinite(rF) ? rF : 0.04, 0.028, 0.07),
    hs: THREE.MathUtils.clamp(handLen / 0.17, 0.7, 1.3),
    // The thumb is forward at rest: local -z on the left hand, +z on the right one.
    thumb: s === 'L' ? -1 : 1,
  };
}

function arm(k: Kit, p: Extract<Part, { kind: 'arm' }>) {
  const a = armFrames(k, p.side);
  if (!a) return;
  const bulk = p.bulk ?? 1, tone = TONES[p.tone ?? 'chrome'], dark = TONES.dark, steel = TONES.steel, g = p.glow;
  const LA = bone(p.side, 'LowerArm'), HA = bone(p.side, 'Hand'), UA = bone(p.side, 'UpperArm');
  const L = a.lf, r = Math.max(a.rF * 1.05, 0.034) * bulk;
  k.hide.add(LA);
  // Elbow joint, forearm shell, a neon strip on the back, a piston underneath, a lit wrist band.
  k.put(LA, a.lower, BALL(), [0, 0, 0], [r * 2.3, r * 2.3, r * 2.3], dark);
  k.put(LA, a.lower, TAPER(0.78), [0, L * 0.5, 0], [r * 2, L * 0.82, r * 2], tone);
  k.put(LA, a.lower, BOX(), [r * 0.88, L * 0.5, 0], [r * 0.3, L * 0.6, r * 0.55], dark);
  k.put(LA, a.lower, BOX(), [r * 1.04, L * 0.5, 0], [r * 0.08, L * 0.52, r * 0.22], g, { glow: true });
  k.rod(LA, a.lower, [-r * 0.95, L * 0.15, 0], [-r * 0.85, L * 0.78, 0], r * 0.22, TONES.chrome);
  k.put(LA, a.lower, CYL(10), [0, L * 0.86, 0], [r * 1.7, L * 0.05, r * 1.7], g, { glow: true });
  k.put(LA, a.lower, CYL(8), [0, L * 0.94, 0], [r * 1.5, L * 0.1, r * 1.5], dark);
  if (p.upper) {
    const ru = a.rU * 1.18 * bulk, lu = a.lu;
    k.put(UA, a.upper, TAPER(0.85), [0, lu * 0.55, 0], [ru * 2, lu * 0.8, ru * 2], tone);
    k.put(UA, a.upper, CYL(10), [0, lu * 0.55, 0], [ru * 2.12, lu * 0.06, ru * 2.12], g, { glow: true });
    if (bulk > 1.2) {
      // Hydraulics: two pistons along the upper arm.
      k.rod(UA, a.upper, [ru * 1.05, lu * 0.2, ru * 0.4], [ru * 0.95, lu * 1.05, ru * 0.3], ru * 0.2, TONES.chrome);
      k.rod(UA, a.upper, [ru * 1.05, lu * 0.2, -ru * 0.4], [ru * 0.95, lu * 1.05, -ru * 0.3], ru * 0.2, TONES.chrome);
      k.put(LA, a.lower, CYL(8), [0, L * 0.3, 0], [r * 2.25, L * 0.22, r * 2.25], steel);
    }
  }
  if (p.tool === 'cannon') {
    // The hand is a gun barrel: shroud, barrel, magazine, glowing muzzle.
    k.put(LA, a.lower, BOX(), [0, L * 1.05, 0], [r * 1.8, L * 0.35, r * 1.7], steel);
    k.put(LA, a.lower, CYL(8), [0, L * 1.35, 0], [r * 1.0, L * 0.5, r * 1.0], dark);
    k.put(LA, a.lower, BOX(), [-r * 1.2, L * 1.0, 0], [r * 0.9, L * 0.22, r * 0.8], dark);
    k.put(LA, a.lower, RING(0.35), [0, L * 1.6, 0], [r * 1.2, r * 1.2, r * 1.2], g, { glow: true, rot: [Math.PI / 2, 0, 0] });
    k.put(LA, a.lower, BOX(), [r * 0.95, L * 1.1, 0], [r * 0.08, L * 0.3, r * 0.3], g, { glow: true });
    k.hide.add(HA);
    return;
  }
  // Mechanical hand: palm, knuckle bar, half-curled fingers, thumb, lit knuckles.
  const s = a.hs * Math.sqrt(bulk), h = a.hand, t = a.thumb;
  k.put(HA, h, BOX(), [0, 0.045 * s, 0], [0.032 * s, 0.085 * s, 0.08 * s], tone);
  k.put(HA, h, BOX(), [0.002 * s, 0.092 * s, 0], [0.03 * s, 0.018 * s, 0.084 * s], dark);
  k.put(HA, h, BOX(), [0.0175 * s, 0.05 * s, 0], [0.004 * s, 0.05 * s, 0.05 * s], p.glow, { glow: true });
  if (p.tool === 'surgeon') {
    // Ripperdoc fingers: long thin tools with lit tips.
    for (let i = 0; i < 3; i++) {
      const z = (i - 1) * 0.026 * s;
      k.rod(HA, h, [0, 0.095 * s, z], [-0.01 * s, 0.17 * s, z], 0.005 * s, TONES.chrome, { n: 5 });
      k.put(HA, h, BOX(), [-0.011 * s, 0.175 * s, z], [0.008 * s, 0.014 * s, 0.008 * s], p.glow, { glow: true });
    }
  } else {
    const curl = 0.7;
    for (let i = 0; i < 4; i++) {
      const z = (i - 1.5) * 0.02 * s;
      k.put(HA, h, BOX(), [-Math.sin(curl) * 0.022 * s, 0.1 * s + Math.cos(curl) * 0.022 * s, z], [0.02 * s, 0.046 * s, 0.016 * s], tone, { rot: [0, 0, curl] });
    }
  }
  k.put(HA, h, BOX(), [-0.008 * s, 0.045 * s, t * 0.046 * s], [0.02 * s, 0.05 * s, 0.018 * s], tone, { rot: [t * 0.6, 0, 0.3] });
  k.hide.add(HA);
}

function bracer(k: Kit, p: Extract<Part, { kind: 'bracer' }>) {
  const a = armFrames(k, p.side);
  if (!a) return;
  const LA = bone(p.side, 'LowerArm'), L = a.lf, r = a.rF * 1.15, tone = TONES[p.tone ?? 'steel'];
  k.put(LA, a.lower, TAPER(0.85), [0, L * 0.6, 0], [r * 2, L * 0.55, r * 2], tone);
  k.put(LA, a.lower, CYL(10), [0, L * 0.4, 0], [r * 2.1, L * 0.04, r * 2.1], p.glow, { glow: true });
  if (p.deck) {
    // Cyberdeck strapped on the forearm, its screen lit.
    k.put(LA, a.lower, BOX(), [r * 1.05, L * 0.6, 0], [r * 0.55, L * 0.42, r * 1.7], TONES.dark);
    k.put(LA, a.lower, BOX(), [r * 1.34, L * 0.6, 0], [r * 0.05, L * 0.3, r * 1.25], p.glow, { glow: true });
  } else {
    k.put(LA, a.lower, BOX(), [r * 1.02, L * 0.62, 0], [r * 0.1, L * 0.3, r * 0.3], p.glow, { glow: true });
  }
}

function leg(k: Kit, p: Extract<Part, { kind: 'leg' }>) {
  const b = k.body, LL = bone(p.side, 'LowerLeg');
  const kn = b.pos(LL), ft = b.pos(bone(p.side, 'Foot'));
  if (!kn || !ft) return;
  const f = frameOf(kn, ft.clone().sub(kn), FWD), L = kn.distanceTo(ft);
  const rr = b.radius([LL, `${LL}+`], kn, ft);
  const r = THREE.MathUtils.clamp(isFinite(rr) ? rr : 0.05, 0.035, 0.09), tone = TONES[p.tone ?? 'chrome'];
  // Knee cap, shin plate with a neon strip, ankle collar.
  k.put(LL, f, BOX(), [r * 0.95, 0.01, 0], [r * 0.6, r * 1.3, r * 1.4], TONES.dark, { rot: [0, 0, 0.15] });
  k.put(LL, f, BOX(), [r * 1.02, L * 0.45, 0], [r * 0.35, L * 0.66, r * 1.35], tone);
  k.put(LL, f, BOX(), [r * 1.22, L * 0.45, 0], [r * 0.06, L * 0.5, r * 0.3], p.glow, { glow: true });
  k.put(LL, f, CYL(10), [0, L * 0.86, 0], [r * 2.15, L * 0.07, r * 2.15], TONES.dark);
  k.put(LL, f, CYL(10), [0, L * 0.8, 0], [r * 2.2, L * 0.025, r * 2.2], p.glow, { glow: true });
  if (p.spring) {
    // Jump legs: piston and coil behind the calf, spring heel.
    k.rod(LL, f, [-r * 1.05, L * 0.12, 0], [-r * 1.0, L * 0.88, 0], r * 0.16, TONES.chrome);
    for (let i = 0; i < 7; i++) k.put(LL, f, RING(0.3), [-r * 1.02, L * (0.3 + i * 0.075), 0], [r * 0.8, r * 0.8, r * 0.8], i % 3 === 1 ? p.glow : TONES.steel, { rot: [Math.PI / 2, 0, 0], glow: i % 3 === 1 });
    k.put(LL, f, BOX(), [-r * 1.0, L * 0.98, 0], [r * 0.7, L * 0.08, r * 0.9], TONES.dark);
  }
}

function visor(k: Kit, p: Extract<Part, { kind: 'visor' }>) {
  const h = head(k);
  if (!h) return;
  // In front of whatever covers the eyes already (bangs, the avatar's own glasses).
  const cover = k.body.surface(['head', 'head+', 'leftEye', 'rightEye', 'leftEye+', 'rightEye+'], h.f.elements[12], h.eyeY, 0.03, 1);
  const y = h.eyeY - 0.004, fz = Math.min(Math.max(h.front(0, y), h.eyeZ + 0.006, isFinite(cover) ? cover : -1), h.eyeZ + 0.03) + 0.006, sx = Math.max(h.sideX(y, 1), -h.sideX(y, -1)) + 0.008;
  const az = fz - h.cz + 0.008, ax = sx;
  const c: Vec = [0, y, h.cz];
  if (p.style === 'goggles') {
    for (const s of [1, -1]) {
      const ex = s * h.eyeX, z = h.front(ex, y);
      k.put('head', h.f, CYL(8), [ex, y, z + 0.012], [0.042, 0.03, 0.042], TONES.dark, { rot: [Math.PI / 2, 0, 0] });
      k.put('head', h.f, CYL(8), [ex, y, z + 0.0275], [0.032, 0.002, 0.032], p.glow, { rot: [Math.PI / 2, 0, 0], glow: true });
    }
    k.put('head', h.f, BAND(300), [0, y + 0.004, h.cz], [ax + 0.006, 0.014, az + 0.004], TONES.dark, { rot: [0, Math.PI, 0] });
    return;
  }
  // LED band over the eyes, dark rims, temple pieces.
  k.put('head', h.f, BAND(200), c, [ax, 0.03, az], p.glow, { glow: true, ink: true });
  k.put('head', h.f, BAND(206), [0, y + 0.017, h.cz], [ax + 0.003, 0.007, az + 0.003], TONES.dark);
  k.put('head', h.f, BAND(206), [0, y - 0.017, h.cz], [ax + 0.003, 0.007, az + 0.003], TONES.dark);
  for (const s of [1, -1]) k.put('head', h.f, BOX(), [s * (ax + 0.004), y, h.cz - 0.01], [0.012, 0.042, 0.04], TONES.steel);
}

function eye(k: Kit, p: Extract<Part, { kind: 'eye' }>) {
  const h = head(k);
  if (!h) return;
  const ex = sgn(p.side) * h.eyeX, y = h.eyeY, z = h.front(ex, y);
  if (p.loupe) {
    k.put('head', h.f, CYL(8), [ex, y, z + 0.02], [0.034, 0.04, 0.034], TONES.chrome, { rot: [Math.PI / 2, 0, 0] });
    k.put('head', h.f, CYL(8), [ex, y, z + 0.041], [0.026, 0.003, 0.026], p.glow, { rot: [Math.PI / 2, 0, 0], glow: true });
    k.rod('head', h.f, [ex, y, z + 0.01], [sgn(p.side) * (h.eyeX + 0.05), y + 0.012, h.cz], 0.004, TONES.dark);
    return;
  }
  // Cyber eye: a metal ring around it, a lit iris, a plate on the cheek bone.
  k.put('head', h.f, RING(0.16), [ex, y, z + 0.004], [0.042, 0.042, 0.042], TONES.chrome);
  k.put('head', h.f, CYL(8), [ex, y, z + 0.003], [0.016, 0.002, 0.016], p.glow, { rot: [Math.PI / 2, 0, 0], glow: true });
  k.put('head', h.f, BOX(), [ex + sgn(p.side) * 0.018, y - 0.026, h.front(ex + sgn(p.side) * 0.018, y - 0.026) + 0.002], [0.022, 0.008, 0.006], TONES.steel);
}

function cheek(k: Kit, p: Extract<Part, { kind: 'cheek' }>) {
  const h = head(k);
  if (!h) return;
  const s = sgn(p.side), x = s * h.eyeX * 1.25;
  for (let i = 0; i < 3; i++) {
    const y = h.eyeY - 0.028 - i * 0.011, xi = x + s * i * 0.003;
    k.put('head', h.f, BOX(), [xi, y, h.front(xi, y) + 0.0015], [0.022 - i * 0.005, 0.0035, 0.004], p.glow, { glow: true });
  }
  const y = h.eyeY - 0.04;
  k.put('head', h.f, BOX(), [x + s * 0.014, y, h.front(x + s * 0.014, y) + 0.0015], [0.0035, 0.03, 0.004], p.glow, { glow: true });
}

function ear(k: Kit, p: Extract<Part, { kind: 'ear' }>) {
  const h = head(k);
  if (!h) return;
  const s = sgn(p.side), y = h.eyeY - 0.012, x = h.sideX(y, s as 1 | -1);
  k.put('head', h.f, CYL(10), [x + s * 0.004, y, h.cz], [0.05, 0.018, 0.05], TONES.steel, { rot: [0, 0, Math.PI / 2] });
  k.put('head', h.f, RING(0.25), [x + s * 0.0135, y, h.cz], [0.034, 0.034, 0.034], p.glow, { rot: [0, Math.PI / 2, 0], glow: true });
  k.rod('head', h.f, [x + s * 0.008, y + 0.015, h.cz - 0.01], [x + s * 0.014, y + 0.08, h.cz - 0.035], 0.004, TONES.dark);
  k.put('head', h.f, BOX(), [x + s * 0.014, y + 0.082, h.cz - 0.036], [0.01, 0.01, 0.01], p.glow, { glow: true });
}

function jack(k: Kit, p: Extract<Part, { kind: 'jack' }>) {
  const b = k.body, n = b.pos('neck'), hp = b.pos('head');
  if (!n || !hp) return;
  const y = n.y + (hp.y - n.y) * 0.45, z = b.surface(['neck', 'head', 'neck+'], n.x, y, 0.025, -1);
  const zb = isFinite(z) ? z : n.z - 0.05;
  const f = at(V(n.x, 0, 0));
  k.put('neck', f, BOX(), [0, y, zb - 0.004], [0.05, 0.05, 0.012], TONES.steel);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.015;
    k.put('neck', f, CYL(6), [x, y, zb - 0.014], [0.01, 0.014, 0.01], TONES.dark, { rot: [Math.PI / 2, 0, 0] });
    k.put('neck', f, BOX(), [x, y, zb - 0.022], [0.006, 0.006, 0.003], p.glow, { glow: true });
  }
}

function cables(k: Kit, p: Extract<Part, { kind: 'cables' }>) {
  const h = head(k), b = k.body, chest = b.pos('upperChest') ?? b.pos('chest');
  if (!h) return;
  // The back of the skull, not of the hair (twin tails reach far behind).
  const zb = Math.max(h.skull.min.z, h.eyeZ - 0.18), y0 = h.eyeY + 0.01;
  const bottom = chest ? chest.y + 0.03 : y0 - 0.25;
  // Plugged into the back of the skull, hanging down over the shoulders.
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 0.028, sx = x * 2.4;
    const a: Vec = [x, y0 + (i % 2) * 0.02, zb + 0.008], m: Vec = [x * 1.6, y0 - 0.07, zb - 0.03], e: Vec = [sx, bottom, Math.min(zb - 0.03, torso(k, sx, bottom, -1) - 0.012)];
    k.put('head', h.f, BOX(), [x, a[1], zb - 0.002], [0.018, 0.018, 0.012], TONES.steel);
    k.put('head', h.f, BOX(), [x, a[1], zb - 0.0095], [0.009, 0.009, 0.003], p.glow, { glow: true });
    k.rod('head', h.f, a, m, 0.0055, i % 2 ? TONES.dark : 0x1c1830);
    k.rod('head', h.f, m, e, 0.0055, i % 2 ? TONES.dark : 0x1c1830);
    k.put('head', h.f, BALL(), m, [0.012, 0.012, 0.012], p.glow, { glow: true });
  }
  if (p.crest) {
    for (let i = 0; i < 5; i++) {
      const z = h.skull.max.z - 0.03 - i * ((h.skull.max.z - h.skull.min.z - 0.05) / 4);
      const base: Vec = [0, h.top - 0.012, z];
      k.rod('head', h.f, base, [0, h.top + 0.05 - Math.abs(i - 2) * 0.008, z - 0.03], 0.006, TONES.dark);
      k.put('head', h.f, BOX(), [0, h.top + 0.052 - Math.abs(i - 2) * 0.008, z - 0.031], [0.01, 0.01, 0.01], p.glow, { glow: true });
    }
  }
}

/** Torso surface (front or back) at height y, a few cm around the middle. */
function torso(k: Kit, x: number, y: number, dir: 1 | -1) {
  const z = k.body.surface(['spine', 'chest', 'upperChest', 'spine+', 'chest+', 'upperChest+', 'neck'], (k.body.pos('hips')?.x ?? 0) + x, y, 0.03, dir);
  return isFinite(z) ? z : dir * 0.1;
}
const torsoBone = (k: Kit): VRMHumanBoneName => (k.body.node('upperChest') ? 'upperChest' : 'chest');

function spine(k: Kit, p: Extract<Part, { kind: 'spine' }>) {
  const b = k.body;
  const list: VRMHumanBoneName[] = ['spine', 'chest', 'upperChest'];
  const hips = b.pos('hips'), neck = b.pos('neck');
  if (!hips || !neck) return;
  // Vertebrae from the waist to the nape, each riding its own bone, a neon line between.
  const ys: { y: number; bn: VRMHumanBoneName }[] = [];
  for (let i = 0; i < 6; i++) {
    const y = hips.y + (neck.y - hips.y) * (0.22 + i * 0.14);
    let bn: VRMHumanBoneName = 'spine';
    for (const n of list) { const q = b.pos(n); if (q && q.y <= y + 0.01) bn = n; }
    ys.push({ y, bn });
  }
  const f = at(V(hips.x, 0, 0));
  for (const { y, bn } of ys) {
    const z = torso(k, 0, y, -1);
    k.put(bn, f, BOX(), [0, y, z - 0.008], [0.045, 0.03, 0.022], TONES.steel);
    k.put(bn, f, BOX(), [0, y - 0.022, z - 0.004], [0.008, 0.016, 0.006], p.glow, { glow: true });
  }
}

function plate(k: Kit, p: Extract<Part, { kind: 'plate' }>) {
  const b = k.body, tb = torsoBone(k), t = b.pos(tb), n = b.pos('neck');
  if (!t || !n) return;
  const y = t.y + (n.y - t.y) * 0.25 - 0.03, z = torso(k, 0, y, 1), zb = torso(k, 0, y, -1);
  const w = THREE.MathUtils.clamp((b.side(['upperChest', 'chest'], y, 0.03, 1) - b.side(['upperChest', 'chest'], y, 0.03, -1)) * 0.7 || 0.2, 0.15, 0.22);
  const tone = TONES[p.tone ?? 'steel'], f = at(V(t.x, 0, 0));
  k.put(tb, f, BOX(), [-w * 0.25, y, z + 0.01], [w * 0.5, 0.15, 0.03], tone, { rot: [-0.12, -0.18, 0] });
  k.put(tb, f, BOX(), [w * 0.25, y, z + 0.01], [w * 0.5, 0.15, 0.03], tone, { rot: [-0.12, 0.18, 0] });
  k.put(tb, f, BOX(), [0, y + 0.08, z - 0.0], [w * 0.7, 0.02, 0.04], TONES.dark);
  k.put(tb, f, BOX(), [0, y, zb - 0.012], [w * 0.85, 0.17, 0.025], tone);
  if (p.core) {
    k.put(tb, f, BOX(), [0, y - 0.005, z + 0.03], [0.04, 0.04, 0.012], p.glow, { glow: true, ink: true, rot: [0, 0, Math.PI / 4] });
  } else {
    for (const s of [1, -1]) k.put(tb, f, BOX(), [s * w * 0.25, y - 0.045, z + 0.026], [w * 0.3, 0.007, 0.004], p.glow, { glow: true });
  }
}

function leds(k: Kit, p: Extract<Part, { kind: 'leds' }>) {
  const b = k.body, tb = torsoBone(k), t = b.pos(tb), n = b.pos('neck');
  if (!t || !n) return;
  const f = at(V(t.x, 0, 0));
  for (let i = 0; i < 4; i++) {
    const x = 0.075, y = t.y + (n.y - t.y) * 0.5 - i * 0.03, z = torso(k, x, y, 1);
    k.put(tb, f, BOX(), [x, y, z + 0.002], [0.012, 0.008, 0.006], i === 1 ? C.yellow : p.glow, { glow: true });
  }
}

function shoulder(k: Kit, p: Extract<Part, { kind: 'shoulder' }>) {
  const a = armFrames(k, p.side);
  if (!a) return;
  const UA = bone(p.side, 'UpperArm'), r = a.rU * 1.1, tone = TONES[p.tone ?? 'steel'];
  // Pauldron: a dome over the shoulder (dome axis = frame x = up at rest), rim and rivet lit.
  k.put(UA, a.upper, DOME(), [r * 0.35, a.lu * 0.15, 0], [r * 2.3, r * 1.4, r * 2.4], tone, { rot: [0, 0, -Math.PI / 2] });
  k.put(UA, a.upper, BOX(), [r * 1.05, a.lu * 0.15, 0], [0.01, r * 0.35, r * 0.35], p.glow, { glow: true });
}

function tanks(k: Kit, p: Extract<Part, { kind: 'tanks' }>) {
  const b = k.body, tb = torsoBone(k), t = b.pos(tb);
  if (!t) return;
  const y = t.y, z = torso(k, 0, y, -1) - 0.05, f = at(V(t.x, 0, 0));
  for (const s of [1, -1]) {
    const x = s * 0.055;
    k.put(tb, f, CYL(8), [x, y, z], [0.085, 0.22, 0.085], TONES.steel);
    k.put(tb, f, DOME(), [x, y + 0.11, z], [0.085, 0.05, 0.085], TONES.dark);
    k.put(tb, f, BOX(), [x, y - 0.01, z - 0.042], [0.016, 0.14, 0.006], p.glow, { glow: true });
    k.rod(tb, f, [x, y + 0.13, z], [s * 0.1, y + 0.17, z + 0.06], 0.008, TONES.dark);
  }
  k.put(tb, f, BOX(), [0, y + 0.06, z + 0.035], [0.16, 0.025, 0.03], TONES.dark);
  k.put(tb, f, BOX(), [0, y - 0.06, z + 0.035], [0.16, 0.025, 0.03], TONES.dark);
}

function mask(k: Kit, p: Extract<Part, { kind: 'mask' }>) {
  const h = head(k);
  if (!h) return;
  const y = h.mouthY, z = h.front(0, y);
  k.put('head', h.f, BOX(), [0, y, z + 0.012], [0.07, 0.05, 0.035], TONES.dark, { rot: [0.15, 0, 0] });
  k.put('head', h.f, BOX(), [0, y - 0.004, z + 0.031], [0.04, 0.006, 0.004], p.glow, { glow: true });
  for (const s of [1, -1]) {
    k.put('head', h.f, CYL(8), [s * 0.043, y - 0.008, z + 0.01], [0.04, 0.03, 0.04], TONES.steel, { rot: [Math.PI / 2, s * 0.7, 0] });
    k.put('head', h.f, CYL(8), [s * 0.054, y - 0.008, z + 0.022], [0.03, 0.004, 0.03], p.glow, { rot: [Math.PI / 2, s * 0.7, 0], glow: true });
  }
}

/** The Psy-Sec helmet, sized on the face (the head box is mostly hair on these avatars). */
function helmetShape(h: Head) {
  const w = Math.max(h.eyeX * 4.1, 0.2), d = 0.225, chin = h.eyeY - 0.105, mid = h.eyeY + 0.035, top = h.eyeY + 0.135;
  return { w, d, chin, mid, top, cz: h.eyeZ + 0.022 - d / 2 };
}

function helmet(k: Kit, p: Extract<Part, { kind: 'helmet' }>) {
  const h = head(k);
  if (!h) return;
  const { w, d, chin, mid, top, cz } = helmetShape(h), tone = TONES[p.tone ?? 'dark'];
  // Shell (eight-sided drum, domed top), visor slit, jaw guard, ear discs, crest.
  k.put('head', h.f, CYL(8), [0, (chin + mid) / 2, cz], [w, mid - chin, d], tone, { rot: [0, Math.PI / 8, 0] });
  k.put('head', h.f, DOME(), [0, mid, cz], [w, (top - mid) * 2, d], tone, { rot: [0, Math.PI / 8, 0] });
  k.put('head', h.f, BOX(), [0, h.eyeY, cz + d * 0.465], [w * 0.62, 0.024, 0.01], p.glow, { glow: true, ink: true });
  k.put('head', h.f, BOX(), [0, chin + 0.022, cz + d * 0.43], [w * 0.5, 0.04, 0.03], TONES.steel);
  for (const s of [1, -1]) {
    k.put('head', h.f, CYL(8), [s * w * 0.47, h.eyeY - 0.01, cz], [0.055, 0.022, 0.055], TONES.steel, { rot: [0, 0, Math.PI / 2] });
    k.put('head', h.f, RING(0.25), [s * (w * 0.47 + 0.012), h.eyeY - 0.01, cz], [0.036, 0.036, 0.036], p.glow, { rot: [0, Math.PI / 2, 0], glow: true });
  }
  k.put('head', h.f, BOX(), [0, top - 0.004, cz], [0.022, 0.03, d * 0.75], p.horns ? TONES.gold : TONES.steel);
  if (p.horns) {
    for (const s of [1, -1]) k.put('head', h.f, CONE(), [s * w * 0.36, mid + (top - mid) * 0.75, cz], [0.035, 0.13, 0.035], TONES.gold, { rot: [0, 0, -s * 0.55] });
  }
  // Hair and ears are pulled inside the shell.
  k.squeeze = { x: h.f.elements[12], cz, rx: w * 0.42, rz: d * 0.42, chin: chin + 0.008, mid, ry: (top - mid) * 0.88 };
}

function halo(k: Kit, p: Extract<Part, { kind: 'halo' }>) {
  const h = head(k);
  if (!h) return;
  k.put('head', h.f, RING(0.09), [0, h.eyeY + 0.21, h.cz - 0.03], [0.26, 0.26, 0.26], p.glow, { rot: [Math.PI / 2 - 0.3, 0, 0], glow: true });
}

const BUILD: { [K in Part['kind']]: (k: Kit, p: Extract<Part, { kind: K }>) => void } = {
  arm, bracer, leg, visor, eye, cheek, ear, jack, cables, spine, plate, leds, shoulder, tanks, mask, helmet, halo,
};

/** Geometry of one avatar's cyberware (built on its first copy, then shared). */
type Built = { meshes: { bone: VRMHumanBoneName; geometry: THREE.BufferGeometry }[]; hide: VRMHumanBoneName[]; squeeze?: Squeeze; skin?: Skin };
/** All of an avatar's pieces in one geometry, rigidly skinned to their bones (see `skinOf`). */
type Skin = { geometry: THREE.BufferGeometry; bones: VRMHumanBoneName[] };

/**
 * One skinned geometry for every piece of an avatar: vertices in the avatar's scene space at rest,
 * each weighted 1 to its bone, grouped by material (metal, neon, ink). A character then draws its
 * cyberware in 3 calls (and 3 in the shadow map) instead of 3 per bone it is bolted to.
 */
function skinOf(vrm: VRM, meshes: Built['meshes']): Skin | undefined {
  const bones: VRMHumanBoneName[] = [], nodes: THREE.Object3D[] = [];
  for (const { bone } of meshes) { const n = vrm.humanoid.getNormalizedBoneNode(bone); if (n && !bones.includes(bone)) { bones.push(bone); nodes.push(n); } }
  if (!bones.length) return undefined;
  vrm.scene.updateMatrixWorld(true);
  const toScene = vrm.scene.matrixWorld.clone().invert();
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [], groups: { start: number; count: number; slot: number }[] = [];
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
  for (let slot = 0; slot < 3; slot++) {
    const start = pos.length / 3;
    for (const { bone, geometry: g } of meshes) {
      const b = bones.indexOf(bone);
      if (b < 0) continue;
      m.multiplyMatrices(toScene, nodes[b].matrixWorld);
      nm.getNormalMatrix(m);
      const P = g.getAttribute('position'), N = g.getAttribute('normal'), C = g.getAttribute('color');
      for (const gr of g.groups) {
        if (gr.materialIndex !== slot) continue;
        for (let i = gr.start; i < gr.start + gr.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
          v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
          col.push(C.getX(i), C.getY(i), C.getZ(i));
          idx.push(b);
        }
      }
    }
    const count = pos.length / 3 - start;
    if (count) groups.push({ start, count, slot });
  }
  const n = pos.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { si[i * 4] = idx[i]; sw[i * 4] = 1; }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  for (const gr of groups) geometry.addGroup(gr.start, gr.count, gr.slot);
  geometry.userData.shared = true; // every copy of the avatar wears it (see dispose.ts)
  return { geometry, bones };
}

/** The inside of a helmet (world space at rest): a drum from chin to mid, a half-ellipsoid above. */
type Squeeze = { x: number; cz: number; rx: number; rz: number; chin: number; mid: number; ry: number };

/**
 * Pulls the head's skin (hair, ears) inside the helmet so nothing pokes through it. Every
 * character parses its own copy of the avatar, so its geometry can be edited.
 */
function squeezeHead(vrm: VRM, s: Squeeze) {
  const headBone = vrm.humanoid.getRawBoneNode('head');
  if (!headBone) return;
  const inHead = new Set<THREE.Object3D>();
  headBone.traverse(o => inHead.add(o));
  const v = V(), inv = new THREE.Matrix4();
  vrm.scene.updateMatrixWorld(true);
  vrm.scene.traverse(o => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute, si = m.geometry.getAttribute('skinIndex'), sw = m.geometry.getAttribute('skinWeight');
    if (!pos || !si || !sw) return;
    inv.copy(m.matrixWorld).invert();
    let changed = false;
    for (let i = 0; i < pos.count; i++) {
      let best = 0, bw = -1;
      for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (w > bw) { bw = w; best = si.getComponent(i, j); } }
      if (!inHead.has(m.skeleton.bones[best])) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (v.y < s.chin) continue;
      const up = v.y > s.mid, dx = (v.x - s.x) / s.rx, dz = (v.z - s.cz) / s.rz, dy = up ? (v.y - s.mid) / s.ry : 0;
      const k = Math.hypot(dx, dy, dz);
      if (k <= 1) continue;
      v.set(s.x + (v.x - s.x) / k, up ? s.mid + (v.y - s.mid) / k : v.y, s.cz + (v.z - s.cz) / k).applyMatrix4(inv);
      pos.setXYZ(i, v.x, v.y, v.z);
      changed = true;
    }
    if (changed) pos.needsUpdate = true;
  });
}
const built = new Map<string, Built>();

/**
 * Bolts the avatar's cyberware onto a freshly loaded VRM (at rest, before it is animated or
 * parented). Returns the per-character metal material (null if this avatar has none).
 */
export function installCyberware(avatar: string, vrm: VRM): MToonMaterial | null {
  const parts = CYBER[avatar];
  if (!parts?.length) return null;
  let b = built.get(avatar);
  if (!b) {
    const kit = new Kit(new Body(vrm));
    for (const p of parts) (BUILD[p.kind] as (k: Kit, p: Part) => void)(kit, p);
    b = { meshes: kit.build(), hide: [...kit.hide], squeeze: kit.squeeze };
    built.set(avatar, b);
  }
  // A replaced forearm: the real one shrinks into the elbow joint (its hand goes with it).
  for (const n of b.hide) vrm.humanoid.getRawBoneNode(n)?.scale.setScalar(0.05);
  if (b.squeeze) squeezeHead(vrm, b.squeeze);
  const mats = materials();
  b.skin ??= skinOf(vrm, b.meshes);
  if (!b.skin) return mats[0];
  // The avatar is at rest here: the bones' current world matrices are the bind pose.
  const mesh = new THREE.SkinnedMesh(b.skin.geometry, mats);
  mesh.name = 'cyberware';
  mesh.userData.cyberware = true;
  mesh.castShadow = true;
  mesh.frustumCulled = false; // like the avatar's own meshes
  vrm.scene.add(mesh);
  vrm.scene.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(b.skin.bones.map(n => vrm.humanoid.getNormalizedBoneNode(n)!) as THREE.Bone[]));
  return mats[0];
}

/** Takes the shared cyberware meshes off a character before it is disposed (portraits). */
export function stripCyberware(root: THREE.Object3D) {
  const list: THREE.Object3D[] = [];
  root.traverse(o => { if (o.userData.cyberware) list.push(o); });
  for (const o of list) {
    const m = (o as THREE.Mesh).material as THREE.Material[];
    m[0]?.dispose(); // the character's own metal; geometry, neon and ink are shared
    (o as THREE.SkinnedMesh).skeleton?.dispose();
    o.removeFromParent();
  }
}
