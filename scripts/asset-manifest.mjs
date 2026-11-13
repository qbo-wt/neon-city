// Lists the heavy 3D files (anime avatars, animation clips, Kenney / KayKit kits) with their sizes
// in public/assets/manifest.json. The loading screen fetches them all once so the HTTP cache is
// warm and the 3D scenes build without pop-in. Run by the Vite plugin (dev and build) or by hand:
//   node scripts/asset-manifest.mjs
import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIRS = ['assets/vrm', 'assets/mixamo/anims', 'assets/kenney', 'assets/kaykit', 'assets/music'];
const EXT = /\.(vrm|fbx|glb|gltf|bin|png|jpe?g|webp|ktx2|ogg|mp3)$/i;

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name), s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push({ path: p, size: s.size });
  }
}

/** Writes the manifest; returns it. `root` is the project folder (with `public/`). */
export function writeManifest(root = process.cwd()) {
  const pub = resolve(root, 'public');
  const found = [];
  for (const d of DIRS) if (existsSync(join(pub, d))) walk(join(pub, d), found);
  const files = found.map(f => ({ path: relative(pub, f.path).split('\\').join('/'), size: f.size }));
  const manifest = { total: files.reduce((s, f) => s + f.size, 0), files };
  writeFileSync(join(pub, 'assets', 'manifest.json'), JSON.stringify(manifest));
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const m = writeManifest();
  console.log(`asset manifest: ${m.files.length} files, ${(m.total / 1048576).toFixed(1)} MB`);
}
