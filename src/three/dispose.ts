import * as THREE from 'three';

/**
 * Frees the GPU side of a place that is gone (street, room, characters): geometries, textures,
 * instance buffers and bone textures. Without this every visit leaked its buffers in the renderer.
 *
 * Geometries flagged `userData.shared` (kit model templates, cyberware shapes) belong to caches
 * that outlive a place and are kept. Materials are not disposed on purpose: their compiled shader
 * programs stay warm for the next place (a few dozen programs in all, no GPU memory), and an
 * unreferenced material is garbage collected anyway. Disposing a cached texture is harmless: it is
 * uploaded again the next time something draws with it.
 */
export function disposeTree(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  const take = (v: unknown) => { if (v && (v as THREE.Texture).isTexture) textures.add(v as THREE.Texture); };
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose();
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    else if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton?.dispose();
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) {
      for (const v of Object.values(m)) take(v);
      for (const v of Object.values(m.userData)) take(v); // textures only a shader hook sees (wet mask...)
      const u = (m as THREE.ShaderMaterial).uniforms;
      if (u) for (const k in u) take(u[k]?.value);
    }
  });
  textures.forEach(t => t.dispose());
}
