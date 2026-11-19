import * as THREE from 'three';
import type Phaser from 'phaser';
import { Builder, DARK, HALF, METAL, NEON, cachedPicture, registerPicture, renderModel, toon } from './implantModels';
import { SPELLS } from '../data/spells';

/**
 * Procedural 3D pictures of the spells (spell bar, spell card, weapon and guide panels), same engine as
 * the implant and relic pictures (toon ramp, ink outline, lazy and cached). A spell is an action, so each
 * one is a small emblem: one of a few base shapes (`SHAPES`) in the spell's own colour (`SpellDef.color`)
 * plus one distinguishing detail (`SPELL_SPECS`). No asset files.
 */
export type SpellShape = 'slash' | 'stab' | 'fist' | 'wire' | 'bullet' | 'burst' | 'grenade' | 'bolt' | 'glyph' | 'heal' | 'shield' | 'arrow' | 'jump' | 'star' | 'turret' | 'summon' | 'wave';
export interface SpellModelSpec { shape: SpellShape; /** Distinguishing detail, read by the shape builder (0 = base). */ detail: number }
const m = (shape: SpellShape, detail = 0): SpellModelSpec => ({ shape, detail });

/** One spec per spell id (a test checks every id of `data/spells.ts` is here). Tweak shape or detail here; the colour is the spell's. */
export const SPELL_SPECS: Record<string, SpellModelSpec> = {
  // Lame-mono
  cut: m('slash'), windcut: m('arrow', 0), thrust: m('stab'), guard: m('shield'),
  // Lames mantes
  rend: m('slash', 2), leap: m('jump'), bleed: m('slash', 3), evade: m('arrow', 1),
  // Poings Titan
  uppercut: m('fist', 1), jab: m('fist'), shockwave: m('wave'), tackle: m('arrow', 2),
  // Fil
  whip: m('wire'), harpoon: m('stab', 1), garrote: m('wire', 1), web: m('wire', 2),
  // Tir
  shot: m('bullet'), pierce: m('bullet', 1), volley: m('burst'), roll: m('jump', 1),
  overheat: m('star'), blocker: m('heal', 1), shortcircuit: m('bolt'), reflex: m('bullet', 3),
  grenade: m('grenade'), turret: m('turret'), stim: m('heal'), kshield: m('shield', 1), goldshot: m('bullet', 2),
  // Ennemis
  'e-knife': m('slash', 1), 'e-shot': m('bullet', 4), 'e-burst': m('burst', 1), 'e-prime': m('star', 1),
  'e-claw': m('slash', 4), 'e-hammer': m('fist', 2), 'e-rush': m('arrow', 3), 'e-hack': m('glyph'),
  'e-jam': m('bolt', 1), 'e-patch': m('heal', 2), 'e-turret': m('turret', 1),
  // Boss
  'b-butt': m('fist', 3), 'b-barrage': m('burst', 2), 'b-call': m('summon'), 'b-charge': m('arrow', 4),
  'x-blade': m('slash', 5), 'x-ray': m('stab', 2), 'x-wave': m('wave', 1), 'x-blink': m('jump', 2), 'x-drones': m('summon', 1),
};

const arc = (r: number, tube: number, a: number) => new THREE.TorusGeometry(r, tube, 6, 24, a);
const octa = (r: number) => new THREE.OctahedronGeometry(r);
const bar = (b: Builder, x: number, y: number, s = 1) => { // zigzag of three neon bars
  b.neonBox(0.3 * s, 0.75 * s, 0.14, [x + 0.12 * s, y + 0.45 * s, 0], [0, 0, 0.45]);
  b.neonBox(0.5 * s, 0.16 * s, 0.14, [x, y, 0]);
  b.neonBox(0.3 * s, 0.75 * s, 0.14, [x - 0.12 * s, y - 0.45 * s, 0], [0, 0, 0.45]);
};
const casing = (c: number) => toon(c === 0xffd34a ? 0xffd34a : 0xc9a24a);

const SHAPES: Record<SpellShape, (b: Builder, d: number) => void> = {
  slash(b, d) {
    if (d === 4) { // claw: three scratches
      for (const y of [-0.45, 0, 0.45]) b.add(arc(0.9, 0.08, 1.0), NEON(b.c), [-0.5, y, 0], [0, 0, -0.5], false);
      return;
    }
    b.add(arc(0.95, 0.17, 2.0), METAL(), [0, -0.3, 0], [0, 0, 0.55]);
    b.add(arc(0.95, 0.07, 2.0), NEON(b.c), [0, -0.3, 0.12], [0, 0, 0.55], false);
    b.cone(0.17, 0.5, [0.75, 0.75, 0], [0, 0, -0.8]);
    if (d === 1) b.cone(0.12, 0.4, [-0.7, 0.5, 0], [0, 0, HALF]);
    if (d === 2 || d === 5) b.add(arc(0.62, 0.1, 2.0), METAL(), [0, -0.3, 0], [0, 0, 0.55]);
    if (d === 3) { b.sph(0.18, [0.2, -0.95, 0.1], NEON(b.c), [1, 1.3, 1]); b.cone(0.1, 0.3, [0.2, -0.7, 0.1]); }
    if (d === 5) b.add(octa(0.2), NEON(b.c), [0, 0.1, 0.1], [0, 0, 0], false);
  },
  stab(b, d) {
    if (d === 2) { // ray: long beam with rings
      b.neonBox(2.0, 0.22, 0.22, [0, 0, 0]);
      for (const x of [-0.7, 0, 0.7]) b.neonRing(0.3, 0.05, [x, 0, 0], [0, HALF, 0]);
      return;
    }
    b.cyl(0.07, 0.07, 1.6, [0, 0, 0], DARK(), [0, 0, HALF], 8);
    b.cone(0.2, 0.8, [1.0, 0, 0], [0, 0, -HALF]);
    b.cyl(0.14, 0.14, 0.2, [-0.5, 0, 0], METAL(), [0, 0, HALF], 8);
    if (d === 1) for (const s of [-1, 1]) b.cone(0.1, 0.4, [0.55, s * 0.28, 0], [0, 0, -HALF - s * 0.2]); // harpoon barbs
    b.g.rotation.z = 0.5;
  },
  fist(b, d) {
    if (d === 2) { // hammer
      b.box(0.35, 1.5, 0.35, [-0.2, -0.2, 0], DARK(), [0, 0, 0.6]);
      b.box(1.0, 0.6, 0.6, [0.35, 0.45, 0], METAL(), [0, 0, 0.6]);
      b.neonBox(1.05, 0.08, 0.64, [0.3, 0.2, 0], [0, 0, 0.6]);
      return;
    }
    if (d === 3) { // rifle butt
      b.box(1.2, 0.5, 0.4, [0, 0, 0], DARK(), [0, 0, 0.3]);
      b.box(0.6, 1.0, 0.4, [-0.5, -0.4, 0], METAL(), [0, 0, 0.3]);
      b.neonBox(0.12, 0.6, 0.44, [0.4, 0.15, 0]);
      return;
    }
    b.box(1.0, 0.7, 0.8, [0, -0.15, 0], DARK());
    for (const x of [-0.33, -0.11, 0.11, 0.33]) b.cyl(0.12, 0.12, 0.4, [x, 0.3, 0.1], METAL(), [HALF, 0, 0], 8);
    b.neonBox(0.9, 0.08, 0.5, [0, -0.2, 0.42]);
    if (d === 1) { b.cone(0.28, 0.6, [0, 1.0, 0]); b.neonBox(0.12, 0.5, 0.1, [0, 0.65, 0]); } // uppercut: rising arrow
  },
  wire(b, d) {
    if (d === 2) { // web: crossed threads in a ring
      for (const a of [0, 0.785, 1.57, 2.355]) b.neonBox(1.9, 0.07, 0.07, [0, 0, 0], [0, 0, a]);
      for (const r of [0.35, 0.7]) b.neonRing(r, 0.04, [0, 0, 0]);
      return;
    }
    if (d === 1) { // garrote: loop between two handles
      b.neonRing(0.7, 0.07, [0, 0.15, 0]);
      for (const x of [-0.35, 0.35]) b.cyl(0.11, 0.11, 0.6, [x, -0.85, 0], DARK(), [0, 0, 0], 8);
      return;
    }
    b.cyl(0.14, 0.14, 0.7, [-0.7, -0.5, 0], DARK(), [0, 0, 0.7], 8); // whip: handle + curling lash
    b.add(arc(0.9, 0.07, 3.6), NEON(b.c), [0.1, 0.1, 0], [0, 0, -0.3], false);
    b.sph(0.13, [0.95, 0.2, 0], NEON(b.c));
  },
  bullet(b, d) {
    const gold = d === 2;
    b.cyl(0.26, 0.26, 0.8, [0, -0.15, 0], casing(gold ? 0xffd34a : 0), [0, 0, 0], 10);
    b.cyl(0.0, 0.26, 0.5, [0, 0.5, 0], toon(gold ? 0xffd34a : 0xe8e0c8), [0, 0, 0], 10);
    b.neonBox(0.52, 0.09, 0.52, [0, -0.45, 0]);
    for (const x of [-0.18, 0, 0.18]) b.neonBox(0.05, 0.5 - Math.abs(x), 0.05, [x, -0.95, 0]); // trail
    if (d === 1) { b.neonRing(0.4, 0.05, [0, 0.25, 0], [HALF, 0, 0]); b.neonRing(0.55, 0.04, [0, 0.55, 0], [HALF, 0, 0]); } // pierce
    if (gold) b.cyl(0.14, 0.14, 0.04, [0, -0.1, 0.27], NEON(b.c), [HALF, 0, 0], 10);
    if (d === 3) b.neonRing(0.75, 0.04, [0, 0, 0]);                                              // reflex clock
    if (d === 4) b.cyl(0.07, 0.07, 0.3, [0.45, 0.2, 0], DARK(), [0, 0, 0.4], 6);
    b.g.rotation.z = -0.6;
  },
  burst(b, d) {
    for (const [a, s] of [[-0.5, 0.85], [0, 1], [0.5, 0.85]] as const) {
      const c = new Builder(b.c);
      c.cyl(0.17, 0.17, 0.6, [0, -0.1, 0], toon(0xc9a24a), [0, 0, 0], 8);
      c.cyl(0, 0.17, 0.4, [0, 0.37, 0], toon(0xe8e0c8), [0, 0, 0], 8);
      c.neonBox(0.36, 0.07, 0.36, [0, -0.3, 0]);
      c.g.scale.setScalar(s); c.g.rotation.z = -a; c.g.position.set(Math.sin(a) * 0.15, -0.2 + (1 - s) * 0.3, 0);
      b.g.add(c.g);
    }
    if (d === 2) { b.neonRing(0.95, 0.045, [0, -0.15, -0.1]); b.neonRing(0.6, 0.04, [0, -0.15, -0.1]); } // barrage zone
    if (d === 1) b.cyl(0.18, 0.18, 0.1, [0, -1.0, 0], DARK(), [0, 0, 0], 8);                        // drone pad
  },
  grenade(b) {
    b.sph(0.62, [0, -0.1, 0], toon(0x4a6a4a));
    for (const y of [-0.3, -0.05, 0.2]) b.neonRing(0.6 * Math.cos(y * 1.2), 0.035, [0, y - 0.1, 0], [HALF, 0, 0]);
    b.cyl(0.2, 0.22, 0.25, [0, 0.6, 0], METAL(), [0, 0, 0], 8);
    b.box(0.5, 0.08, 0.14, [0.3, 0.8, 0], METAL(), [0, 0, 0.3]);
    b.neonRing(0.22, 0.05, [-0.25, 0.85, 0]);
  },
  bolt(b, d) {
    bar(b, 0, 0, 1.2);
    if (d === 1) { b.neonRing(0.95, 0.05, [0, 0, -0.1]); b.box(1.4, 0.07, 0.07, [0, 0, 0.1], DARK(), [0, 0, 0.8]); } // jam: struck-out ring
    else for (const s of [-1, 1]) b.cone(0.1, 0.35, [s * 0.75, s * 0.2, 0], [0, 0, -s * HALF]);
  },
  glyph(b) {
    b.box(1.1, 0.14, 1.1, [0, 0, 0], DARK());
    b.box(0.55, 0.18, 0.55, [0, 0.1, 0]);
    b.neonBox(0.3, 0.2, 0.3, [0, 0.12, 0]);
    for (let i = -1; i <= 1; i++) for (const s of [-1, 1]) { b.neonBox(0.06, 0.05, 0.3, [i * 0.28, -0.02, s * 0.7]); b.neonBox(0.3, 0.05, 0.06, [s * 0.7, -0.02, i * 0.28]); }
    b.neonRing(0.75, 0.04, [0, 0.3, 0], [HALF, 0, 0]);
    b.g.rotation.x = 0.6;
  },
  heal(b, d) {
    if (d === 1) { // pill
      b.add(new THREE.CapsuleGeometry(0.34, 0.8, 4, 10), toon(0xe8e4ff), [0, 0, 0], [0, 0, 0.7]);
      b.neonBox(0.12, 0.7, 0.12, [-0.12, -0.12, 0.38], [0, 0, 0.7]);
      b.neonBox(0.7, 0.12, 0.12, [0.3, 0.3, 0.38], [0, 0, 0.7]);
      return;
    }
    if (d === 0) { // syringe
      b.cyl(0.26, 0.26, 1.1, [0, 0.1, 0], toon(0xe8e4ff), [0, 0, 0], 10);
      b.cyl(0.18, 0.18, 0.8, [0, 0.1, 0.1], NEON(b.c), [0, 0, 0], 10);
      b.cyl(0.4, 0.4, 0.1, [0, 0.7, 0], DARK(), [0, 0, 0], 10);
      b.cyl(0.08, 0.08, 0.5, [0, 1.0, 0], METAL(), [0, 0, 0], 6);
      b.cone(0.07, 0.5, [0, -0.75, 0], [Math.PI, 0, 0]);
      b.g.rotation.z = -0.5;
      return;
    }
    b.neonBox(0.5, 1.5, 0.3, [0, 0, 0]); // patch: cross + signal arcs
    b.neonBox(1.5, 0.5, 0.3, [0, 0, 0]);
    b.add(arc(0.9, 0.05, 1.2), NEON(b.c), [0, -0.2, -0.1], [0, 0, 0.9], false);
  },
  shield(b, d) {
    b.cyl(0.85, 0.85, 0.16, [0, 0, 0], DARK(), [HALF, 0, 0], 6);
    b.cyl(0.6, 0.6, 0.22, [0, 0, 0.03], METAL(), [HALF, 0, 0], 6);
    b.neonRing(0.72, 0.045, [0, 0, 0.12]);
    b.add(octa(d === 1 ? 0.3 : 0.2), NEON(b.c), [0, 0, 0.2], [0, 0, 0], false);
    if (d === 1) b.neonRing(1.0, 0.04, [0, 0, 0]);
  },
  arrow(b, d) {
    b.neonBox(1.3, 0.34, 0.2, [-0.15, 0, 0]);
    b.cone(0.5, 0.9, [0.85, 0, 0], [0, 0, -HALF]);
    for (const y of [-0.55, 0.55]) b.box(0.8, 0.07, 0.07, [-0.7, y, 0], DARK());
    if (d === 1) for (const y of [-0.3, 0.3]) b.box(0.6, 0.07, 0.07, [-1.0, y, 0], METAL()); // evade: longer trails
    if (d === 2) b.box(0.4, 0.9, 0.5, [-1.0, 0, 0], METAL());                                    // tackle: shoulder
    if (d === 3) for (const y of [-0.3, 0.3]) b.cone(0.1, 0.45, [0.3, y * 1.4, 0.2], [0, 0, -HALF]); // rush: horns
    if (d === 4) { b.cyl(0.4, 0.4, 0.14, [-1.0, 0, 0], DARK(), [0, 0, HALF], 8); b.neonRing(0.4, 0.04, [-1.0, 0, 0], [0, HALF, 0]); } // charge: wheel
  },
  jump(b, d) {
    if (d === 2) { // blink: diamond with echo
      b.add(octa(0.6), NEON(b.c), [0.4, 0.2, 0], [0, 0.6, 0], false);
      b.add(octa(0.4), toon(b.c), [-0.55, -0.3, 0], [0, 0.6, 0]);
      return;
    }
    if (d === 1) { // roll: curled loop
      b.add(arc(0.7, 0.2, 5.0), METAL(), [0, 0, 0], [0, 0, 0.5]);
      b.add(arc(0.7, 0.08, 5.0), NEON(b.c), [0, 0, 0.18], [0, 0, 0.5], false);
      b.cone(0.28, 0.55, [0.55, 0.55, 0], [0, 0, -0.8]);
      return;
    }
    b.add(arc(1.0, 0.1, Math.PI), NEON(b.c), [0, -0.5, 0], [0, 0, 0], false); // leap: arc up and over, landing ring
    b.cone(0.3, 0.6, [1.0, -0.5, 0], [0, 0, Math.PI]);
    b.cyl(0.55, 0.55, 0.08, [1.0, -0.95, 0], DARK(), [0, 0, 0], 12);
    b.neonRing(0.55, 0.04, [1.0, -0.9, 0], [HALF, 0, 0]);
    b.cyl(0.14, 0.14, 0.4, [-1.0, -0.7, 0], METAL(), [0, 0, 0], 8);
  },
  star(b, d) {
    if (d === 1) { // prime: bomb with a fuse
      b.sph(0.55, [0, -0.15, 0], toon(0x4a3a6a));
      b.cyl(0.1, 0.1, 0.3, [0, 0.45, 0], METAL(), [0, 0, 0], 8);
      b.cone(0.18, 0.5, [0.15, 0.9, 0], [0, 0, 0.3]);
      b.neonRing(0.58, 0.04, [0, -0.15, 0], [HALF, 0, 0]);
      return;
    }
    b.add(octa(0.55), NEON(b.c), [0, -0.1, 0], [0, 0.4, 0], false);
    b.neonRing(0.85, 0.045, [0, -0.1, 0], [HALF * 0.8, 0, 0]);
    for (const x of [-0.45, 0, 0.45]) b.cone(0.17, 0.8 - Math.abs(x), [x, 0.8, 0]); // flames
  },
  turret(b, d) {
    b.cyl(0.6, 0.75, 0.3, [0, -0.55, 0], DARK(), [0, 0, 0], 8);
    b.sph(0.4, [0, -0.15, 0], toon(0x6a5fb0));
    b.cyl(0.14, 0.14, 1.0, [0.6, -0.05, 0], METAL(), [0, 0, HALF], 8);
    b.cyl(0.1, 0.1, 0.06, [1.12, -0.05, 0], NEON(b.c), [0, 0, HALF], 8);
    b.neonBox(0.5, 0.07, 0.07, [0, 0.1, 0.4]);
    if (d === 1) b.cyl(0.05, 0.05, 0.6, [-0.2, 0.4, 0], METAL()); // enemy: antenna
    else b.neonRing(0.85, 0.04, [0, -0.7, 0], [HALF, 0, 0]);       // ally: ring
  },
  summon(b, d) {
    b.sph(0.4, [0, 0, 0], toon(0x6a5fb0));
    b.neonBox(0.35, 0.1, 0.1, [0, 0, 0.38]);
    if (d === 1) for (const s of [-1, 1]) { // drone rotors
      b.cyl(0.3, 0.3, 0.04, [s * 0.8, 0.35, 0], NEON(b.c), [0, 0, 0], 12);
      b.cyl(0.04, 0.04, 0.4, [s * 0.5, 0.2, 0], METAL(), [0, 0, 0.9 * s], 6);
    } else for (const s of [-1, 1]) { // ears and claws
      b.sph(0.18, [s * 0.3, 0.45, 0], toon(0x6a5fb0));
      b.cone(0.1, 0.4, [s * 0.9, -0.1, 0], [0, 0, -s * HALF]);
    }
    b.neonRing(1.0, 0.045, [0, -0.55, 0], [HALF, 0, 0]);
  },
  wave(b, d) {
    b.cyl(0.4, 0.4, 0.2, [0, -0.2, 0], DARK(), [0, 0, 0], 12);
    for (const r of d === 1 ? [0.7, 1.0, 1.3] : [0.8, 1.15]) b.neonRing(r, 0.06, [0, -0.1, 0], [HALF * 0.5, 0, 0]);
    if (d === 0) for (const a of [0.6, 2.4, 4.0]) b.cone(0.2, 0.6, [Math.cos(a) * 0.6, 0.45, Math.sin(a) * 0.6]); // debris
    else b.add(octa(0.3), NEON(b.c), [0, 0.35, 0], [0, 0.4, 0], false);
  },
};

/** Builds the 3D model of a spell (about 2 units wide, centred on the origin). Null for an unknown id. */
export function buildSpellModel(id: string): THREE.Group | null {
  const spec = SPELL_SPECS[id], def = SPELLS[id];
  if (!spec || !def) return null;
  const b = new Builder(def.color);
  SHAPES[spec.shape](b, spec.detail);
  const root = new THREE.Group();
  root.add(b.g);
  return root;
}

/** The picture of a spell, rendered on first request and cached; null if rendering fails. */
export function spellPicture(id: string): Promise<HTMLCanvasElement | null> {
  return cachedPicture('spell:' + id, () => {
    const model = buildSpellModel(id);
    return model ? renderModel(model, SPELLS[id].color) : null;
  });
}

/** Registers `spell-3d-<id>` as a Phaser texture once rendered; resolves with the key, or null on failure (callers keep their text fallback). */
export function spellTexture(scene: Phaser.Scene, id: string): Promise<string | null> {
  return registerPicture(scene, `spell-3d-${id}`, spellPicture(id));
}

/**
 * Puts the picture of a spell into `parent` at (x, y), `size` logical px wide. `fallback` (the 2-letter
 * text) is hidden once the picture shows and stays if rendering fails. `dim` greys it out (spell
 * unavailable). `valid` lets the caller drop a late result (the card was rebuilt meanwhile).
 */
export function showSpellPicture(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, id: string, x: number, y: number, size: number,
  opts: { dim?: boolean; fallback?: { setVisible(v: boolean): unknown }; valid?: () => boolean } = {}) {
  const put = (key: string) => {
    if ((opts.valid && !opts.valid()) || !parent.active) return;
    const img = scene.add.image(x, y, key).setDisplaySize(size, size);
    if (opts.dim) img.setTint(0x6a6a7a).setAlpha(0.55);
    parent.add(img);
    opts.fallback?.setVisible(false);
  };
  const key = `spell-3d-${id}`;
  if (scene.textures.exists(key)) { put(key); return; }
  spellTexture(scene, id).then(k => { if (k && scene.sys?.isActive()) put(k); }).catch(() => {});
}
