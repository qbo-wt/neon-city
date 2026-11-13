// Makes VRM avatars smaller to download, without visible change. Run after slim-vrm.mjs:
//   1. textures wider than MAX px are downscaled to MAX (Lanczos) and saved as 256-colour palette PNG
//      (libimagequant, max quality, dithered). The atlases are flat anime colours (a few thousand
//      distinct values) and a character never fills more than ~200 px on screen (portraits: 208 px);
//   2. morph targets (facial expressions) become sparse accessors: only the face vertices they move
//      are stored, the rest are implicit zeros (GLTFLoader expands them on load). The exporter left
//      float noise below EPS (1 micrometre) on every other vertex; that noise is dropped;
//   3. 32-bit triangle indices become 16-bit when the mesh has fewer than 65 536 vertices (lossless).
// The JSON keeps every extension (VRM / VRMC_*, MToon, spring bones, meta) as is; only bufferViews,
// accessors and images are rewritten, and the binary chunk is repacked. Running it twice is a no-op.
//
//   node scripts/compress-vrm.mjs <file.vrm>...      (in place)
import fs from 'node:fs';
import sharp from 'sharp';

const MAX = 1024;
/** A morph target moves a vertex when one of its components exceeds this (metres / unit normal). */
const EPS = 1e-6;
const FLOAT = 5126, U16 = 5123, U32 = 5125;
const SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

async function compress(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  const jsonLen = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen));
  if (!j.extensions?.VRM && !j.extensions?.VRMC_vrm) throw new Error(`${file}: no VRM extension`);
  if (j.bufferViews.some(v => v.byteStride)) throw new Error(`${file}: interleaved buffer views are not handled`);

  // Every bufferView becomes a chunk of bytes; new chunks are appended, unused ones dropped at repack.
  const chunks = j.bufferViews.map(v => bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength));
  const addChunk = bytes => { chunks.push(bytes); j.bufferViews.push({ buffer: 0, byteLength: bytes.byteLength }); return chunks.length - 1; };
  const read = (a, Typed) => {
    const src = chunks[a.bufferView].subarray(a.byteOffset ?? 0);
    return new Typed(src.buffer.slice(src.byteOffset, src.byteOffset + a.count * SIZES[a.type] * Typed.BYTES_PER_ELEMENT));
  };

  // 1. Textures.
  for (const im of j.images ?? []) {
    if (im.bufferView === undefined || im.mimeType !== 'image/png') continue;
    const img = sharp(chunks[im.bufferView]);
    const { width = 0, height = 0 } = await img.metadata();
    if (Math.max(width, height) <= MAX) continue;
    const out = await img.resize({ width: Math.round(width * MAX / Math.max(width, height)), kernel: 'lanczos3' })
      .png({ palette: true, colors: 256, quality: 100, dither: 1, compressionLevel: 9 }).toBuffer();
    if (out.byteLength < chunks[im.bufferView].byteLength) im.bufferView = addChunk(out);
  }

  // 2. Morph targets -> sparse.
  const targetAcc = new Set(), otherAcc = new Set();
  for (const m of j.meshes) for (const p of m.primitives) {
    Object.values(p.attributes).forEach(a => otherAcc.add(a));
    if (p.indices !== undefined) otherAcc.add(p.indices);
    for (const t of p.targets ?? []) Object.values(t).forEach(a => targetAcc.add(a));
  }
  for (const i of targetAcc) {
    const a = j.accessors[i];
    if (otherAcc.has(i) || a.sparse || a.bufferView === undefined || a.componentType !== FLOAT) continue;
    const n = SIZES[a.type], v = read(a, Float32Array), moved = [];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) if (Math.abs(v[k * n + c]) > EPS) { moved.push(k); break; }
    delete a.bufferView; delete a.byteOffset;
    if (!moved.length) continue; // nothing moves: an accessor without bufferView reads as zeros
    const Idx = a.count < 65536 ? Uint16Array : Uint32Array;
    const values = new Float32Array(moved.length * n);
    moved.forEach((k, r) => values.set(v.subarray(k * n, k * n + n), r * n));
    a.sparse = {
      count: moved.length,
      indices: { bufferView: addChunk(new Uint8Array(Idx.from(moved).buffer)), componentType: Idx === Uint16Array ? U16 : U32 },
      values: { bufferView: addChunk(new Uint8Array(values.buffer)) },
    };
  }

  // 3. 32-bit indices -> 16-bit.
  for (const m of j.meshes) for (const p of m.primitives) {
    const a = j.accessors[p.indices];
    if (!a || a.componentType !== U32 || a.sparse) continue;
    const v = read(a, Uint32Array);
    if (j.accessors[p.attributes.POSITION].count >= 65536 || v.some(x => x > 65535)) continue;
    a.bufferView = addChunk(new Uint8Array(Uint16Array.from(v).buffer));
    a.componentType = U16; delete a.byteOffset;
  }

  // Repack: keep only referenced chunks, 4-byte aligned, and remap the indices.
  const refs = [];
  for (const a of j.accessors) {
    if (a.bufferView !== undefined) refs.push([a, 'bufferView']);
    if (a.sparse) refs.push([a.sparse.indices, 'bufferView'], [a.sparse.values, 'bufferView']);
  }
  for (const im of j.images ?? []) if (im.bufferView !== undefined) refs.push([im, 'bufferView']);
  const map = new Map(), views = [], parts = [];
  let off = 0;
  for (const [o, k] of refs) {
    const old = o[k];
    if (!map.has(old)) {
      const bytes = chunks[old], pad = (4 - (off % 4)) % 4;
      if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
      map.set(old, views.length);
      views.push({ ...j.bufferViews[old], buffer: 0, byteOffset: off, byteLength: bytes.byteLength });
      parts.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)); off += bytes.byteLength;
    }
    o[k] = map.get(old);
  }
  const padBin = (4 - (off % 4)) % 4;
  if (padBin) parts.push(Buffer.alloc(padBin));
  const newBin = Buffer.concat(parts);
  j.bufferViews = views;
  j.buffers = [{ byteLength: newBin.byteLength }];

  let json = Buffer.from(JSON.stringify(j), 'utf8');
  json = Buffer.concat([json, Buffer.alloc((4 - (json.byteLength % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.byteLength + 8 + newBin.byteLength, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
  const outBuf = Buffer.concat([header, ch(json.byteLength, 0x4e4f534a), json, ch(newBin.byteLength, 0x004e4942), newBin]);
  fs.writeFileSync(file, outBuf);
  console.log(`${file}: ${(buf.byteLength / 1048576).toFixed(2)} -> ${(outBuf.byteLength / 1048576).toFixed(2)} MB`);
}

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node scripts/compress-vrm.mjs <file.vrm>...'); process.exit(1); }
for (const f of files) await compress(f);
