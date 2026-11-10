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
  // Interiors: apartment, corridor, clinic, den.
  'metal_office_desk', 'classic_laptop', 'television_02', 'Television_01', 'old_bed_frame', 'sofa_02', 'sofa_03', 'modern_coffee_table_01',
  'electric_stove', 'drawer_cabinet', 'potted_plant_01', 'potted_plant_02', 'steel_frame_shelves_01', 'steel_frame_shelves_02', 'worn_metal_rack',
  'katana_stand_01', 'cardboard_box_01', 'WetFloorSign_01', 'CoffeeCart_01', 'painted_wooden_bench', 'plastic_crate_01', 'BarberShopChair_01',
  'desk_lamp_arm_01', 'vintage_cabinet_01', 'medical_box', 'modern_arm_chair_01', 'mounted_fluorescent_lights', 'hanging_picture_frame_01',
  'hanging_picture_frame_02', 'tool_cart', 'vintage_microwave', 'metal_stool_01', 'throw_pillows_01', 'industrial_wall_lamp',
];
export const TEXTURES = ['asphalt_02', 'road_damaged', 'concrete_pavement_02', 'square_tiles_03',
  'laminate_floor_02', 'grey_plaster_02', 'worn_tile_floor', 'worn_plaster_wall', 'interior_tiles', 'concrete_floor_worn_001', 'concrete_block_wall'];
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
