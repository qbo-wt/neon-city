// Lists the Kenney / KayKit models that nothing in src/ references, and deletes them with --delete
// (they stay in the git history: `git log --diff-filter=D --name-only -- public/assets/kenney`, then
// `git checkout <commit>~1 -- <path>`). A model counts as used when its bare name appears in src/
// as a string ('taxi', 'kaykit/couch', `${K}cars/box`...). Names that src/ assembles at run time
// must be listed in DYNAMIC, or they get pruned. Palettes (Textures/, texture/) and licences stay.
//   node scripts/prune-kits.mjs [--delete] && node scripts/asset-manifest.mjs
import { readdirSync, readFileSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PUB = 'public/assets';
/** Models whose names are built from pieces (src/three/street/city.ts, buildings). */
const DYNAMIC = new Set([
  ...'abcdeglmnr'.split('').map(c => `kenney/industrial/building-${c}`),
  ...'abcde'.split('').map(c => `kenney/commercial/building-skyscraper-${c}`),
  ...'abdfghijlmn'.split('').map(c => `kenney/commercial/building-${c}`),
]);

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const src = walk('src').filter(f => /\.(ts|js|json)$/.test(f)).map(f => readFileSync(f, 'utf8')).join('\n');
const esc = s => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
const isUsed = id => DYNAMIC.has(id) || new RegExp(`['"\`/]${esc(id.split('/').pop())}['"\`]`).test(src);

/** [id like 'kenney/cars/taxi', files that go with it] */
const models = [];
for (const kit of readdirSync(join(PUB, 'kenney'))) for (const f of readdirSync(join(PUB, 'kenney', kit)))
  if (f.endsWith('.glb')) models.push([`kenney/${kit}/${f.slice(0, -4)}`, [join(PUB, 'kenney', kit, f)]]);
const kk = join(PUB, 'kaykit/furniture');
for (const f of readdirSync(kk)) if (f.endsWith('.gltf')) {
  const files = [join(kk, f)];
  for (const b of JSON.parse(readFileSync(join(kk, f), 'utf8')).buffers ?? [])
    if (b.uri && !b.uri.startsWith('data:')) files.push(join(kk, b.uri));
  models.push([`kaykit/furniture/${f.slice(0, -5)}`, files]);
}

const del = process.argv.includes('--delete');
let n = 0, bytes = 0;
for (const [id, files] of models) {
  if (isUsed(id)) continue;
  n++;
  for (const f of files) if (existsSync(f)) { bytes += statSync(f).size; if (del) unlinkSync(f); }
  if (!del) console.log('unused', id);
}
console.log(`${n}/${models.length} models unused, ${(bytes / 1048576).toFixed(1)} MB${del ? ' deleted' : ' (dry run; --delete removes them)'}`);
