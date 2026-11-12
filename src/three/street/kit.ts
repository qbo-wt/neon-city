import * as THREE from 'three';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { nightPalette } from './palette';

/**
 * The CC0 low-poly kits (Kenney, KayKit), loaded once per model and recoloured for the night.
 * A model path is relative to `assets/` without extension: 'kenney/cars/taxi',
 * 'kaykit/furniture/chair_A'. All models of a kit share one material (one palette texture), so
 * a street of a hundred props stays a handful of shaders.
 */
export class KitLibrary {
  private models = new Map<string, Promise<THREE.Group>>();
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  private glowMats = new Map<string, THREE.MeshStandardMaterial>();

  constructor(private gltf: GLTFLoader) {}

  static isKitPath(id: string) { return id.startsWith('kenney/') || id.startsWith('kaykit/'); }

  private url(path: string) { return `assets/${path}${path.startsWith('kaykit/') ? '.gltf' : '.glb'}`; }
  private kitOf(path: string) { return path.slice(0, path.lastIndexOf('/')); }

  /** The shared night material of a kit, made from the first palette texture seen for it. */
  private kitMaterial(kit: string, src: THREE.MeshStandardMaterial) {
    let m = this.mats.get(kit);
    if (!m) {
      const pal = src.map ? nightPalette(kit, src.map) : undefined;
      m = new THREE.MeshStandardMaterial({ map: pal?.map ?? null, color: src.map ? 0xffffff : src.color, roughness: 1, metalness: 0, side: THREE.FrontSide });
      m.userData.glass = pal?.glass ?? null;
      m.name = `${kit}-night`;
      this.mats.set(kit, m);
    }
    return m;
  }

  load(path: string): Promise<THREE.Group> {
    let p = this.models.get(path);
    if (!p) {
      const kit = this.kitOf(path);
      p = this.gltf.loadAsync(this.url(path)).then(g => {
        g.scene.traverse(o => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true; mesh.receiveShadow = true;
          const fix = (mat: THREE.Material) => {
            const s = mat as THREE.MeshStandardMaterial;
            if (!s.isMeshStandardMaterial) return mat;
            if (!s.map) { const c = s.clone(); c.roughness = 1; c.metalness = 0; return c; }
            return this.kitMaterial(kit, s);
          };
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(fix) : fix(mesh.material);
        });
        return g.scene;
      });
      this.models.set(path, p);
    }
    return p;
  }

  /** A copy of a model (materials shared). */
  async clone(path: string): Promise<THREE.Object3D> {
    const root = await this.load(path);
    return root.clone(true);
  }

  /**
   * A kit material whose window glass glows in `color` (lit windows of the skyline, shop
   * windows). Falls back to the plain kit material when the palette has no glass.
   */
  glowing(obj: THREE.Object3D, color: number, intensity = 1.6) {
    obj.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const base = mesh.material as THREE.MeshStandardMaterial;
      if (Array.isArray(base) || !base.userData?.glass) return;
      const key = `${base.name}:${color.toString(16)}:${intensity}`;
      let m = this.glowMats.get(key);
      if (!m) {
        m = base.clone();
        m.emissiveMap = base.userData.glass as THREE.Texture;
        m.emissive.setHex(color);
        m.emissiveIntensity = intensity;
        this.glowMats.set(key, m);
      }
      mesh.material = m;
    });
    return obj;
  }
}

/**
 * Scales `o` uniformly so its footprint fits `w` x `d` metres (and its height `h` if given),
 * then centres it on the origin with its base on y = 0. Returns the final size.
 */
export function fitObject(o: THREE.Object3D, w: number, d: number, h = Infinity, grow = true) {
  o.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(o), size = bb.getSize(new THREE.Vector3());
  let k = Math.min(w / Math.max(1e-3, size.x), d / Math.max(1e-3, size.z), h / Math.max(1e-3, size.y));
  if (!grow) k = Math.min(1, k);
  o.scale.multiplyScalar(k);
  o.updateMatrixWorld(true);
  const bb2 = new THREE.Box3().setFromObject(o), c = bb2.getCenter(new THREE.Vector3());
  o.position.sub(new THREE.Vector3(c.x, bb2.min.y, c.z));
  return bb2.getSize(new THREE.Vector3());
}

/** Wraps `o` in a group so the group's origin is the base centre (rotations then turn in place). */
export function based(o: THREE.Object3D, w: number, d: number, h = Infinity) {
  const g = new THREE.Group();
  fitObject(o, w, d, h);
  g.add(o);
  return g;
}
