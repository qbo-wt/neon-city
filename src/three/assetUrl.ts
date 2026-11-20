import * as THREE from 'three';

/**
 * Cache busting for public/assets. Those files keep stable names across deploys, so a browser that
 * cached an old copy could run new code on old data (characters stuck in a T-pose after the
 * animation file changed). The manifest (scripts/asset-manifest.mjs) gives each file a content
 * hash; every download asks for `path?v=<hash>`, so a changed file is a new URL and an unchanged
 * one stays cached across deploys.
 */
const versions = new Map<string, string>();

/** The manifest's path → hash, set by the preloader as soon as it has read the manifest. */
export function setAssetVersions(files: readonly { path: string; v?: string }[]) {
  for (const f of files) if (f.v) versions.set(f.path, f.v);
}

/** `url` with its content version, when the manifest knows the file; unchanged otherwise. */
export function assetUrl(url: string): string {
  if (!versions.size || /^(data|blob):/.test(url) || url.includes('?')) return url;
  const i = url.indexOf('assets/');
  const v = i >= 0 ? versions.get(url.slice(i)) : undefined;
  return v ? `${url}?v=${v}` : url;
}

// Every three.js loader (GLTF models, their .bin and textures, animation clips) goes through this.
THREE.DefaultLoadingManager.setURLModifier(assetUrl);
