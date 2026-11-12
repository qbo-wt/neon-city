import * as THREE from 'three';
import { at, BACK_Y as B, MY, type Interior3D } from '../Interior3D';
import { codeRain, graph, leds, terminal } from './fx';
import { rng } from './paint';
import { cans, carton, halo, plant } from './props';

/**
 * Nyx's den: dark, green and cyan. A wall of server racks with blinking LEDs, a big wall of
 * falling code in the middle, Nyx jacked in at a curved desk of screens under a turning hologram,
 * cables everywhere, a beanbag and a jellyfish tank in front.
 */
export const DEN = {
  grid: [
    '###############',
    '###############',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '###############',
  ],
  nyx: { x: 250, y: 132 },
  talk: { x: 250, y: 158 },
  exit: { x: 56, y: 100 },
  spawn: { x: 58, y: 112 },
  blockers: [
    [88, 80, 116, 16], // racks left
    [296, 80, 172, 16], // racks right
    [208, 106, 84, 14], // desk
    [56, 178, 34, 20], // beanbag
    [380, 194, 64, 22], // tank
    [100, 196, 40, 16], // crates
  ] as [number, number, number, number][],
};

export async function buildDen(v: Interior3D) {
  const dark = v.mat(0x12161a, { rough: 0.45, metal: 0.4 });
  v.door(DEN.exit.x, 0x39ff88, { panel: 0x14261e });
  v.neon('SORTIE', DEN.exit.x + 2, 2.86, 0.8, 0x39ff88, { light: 3 });

  // Server racks along the back wall.
  const racks = [...Array.from({ length: 5 }, (_, i) => 98 + i * 23), ...Array.from({ length: 7 }, (_, i) => 306 + i * 23)];
  racks.forEach((x, i) => {
    v.box(at(x, B + 0.35 * MY), 0.66, 2.2, 0.7, dark);
    v.screen(at(x, B + 0.35 * MY, 1.1).add(new THREE.Vector3(0, 0, 0.352)), 0.56, 1.9, leds(i % 3 ? ['#39ff88', '#00f0ff'] : ['#39ff88', '#f5e663', '#ff2a6d'], 18, i + 3), { fps: 5, res: 48 });
    if (i % 3 === 1) {
      const fan = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.15, 6), v.glow(0x00f0ff, 1.3));
      fan.position.copy(at(x, B + 0.35 * MY, 2.0)).add(new THREE.Vector3(0, 0, 0.36));
      v.add(fan);
      v.anim.add((_t, dt) => { fan.rotation.z += dt * 10; });
    }
  });
  v.wash(150, 1.2, 4.6, 2.4, 0x39ff88, 0.16);
  v.wash(376, 1.2, 6.0, 2.4, 0x00f0ff, 0.14);
  // Sagging cables between the racks' tops.
  for (let i = 0; i < racks.length - 1; i++) if (racks[i + 1] - racks[i] < 30) v.hang(at(racks[i] + 8, B + 6, 2.2), at(racks[i + 1] - 8, B + 6, 2.2), 0.25 + (i % 3) * 0.1, 0.02);

  // The code wall in the middle.
  v.box(v.onWall(250, 1.95, 0.02), 2.9, 2.0, 0.06, v.mat(0x080a0c));
  v.screen(v.onWall(250, 1.95, 0.06), 2.7, 1.8, codeRain('#39ff88', 3, 26), { fps: 12, res: 260 });
  v.wash(250, 1.9, 4.5, 3.0, 0x39ff88, 0.25);

  await desk(v, dark);
  floor(v);

  // Light: screen glow on Nyx, cold cyan fill, a violet backlight, LEDs.
  v.light(250, 120, 1.4, 0x39ff88, 6, 4.5);
  v.light(250, 110, 2.8, 0x00f0ff, 3, 6);
  v.light(120, 150, 2.4, 0x2a8a6a, 3, 7);
  v.light(390, 150, 2.4, 0x8a4dff, 3.5, 7);
  v.light(410, 204, 1.0, 0x00f0ff, 3, 4);
  v.pool(250, 128, 2.2, 0x39ff88, 0.22, 0.8);
}

/** Curved desk of screens around Nyx's chair, a hologram turning over it. */
async function desk(v: Interior3D, dark: THREE.Material) {
  const { x } = DEN.nyx, cy = 113;
  const top = v.mat(0x1a2024, { rough: 0.4, metal: 0.3 });
  // Arc of desk segments, screens on top facing Nyx (and us).
  const draws = [graph('#00f0ff', 2), codeRain('#39ff88', 7, 12), terminal('#39ff88', ['> jack in', 'ICE: noir', 'tunnel 3/7 ok', '> trace?', 'NEGATIF', 'cerveau: 41°C']), codeRain('#00f0ff', 9, 12), graph('#39ff88', 6)];
  draws.forEach((draw, i) => {
    const a = (i - 2) * 0.38, px = x + Math.sin(a) * 40, py = cy + (1 - Math.cos(a)) * 14;
    v.box(at(px, py, 0.72), 0.78, 0.05, 0.5, top, { yaw: -a });
    v.box(at(px, py), 0.06, 0.72, 0.4, dark, { yaw: -a });
    v.box(at(px, py, 0.765), 0.76, 0.01, 0.02, v.glow(0x39ff88, 1.3), { yaw: -a });
    v.screen(at(px, py - 3, 1.1), 0.62, 0.38, draw, { yaw: -a, bezel: 0x0a0c0e, fps: 9 });
    if (i % 2 === 0) v.screen(at(px, py - 4, 1.55), 0.5, 0.3, i === 2 ? graph('#f5e663', 11) : codeRain('#39ff88', 20 + i, 10), { yaw: -a, bezel: 0x0a0c0e, fps: 7, tilt: 0.12 });
  });
  // Keyboard glow, cans, a pizza box.
  v.box(at(x, cy + 5, 0.77), 0.55, 0.02, 0.18, v.glow(0x00f0ff, 0.9));
  cans(v, x + 30, cy + 6, 0.77, 4, 5);
  // Nyx's chair behind her.
  await v.model('station/chair-armrest-headrest', x, DEN.nyx.y + 9, { height: 1.15, recolor: 'den' });
  // Hologram: a wire globe with rings, turning and glitching.
  const holo = new THREE.Group();
  holo.position.copy(at(x, cy, 2.2));
  const lm = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, toneMapped: false, depthWrite: false });
  holo.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.42, 1)), lm));
  for (const r of [0.6, 0.75]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 4, 48), new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); ring.rotation.x = Math.PI / 2 + r; holo.add(ring); }
  v.add(holo);
  v.cone(at(x, cy, 2.0), 0.3, 0.6, 1.0, 0x00f0ff, 0.12);
  halo(v, at(x, cy, 2.2), 1.8, 0x00f0ff, 0.35);
  v.anim.add((t, dt) => { holo.rotation.y += dt * 0.5; holo.children[1].rotation.z += dt * 0.8; holo.children[2].rotation.z -= dt * 0.6; lm.opacity = Math.sin(t * 31) > 0.93 ? 0.25 : 0.85; holo.position.x = at(x, cy).x + (Math.sin(t * 47) > 0.97 ? 0.04 : 0); });
  // A bundle of cables from the racks to the desk.
  const r = rng(8);
  for (let i = 0; i < 7; i++) {
    const sx = 100 + r() * 340;
    v.cable([at(sx, B + 14, 0.3), at(sx, B + 22, 0.02), at((sx + x) / 2, B + 24 + r() * 6, 0.02), at(x + (r() - 0.5) * 60, cy - 2, 0.02)], 0.018 + r() * 0.012, [0x0c1012, 0x14201a, 0x0a1a20][i % 3]);
  }
  v.cable([at(150, B + 16, 0.02), at(190, B + 20, 0.015), at(x - 34, B + 24, 0.015), at(x - 30, cy - 2, 0.02)], 0.01, 0, { glow: 0x39ff88 });
}

/** Beanbag, jellyfish tank, crates, junk, floor cables in front. */
function floor(v: Interior3D) {
  // Beanbag with a pizza box.
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), v.mat(0x4a2a6a, { rough: 0.9 }));
  bag.scale.set(1, 0.55, 0.9); bag.position.copy(at(73, 188, 0.25)); bag.castShadow = true;
  v.add(bag);
  v.box(at(96, 186), 0.4, 0.04, 0.4, v.mat(0xe8d8b8), { yaw: 0.5 });
  cans(v, 60, 204, 0, 3, 2);
  // Jellyfish tank on a low cabinet: glowing water, drifting jellies, bubbles.
  const tx = 412, ty = 205;
  v.box(at(tx, ty), 1.9, 0.5, 0.6, v.mat(0x0c1014));
  const water = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 0.5), new THREE.MeshBasicMaterial({ color: 0x0a4a6a, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false }));
  water.position.copy(at(tx, ty, 0.9)); v.add(water);
  for (let i = 0; i < 4; i++) {
    const j = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), v.glow([0xff6fb0, 0x00f0ff, 0xb84dff, 0x39ff88][i], 1.6));
    v.add(j);
    const ph = i * 1.7;
    v.anim.add(t => { j.position.copy(at(tx - 20 + i * 13 + Math.sin(t * 0.3 + ph) * 4, ty, 0.75 + ((Math.sin(t * 0.5 + ph) + 1) / 2) * 0.4)); j.scale.y = 1 + Math.sin(t * 3 + ph) * 0.25; });
  }
  v.steam(tx + 18, ty, 0.6, { rate: 3, rise: 0.25, size: 0.04, spread: 0.05, life: 1.5, opacity: 0.6, color: 0xbff8ff, additive: true });
  v.box(at(tx, ty, 1.3), 1.85, 0.04, 0.55, v.glow(0x00f0ff, 1.1));
  // Crates of hardware, an old plant, junk.
  carton(v, 112, 204, 0.6, 0.45, 0.5, { color: 0x2a3a34, yaw: 0.1 });
  carton(v, 128, 206, 0.5, 0.35, 0.45, { color: 0x3a4a40, yaw: -0.2 });
  carton(v, 116, 204, 0.4, 0.3, 0.35, { h: 0.45, color: 0x1a2a24, yaw: 0.4 });
  plant(v, 452, 112, 0.9, { seed: 40, leaf: 0x1a6a4a });
  // Her tag, in neon over the right-hand racks.
  v.neon('NYX//0xFF', 376, 2.86, 0.6, 0x39ff88, { washK: 0.6 });
}
