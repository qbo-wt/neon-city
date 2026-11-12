import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * The CC0 low-poly kits used to dress the interiors: Kenney (`assets/kenney/<kit>/<name>.glb`, one
 * `Textures/colormap.png` palette per kit) and KayKit Furniture (`assets/kaykit/furniture/<name>.gltf`).
 *
 * Model ids are `<kit>/<name>`, e.g. `station/computer-screen`, `arcade/vending-machine`,
 * `kaykit/couch_pillows`. Palettes are copied into canvas textures (optionally recoloured towards the
 * neon palette), which the stylise pass keeps as they are instead of averaging them to one colour.
 */
const loader = new GLTFLoader();
const models = new Map<string, Promise<THREE.Group>>();

const url = (id: string) => {
  const [kit, name] = id.split('/');
  return kit === 'kaykit' ? `assets/kaykit/furniture/${name}.gltf` : `assets/kenney/${kit}/${name}.glb`;
};

/** Recolours a palette texel: HSL in, HSL out (all 0..1). */
export type Recolor = (h: number, s: number, l: number) => [number, number, number];

/** Named recolourings of the kit palettes, shared by every room. */
export const RECOLORS: Record<string, Recolor> = {
  /** Kenney station / space: lavender steel → dark gunmetal, orange trim → neon magenta. */
  steel: (h, s, l) => {
    if (s < 0.35) return [0.7, s * 0.6, l * 0.55];
    if (h > 0.04 && h < 0.17) return [0.93, 0.85, l * 0.8];
    return [h, s, l * 0.8];
  },
  /** Same, with cyan trim (clinic). */
  clinic: (h, s, l) => {
    if (s < 0.35) return [0.58, s * 0.35, Math.min(0.92, l * 1.05)];
    if (h > 0.04 && h < 0.17) return [0.5, 0.9, l * 0.75];
    return [h, s, l];
  },
  /** Dark hacker kit: near-black steel, green trim. */
  den: (h, s, l) => {
    if (s < 0.35) return [0.55, s * 0.4, l * 0.35];
    if (h > 0.04 && h < 0.17) return [0.38, 0.9, l * 0.7];
    return [h, s * 0.8, l * 0.6];
  },
  /** KayKit furniture at night: dark plum wood, blue fabric → violet, yellow → hot pink. */
  night: (h, s, l) => {
    if (h < 0.11 && s > 0.25 && l < 0.75) return [0.97, s * 0.55, l * 0.6]; // wood
    if (h > 0.5 && h < 0.7) return [0.76, Math.min(1, s * 1.1), l * 0.7]; // blue fabric
    if (h >= 0.11 && h < 0.17 && s > 0.5) return [0.92, 0.75, l * 0.75]; // yellow fabric
    return [h, s, l * 0.85];
  },
};

const palettes = new Map<string, THREE.Texture>();

/** A canvas copy of a palette texture, recoloured; cached per source image and recolouring. */
function palette(src: THREE.Texture, recolor?: string): THREE.Texture | null {
  const img = src.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img || !img.width) return null;
  const key = `${(src.source as { uuid: string }).uuid}:${recolor ?? ''}`;
  const hit = palettes.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const fn = recolor ? RECOLORS[recolor] : undefined;
  if (fn) {
    const d = ctx.getImageData(0, 0, c.width, c.height), px = d.data, col = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
    for (let i = 0; i < px.length; i += 4) {
      col.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, THREE.SRGBColorSpace).getHSL(hsl, THREE.SRGBColorSpace);
      const [h, s, l] = fn(hsl.h, hsl.s, hsl.l);
      col.setHSL(((h % 1) + 1) % 1, Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, l)), THREE.SRGBColorSpace);
      const o = col.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
      px[i] = o.r * 255; px[i + 1] = o.g * 255; px[i + 2] = o.b * 255;
    }
    ctx.putImageData(d, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = src.flipY;
  t.wrapS = src.wrapS; t.wrapT = src.wrapT;
  t.magFilter = THREE.NearestFilter;
  t.userData.keepTexture = true;
  palettes.set(key, t);
  return t;
}

function load(id: string): Promise<THREE.Group> {
  let p = models.get(id);
  if (!p) {
    p = loader.loadAsync(url(id)).then(g => g.scene);
    models.set(id, p);
  }
  return p;
}

export interface ModelOpts {
  /** Palette recolouring (see RECOLORS). */
  recolor?: string;
  /** Multiplies every material colour. */
  tint?: number;
  /** Extra glow on the whole model (emissive = its own palette). */
  glow?: number;
  shadow?: boolean;
}

const matCache = new Map<string, THREE.Material>();

/**
 * A fresh copy of a kit model, palette swapped, base on y = 0 and centred on the origin in x/z
 * (inside a wrapper group, so the caller can scale, turn and place it freely).
 */
export async function kitModel(id: string, o: ModelOpts = {}): Promise<THREE.Group> {
  const src = await load(id);
  const copy = src.clone(true);
  copy.traverse(n => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = o.shadow !== false;
    mesh.receiveShadow = true;
    const swap = (m: THREE.Material) => {
      const std = m as THREE.MeshStandardMaterial;
      const key = `${m.uuid}:${o.recolor ?? ''}:${o.tint ?? ''}:${o.glow ?? ''}`;
      let out = matCache.get(key);
      if (!out) {
        const c = std.clone();
        const map = std.map ? palette(std.map, o.recolor) : null;
        if (map) c.map = map;
        if (o.tint !== undefined) c.color.multiply(new THREE.Color(o.tint));
        if (o.glow && map) { c.emissive = new THREE.Color(0xffffff); c.emissiveMap = map; c.emissiveIntensity = o.glow; }
        c.userData.keepTexture = true;
        // Glass panes (claw machine, pinball) stay see-through.
        if (/glass/i.test(m.name)) { c.transparent = true; c.opacity = 0.35; c.depthWrite = false; }
        matCache.set(key, c);
        out = c;
      }
      return out;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
  copy.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(copy), c = bb.getCenter(new THREE.Vector3());
  copy.position.sub(new THREE.Vector3(c.x, bb.min.y, c.z));
  const g = new THREE.Group();
  g.add(copy);
  g.userData.size = bb.getSize(new THREE.Vector3());
  return g;
}

/** Starts loading a batch of models (so a room builds without waiting on each file in turn). */
export function preloadKit(ids: string[]) { return Promise.all(ids.map(id => load(id).catch(() => null))); }
