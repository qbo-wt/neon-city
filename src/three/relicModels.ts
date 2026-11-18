import * as THREE from 'three';
import type Phaser from 'phaser';
import { Builder, CY, DARK, GR, HALF, METAL, NEON, YL, cachedPicture, registerPicture, renderModel, toon } from './implantModels';

/**
 * Procedural 3D pictures of the relics (HUD, choice panel, chest), same look and same renderer as the
 * implant pictures: toon ramp, ink outline, lazy and cached. The neon colour follows the rarity
 * (as RELIC_RARITY_COLORS); cursed relics also get a green halo. No asset files.
 */
export type RelicShape = 'blade' | 'orb' | 'guns' | 'fist' | 'fang' | 'metronome' | 'chip' | 'coin' | 'coil' | 'garment' | 'cell' | 'gel' | 'crowbar' | 'mask' | 'gear' | 'paper';
export type RelicRarityKey = 'common' | 'rare' | 'legendary' | 'cursed';
export interface RelicSpec { shape: RelicShape; rarity: RelicRarityKey; detail: number }

const COMMON = 0x9a96c8;
export const RARITY_NEON: Record<RelicRarityKey, number> = { common: COMMON, rare: CY, legendary: YL, cursed: GR };

/** One spec per relic id (a test checks every id of `data/relics.ts` is here). Tweak shape, rarity colour or detail here. */
export const RELIC_SPECS: Record<string, RelicSpec> = {
  'katana': { shape: 'blade', rarity: 'legendary', detail: 0 },
  'last-breath': { shape: 'orb', rarity: 'legendary', detail: 0 },
  'convergence': { shape: 'orb', rarity: 'legendary', detail: 1 },
  'pistols': { shape: 'guns', rarity: 'rare', detail: 0 },
  'cleaver': { shape: 'blade', rarity: 'rare', detail: 2 },
  'grudge': { shape: 'fist', rarity: 'rare', detail: 0 },
  'viper-fang': { shape: 'fang', rarity: 'rare', detail: 0 },
  'metronome': { shape: 'metronome', rarity: 'rare', detail: 0 },
  'purger': { shape: 'chip', rarity: 'rare', detail: 0 },
  'interest': { shape: 'coin', rarity: 'rare', detail: 0 },
  'living-chrome': { shape: 'gear', rarity: 'rare', detail: 0 },
  'piston-gloves': { shape: 'fist', rarity: 'rare', detail: 1 },
  'hunt-coil': { shape: 'coil', rarity: 'common', detail: 0 },
  'loner-cloak': { shape: 'garment', rarity: 'common', detail: 0 },
  'spiked-jacket': { shape: 'garment', rarity: 'common', detail: 1 },
  'backup-cell': { shape: 'cell', rarity: 'common', detail: 0 },
  'nano-weave': { shape: 'chip', rarity: 'common', detail: 1 },
  'scar-gel': { shape: 'gel', rarity: 'common', detail: 0 },
  'platinum-card': { shape: 'coin', rarity: 'common', detail: 1 },
  'scavenger': { shape: 'crowbar', rarity: 'common', detail: 0 },
  'hungry-blade': { shape: 'blade', rarity: 'cursed', detail: 1 },
  'oni-mask': { shape: 'mask', rarity: 'cursed', detail: 0 },
  'burning-mind': { shape: 'orb', rarity: 'cursed', detail: 2 },
  'blood-contract': { shape: 'paper', rarity: 'cursed', detail: 0 },
};

const SHAPES: Record<RelicShape, (b: Builder, d: number) => void> = {
  blade(b, d) {
    if (d === 2) { // cleaver: wide slab with a hole
      b.box(1.1, 0.9, 0.12, [0.2, 0.2, 0], METAL(), [0, 0, 0.2]);
      b.neonBox(1.1, 0.07, 0.14, [0.2, -0.22, 0], [0, 0, 0.2]);
      b.cyl(0.14, 0.14, 0.16, [0.4, 0.4, 0], DARK(), [HALF, 0, 0], 10);
      b.box(0.2, 0.8, 0.2, [-0.55, -0.45, 0], DARK(), [0, 0, 0.2]);
      return;
    }
    b.box(0.2, 1.5, 0.1, [0.1, 0.2, 0], METAL()); // long blade
    b.neonBox(0.05, 1.45, 0.12, [0.2, 0.2, 0]);    // edge glow
    b.cone(0.14, 0.4, [0.1, 1.15, 0]);               // tip
    b.box(0.55, 0.1, 0.18, [0.1, -0.78, 0], DARK());  // guard
    b.cyl(0.09, 0.09, 0.55, [0.1, -1.1, 0], DARK(), [0, 0, 0], 8);
    if (d === 1) for (const y of [-0.1, 0.35, 0.8]) b.cone(0.1, 0.28, [-0.1, y, 0], [0, 0, HALF]); // jagged hungry teeth
    b.g.rotation.z = -0.7;
  },
  orb(b, d) {
    b.sph(0.55, [0, 0, 0], toon(d === 2 ? 0xff7a3a : b.c));
    b.neonRing(0.8, 0.045, [0, 0, 0], [HALF * 0.8, 0, 0]);
    if (d === 0) { b.neonBox(0.12, 0.5, 0.06, [0, 0, 0.55]); b.neonBox(0.5, 0.12, 0.06, [0, 0, 0.55]); }          // faint spark of a last breath
    if (d === 1) for (const a of [0, 2.1, 4.2]) b.add(new THREE.OctahedronGeometry(0.2), NEON(b.c), [Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0], [0, 0, 0], false); // converging nodes
    if (d === 2) for (const x of [-0.3, 0, 0.3]) b.cone(0.16, 0.7 - Math.abs(x), [x, 0.75, 0]);                  // flames
  },
  guns(b) {
    for (const s of [-1, 1]) {
      b.box(0.9, 0.34, 0.26, [0.1, 0.22 * s, 0.2 * s], METAL(), [0, 0, 0]);
      b.box(0.26, 0.55, 0.24, [-0.3, -0.08 + 0.22 * s, 0.2 * s], DARK(), [0, 0, 0.25]);
      b.cyl(0.07, 0.07, 0.4, [0.65, 0.22 * s, 0.2 * s], DARK(), [0, 0, HALF], 8);
      b.neonBox(0.5, 0.05, 0.28, [0.1, 0.36 + 0.22 * s - 0.0, 0.2 * s]);
    }
  },
  fist(b, d) {
    b.box(0.9, 0.6, 0.8, [0, 0, 0], DARK());
    for (const x of [-0.3, -0.1, 0.1, 0.3]) b.cyl(0.11, 0.11, 0.35, [x, 0.38, 0.1], METAL(), [HALF, 0, 0], 8);
    b.cyl(0.25, 0.3, 0.8, [0, -0.7, 0], METAL(), [0, 0, 0], 8);
    b.neonBox(0.9, 0.06, 0.08, [0, 0.15, 0.4]);
    if (d === 1) for (const x of [-0.45, 0.45]) b.cyl(0.07, 0.07, 1.0, [x, -0.4, 0.2], NEON(b.c), [0, 0, 0], 8); // pistons
    b.g.rotation.z = 0.2;
  },
  fang(b) {
    b.cone(0.4, 1.7, [0, 0.1, 0], [0, 0, Math.PI]).material = toon(0xe8e4ff);
    b.cyl(0.4, 0.4, 0.22, [0, 0.95, 0], DARK(), [0, 0, 0], 10);
    b.sph(0.12, [0, -1.0, 0], NEON(b.c), [1, 1.5, 1]);  // venom drop
    b.neonBox(0.07, 0.8, 0.07, [0, 0.35, 0.3]);
    b.g.rotation.z = 0.25;
  },
  metronome(b) {
    b.cyl(0.35, 0.8, 1.5, [0, -0.1, 0], DARK(), [0, 0, 0], 4);
    b.g.children.forEach(c => { c.rotation.y = Math.PI / 4; });
    b.box(0.06, 1.4, 0.06, [0.1, 0.5, 0.45], METAL(), [0, 0, 0.35]);               // pendulum arm
    b.sph(0.14, [-0.1, 0.2, 0.45], NEON(b.c));                                       // weight
    b.neonBox(0.7, 0.07, 0.07, [0, -0.5, 0.58]);
  },
  chip(b, d) {
    b.box(1.1, 0.14, 1.1, [0, 0, 0], DARK());
    b.box(0.6, 0.18, 0.6, [0, 0.1, 0]);
    b.neonBox(0.3, 0.2, 0.3, [0, 0.12, 0]);
    for (let i = -2; i <= 2; i++) for (const s of [-1, 1]) { b.box(0.07, 0.05, 0.22, [i * 0.2, -0.02, s * 0.66]); b.box(0.22, 0.05, 0.07, [s * 0.66, -0.02, i * 0.2]); }
    if (d === 0) b.neonRing(0.45, 0.03, [0, 0.22, 0], [HALF, 0, 0]);                  // purger ring
    if (d === 1) for (const x of [-0.3, 0, 0.3]) b.neonBox(0.05, 0.05, 1.0, [x, 0.22, 0]); // woven threads
    b.g.rotation.x = 0.6;
  },
  coin(b, d) {
    if (d === 1) { // card
      b.box(1.6, 1.0, 0.07, [0, 0, 0], METAL());
      b.box(0.3, 0.24, 0.05, [-0.5, 0.15, 0.06], toon(0xf5e663));
      b.neonBox(1.3, 0.08, 0.04, [0, -0.25, 0.06]);
      b.neonBox(0.8, 0.06, 0.04, [0, -0.4, 0.06]);
      return;
    }
    for (let i = 0; i < 4; i++) b.cyl(0.55, 0.55, 0.14, [0, -0.55 + i * 0.2, 0], i % 2 ? toon(b.c) : METAL(), [0, 0, 0], 16);
    b.cyl(0.55, 0.55, 0.14, [0.35, 0.3, 0.45], toon(b.c), [HALF - 0.4, 0, 0], 16);   // coin leaning on the stack
  },
  coil(b) {
    for (let i = 0; i < 5; i++) b.add(new THREE.TorusGeometry(0.5, 0.11, 6, 16), i % 2 ? METAL() : NEON(b.c), [0, -0.7 + i * 0.35, 0], [HALF, 0, 0], i % 2 === 1);
    b.cyl(0.14, 0.14, 1.9, [0, 0, 0], DARK(), [0, 0, 0], 8);
    b.cone(0.2, 0.4, [0, 1.15, 0]);
  },
  garment(b, d) {
    b.cyl(0.35, 0.8, 1.6, [0, -0.1, 0], DARK(), [0, 0, 0], 10);
    b.cyl(0.5, 0.5, 0.25, [0, 0.75, 0], METAL(), [0, 0, 0], 10);        // collar
    b.neonBox(0.07, 1.3, 0.05, [0, -0.1, 0.62]);
    if (d === 1) for (const [x, y] of [[-0.35, 0.3], [0.35, 0.3], [-0.5, -0.3], [0.5, -0.3], [0, -0.6]]) b.cone(0.1, 0.35, [x, y, 0.45], [HALF, 0, 0]); // studs
  },
  cell(b) {
    b.cyl(0.45, 0.45, 1.4, [0, 0, 0], DARK(), [0, 0, 0], 12);
    b.cyl(0.2, 0.2, 0.2, [0, 0.8, 0], METAL(), [0, 0, 0], 8);
    b.add(new THREE.CylinderGeometry(0.46, 0.46, 0.3, 12), NEON(b.c), [0, 0.1, 0], [0, 0, 0], false);
    b.neonBox(0.16, 0.5, 0.05, [0, -0.45, 0.46]);
  },
  gel(b) {
    b.cyl(0.55, 0.55, 0.9, [0, -0.1, 0], toon(0xcfe9ff), [0, 0, 0], 12);
    b.cyl(0.58, 0.58, 0.3, [0, 0.55, 0], DARK(), [0, 0, 0], 12);
    b.sph(0.38, [0, -0.15, 0], NEON(b.c));
    b.box(0.5, 0.5, 0.06, [0.1, -0.1, 0.56], METAL(), [0, 0, 0.1]);   // cross patch
    b.neonBox(0.3, 0.07, 0.04, [0.1, -0.1, 0.6]); b.neonBox(0.07, 0.3, 0.04, [0.1, -0.1, 0.6]);
  },
  crowbar(b) {
    b.cyl(0.1, 0.1, 1.8, [0, 0, 0], METAL(), [0, 0, 0.5], 8);
    b.cyl(0.1, 0.1, 0.7, [-0.75, 0.9, 0], METAL(), [0, 0, 1.7], 8);                  // hooked head
    b.add(new THREE.BoxGeometry(0.25, 0.1, 0.1), NEON(b.c), [-1.05, 0.7, 0], [0, 0, 0.6], false);
    b.neonBox(0.08, 0.5, 0.12, [0.45, -0.45, 0], [0, 0, 0.5]);
  },
  mask(b) {
    b.sph(0.8, [0, 0, 0], toon(0xe8e4ff), [1, 1.15, 0.6]);
    for (const s of [-1, 1]) {
      b.cone(0.16, 0.7, [s * 0.5, 0.85, 0], [0, 0, -s * 0.3]).material = toon(b.c);
      b.add(new THREE.BoxGeometry(0.34, 0.12, 0.1), NEON(b.c), [s * 0.3, 0.15, 0.47], [0, 0, s * -0.4], false); // glowing eyes
      b.cone(0.07, 0.25, [s * 0.25, -0.45, 0.42], [Math.PI, 0, 0]).material = toon(0xe8e4ff);                    // fangs
    }
    b.neonBox(0.7, 0.07, 0.1, [0, -0.3, 0.46]);
  },
  gear(b) {
    b.cyl(0.65, 0.65, 0.3, [0, 0, 0], METAL(), [HALF, 0, 0], 12);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; b.box(0.28, 0.3, 0.3, [Math.cos(a) * 0.75, Math.sin(a) * 0.75, 0], METAL(), [0, 0, a]); }
    b.cyl(0.3, 0.3, 0.34, [0, 0, 0], DARK(), [HALF, 0, 0], 10);
    b.cyl(0.14, 0.14, 0.4, [0, 0, 0], NEON(b.c), [HALF, 0, 0], 8);
    b.neonRing(0.45, 0.035, [0, 0, 0.17]);
  },
  paper(b) {
    b.box(1.2, 1.6, 0.06, [0, 0, 0], toon(0xe8e4ff), [0, 0, 0.1]);
    for (const y of [0.5, 0.2, -0.1]) b.box(0.8, 0.06, 0.04, [0, y, 0.05], DARK(), [0, 0, 0.1]);
    b.cyl(0.25, 0.25, 0.08, [0.2, -0.5, 0.06], NEON(b.c), [HALF, 0, 0], 10);          // seal
    b.neonBox(0.04, 0.5, 0.05, [0.2, -0.95, 0.06], [0, 0, 0.1]);                       // dripping seal ribbon
  },
};

/** The 3D model of a relic (about 2 units wide, centred on the origin). Null for an unknown id. */
export function buildRelicModel(id: string): THREE.Group | null {
  const spec = RELIC_SPECS[id];
  if (!spec) return null;
  const b = new Builder(RARITY_NEON[spec.rarity]);
  SHAPES[spec.shape](b, spec.detail);
  const root = new THREE.Group();
  root.add(b.g);
  return root;
}

/** The picture of a relic, rendered on first request and cached; null if rendering fails. */
export function relicPicture(id: string): Promise<HTMLCanvasElement | null> {
  return cachedPicture('relic:' + id, () => {
    const model = buildRelicModel(id), spec = RELIC_SPECS[id];
    return model ? renderModel(model, RARITY_NEON[spec.rarity], spec.rarity === 'cursed' ? GR : undefined) : null;
  });
}

/** Registers `relic-3d-<id>` as a Phaser texture once rendered; resolves with the key, or null on failure (callers keep their text fallback). */
export function relicTexture(scene: Phaser.Scene, id: string): Promise<string | null> {
  return registerPicture(scene, `relic-3d-${id}`, relicPicture(id));
}
