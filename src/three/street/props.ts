import * as THREE from 'three';
import { pick } from '../../core/rng';
import type { Board } from '../../tactics/types';
import { fitObject } from './kit';
import { basic, box, containerBox, holoAd, plain, reflective, signBoard, type CityPlan, type StreetCtx } from './city';
import { canvas, glowTexture, shade, stripeTexture, tex, tickerTexture } from './paint';
import { N } from './styles';

/**
 * Board props (cover and obstacles) as low-poly kit models or small custom builds, each fitted
 * to its cell, and the street dressing around the board: lamps, bollards, trash bags, fences,
 * parked scooters, steam from the grates.
 */

const K = 'kenney/';

/** Builds a group whose origin is the base centre of the cell, for one prop kind. */
export async function makeProp(ctx: StreetCtx, kind: string, CELL: number, at = new THREE.Vector3()): Promise<THREE.Object3D | null> {
  const W = (x: number, y: number, z: number) => at.clone().add(new THREE.Vector3(x, y, z));
  const { kit, rng, theme } = ctx;
  const fit = async (path: string, w: number, d: number, h = Infinity) => { const o = await kit.clone(path); fitObject(o, w, d, h); const g = new THREE.Group(); g.add(o); return g; };
  const C = CELL;
  switch (kind) {
    case 'crate': case 'crate-b': {
      const g = new THREE.Group();
      const a = await fit(`${K}cars/box`, C * 0.72, C * 0.72);
      a.rotation.y = rng() * 0.6 - 0.3;
      g.add(a);
      if (rng() < 0.6) { const b2 = await fit(`${K}cars/box`, C * 0.5, C * 0.5); b2.position.y = new THREE.Box3().setFromObject(a).max.y; b2.rotation.y = rng() * 1.5; g.add(b2); }
      return g;
    }
    case 'barrel': {
      const g = new THREE.Group();
      const a = await fit(`${K}station/container-tall`, C * 0.5, C * 0.5, 1.05);
      a.position.set(-0.18, 0, -0.1); g.add(a);
      if (rng() < 0.7) { const b2 = await fit(`${K}station/container`, C * 0.42, C * 0.42, 0.8); b2.position.set(0.3, 0, 0.25); g.add(b2); }
      return g;
    }
    case 'dumpster': {
      const g = await fit(`${K}station/skip`, C * 0.95, C * 0.62);
      g.rotation.y = Math.PI / 2 * (rng() < 0.5 ? 1 : 0);
      // Trash bags overflowing.
      const bagMat = plain(0x2a2a40, 'bag');
      for (let i = 0; i < 3; i++) {
        const bag = new THREE.Mesh(new THREE.SphereGeometry(0.22 + rng() * 0.08, 7, 5), bagMat);
        bag.scale.y = 0.8; bag.position.set((rng() - 0.5) * 0.6, 0.55 + rng() * 0.1, (rng() - 0.5) * 0.3); bag.castShadow = true;
        g.add(bag);
      }
      return g;
    }
    case 'pillar': {
      const g = new THREE.Group();
      const hz = stripeTexture(0xf5e663, 0x1a1430, 8, true);
      hz.repeat.set(2, 0.5);
      g.add(box(C * 0.62, 4.6, C * 0.62, plain(0x6a6888, 'pillar'), 0, 2.3, 0));
      g.add(box(C * 0.64, 0.9, C * 0.64, new THREE.MeshStandardMaterial({ map: hz, roughness: 1 }), 0, 0.45, 0));
      // Fluorescent tube and the bay letter.
      const tube = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), basic(null, 0xd8f4ff, 2.2));
      tube.position.set(C * 0.32, 3.2, 0); g.add(reflective(tube));
      const sign = signBoard(ctx, pick(rng, ['A', 'B', 'C', 'D', 'E', 'F']), N.cyan, 'box', 0.6, 0.6);
      sign.position.set(0, 2.6, C * 0.31); g.add(sign);
      return g;
    }
    case 'stall': {
      const g = new THREE.Group();
      const col = pick(rng, theme.neon);
      g.add(box(C * 0.9, 0.85, C * 0.62, plain(0x5a3a3a, 'stall'), 0, 0.42, 0));
      g.add(box(C * 0.94, 0.06, C * 0.66, plain(0x2a1a2a, 'stall2'), 0, 0.87, 0));
      const goods = await fit(`${K}market/${pick(rng, ['display-fruit', 'display-bread', 'display-fruit'])}`, C * 0.5, C * 0.45, 0.45);
      goods.position.y = 0.9; g.add(goods);
      // Canopy on four poles, a lantern and a small sign.
      const t = stripeTexture(col, shade(col, 0.45), 6);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.05, 2.1, 0.05, plain(0x1e1a34, 'iron'), x * C * 0.43, 1.05, z * C * 0.3));
      const roof = new THREE.Mesh(new THREE.BoxGeometry(C * 1.0, 0.06, C * 0.8), [plain(shade(col, 0.4)), plain(shade(col, 0.4)), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }), plain(shade(col, 0.3)), plain(shade(col, 0.4)), plain(shade(col, 0.4))]);
      roof.position.y = 2.15; roof.rotation.x = 0.12; roof.castShadow = true;
      g.add(roof);
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), basic(null, 0xffb050, 2));
      lantern.position.set(0, 1.85, C * 0.25); lantern.scale.y = 1.3;
      g.add(reflective(lantern));
      ctx.life.swing(lantern, 0.1, 1.3);
      const sign = signBoard(ctx, pick(rng, ['RAMEN', 'THÉ', 'SOBA', 'FRUITS', 'POISSON', 'TOFU', 'BAO']), col, 'tube', C * 0.8, C * 0.22);
      sign.position.set(0, 2.36, C * 0.36); sign.rotation.x = -0.15;
      g.add(sign);
      if (rng() < 0.4) ctx.life.vent(W(0, 1.1, 0), 0.4, 1.2);
      return g;
    }
    case 'container': {
      const col = pick(rng, [0xc0503a, 0x3a7ab0, 0xc0902a, 0x4a9a6a, 0x8a4ab0, 0xb03a6a]);
      const g = new THREE.Group();
      const c = containerBox(col, C * 0.96, 1.9, C * 0.96);
      c.position.y = 0.95; g.add(c);
      const label = signBoard(ctx, pick(rng, ['KSL', 'NCX', 'HOSHI', 'MRSK', 'VEGA']), 0xe8e4ff, 'box', 0.9, 0.3);
      label.position.set(0, 1.5, C * 0.48 + 0.01); g.add(label);
      return g;
    }
    case 'barrier': {
      const g = await fit(`${K}roads/construction-barrier`, C * 0.5, C * 0.95, 0.95);
      g.rotation.y = rng() < 0.5 ? 0 : Math.PI / 2;
      // Hazard stripes and a blinking light on top.
      const hz = stripeTexture(0xff2a6d, 0xe8e4ff, 8, true);
      const band = new THREE.Mesh(new THREE.PlaneGeometry(C * 0.9, 0.22), new THREE.MeshStandardMaterial({ map: hz, roughness: 1 }));
      band.position.set(0.26, 0.6, 0); band.rotation.y = Math.PI / 2;
      g.add(band);
      const band2 = band.clone(); band2.position.x = -0.26; band2.rotation.y = -Math.PI / 2; g.add(band2);
      if (rng() < 0.6) {
        const l = await fit(`${K}roads/construction-light`, 0.25, 0.25, 0.5);
        l.position.y = new THREE.Box3().setFromObject(g).max.y - 0.02; g.add(l);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), basic(null, 0xff8c2a, 2.5));
        bulb.position.set(0, l.position.y + 0.42, 0); g.add(reflective(bulb));
        ctx.life.flicker(bulb.material as THREE.MeshBasicMaterial, 3);
      }
      return g;
    }
    case 'planter': {
      const g = await fit(`${K}suburban/planter`, C * 0.92, C * 0.7, 0.6);
      const tree = await fit(`${K}suburban/tree-small`, C * 0.6, C * 0.6, 2.2);
      tree.position.y = 0.45; g.add(tree);
      // A neon ring around the planter.
      const ring = new THREE.Mesh(new THREE.BoxGeometry(C * 0.94, 0.05, C * 0.72), basic(null, theme.neon[0], 1.6));
      ring.position.y = 0.58; g.add(reflective(ring));
      return g;
    }
    case 'vending': {
      const g = await fit(`${K}arcade/vending-machine`, C * 0.75, C * 0.7, 1.95);
      const col = pick(rng, [N.cyan, N.magenta, N.yellow, N.green]);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.2), basic(vendingFace(col), 0xffffff, 1.4));
      const bb = new THREE.Box3().setFromObject(g);
      screen.position.set(-0.08, 1.05, bb.max.z + 0.01);
      g.add(reflective(screen));
      ctx.glows.push({ p: W(0, 1.2, 1), color: col, power: 1.2 });
      return g;
    }
    case 'lamp': {
      const g = await fit(`${K}roads/light-square`, C * 0.7, C * 0.7, 4.4);
      const bb = new THREE.Box3().setFromObject(g);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.24), basic(null, 0xffd8a0, 2.4));
      head.position.set((bb.min.x + bb.max.x) / 2, bb.max.y - 0.1, bb.max.z - 0.35);
      g.add(reflective(head));
      return g;
    }
    case 'totem': {
      const g = new THREE.Group();
      g.add(box(C * 0.5, 0.4, C * 0.5, plain(0x2a2444, 'iron'), 0, 0.2, 0));
      const col = theme.neon[0], col2 = theme.neon[1] ?? N.magenta;
      const pillar = box(0.36, 3.2, 0.36, plain(0x1a1430, 'totem'), 0, 2, 0);
      g.add(pillar);
      const t = tickerTexture(['NEON CITY', 'PSY-SEC', 'KESSLER', 'BIENVENUE'], col);
      t.repeat.set(0.4, 1);
      ctx.life.scroll(t, 0.08);
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 2.6), basic(t, 0xffffff, 1.5));
        s.rotation.set(0, i * Math.PI / 2, Math.PI / 2);
        s.position.set(Math.sin(i * Math.PI / 2) * 0.185, 2, Math.cos(i * Math.PI / 2) * 0.185);
        g.add(reflective(s));
      }
      // The hologram on top: rotating rings and a floating diamond.
      const holo = new THREE.Group();
      holo.position.y = 4.4;
      const hm = basic(null, col, 1.8, { transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true });
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), hm);
      holo.add(gem);
      ctx.life.spin(gem, 'y', 1.2);
      for (let i = 0; i < 2; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9 + i * 0.3, 0.025, 6, 40), basic(null, i ? col2 : col, 1.8, { transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
        ring.rotation.x = Math.PI / 2 + (i ? 0.4 : -0.3);
        holo.add(ring);
        ctx.life.spin(ring, 'z', i ? -0.8 : 0.6);
      }
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.5, 1.2, 12, 1, true), basic(glowTexture(), col, 1, { transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 3.8;
      g.add(reflective(beam), reflective(holo));
      ctx.life.bob(holo, 0.12, 1.4);
      ctx.glows.push({ p: W(0, 4, 0), color: col, power: 3 });
      return g;
    }
    case 'generator': {
      const g = new THREE.Group();
      g.add(box(C * 0.85, 0.12, C * 0.7, plain(0x2a2444, 'iron'), 0, 0.06, 0));
      const tank = await fit(`${K}industrial/detail-tank`, C * 0.85, C * 0.6, 0.9);
      tank.position.y = 0.12; g.add(tank);
      const hz = stripeTexture(0xf5e663, 0x1a1430, 8, true);
      const base = box(C * 0.86, 0.3, C * 0.66, new THREE.MeshStandardMaterial({ map: hz, roughness: 1 }), 0, 0.27, 0);
      g.add(base);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.02), basic(null, N.green, 2));
      led.position.set(0, 0.32, C * 0.335); g.add(reflective(led));
      ctx.life.flicker(led.material as THREE.MeshBasicMaterial, 1.5);
      ctx.life.vent(W(0, 1.0, 0), 0.5, 1.4);
      return g;
    }
  }
  return null;
}

/** A vending machine front: drinks behind glass, a logo band. */
function vendingFace(col: number) {
  const { c, g } = canvas(128, 256);
  g.fillStyle = '#0a0618'; g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#' + col.toString(16).padStart(6, '0'); g.fillRect(0, 0, 128, 46);
  g.fillStyle = '#0a0618'; g.font = '600 40px "Teko", sans-serif'; g.textAlign = 'center'; g.fillText('NEURO', 64, 38);
  const cols = ['#ff2a6d', '#00f0ff', '#f5e663', '#39ff88', '#b84dff', '#ff8c2a'];
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) { g.fillStyle = cols[(r * 4 + k) % cols.length]; g.fillRect(12 + k * 28, 60 + r * 46, 18, 34); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(14 + k * 28, 62 + r * 46, 4, 30); }
  return tex(c);
}

/** Holes in the ground: manholes, grates (steam), dock water, the plaza fountain. */
export function makeHole(ctx: StreetCtx, kind: string, CELL: number): THREE.Object3D | null {
  const g = new THREE.Group();
  const C = CELL;
  if (kind === 'water') return null; // drawn by World3D (a reflective surface)
  if (kind === 'manhole' || kind === 'grate') {
    const { c, g: d } = canvas(128, 128);
    d.fillStyle = '#0a0618'; d.fillRect(0, 0, 128, 128);
    if (kind === 'manhole') {
      d.fillStyle = '#4a4664'; d.beginPath(); d.arc(64, 64, 58, 0, Math.PI * 2); d.fill();
      d.strokeStyle = '#2a2640'; d.lineWidth = 4; for (let r = 16; r < 58; r += 12) { d.beginPath(); d.arc(64, 64, r, 0, Math.PI * 2); d.stroke(); }
      d.fillStyle = '#2a2640'; d.font = '600 22px "Teko", sans-serif'; d.textAlign = 'center'; d.fillText('NEON CITY', 64, 72);
    } else {
      d.fillStyle = '#4a4664'; d.fillRect(6, 6, 116, 116);
      d.fillStyle = '#0a0618'; for (let x = 14; x < 116; x += 14) d.fillRect(x, 12, 7, 104);
    }
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(C * 0.85, C * 0.85), new THREE.MeshStandardMaterial({ map: tex(c), roughness: 1 }));
    plate.rotation.x = -Math.PI / 2; plate.position.y = 0.012; plate.receiveShadow = true;
    g.add(plate);
    if (kind === 'grate') {
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(C * 0.7, C * 0.7), basic(glowTexture(), 0xff6a2a, 1, { transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.02;
      g.add(glow);
    }
    return g;
  }
  if (kind === 'fountain') {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(C * 0.5, C * 0.52, 0.35, 20, 1, true), plain(0x6a6488, 'stone'));
    rim.position.y = 0.17; rim.castShadow = true;
    const water = new THREE.Mesh(new THREE.CircleGeometry(C * 0.48, 20), basic(glowTexture(), N.cyan, 0.9, { transparent: true, opacity: 0.7 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.25;
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, 1.6, 8, 1, true), basic(glowTexture(), 0x9af8ff, 1.2, { transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    jet.position.y = 1.05;
    g.add(rim, reflective(water), reflective(jet));
    ctx.life.bob(jet, 0.06, 4);
    return g;
  }
  return null;
}

/**
 * Low dressing around the board: kerb furniture right at the edges (bollards, trash bags,
 * scooters, fences), street lamps on the pavement behind, in the cells where nothing tall may
 * stand. Never on the board itself.
 */
export async function dressStreet(ctx: StreetCtx, plan: CityPlan, b: Board) {
  const { rng, CELL, theme, kit } = ctx;
  const g = ctx.group;
  const style = theme.ground;
  const jobs: Promise<void>[] = [];
  const place = (o: THREE.Object3D, x: number, y: number, jitter = 0.25) => {
    o.position.add(new THREE.Vector3((x + 0.5 + (rng() - 0.5) * jitter) * CELL, 0, (y + 0.5 + (rng() - 0.5) * jitter) * CELL));
    g.add(o);
  };
  const add = (path: string, x: number, y: number, w: number, d: number, h = Infinity, yaw = rng() * 6.28) => {
    jobs.push(kit.clone(path).then(o => { fitObject(o, w, d, h); const holder = new THREE.Group(); holder.add(o); holder.rotation.y = yaw; place(holder, x, y); }));
  };
  const bagMat = plain(0x26263c, 'bag');
  buildEdges(ctx, plan, b);
  for (let y = -RANGE_NEAR; y < b.h + RANGE_NEAR; y++) for (let x = -RANGE_NEAR; x < b.w + RANGE_NEAR; x++) {
    if (plan.on(x, y) || plan.occupied(x, y)) continue;
    const lim = plan.allowed(x, y), d = plan.dist(x, y);
    if (d > 3) continue;
    const r = rng();
    if (lim < 0.5) {
      if (d === 1 && r < 0.18) {
        // Bollard.
        const bo = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, Math.min(0.45, lim + 0.2), 8), plain(0x8a86aa, 'bollard'));
        bo.position.y = Math.min(0.45, lim + 0.2) / 2; bo.castShadow = true;
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.04, 8), basic(null, N.yellow, 1.6));
        cap.position.y = Math.min(0.45, lim + 0.2) + 0.02;
        const h = new THREE.Group(); h.add(bo, reflective(cap)); place(h, x, y, 0.4);
      }
      continue;
    }
    if (lim < 1.4) {
      if (r < 0.12) {
        const h = new THREE.Group();
        for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) { const bag = new THREE.Mesh(new THREE.SphereGeometry(0.2 + rng() * 0.1, 7, 5), bagMat); bag.scale.y = 0.75; bag.position.set((rng() - 0.5) * 0.7, 0.15, (rng() - 0.5) * 0.7); bag.castShadow = true; h.add(bag); }
        place(h, x, y);
      } else if (r < 0.2) add(`${K}cars/cone`, x, y, 0.4, 0.4, 0.6);
      else if (r < 0.26 && style !== 'parking') add(`${K}station/container`, x, y, 0.55, 0.55, 0.85);
      continue;
    }
    // Room for something taller: lamps on the pavement, vending machines, parked bikes.
    if (r < 0.1 && style !== 'parking') {
      const at = new THREE.Vector3((x + 0.5) * CELL, 0, (y + 0.5) * CELL);
      jobs.push(makeProp(ctx, 'lamp', CELL, at).then(o => { if (o) { o.rotation.y = Math.PI / 4 + Math.PI; place(o, x, y, 0); } }));
      ctx.glows.push({ p: at.clone().setY(4.1), color: 0xffc890, power: 2.2 }); ctx.pools.push({ x: at.x, z: at.z, r: 3, color: 0xffb070, a: 0.28 });
    } else if (r < 0.13 && d === 1 && lim > 2.2 && style !== 'parking' && style !== 'docks') {
      jobs.push(makeProp(ctx, 'vending', CELL, new THREE.Vector3((x + 0.5) * CELL, 0, (y + 0.5) * CELL)).then(o => { if (o) { o.rotation.y = rng() < 0.5 ? 0 : Math.PI / 2; place(o, x, y, 0); } }));
    } else if (r < 0.3) {
      const h = new THREE.Group();
      for (let i = 0; i < 3; i++) { const bag = new THREE.Mesh(new THREE.SphereGeometry(0.22 + rng() * 0.1, 7, 5), bagMat); bag.scale.y = 0.75; bag.position.set((rng() - 0.5) * 0.8, 0.16, (rng() - 0.5) * 0.8); bag.castShadow = true; h.add(bag); }
      place(h, x, y);
    }
  }
  // Steam from the street grates around the board (outside the play area, a few).
  for (let i = 0; i < 3; i++) {
    const x = -1 - Math.floor(rng() * 2), y = Math.floor(rng() * b.h);
    if (plan.occupied(x, y)) continue;
    ctx.life.vent(new THREE.Vector3((x + 0.5) * CELL, 0.05, (y + 0.5) * CELL), 0.8, 2.5);
  }
  await Promise.all(jobs);
  void holoAd;
}

const RANGE_NEAR = 5;

/** The Kenney car used for a board car prop (seeded per board). */
export function carModel(ctx: StreetCtx) { return `${K}cars/${pick(ctx.rng, ctx.theme.cars)}`; }

/** Breakables (units with HP) as street models; ids accepted by World3D.propModel. */
export const BREAKABLE_PATHS: Record<string, string> = {
  crate: 'street:crate', barrel: 'street:barrel', trash: 'street:trash', vending: 'street:vending',
};

/** A street trash bin (breakable). */
export function trashBin(CELL: number) {
  const g = new THREE.Group();
  const col = 0x3a8a6a;
  g.add(box(CELL * 0.5, 0.85, CELL * 0.45, plain(col, 'bin'), 0, 0.43, 0));
  const lid = box(CELL * 0.54, 0.1, CELL * 0.5, plain(shade(col, 0.7), 'bin2'), 0, 0.9, -0.02);
  lid.rotation.x = -0.18;
  g.add(lid);
  g.add(box(CELL * 0.3, 0.12, 0.02, plain(0xe8e4ff, 'binlabel'), 0, 0.6, CELL * 0.226));
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 5), plain(0x26263c, 'bag'));
  bag.position.set(0.4, 0.15, 0.1); bag.scale.y = 0.75; bag.castShadow = true;
  g.add(bag);
  return g;
}

let fenceTex: THREE.Texture | undefined;
/** Chain-link mesh on a transparent canvas. */
function chainLink() {
  if (fenceTex) return fenceTex;
  const { c, g } = canvas(64, 64);
  g.strokeStyle = '#b8b4d8'; g.lineWidth = 2;
  for (let k = -64; k < 128; k += 12) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); g.beginPath(); g.moveTo(k + 64, 0); g.lineTo(k, 64); g.stroke(); }
  fenceTex = tex(c, { repeat: true });
  return fenceTex;
}

/**
 * Edges of the board that face a void in front (cut corners, the alley's dead end): a chain-link
 * fence on industrial streets, low neon-trimmed planters elsewhere. Both stay low or see-through.
 */
function buildEdges(ctx: StreetCtx, plan: CityPlan, b: Board) {
  const { CELL, theme, rng } = ctx;
  const fence = theme.ground === 'alley' || theme.ground === 'docks' || theme.ground === 'checkpoint' || theme.ground === 'parking';
  const t = chainLink();
  const fm = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
  fm.userData.keepColor = true;
  const post = plain(0x2a2640, 'iron');
  const planter = plain(0x4a4466, 'planter');
  const trim = basic(null, theme.neon[0], 1.5);
  const hedge = plain(0x1e5a4a, 'hedge');
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    if (!plan.on(x, y)) continue;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (plan.on(nx, ny) || plan.back(nx, ny) || plan.occupied(nx, ny)) continue;
      if (nx < 0 || ny < 0 || nx >= b.w || ny >= b.h) continue; // outer edges stay open
      // The shared edge, in world metres.
      const ex = (x + 0.5 + dx * 0.5) * CELL, ez = (y + 0.5 + dy * 0.5) * CELL;
      const along = dx !== 0 ? 'z' : 'x';
      const g = new THREE.Group();
      g.position.set(ex + dx * 0.12, 0, ez + dy * 0.12);
      if (along === 'z') g.rotation.y = Math.PI / 2;
      if (fence) {
        t.repeat.set(CELL / 0.5, 2.2 / 0.5);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(CELL, 2.2), fm);
        m.position.y = 1.1;
        g.add(m, box(0.06, 2.3, 0.06, post, CELL / 2, 1.15, 0), box(CELL, 0.05, 0.05, post, 0, 2.2, 0));
        if (rng() < 0.25) { const s = signBoard(ctx, pick(rng, ['DANGER', 'PRIVÉ', 'NO EXIT', 'ZONE B']), pick(rng, [N.yellow, N.magenta]), 'box', 0.9, 0.34); s.position.set((rng() - 0.5) * 0.6, 1.3, 0.04 * (dx + dy > 0 ? -1 : 1)); s.rotation.y = dx + dy > 0 ? Math.PI : 0; g.add(s); }
      } else {
        g.add(box(CELL, 0.42, 0.5, planter, 0, 0.21, 0), box(CELL - 0.1, 0.22, 0.4, hedge, 0, 0.5, 0));
        const tr = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.04, 0.04), trim);
        tr.position.set(0, 0.42, 0.26 * (dx + dy > 0 ? -1 : 1));
        g.add(reflective(tr));
      }
      ctx.group.add(g);
    }
  }
}
