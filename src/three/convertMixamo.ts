import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/**
 * Dev tool (tools/mixamo-convert.html, driven by scripts/convert-mixamo.mjs): turns a Mixamo FBX
 * character (often 50-100 MB of 4K textures) into a compact GLB: metres, PBR materials, textures
 * at most 1024 px, JPEG unless they need transparency, bone names without the mixamorig prefix.
 */
const bare = (name: string) => name.replace(/^mixamorig\d*:?/, '');

async function convert(name: string): Promise<string> {
  const g = await new FBXLoader().loadAsync(`/assets/mixamo/characters/${name}.fbx`);
  g.animations = [];
  g.scale.multiplyScalar(0.01);
  g.traverse(o => {
    if ((o as THREE.Bone).isBone) o.name = bare(o.name);
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const list = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshPhongMaterial[];
    const next = list.map(p => {
      const alpha = p.transparent || p.alphaTest > 0 || (p.opacity ?? 1) < 1;
      for (const t of [p.map, p.normalMap]) if (t) t.userData.mimeType = alpha && t === p.map ? 'image/png' : 'image/jpeg';
      return new THREE.MeshStandardMaterial({
        name: p.name, map: p.map ?? null, normalMap: p.normalMap ?? null, color: p.map ? 0xffffff : p.color,
        roughness: 0.65, metalness: 0.1, transparent: alpha, alphaTest: alpha ? 0.4 : 0, side: alpha ? THREE.DoubleSide : THREE.FrontSide,
      });
    });
    m.material = Array.isArray(m.material) ? next : next[0];
  });
  // FBX textures decode after the model resolves: wait for them, drop the ones that never load.
  const textures: { mat: THREE.MeshStandardMaterial; key: 'map' | 'normalMap' }[] = [];
  g.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
      for (const key of ['map', 'normalMap'] as const) if (mat[key]) textures.push({ mat, key });
    }
  });
  const ready = (img: unknown) => !!img && ((img as HTMLImageElement).complete === undefined || ((img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0));
  for (let i = 0; i < 100 && textures.some(t => !ready(t.mat[t.key]!.image)); i++) await new Promise(r => setTimeout(r, 100));
  for (const t of textures) if (!ready(t.mat[t.key]!.image)) { t.mat[t.key] = null; t.mat.needsUpdate = true; }
  const glb = await new GLTFExporter().parseAsync(g, { binary: true, maxTextureSize: 1024, onlyVisible: true }) as ArrayBuffer;
  const blob = new Blob([glb]);
  return await new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
}

(window as unknown as { convertMixamo: typeof convert }).convertMixamo = convert;
