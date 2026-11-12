import * as THREE from 'three';
import { at, BACK_Y as B, MX, MY, type Interior3D } from '../Interior3D';
import { arcadeGame, flicker, ticker } from './fx';
import { canvasTex, FONT_TITLE, rng } from './paint';
import { cans, carton, halo, plant, wallPoster } from './props';
import { preloadKit } from './kit';

/**
 * Floor 37 of the H-12 megabuilding: a long hall that runs off both sides of the screen. Every
 * door is on the back wall under a big lit sign (clinic, home, elevator, den), with Lo's ramen
 * stand in the middle, a vending machine and an arcade cabinet, a game corner and a sagging couch
 * in front, puddles under a leak, a dying ceiling light.
 */
export const HALL = {
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
  clinic: { x: 44, y: 100 },
  home: { x: 148, y: 100 },
  lo: { x: 215, y: 87 },
  elevator: { x: 344, y: 102 },
  den: { x: 440, y: 100 },
  /** Where the player comes out of each door. */
  spawn: { apartment: { x: 148, y: 106 }, doc: { x: 46, y: 106 }, net: { x: 438, y: 106 } },
  blockers: [
    [176, 94, 80, 14], // ramen counter
    [254, 80, 54, 14], // vending + arcade
    [60, 192, 54, 22], // couch
    [372, 196, 76, 28], // game corner
    [150, 200, 56, 12], // bench
    [262, 200, 56, 12], // bench
    [32, 80, 10, 14], // plant by the clinic
    [112, 172, 14, 12], // bin + mop
  ] as [number, number, number, number][],
};

const KIT = ['arcade/arcade-machine', 'arcade/claw-machine', 'arcade/gambling-machine', 'arcade/vending-machine', 'kaykit/couch', 'station/container', 'market/shopping-basket'];

export async function buildCorridor(v: Interior3D) {
  void preloadKit(KIT);
  wallDressing(v);
  // Doors and their signs.
  v.door(4, 0x8a86b0);
  v.door(HALL.clinic.x, 0xff3b3b, { panel: 0x3a1c28 });
  const clinic = v.neon('CLINIQUE', HALL.clinic.x + 4, 2.86, 0.8, 0xff3b3b, { light: 4 });
  crossSign(v, HALL.clinic.x - 22, 1.6);
  void clinic;
  v.door(100, 0x8a86b0);
  v.plate('3710', 100, 2.42, 0.13, '#c8c4e8');
  v.plate('OKONKWO', 100, 1.5, 0.08, '#c8c4e8');
  v.door(HALL.home.x, 0x00f0ff);
  v.neon('APPART', HALL.home.x, 2.86, 0.8, 0x00f0ff, { light: 3 });
  v.plate('3712', HALL.home.x + 25, 1.5, 0.13, '#00f0ff');
  elevator(v);
  v.door(402, 0x8a86b0);
  v.plate('3716', 402, 2.42, 0.13, '#c8c4e8');
  v.door(HALL.den.x, 0x39ff88, { panel: 0x14261e });
  v.neon('NET//DEN', HALL.den.x - 6, 2.86, 0.8, 0x39ff88, { light: 4 });
  // Doormats.
  for (const [x, c] of [[100, 0x2a2030], [HALL.home.x, 0x1a3040], [402, 0x2a2030]] as const) v.decal(x, B + 9, 0.9, 0.45, v.mat(c, { rough: 1 }), 0.005);

  await ramenStand(v);
  await games(v);
  await lounge(v);
  floor(v);

  // Ceiling lights seen as pools on the floor; the third one is dying.
  const ceil = [[90, 150], [215, 140], [300, 150], [420, 150]] as const;
  ceil.forEach(([x, y], i) => {
    const m = v.pool(x, y, 2.2, i === 1 ? 0xffb070 : 0xc8d0ff, i === 1 ? 0.16 : 0.12, 0.8);
    const l = v.light(x, y, 2.9, i === 1 ? 0xffa060 : 0xc8d0ff, i === 1 ? 5 : 3.5, 7);
    if (i === 2) {
      const mm = new THREE.MeshBasicMaterial({ color: 0xffffff });
      flicker(v.anim, mm, 1, l, { broken: true });
      v.anim.add(() => { m.opacity = 0.12 * mm.color.r; });
    }
  });
}

/** Panels, pipes, wall lamps, posters, an advert screen, graffiti. */
function wallDressing(v: Interior3D) {
  const fw = 480 / MX;
  // Two pipes along the top of the wall, with brackets; a thin conduit lower down.
  for (const [h, r, c] of [[3.62, 0.07, 0x3a3250], [3.45, 0.045, 0x2a2440], [2.3, 0.02, 0x1a1428]] as const) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, fw, 8), v.mat(c, { rough: 0.5, metal: 0.4 }));
    p.rotation.z = Math.PI / 2;
    p.position.copy(v.onWall(240, h, r + 0.02));
    p.castShadow = true;
    v.add(p);
  }
  for (let x = 20; x < 480; x += 60) v.box(v.onWall(x, 3.52, 0.05), 0.06, 0.22, 0.12, v.mat(0x15101e));
  // A steaming vent near the elevator.
  v.box(v.onWall(392, 2.05, 0.03), 0.4, 0.25, 0.06, v.mat(0x2a2440));
  v.steam(392, B + 2, 2.1, { rate: 2.5, rise: 0.25, size: 0.25, opacity: 0.18, color: 0xb8b0e0 });
  // Wall lamps between doors.
  for (const x of [72, 124, 382]) {
    v.box(v.onWall(x, 2.05, 0.04), 0.14, 0.16, 0.08, v.mat(0x1a1428));
    v.box(v.onWall(x, 2.05, 0.09), 0.1, 0.04, 0.02, v.glow(0xffd8a0, 1.8));
    v.wash(x, 2.1, 1.0, 1.6, 0xffc890, 0.22);
  }
  // Posters, stickers, a noticeboard.
  wallPoster(v, 72, 1.35, 0.4, 3, 'SYNTH', ['#1a0a2a', '#ff2a6d', '#f5e663'], { tilt: -0.06 });
  wallPoster(v, 124, 1.3, 0.36, 11, 'ROUILLE', ['#0a1420', '#00f0ff', '#ff8c2a'], { tilt: 0.05 });
  wallPoster(v, 383, 1.3, 0.36, 19, 'GRID', ['#160a1a', '#39ff88', '#b84dff'], { tilt: 0.03 });
  const notes = canvasTex(128, 96, (c) => {
    const r = rng(4);
    c.fillStyle = '#3a2a22'; c.fillRect(0, 0, 128, 96);
    for (let i = 0; i < 9; i++) { c.fillStyle = ['#e8e4d0', '#f5e663', '#a8c8ff', '#ffb0c8'][i % 4]; c.save(); c.translate(10 + (i % 3) * 40 + r() * 6, 8 + Math.floor(i / 3) * 28 + r() * 4); c.rotate((r() - 0.5) * 0.2); c.fillRect(0, 0, 28, 22); c.fillStyle = '#5a5a6a'; for (let k = 0; k < 3; k++) c.fillRect(3, 5 + k * 5, 20, 1.5); c.restore(); }
  });
  v.plane(v.onWall(124, 2.0, 0.02), 0.4, 0.3, new THREE.MeshStandardMaterial({ map: notes, roughness: 0.9 }));
  // Advert screen over the vending machine and the arcade.
  const ad = v.screen(v.onWall(279, 2.22, 0.06), 1.5, 0.3, ticker('BIÈRE NEON — GOÛTE LA NUIT  ★  ASSURANCE TRAUMA PLATINE  ★  RAMEN DE MAMIE LO, 24H/24  ★  ', '#f5e663'), { fps: 20, res: 256, bezel: 0x15101e });
  void ad;
  v.wash(279, 2.2, 2.4, 1.0, 0xf5e663, 0.12);
}

/** A red cross in a lit box, next to the clinic door. */
function crossSign(v: Interior3D, px: number, h: number) {
  v.box(v.onWall(px, h - 0.22, 0.02), 0.44, 0.44, 0.06, v.mat(0x1a0c12));
  const m = v.glow(0xff3b3b, 2);
  v.box(v.onWall(px, h - 0.18, 0.06), 0.3, 0.09, 0.02, m);
  v.box(v.onWall(px, h - 0.31, 0.06), 0.09, 0.3, 0.02, m);
  flicker(v.anim, m, 2);
  v.wash(px, h, 1.2, 1.2, 0xff3b3b, 0.3);
}

/** Wide sliding doors, a floor display, call buttons, hazard stripes, the big sign. */
function elevator(v: Interior3D) {
  const { x } = HALL.elevator;
  v.door(x, 0xf5e663, { wide: true, panel: 0x5a5876 });
  v.neon('ASCENSEUR', x, 2.86, 0.8, 0xf5e663, { light: 4 });
  // Floor display: 37 and a falling arrow.
  v.screen(v.onWall(x, 2.38, 0.17), 0.5, 0.14, (c, t, w, h) => {
    c.fillStyle = '#100a04'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ff8c2a'; c.font = `600 ${Math.round(h * 0.9)}px ${FONT_TITLE}`; c.fillText('37', 8, h * 0.88);
    const k = (t * 1.5) % 1;
    c.fillStyle = '#f5e663';
    c.beginPath(); c.moveTo(w * 0.7, h * (0.15 + k * 0.3)); c.lineTo(w * 0.9, h * (0.15 + k * 0.3)); c.lineTo(w * 0.8, h * (0.55 + k * 0.3)); c.fill();
    c.fillText('RUE', w * 0.36, h * 0.88);
  }, { fps: 12, res: 96 });
  // Call buttons.
  v.box(v.onWall(x + 40, 1.1, 0.02), 0.14, 0.3, 0.04, v.mat(0x2a2440));
  for (const [dy, c] of [[0.07, 0xf5e663], [-0.07, 0x5a5876]] as const) v.cyl(v.onWall(x + 40, 1.1 + dy, 0.045), 0.03, 0.03, 0.02, v.glow(c, 1.8)).rotation.x = Math.PI / 2;
  // Hazard stripes in front.
  const stripes = canvasTex(256, 32, (c) => { c.fillStyle = '#16120a'; c.fillRect(0, 0, 256, 32); c.fillStyle = '#f5c83a'; for (let i = -2; i < 20; i++) { c.beginPath(); c.moveTo(i * 16, 32); c.lineTo(i * 16 + 8, 32); c.lineTo(i * 16 + 20, 0); c.lineTo(i * 16 + 12, 0); c.fill(); } });
  v.decal(x, B + 18, 2.2, 0.28, new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.8 }), 0.006);
}

/** Lo's ramen stand: counter, noren, red lanterns, pots steaming, stools. */
async function ramenStand(v: Interior3D) {
  const { x } = HALL.lo, w = 2.4, cy = B + 21;
  // Back: a lit kitchen niche (warm shelves) against the wall.
  v.plane(v.onWall(x, 1.25, 0.02), w - 0.1, 1.6, v.mat(0x2a1410));
  v.wash(x, 1.3, w * 1.3, 2.2, 0xff8c2a, 0.35);
  for (const h of [1.45, 1.85]) {
    v.box(v.onWall(x, h, 0.1), w - 0.3, 0.03, 0.2, v.mat(0x5a3020));
    const r = rng(h * 10);
    for (let i = 0; i < 9; i++) v.cyl(v.onWall(x - 32 + i * 8, h + 0.03, 0.12), 0.05, 0.05, 0.1 + r() * 0.12, v.mat([0xe8e0d0, 0xff4a3a, 0xf5c84a, 0x2a2030][i % 4]), 8);
  }
  // Awning (red / white stripes) and the noren curtain with RAMEN on it.
  const awn = canvasTex(256, 64, (c) => { for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#f0e8e0' : '#d82a3a'; c.fillRect(i * 16, 0, 16, 64); } });
  const awning = v.box(v.onWall(x, 2.26, 0.4), w + 0.2, 0.06, 0.8, [v.mat(0xd82a3a), v.mat(0xd82a3a), new THREE.MeshStandardMaterial({ map: awn, roughness: 0.8 }), v.mat(0x5a1a20), new THREE.MeshStandardMaterial({ map: awn, roughness: 0.8 }), v.mat(0xd82a3a)]);
  awning.rotation.x = 0.18;
  const noren = canvasTex(256, 96, (c) => {
    c.fillStyle = '#1a1030'; c.fillRect(0, 0, 256, 96);
    c.fillStyle = '#f0e8e0'; c.font = `600 70px ${FONT_TITLE}`; c.textAlign = 'center'; c.fillText('RAMEN', 128, 78);
    c.fillStyle = '#05030c'; for (let i = 1; i < 4; i++) c.fillRect(i * 64 - 2, 30, 4, 66);
  });
  const nm = new THREE.MeshStandardMaterial({ map: noren, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: noren, emissiveIntensity: 0.15 });
  for (let i = 0; i < 4; i++) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w / 4 - 0.02, 0.55), nm);
    const g = new THREE.Group();
    g.position.copy(v.onWall(x - 27 + i * 18, 2.18, 0.78));
    strip.position.y = -0.27;
    const uv = strip.geometry.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) + i) / 4);
    g.add(strip);
    v.add(g);
    v.sway(g, 0.06, 0.8 + i * 0.1, 'x');
  }
  // Paper lanterns.
  for (const dx of [-42, 42]) {
    const g = new THREE.Group();
    g.position.copy(v.onWall(x + dx, 2.2, 0.75));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), v.glow(0xff3a2a, 1.5));
    lamp.scale.y = 1.25; lamp.position.y = -0.25;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 8), v.mat(0x1a1010));
    cap.position.y = -0.02;
    g.add(lamp, cap);
    v.add(g);
    v.sway(g, 0.08, 1.1);
    halo(v, g.position.clone().add(new THREE.Vector3(0, -0.25, 0.05)), 1.1, 0xff5a3a, 0.5);
  }
  v.neon('RAMEN', x, 2.88, 0.75, 0xff3b3b, { light: 0, washK: 0.6, d: 0.95, centre: v.onWall(x, 2.88, 0.95) });
  v.plate('CHEZ MAMIE LO', x, 2.48, 0.14, '#f5e663', '#2a0a0a', 0.95);
  // Counter: dark wood, a lit front, bowls and pots.
  v.box(at(x, cy), w, 1.0, 0.55, v.mat(0x3a1a14, { rough: 0.6 }));
  v.box(at(x, cy, 1.0), w + 0.1, 0.06, 0.65, v.mat(0x7a4a30, { rough: 0.5 }));
  v.box(at(x, cy + 0.28 * MY, 0.86), w - 0.1, 0.03, 0.01, v.glow(0xff8c2a, 1.6));
  const front = canvasTex(256, 64, (c) => { c.fillStyle = '#3a1a14'; c.fillRect(0, 0, 256, 64); c.strokeStyle = '#ff8c2a'; c.lineWidth = 2; for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(16 + i * 32, 36, 10, 0, Math.PI * 2); c.stroke(); } });
  v.plane(at(x, cy + 0.28 * MY, 0.45), w - 0.1, 0.6, new THREE.MeshStandardMaterial({ map: front, roughness: 0.8, emissive: 0xffffff, emissiveMap: front, emissiveIntensity: 0.2 }));
  for (const dx of [-24, 0, 24]) {
    v.cyl(at(x + dx, cy + 3, 1.06), 0.11, 0.07, 0.08, v.mat(0xe8e0d0), 12);
    v.cyl(at(x + dx, cy + 3, 1.13), 0.1, 0.1, 0.01, v.mat(0xd8a040), 12);
  }
  for (const dx of [-30, 30]) {
    v.cyl(at(x + dx, cy - 6, 1.06), 0.17, 0.16, 0.26, v.mat(0x8a8aa0, { metal: 0.5, rough: 0.35 }), 12);
    v.steam(x + dx, cy - 6, 1.35, { rate: 6, rise: 0.45, size: 0.22, opacity: 0.35, color: 0xfff0e0 });
  }
  cans(v, x + 12, cy - 4, 1.06, 2, 3);
  // Stools.
  for (const dx of [-30, -10, 10, 30]) {
    v.cyl(at(x + dx, cy + 0.6 * MY), 0.04, 0.06, 0.62, v.mat(0x2a2440, { metal: 0.5 }));
    v.cyl(at(x + dx, cy + 0.6 * MY, 0.62), 0.17, 0.17, 0.06, v.mat(0xd82a3a, { rough: 0.5 }), 12);
  }
  v.pool(x, cy + 12, 2.0, 0xff8c2a, 0.3, 0.7);
  v.light(x, cy + 8, 1.8, 0xff8c2a, 5, 5);
}

/** Vending machine, arcade cabinet; the game corner up front; glows. */
async function games(v: Interior3D) {
  // Vending machine: lit drink rows, logo, coin slot.
  const vx = 266, vy = B + 0.36 * MY;
  v.box(at(vx, vy), 0.84, 1.9, 0.68, v.mat(0xd8246a, { rough: 0.5, metal: 0.2 }));
  const drinks = canvasTex(96, 160, (c) => {
    c.fillStyle = '#0a0814'; c.fillRect(0, 0, 96, 160);
    const cols = ['#ff2a6d', '#00f0ff', '#f5e663', '#39ff88', '#ff8c2a', '#e8e8ff'];
    for (let r = 0; r < 5; r++) { c.fillStyle = '#1a1628'; c.fillRect(4, 8 + r * 28 + 18, 88, 3); for (let i = 0; i < 5; i++) { c.fillStyle = cols[(r * 2 + i) % cols.length]; c.fillRect(8 + i * 17, 8 + r * 28, 10, 18); c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(9 + i * 17, 9 + r * 28, 2, 14); } }
  });
  const dm = new THREE.MeshBasicMaterial({ map: drinks, toneMapped: false });
  dm.color.setScalar(1.3);
  v.plane(at(vx - 3, vy + 0.345 * MY, 1.1), 0.5, 1.05, dm);
  v.plane(at(vx, vy + 0.345 * MY, 1.75), 0.76, 0.18, (() => { const m = new THREE.MeshBasicMaterial({ map: canvasTex(128, 32, (c) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 128, 32); c.fillStyle = '#d8246a'; c.font = `600 30px ${FONT_TITLE}`; c.textAlign = 'center'; c.fillText('NEON COLA', 64, 28); }), toneMapped: false }); m.color.setScalar(1.4); return m; })());
  v.box(at(vx + 11, vy + 0.33 * MY, 1.0), 0.14, 0.3, 0.02, v.mat(0x2a1020));
  v.box(at(vx, vy + 0.33 * MY, 0.3), 0.6, 0.16, 0.02, v.mat(0x0a0614));
  v.wash(vx, 1.1, 1.4, 2.2, 0xff2a6d, 0.3);
  v.light(vx, vy + 14, 1.3, 0xff2a6d, 3, 3.5);
  // Arcade cabinet with a live game.
  const ax = 293;
  await v.wallModel('arcade/arcade-machine', ax, { height: 1.8, stretch: [0.82, 1, 0.8] });
  v.screen(at(ax, B + 0.34 * MY, 1.38), 0.5, 0.38, arcadeGame(3, 260), { fps: 12, res: 96, tilt: -0.2 });
  v.wash(ax, 1.3, 1.2, 1.6, 0x6a2cff, 0.35);
  v.light(ax, B + 18, 1.4, 0x8a4dff, 3, 3.5);
  // Game corner at the front right: claw machine, slot machine, a second cabinet.
  await v.model('arcade/claw-machine', 384, 214, { height: 1.85, yaw: 0.2 });
  halo(v, at(384, 214, 1.6), 1.2, 0xff6fb0, 0.35);
  await v.model('arcade/gambling-machine', 412, 216, { height: 1.55, yaw: -0.1 });
  await v.model('arcade/arcade-machine', 437, 212, { height: 1.8, yaw: -0.35, stretch: [0.82, 1, 0.8] });
  const s2 = v.screen(at(437, 218, 1.38), 0.46, 0.34, arcadeGame(8, 320), { fps: 12, res: 96, yaw: -0.35, tilt: 0.25 });
  void s2;
  v.light(410, 206, 1.6, 0xff6fb0, 4, 4.5);
  v.pool(410, 200, 1.8, 0xff2a6d, 0.22);
}

/** Front left: a sagging couch, bins, a mop; benches. */
async function lounge(v: Interior3D) {
  await v.model('kaykit/couch', 87, 204, { w: 1.9, recolor: 'night', tint: 0x9a7a5a });
  carton(v, 46, 214, 0.5, 0.4, 0.4, { yaw: 0.3 });
  carton(v, 48, 212, 0.38, 0.3, 0.32, { h: 0.4, yaw: -0.2, color: 0x7a5040 });
  // Bins, mop bucket, wet floor sign by the puddle.
  v.cyl(at(118, 178), 0.22, 0.2, 0.75, v.mat(0x2a4a3a, { rough: 0.6, metal: 0.3 }), 10);
  v.cyl(at(118, 178, 0.75), 0.24, 0.24, 0.04, v.mat(0x1a2a22), 10);
  const sign = v.box(at(132, 168), 0.32, 0.6, 0.04, v.mat(0xf5c83a), { yaw: 0.4 });
  sign.rotation.x = -0.15;
  // Benches facing us along the front.
  for (const bx of [178, 290]) {
    v.box(at(bx, 206, 0.42), 1.7, 0.06, 0.42, v.mat(0x4a3a6a, { rough: 0.6 }));
    v.box(at(bx, 197, 0.45), 1.7, 0.4, 0.05, v.mat(0x4a3a6a, { rough: 0.6 }));
    for (const dx of [-22, 22]) v.box(at(bx + dx, 206), 0.06, 0.42, 0.38, v.mat(0x1a1428, { metal: 0.5 }));
  }
  plant(v, 37, B + 8, 1.2, { seed: 21 });
  plant(v, 236, 216, 0.9, { seed: 4 });
  cans(v, 170, 206, 0.48, 2, 9);
}

/** The floor: a leak dripping into a puddle, flyers, cans, cables, scuffed lines. */
function floor(v: Interior3D) {
  // Puddles reflecting the neon (glossy dark + coloured streaks).
  for (const [x, y, w, d, c] of [[150, 166, 1.6, 0.9, 0xff2a6d], [330, 140, 1.2, 0.7, 0x00f0ff], [44, 150, 0.9, 0.5, 0xff3b3b]] as const) {
    const m = new THREE.MeshBasicMaterial({ map: canvasTex(128, 64, (cc) => {
      cc.clearRect(0, 0, 128, 64);
      const g = cc.createRadialGradient(64, 32, 4, 64, 32, 62); g.addColorStop(0, 'rgba(10,6,24,0.85)'); g.addColorStop(1, 'rgba(10,6,24,0)');
      cc.fillStyle = g; cc.beginPath(); cc.ellipse(64, 32, 62, 30, 0, 0, Math.PI * 2); cc.fill();
    }), transparent: true, depthWrite: false });
    v.decal(x, y, w, d, m, 0.006).renderOrder = 1;
    v.pool(x, y, w * 0.35, c, 0.3, 0.4);
    // A drop falls every few seconds and rings spread.
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.08, 20), new THREE.MeshBasicMaterial({ color: 0xc8d0ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(at(x, y, 0.012));
    v.add(ring);
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), v.glow(0xc8d0ff, 1.2));
    v.add(drop);
    const period = 2.2 + w, ph = Math.random() * period;
    v.anim.add(t => {
      const k = ((t + ph) % period) / period;
      const fall = k * period / 0.7;
      drop.visible = fall < 1;
      drop.position.copy(at(x, y, 3.4 * (1 - fall * fall)));
      const rk = (k * period - 0.7) / 1.2;
      const rm = ring.material as THREE.MeshBasicMaterial;
      if (rk > 0 && rk < 1) { ring.scale.setScalar(1 + rk * 6); rm.opacity = 0.6 * (1 - rk); } else rm.opacity = 0;
    });
  }
  // Flyers, butts, crushed cans.
  const r = rng(77);
  for (let i = 0; i < 14; i++) {
    const px = 40 + r() * 400, py = 112 + r() * 100;
    if (r() < 0.5) v.decal(px, py, 0.18, 0.24, v.mat([0xe8e4d0, 0xf5e663, 0xffb0c8][i % 3], { rough: 1 }), 0.003, r() * 3);
    else v.box(at(px, py), 0.1, 0.03, 0.06, v.mat([0xff2a6d, 0x00f0ff, 0xc8c8d8][i % 3], { rough: 0.5 }), { yaw: r() * 3 });
  }
  // Worn walking line along the hall.
  const wear = new THREE.MeshBasicMaterial({ map: canvasTex(256, 32, (c) => { const g = c.createLinearGradient(0, 0, 0, 32); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 32); }), transparent: true, depthWrite: false });
  v.decal(240, 140, 16, 1.8, wear, 0.002);
  // Cable runs from the doors' keypads along the skirting.
  v.cable([at(0, B + 3, 0.02), at(120, B + 4, 0.02), at(240, B + 3, 0.02), at(480, B + 4, 0.02)], 0.015, 0x15101e);
}
