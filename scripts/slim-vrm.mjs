// Makes a VRM 0.x avatar lighter for the game: keeps only the facial expressions the game plays
// (blink, talk, joy, anger, sorrow), drops the other morph targets and repacks the binary chunk.
// The VRM extension (bones, MToon materials, spring bones, meta and licence) is kept as is.
//
//   node scripts/slim-vrm.mjs <in.vrm> <out.vrm>
import fs from 'node:fs';

const KEEP = new Set(['a', 'blink', 'joy', 'angry', 'sorrow']);
const [, , src, dst] = process.argv;
if (!src || !dst) { console.error('usage: node scripts/slim-vrm.mjs <in.vrm> <out.vrm>'); process.exit(1); }

const buf = fs.readFileSync(src);
const jsonLen = buf.readUInt32LE(12);
const j = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen));
const vrm = j.extensions?.VRM;
if (!vrm) throw new Error('not a VRM 0.x file');

// 1. Which morph targets each mesh still needs.
const groups = vrm.blendShapeMaster.blendShapeGroups.filter(g => KEEP.has(g.presetName));
const used = new Map(); // mesh index -> sorted kept target indices
for (const g of groups) for (const b of g.binds) {
  if (!used.has(b.mesh)) used.set(b.mesh, new Set());
  used.get(b.mesh).add(b.index);
}
const remap = new Map(); // `${mesh}:${old}` -> new
j.meshes.forEach((m, mi) => {
  const keep = [...(used.get(mi) ?? [])].sort((a, b) => a - b);
  keep.forEach((old, i) => remap.set(`${mi}:${old}`, i));
  for (const p of m.primitives) if (p.targets) {
    p.targets = keep.map(i => p.targets[i]);
    if (!p.targets.length) delete p.targets;
  }
  if (m.weights) m.weights = keep.map(i => m.weights[i] ?? 0);
  if (m.extras?.targetNames) m.extras.targetNames = keep.map(i => m.extras.targetNames[i]);
  for (const p of m.primitives) if (p.extras?.targetNames) p.extras.targetNames = keep.map(i => p.extras.targetNames[i]);
});
for (const g of groups) g.binds = g.binds.map(b => ({ ...b, index: remap.get(`${b.mesh}:${b.index}`) }));
vrm.blendShapeMaster.blendShapeGroups = groups;

// 2. Drop accessors nobody references any more, then buffer views, then repack the binary.
const accUsed = new Set();
const markAcc = i => { if (i !== undefined) accUsed.add(i); };
for (const m of j.meshes) for (const p of m.primitives) {
  Object.values(p.attributes).forEach(markAcc);
  markAcc(p.indices);
  for (const t of p.targets ?? []) Object.values(t).forEach(markAcc);
}
for (const s of j.skins ?? []) markAcc(s.inverseBindMatrices);
for (const a of j.animations ?? []) for (const s of a.samplers) { markAcc(s.input); markAcc(s.output); }
const accMap = new Map();
const accessors = [];
j.accessors.forEach((a, i) => { if (accUsed.has(i)) { accMap.set(i, accessors.length); accessors.push(a); } });
const A = i => (i === undefined ? undefined : accMap.get(i));
for (const m of j.meshes) for (const p of m.primitives) {
  for (const k of Object.keys(p.attributes)) p.attributes[k] = A(p.attributes[k]);
  if (p.indices !== undefined) p.indices = A(p.indices);
  for (const t of p.targets ?? []) for (const k of Object.keys(t)) t[k] = A(t[k]);
}
for (const s of j.skins ?? []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = A(s.inverseBindMatrices);
for (const a of j.animations ?? []) for (const s of a.samplers) { s.input = A(s.input); s.output = A(s.output); }
j.accessors = accessors;

const bvUsed = new Set();
for (const a of j.accessors) {
  if (a.bufferView !== undefined) bvUsed.add(a.bufferView);
  if (a.sparse) { bvUsed.add(a.sparse.indices.bufferView); bvUsed.add(a.sparse.values.bufferView); }
}
for (const im of j.images ?? []) if (im.bufferView !== undefined) bvUsed.add(im.bufferView);
const chunks = [];
let offset = 0;
const bvMap = new Map();
const views = [];
j.bufferViews.forEach((v, i) => {
  if (!bvUsed.has(i)) return;
  const data = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  bvMap.set(i, views.length);
  views.push({ ...v, buffer: 0, byteOffset: offset });
  chunks.push(data);
  offset += data.length;
});
for (const a of j.accessors) {
  if (a.bufferView !== undefined) a.bufferView = bvMap.get(a.bufferView);
  if (a.sparse) { a.sparse.indices.bufferView = bvMap.get(a.sparse.indices.bufferView); a.sparse.values.bufferView = bvMap.get(a.sparse.values.bufferView); }
}
for (const im of j.images ?? []) if (im.bufferView !== undefined) im.bufferView = bvMap.get(im.bufferView);
j.bufferViews = views;
const newBin = Buffer.concat(chunks);
const binPad = Buffer.concat([newBin, Buffer.alloc((4 - (newBin.length % 4)) % 4)]);
j.buffers = [{ byteLength: binPad.length }];

const jsonBuf = Buffer.from(JSON.stringify(j), 'utf8');
const jsonPad = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
const head = Buffer.alloc(12);
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
head.writeUInt32LE(12 + 8 + jsonPad.length + 8 + binPad.length, 8);
const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
fs.writeFileSync(dst, Buffer.concat([head, ch(jsonPad.length, 0x4e4f534a), jsonPad, ch(binPad.length, 0x004e4942), binPad]));
console.log(`${src} -> ${dst}: ${(buf.length / 1e6).toFixed(1)} MB -> ${((12 + 16 + jsonPad.length + binPad.length) / 1e6).toFixed(1)} MB`);
