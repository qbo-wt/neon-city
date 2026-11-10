// Downloads the CC0 Poly Haven assets the 3D streets use into public/assets/ph/ (models as 1k glTF,
// textures as 1k jpg, one night HDRI). Re-run safely: files already present are skipped.
// Usage: node scripts/fetch-polyhaven.mjs
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('public/assets/ph');
const RES = '1k';

export const MODELS = [
  'modular_urban_apartments_facade', 'modular_fire_escape', 'concrete_road_barrier', 'concrete_road_barrier_02', 'covered_car',
  'metal_trash_can', 'street_lamp_01', 'street_lamp_02', 'utility_box_01', 'utility_box_02', 'rollershutter_door', 'exterior_aircon_unit',
  'fire_hydrant', 'water_manhole_cover', 'security_camera_01', 'barrel_stove', 'old_tyre', 'modular_chainlink_fence', 'modular_street_seating',
  'modular_electricity_poles', 'security_light', 'modular_airduct_circular_01',
];
export const TEXTURES = ['asphalt_02', 'road_damaged', 'concrete_pavement_02', 'square_tiles_03'];
export const HDRIS = ['modern_buildings_night'];

const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r; };
const save = async (url, file) => {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await (await get(url)).arrayBuffer()));
};

for (const id of MODELS) {
  const files = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
  const g = files.gltf?.[RES]?.gltf;
  if (!g) { console.warn('no gltf for', id); continue; }
  await save(g.url, path.join(OUT, id, `${id}.gltf`));
  for (const [rel, f] of Object.entries(g.include ?? {})) await save(f.url, path.join(OUT, id, rel));
  console.log('model', id);
}
for (const id of TEXTURES) {
  const files = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
  const pick = { diff: files.Diffuse, nor: files.nor_gl, rough: files.Rough, ao: files.AO };
  for (const [k, v] of Object.entries(pick)) if (v?.[RES]?.jpg) await save(v[RES].jpg.url, path.join(OUT, 'tex', id, `${k}.jpg`));
  console.log('texture', id);
}
for (const id of HDRIS) {
  const files = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
  await save(files.hdri[RES].hdr.url, path.join(OUT, 'hdri', `${id}.hdr`));
  console.log('hdri', id);
}
