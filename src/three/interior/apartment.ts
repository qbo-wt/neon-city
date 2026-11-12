import * as THREE from 'three';
import { at, BACK_Y as B, MX, MY, type Interior3D } from '../Interior3D';
import { codeRain, graph, leds, rainTexture, terminal, ticker } from './fx';
import { canvasTex, rng } from './paint';
import { blanket, books, cans, carton, cat, fairyLights, halo, katana, noodleCup, plant, rifle, wallPoster } from './props';
import { preloadKit } from './kit';

/**
 * The player's studio, 37th floor: a big rainy window on the city is the backdrop, the desk and
 * its screens sit right under it (the focal point), the weapon wall on the left, the kitchen corner
 * and the front door on the right, the unmade bed and the couch in front.
 *
 * Positions are Phaser world px (ground y = where a thing touches the floor), sizes in metres.
 */
export const APT = {
  grid: [
    '###############',
    '#############A#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#...........P.#',
    '#.............#',
    '###############',
  ],
  rack: { x: 80, y: 106 },
  desk: { x: 216, y: 112 },
  server: { x: 326, y: 110 },
  door: { x: 432, y: 100 },
  fromDoor: { x: 430, y: 112 },
  /** Furniture footprints (left, top, w, h). */
  blockers: [
    [44, 80, 74, 13], // weapon locker
    [120, 80, 20, 12], // plant
    [176, 80, 82, 17], // desk
    [240, 98, 16, 10], // chair
    [313, 80, 26, 17], // server
    [341, 80, 74, 16], // kitchen
    [32, 122, 70, 32], // bed
    [32, 106, 24, 14], // nightstand
    [226, 152, 46, 14], // low table
    [212, 190, 78, 22], // couch
    [182, 196, 14, 12], // floor lamp
    [306, 160, 26, 18], // armchair
    [420, 186, 28, 26], // big plant
    [384, 202, 34, 20], // boxes
    [128, 196, 26, 14], // laundry
  ] as [number, number, number, number][],
};

const KIT = ['kaykit/bed_double_B', 'kaykit/cabinet_small', 'kaykit/lamp_table', 'kaykit/couch_pillows', 'kaykit/lamp_standing', 'kaykit/table_low', 'kaykit/armchair_pillows', 'kaykit/pillow_A', 'kaykit/pillow_B', 'station/chair-armrest-headrest', 'kaykit/shelf_B_large_decorated', 'kaykit/book_set', 'kaykit/cactus_small_A', 'kaykit/pictureframe_small_B'];

export async function buildApartment(v: Interior3D) {
  void preloadKit(KIT);
  const W = v.onWall.bind(v);
  window3d(v);
  weaponWall(v);
  desk(v);
  server(v);
  kitchen(v);
  v.door(APT.door.x, 0x00f0ff);
  v.neon('COULOIR', APT.door.x - 10, 2.86, 0.9, 0x00f0ff, { light: 3 });
  v.plate('3712', APT.door.x - 26, 1.5, 0.14, '#00f0ff');
  // Posters and frames on the bare bits of wall.
  wallPoster(v, 128, 2.05, 0.5, 31, 'KRAKEN', ['#140a2a', '#ff2a6d', '#00f0ff'], { tilt: 0.04 });
  wallPoster(v, 318, 2.65, 0.42, 7, 'NULL//', ['#0a1a20', '#39ff88', '#f5e663'], { tilt: -0.05 });
  fairyLights(v, 136, 300, 3.3);
  void W;

  await bedroom(v);
  await lounge(v);
  foreground(v);

  // Light: the city through the window (violet / magenta), screens (cyan), lamps (warm).
  v.light(216, B + 20, 2.3, 0xb84dff, 7, 9);
  v.light(216, B + 20, 1.2, 0x00f0ff, 4, 4.5);
  v.light(46, 118, 1.1, 0xff8c5a, 4, 4.5);
  v.light(376, B + 12, 1.7, 0xf5e663, 3, 4);
  v.light(80, B + 16, 2.2, 0xf5e663, 2.5, 3.5);
  v.light(190, 196, 1.6, 0xff6fb0, 3.5, 4.5);
  v.light(340, 196, 1.8, 0x00b8ff, 4, 6);
  v.light(100, 196, 1.6, 0xff2a6d, 4, 5.5);
  v.pool(216, B + 44, 3.2, 0x8a4dff, 0.22, 0.7);
  v.pool(216, B + 26, 1.4, 0x00f0ff, 0.25, 0.7);
  v.dust(at(216, B + 36, 1.4), new THREE.Vector3(4.5, 2.4, 2.5), 0xd8c8ff, 50);
}

/** Back-wall window: the city at night, layered, flying cars, rain on the glass. */
function window3d(v: Interior3D) {
  const x0 = 128, x1 = 304, cx = (x0 + x1) / 2, w = (x1 - x0) / MX, h0 = 0.95, h1 = 3.15, hh = h1 - h0;
  const r = rng(99);
  // Static skyline, painted once.
  const sky = canvasTex(640, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#07031a'); g.addColorStop(0.55, '#2a0c48'); g.addColorStop(0.85, '#7a1a6a'); g.addColorStop(1, '#ff4a8a');
    c.fillStyle = g; c.fillRect(0, 0, 640, 256);
    // Far towers.
    for (let x = 0; x < 640;) {
      const bw = 18 + r() * 40, bh = 70 + r() * 150;
      c.fillStyle = '#1e0c3a'; c.fillRect(x, 256 - bh, bw, bh);
      for (let wy = 256 - bh + 6; wy < 252; wy += 7) for (let wx = x + 3; wx < x + bw - 3; wx += 5) if (r() < 0.18) { c.fillStyle = ['#f5c46b', '#ff6fb0', '#7ad8ff'][Math.floor(r() * 3)]; c.globalAlpha = 0.6; c.fillRect(wx, wy, 2, 3); c.globalAlpha = 1; }
      x += bw + 3;
    }
    // A megatower with a spire and red beacons.
    c.fillStyle = '#140826'; c.fillRect(380, 20, 70, 236); c.fillRect(410, 0, 8, 30);
    // Near blocks, darker, with vertical neon signs.
    for (let x = -10; x < 640;) {
      const bw = 50 + r() * 70, bh = 40 + r() * 80;
      c.fillStyle = '#0a0418'; c.fillRect(x, 256 - bh, bw, bh);
      if (r() < 0.7) {
        const col = ['#ff2a6d', '#00f0ff', '#f5e663', '#39ff88', '#b84dff'][Math.floor(r() * 5)];
        const sx = x + 6 + r() * (bw - 20), sy = 256 - bh + 6;
        c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 10;
        c.fillRect(sx, sy, 9, 34 + r() * 30);
        c.shadowBlur = 0; c.fillStyle = '#0a0418';
        for (let k = 0; k < 4; k++) c.fillRect(sx + 2, sy + 4 + k * 9, 5, 4);
      }
      x += bw + 8;
    }
  });
  const skyImg = sky.image as HTMLCanvasElement;
  const cars = Array.from({ length: 7 }, (_, i) => ({ x: r() * 640, y: 40 + r() * 130, v: (r() < 0.5 ? -1 : 1) * (20 + r() * 50), c: i % 3 === 0 ? '#ff4a4a' : '#fff4d0' }));
  const view = v.screen(W3(v, cx, h0 + hh / 2, 0.005), w, hh, (c, t, cw, ch) => {
    c.drawImage(skyImg, 0, 0, cw, ch);
    // Billboard on the megatower, cycling colours; beacons blinking.
    const hue = (t * 40) % 360;
    c.fillStyle = `hsl(${hue},90%,55%)`; c.globalAlpha = 0.85; c.fillRect(cw * 0.6, ch * 0.3, cw * 0.09, ch * 0.22); c.globalAlpha = 1;
    c.fillStyle = '#0a0418'; c.font = `600 ${Math.round(ch * 0.1)}px "Teko", sans-serif`; c.fillText('NEO', cw * 0.612, ch * 0.45);
    if (Math.sin(t * 3) > 0) { c.fillStyle = '#ff3030'; c.fillRect(cw * 0.645, 2, 4, 4); c.fillRect(cw * 0.6, ch * 0.08, 3, 3); }
    for (const car of cars) {
      car.x += car.v * 0.1; if (car.x > 660) car.x = -20; if (car.x < -20) car.x = 660;
      const x = (car.x / 640) * cw, y = (car.y / 256) * ch;
      c.fillStyle = car.c; c.shadowColor = car.c; c.shadowBlur = 6; c.fillRect(x, y, 4, 2); c.shadowBlur = 0;
      c.globalAlpha = 0.25; c.fillRect(x - Math.sign(car.v) * 14, y + 0.5, 14, 1); c.globalAlpha = 1;
    }
  }, { fps: 10, res: 480, k: 1.05 });
  view.group.renderOrder = 0;
  // Rain streaks and droplets on the glass.
  for (const [speed, op, rep] of [[1.6, 0.55, 2], [0.25, 0.4, 3]] as const) {
    const tex = rainTexture(v.anim, '#b8c8ff', speed);
    tex.repeat.set(rep * 1.6, rep * 0.8);
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false, toneMapped: false });
    const p = v.plane(W3(v, cx, h0 + hh / 2, 0.012 + speed * 0.002), w, hh, m);
    p.renderOrder = 3;
  }
  // Frame, mullions, sill.
  const frame = v.mat(0x1a1428, { rough: 0.5, metal: 0.3 });
  const bar = (bw: number, bh: number, x: number, y: number) => v.box(W3(v, x, y, 0.04), bw, bh, 0.08, frame);
  bar(w + 0.16, 0.1, cx, h1);
  bar(w + 0.16, 0.12, cx, h0 - 0.12);
  for (const fx of [x0 - 2, x1 + 2]) bar(0.1, hh + 0.2, fx, h0 - 0.1);
  for (const fx of [x0 + (x1 - x0) / 3, x0 + (2 * (x1 - x0)) / 3]) bar(0.06, hh, fx, h0);
  bar(w, 0.05, cx, h0 + hh * 0.68);
  // Sill with plants and junk.
  v.box(W3(v, cx, h0 - 0.02, 0.16), w + 0.3, 0.06, 0.32, v.mat(0x2a2038));
  plant(v, x0 + 12, B + 0.18 * MY, 0.45, { h: h0 + 0.04, seed: 5 });
  plant(v, x1 - 16, B + 0.18 * MY, 0.38, { h: h0 + 0.04, seed: 9, pot: 0xff2a6d });
  cans(v, x1 - 34, B + 0.16 * MY, h0 + 0.04, 3, 4);
  // Light spill on the wall around the window, and the panes' light falling on the floor.
  v.wash(cx, h0 + hh / 2, w * 1.6, hh * 1.7, 0xb84dff, 0.18);
  const shaft = canvasTex(256, 256, (c) => {
    c.clearRect(0, 0, 256, 256);
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.filter = 'blur(7px)';
    for (let i = 0; i < 3; i++) for (const [y0, y1] of [[0, 150], [162, 256]]) c.fillRect(6 + i * 84 + (y0 / 256) * 20, y0, 74, y1 - y0);
  });
  const sm = new THREE.MeshBasicMaterial({ map: shaft, color: 0xc070ff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  v.decal(cx + 6, B + 1.7 * MY, w * 1.05, 3.4, sm, 0.01).renderOrder = 2;
}

const W3 = (v: Interior3D, px: number, h: number, d: number) => v.onWall(px, h, d);

/** Left: pegboard with blades and guns over a weapon locker, yellow strip light. */
function weaponWall(v: Interior3D) {
  const { x } = APT.rack, w = 2.1;
  const board = v.box(W3(v, x, 0.95, 0.02), w, 1.45, 0.04, v.mat(0x1e1a2a, { rough: 0.7 }));
  board.receiveShadow = true;
  // Pegboard holes.
  const holes = canvasTex(256, 176, (c) => {
    c.fillStyle = '#231e32'; c.fillRect(0, 0, 256, 176);
    c.fillStyle = '#0e0a16';
    for (let y = 8; y < 176; y += 14) for (let xx = 8; xx < 256; xx += 14) c.fillRect(xx, y, 3, 3);
  });
  v.plane(W3(v, x, 1.67, 0.045), w - 0.06, 1.39, new THREE.MeshStandardMaterial({ map: holes, roughness: 0.8 }));
  v.box(W3(v, x, 2.4, 0.06), w + 0.1, 0.05, 0.12, v.glow(0xf5e663, 1.6));
  v.wash(x, 1.8, w * 1.5, 1.8, 0xf5e663, 0.22);
  katana(v, W3(v, x - 8, 2.08, 0.1), 1.05, 0.12, 0x00f0ff);
  katana(v, W3(v, x - 4, 1.86, 0.1), 0.85, 0.05, 0xff2a6d);
  rifle(v, W3(v, x + 2, 1.55, 0.1), 0.95, 0xff2a6d);
  rifle(v, W3(v, x - 6, 1.28, 0.1), 0.7, 0x39ff88);
  // Pistols and a grenade belt as little shapes on hooks.
  for (const [dx, h] of [[22, 1.98], [24, 1.32]] as const) {
    v.box(W3(v, x + dx, h, 0.09), 0.2, 0.07, 0.04, v.mat(0x2a2438));
    v.box(W3(v, x + dx - 2, h - 0.1, 0.09), 0.05, 0.12, 0.04, v.mat(0x2a2438));
  }
  // Locker below, with a helmet on top.
  v.box(at(x, B + 0.24 * MY), w, 0.9, 0.46, v.mat(0x2c2440, { rough: 0.5, metal: 0.4 }));
  for (const dx of [-17, 0, 17]) v.box(at(x + dx, B + 0.47 * MY, 0.2), 0.5, 0.6, 0.02, v.mat(0x221c34));
  v.box(at(x, B + 0.47 * MY, 0.85), w - 0.05, 0.02, 0.02, v.glow(0xf5e663, 1.2));
  const helmet = v.cyl(at(x + 18, B + 0.2 * MY, 0.9), 0.13, 0.15, 0.2, v.mat(0x3a3450, { rough: 0.4 }), 12);
  helmet.scale.z = 1.1;
  v.box(at(x + 18, B + 0.3 * MY, 0.97), 0.24, 0.06, 0.03, v.glow(0xff2a6d, 1.5));
  carton(v, x - 20, B + 0.2 * MY, 0.35, 0.22, 0.3, { h: 0.9, yaw: 0.2, color: 0x4a3a2a });
}

/** The terminal: a long desk under the window, three screens and a vertical one, PC tower, chair. */
function desk(v: Interior3D) {
  const { x } = APT.desk, cy = B + 0.36 * MY, w = 2.4;
  const top = v.mat(0x2a2238, { rough: 0.5 });
  v.box(at(x, cy, 0.72), w, 0.05, 0.7, top);
  v.box(at(x, cy, 0.765), w, 0.012, 0.7, v.mat(0x3a3250));
  for (const dx of [-36, 36]) v.box(at(x + dx, cy), 0.05, 0.72, 0.62, v.mat(0x1a1428));
  v.box(at(x, cy - 3, 0.71), w - 0.1, 0.02, 0.02, v.glow(0x00f0ff, 1.4));
  // Screens: centre terminal (run history), angled side ones, one portrait.
  const sh = 1.2, sz = B + 0.12 * MY;
  const scr = (px: number, ww: number, hh: number, yaw: number, draw: Parameters<Interior3D['screen']>[3], h = sh) => {
    v.box(at(px, sz, 0.77), 0.05, h - 0.77 - hh / 2, 0.05, v.mat(0x15101e));
    v.box(at(px, sz, 0.77), 0.22, 0.02, 0.14, v.mat(0x15101e));
    return v.screen(at(px, sz, h).add(new THREE.Vector3(0, 0, 0.03)), ww, hh, draw, { yaw, bezel: 0x0e0a16, fps: 8 });
  };
  scr(x, 0.92, 0.52, 0, terminal('#00f0ff', ['> runs --history', 'RUN #12  SECTEUR 4  MORT', 'RUN #13  SECTEUR 6  FUITE', '> bestiaire --sync', 'OK 41 entrées', '> meteo', 'PLUIE ACIDE 94%', '> dailies', 'GRAINE 0x3F2A']));
  scr(x - 29, 0.74, 0.46, 0.3, graph('#ff2a6d', 3));
  scr(x + 29, 0.74, 0.46, -0.3, codeRain('#00f0ff', 5, 12));
  scr(x + 50, 0.3, 0.52, -0.45, graph('#f5e663', 8), 1.25);
  v.wash(x, 1.2, 3.2, 1.2, 0x00f0ff, 0.2, 0.05);
  // Keyboard with a light strip, mouse, mug, noodles, cables.
  v.box(at(x, cy + 2, 0.77), 0.5, 0.025, 0.16, v.mat(0x15101e));
  v.box(at(x, cy + 2, 0.795), 0.46, 0.006, 0.12, v.glow(0xb84dff, 1.1));
  v.box(at(x + 12, cy + 2, 0.77), 0.06, 0.03, 0.1, v.mat(0x15101e));
  v.cyl(at(x - 16, cy + 3, 0.77), 0.045, 0.04, 0.1, v.mat(0xff2a6d));
  noodleCup(v, x - 28, cy + 2, 0.77);
  cans(v, x + 30, cy + 3, 0.77, 2, 8);
  books(v, x - 34, cy - 2, 0.77, 3, false, 4);
  // PC tower under the desk, fans spinning behind a glass side.
  const pc = v.box(at(x + 26, cy + 1), 0.24, 0.48, 0.5, v.mat(0x15101e, { rough: 0.4 }));
  void pc;
  for (const dy of [0.14, 0.32]) {
    const fan = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.08, 6), v.glow(0xff2a6d, 1.6));
    fan.position.copy(at(x + 26, cy + 1, dy)).add(new THREE.Vector3(0, 0, 0.26));
    v.add(fan);
    v.anim.add((_t, dt) => { fan.rotation.z += dt * 8; });
  }
  v.cable([at(x + 26, cy - 4, 0.2), at(x + 30, cy - 6, 0.02), at(x + 70, B + 8, 0.02), at(APT.server.x - 6, B + 4, 0.1)], 0.018);
  v.cable([at(x - 10, sz, 0.75), at(x - 12, B + 2, 0.4), at(x - 14, B + 2, 0.02), at(x - 60, B + 6, 0.02)], 0.012, 0x22182c);
  // Gaming chair, pushed back and turned, as if just left.
  void v.model('station/chair-armrest-headrest', 248, 104, { height: 1.15, yaw: Math.PI - 0.6, recolor: 'steel' });
}

/** Server tower (the bestiary): LEDs, a small display, cables. */
function server(v: Interior3D) {
  const { x } = APT.server, cy = B + 0.36 * MY;
  v.box(at(x, cy), 0.74, 2.0, 0.7, v.mat(0x16121f, { rough: 0.45, metal: 0.4 }));
  v.screen(at(x, cy, 1.0).add(new THREE.Vector3(0, 0, 0.352)), 0.6, 1.5, leds(['#39ff88', '#00f0ff', '#ff2a6d'], 16, 3), { fps: 6, res: 64 });
  v.screen(at(x, cy, 1.88).add(new THREE.Vector3(0, 0, 0.353)), 0.6, 0.12, ticker('BESTIAIRE // 41 FICHES // SYNC OK //', '#39ff88'), { fps: 14, res: 160 });
  v.box(at(x, cy, 2.0), 0.76, 0.04, 0.72, v.mat(0x0e0a16));
  v.wash(x, 1.2, 1.4, 2.2, 0x39ff88, 0.14);
  v.light(x, cy + 14, 1.0, 0x39ff88, 1.6, 2.5);
}

/** Kitchen corner: fridge, counter with sink and stove (a pot steaming), cabinets, hood, shelf. */
function kitchen(v: Interior3D) {
  const x0 = 342, cy = B + 0.33 * MY;
  // Fridge with magnets and a little display.
  const fx = x0 + 12;
  v.box(at(fx, cy), 0.72, 1.9, 0.64, v.mat(0x9a8ab0, { rough: 0.4 }));
  v.box(at(fx + 9, cy + 8, 0.7), 0.03, 0.6, 0.03, v.mat(0x2a2438));
  v.box(at(fx, cy + 7.6, 1.15), 0.7, 0.012, 0.02, v.mat(0x2a2438));
  v.box(at(fx - 4, cy + 7.7, 1.5), 0.16, 0.08, 0.01, v.glow(0x00f0ff, 1.2));
  for (const [dx, h, c] of [[-6, 0.9, 0xff2a6d], [2, 1.65, 0xf5e663], [-2, 0.5, 0x39ff88], [6, 1.35, 0xffffff]] as const) v.box(at(fx + dx, cy + 7.6, h), 0.08, 0.1, 0.01, v.mat(c));
  // Counter.
  const cx = x0 + 49, cw = 1.5;
  v.box(at(cx, cy), cw, 0.86, 0.6, v.mat(0x2c2440, { rough: 0.6 }));
  v.box(at(cx, cy, 0.86), cw + 0.04, 0.05, 0.64, v.mat(0x5a5276, { rough: 0.35 }));
  for (const dx of [-17, 0, 17]) v.box(at(cx + dx, cy + 7.2, 0.15), 0.44, 0.62, 0.01, v.mat(0x241c36));
  // Sink with tap, stove with a pot that steams.
  v.box(at(cx - 10, cy, 0.905), 0.5, 0.01, 0.36, v.mat(0x101018));
  const tap = v.box(at(cx - 10, cy - 5, 0.91), 0.03, 0.3, 0.03, v.mat(0xb8c0d8, { metal: 0.6, rough: 0.3 }));
  void tap;
  v.box(at(cx + 11, cy, 0.905), 0.5, 0.012, 0.4, v.mat(0x0a0a10));
  for (const dx of [7, 15]) { const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.08, 16), v.glow(0xff4a2a, 1.4)); ring.rotation.x = -Math.PI / 2; ring.position.copy(at(cx + dx, cy, 0.913)); v.add(ring); }
  v.cyl(at(cx + 8, cy, 0.912), 0.12, 0.11, 0.16, v.mat(0xb8c0d8, { rough: 0.35, metal: 0.4 }));
  v.steam(cx + 8, cy, 1.1, { rate: 4, rise: 0.35, size: 0.18, opacity: 0.3 });
  v.cyl(at(cx + 18, cy - 3, 0.912), 0.08, 0.09, 0.18, v.mat(0xff2a6d, { rough: 0.5 })); // rice cooker
  // Upper cabinets, hood, light strip, shelf with jars.
  v.box(W3(v, cx - 8, 1.62, 0.18), 0.9, 0.7, 0.34, v.mat(0x2c2440));
  v.box(W3(v, cx + 14, 1.75, 0.2), 0.5, 0.35, 0.4, v.mat(0x3a3450, { metal: 0.4, rough: 0.4 }));
  v.box(W3(v, cx, 1.6, 0.3), cw, 0.02, 0.03, v.glow(0xf5e663, 1.6));
  v.wash(cx, 1.2, cw * 1.6, 1.0, 0xf5e663, 0.2);
  v.box(W3(v, cx - 8, 2.18, 0.12), 0.9, 0.03, 0.22, v.mat(0x3a2a48));
  const r = rng(12);
  for (let i = 0; i < 5; i++) {
    const jar = v.cyl(W3(v, cx - 20 + i * 6, 2.2, 0.12), 0.05, 0.05, 0.12 + r() * 0.06, v.mat([0xf5c84a, 0xff6fb0, 0x8ad8a0, 0xe8e0f0][i % 4], { rough: 0.4 }), 8);
    void jar;
  }
  // Pans hanging under the cabinet.
  for (const dx of [-16, -10]) { const p = v.cyl(W3(v, cx + dx, 1.12, 0.12), 0.1, 0.1, 0.02, v.mat(0x2a2438, { metal: 0.5, rough: 0.4 }), 12); p.rotation.x = Math.PI / 2; }
}

async function bedroom(v: Interior3D) {
  // Bed along the left wall, head to the wall.
  const bx = 66, by = 134;
  await v.model('kaykit/bed_double_B', bx, by, { w: 2.15, yaw: -Math.PI / 2, recolor: 'night' });
  blanket(v, at(bx + 6, by + 1, 0.54), 1.45, 1.5, 0x3a2a8a, 3).scale.y = 0.6;
  await v.model('kaykit/pillow_B', bx - 22, by - 7, { s: 0.55, h: 0.56, yaw: 0.3, recolor: 'night' });
  await v.model('kaykit/pillow_A', bx - 24, by + 7, { s: 0.55, h: 0.6, yaw: -0.5, recolor: 'night' });
  cat(v, bx + 12, by - 4, 0.6, 0xf0ecf8);
  // Laptop left open on the bed.
  v.box(at(bx - 4, by + 9, 0.62), 0.34, 0.015, 0.24, v.mat(0x1a1428));
  v.screen(at(bx - 4, by + 6, 0.73), 0.32, 0.2, codeRain('#ff2a6d', 9, 8), { tilt: -0.3, fps: 6, res: 64 });
  // Nightstand and lamp.
  await v.model('kaykit/cabinet_small', 44, 114, { w: 0.55, recolor: 'night' });
  await v.model('kaykit/lamp_table', 44, 113, { height: 0.42, h: 0.55, glow: 0.6 });
  halo(v, at(44, 113, 0.82), 0.9, 0xff9a6a, 0.5);
  v.pool(46, 120, 1.2, 0xff8c5a, 0.25);
  // Clothes on the floor, sneakers.
  const cloth = [0x00b8d0, 0xff2a6d, 0x2a2238];
  for (let i = 0; i < 3; i++) blanket(v, at(112 + i * 7, 170 + (i % 2) * 6, 0.02), 0.45, 0.32, cloth[i], 20 + i).scale.set(1, 0.5, 1);
  for (const dx of [0, 5]) v.box(at(100 + dx, 182, 0), 0.12, 0.08, 0.28, v.mat(0xe8e8ff), { yaw: 0.3 + dx * 0.05 });
  // Laundry basket.
  v.cyl(at(141, 203), 0.3, 0.26, 0.4, v.mat(0x6a5a8a, { rough: 0.7 }), 10);
  blanket(v, at(141, 203, 0.38), 0.5, 0.45, 0xf5e663, 7);
}

async function lounge(v: Interior3D) {
  // Round rug with neon rings.
  const rug = canvasTex(256, 256, (c) => {
    c.clearRect(0, 0, 256, 256);
    const rings = ['#2a1240', '#ff2a6d', '#2a1240', '#3a1a5a', '#00b8d0', '#2a1240'];
    rings.forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(128, 128, 126 - i * (i === 1 || i === 4 ? 1 : 0) - [0, 8, 12, 48, 56, 60][i], 0, Math.PI * 2); c.fill(); });
  });
  v.decal(250, 170, 3.6, 2.6, new THREE.MeshStandardMaterial({ map: rug, transparent: true, roughness: 1 }), 0.006);
  await v.model('kaykit/table_low', 249, 159, { w: 1.3, recolor: 'night' });
  noodleCup(v, 240, 158, 0.33); noodleCup(v, 244, 161, 0.33);
  cans(v, 256, 159, 0.33, 4, 11);
  // A holo-projector puck on the table, a slowly turning hologram (the "TV").
  v.cyl(at(262, 157, 0.33), 0.07, 0.08, 0.04, v.mat(0x15101e));
  const holo = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.2, 1)), new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, toneMapped: false }));
  holo.position.copy(at(262, 157, 0.68));
  v.add(holo);
  v.cone(at(262, 157, 0.66), 0.22, 0.05, 0.3, 0x00f0ff, 0.25).side = THREE.DoubleSide;
  v.anim.add((t, dt) => { holo.rotation.y += dt * 0.6; holo.rotation.x = Math.sin(t * 0.5) * 0.3; (holo.material as THREE.LineBasicMaterial).opacity = Math.sin(t * 23) > 0.95 ? 0.3 : 0.8; });
  // Couch with its back to us, facing the window; floor lamp; armchair.
  await v.model('kaykit/couch_pillows', 251, 202, { w: 2.4, yaw: Math.PI, recolor: 'night' });
  await v.model('kaykit/lamp_standing', 189, 202, { height: 1.65, glow: 0.25 });
  halo(v, at(189, 202, 1.55), 1.2, 0xff6fb0, 0.45);
  await v.model('kaykit/armchair_pillows', 319, 168, { w: 0.9, yaw: -Math.PI / 2 - 0.4, recolor: 'night' });
  // Big plant and moving boxes in the corner by the door, a guitar against the wall.
  plant(v, 434, 200, 1.5, { seed: 3, pot: 0x2a2238 });
  plant(v, 166, 92, 0.9, { seed: 8 });
  plant(v, 130, 86, 1.1, { seed: 6, pot: 0xff2a6d });
  carton(v, 395, 212, 0.6, 0.45, 0.5, { yaw: 0.1 });
  carton(v, 408, 210, 0.45, 0.4, 0.42, { yaw: -0.2, color: 0x7a4a3a });
  carton(v, 398, 212, 0.42, 0.32, 0.38, { h: 0.45, yaw: 0.35, color: 0x9a6a50 });
  guitar(v, 442, 150);
  // Life on the floor: a pizza box, a game pad, a skateboard, a power strip with cables.
  const pz = v.box(at(298, 196), 0.42, 0.04, 0.42, v.mat(0xe8d8b8), { yaw: 0.4 });
  void pz;
  v.box(at(300, 196, 0.04), 0.4, 0.004, 0.4, v.mat(0xff2a6d), { yaw: 0.4 });
  v.box(at(282, 184), 0.14, 0.04, 0.09, v.mat(0x1a1428), { yaw: -0.5 });
  v.box(at(282, 184, 0.04), 0.1, 0.005, 0.05, v.glow(0x00f0ff, 1.2), { yaw: -0.5 });
  const sk = v.box(at(360, 120, 0.06), 0.8, 0.025, 0.22, v.mat(0x2a2238), { yaw: 0.25 });
  for (const s of [-0.28, 0.28]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), v.glow(0x39ff88, 1.2)); wh.rotation.x = Math.PI / 2; wh.position.set(s, -0.04, 0); sk.add(wh); }
  v.box(at(150, 118), 0.3, 0.05, 0.08, v.mat(0xe8e8ff));
  v.cable([at(150, 118, 0.02), at(165, 124, 0.01), at(190, 120, 0.01), at(200, B + 16, 0.01)], 0.012, 0x221830);
  v.cable([at(150, 118, 0.02), at(120, 124, 0.01), at(80, 120, 0.01), at(52, 116, 0.3)], 0.012, 0x221830);
}

function guitar(v: Interior3D, px: number, py: number) {
  const g = new THREE.Group();
  g.position.copy(at(px, py, 0));
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 14), v.mat(0xff2a6d, { rough: 0.4 }));
  body.rotation.x = Math.PI / 2; body.position.y = 0.25; body.scale.set(1, 1, 1.25);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.03), v.mat(0x1a1010));
  neck.position.y = 0.72;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.03), v.mat(0x1a1010));
  head.position.y = 1.08;
  g.add(body, neck, head);
  g.rotation.z = 0.18; g.rotation.y = -0.6;
  g.traverse(o => { o.castShadow = true; });
  v.add(g);
}

/** Things at the very front, between the room and us. */
function foreground(v: Interior3D) {
  // A low shelf with records and a speaker at the front-left, a plant front-right.
  v.box(at(64, 238), 2.4, 0.42, 0.4, v.mat(0x1c1428));
  books(v, 40, 238, 0.42, 9, true, 5);
  v.box(at(92, 238, 0.42), 0.3, 0.42, 0.28, v.mat(0x15101e));
  const cone = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.1, 12), v.glow(0xb84dff, 1.2));
  cone.position.copy(at(92, 238, 0.66)).add(new THREE.Vector3(0, 0, 0.145));
  v.add(cone);
  v.anim.add(t => { cone.scale.setScalar(1 + Math.max(0, Math.sin(t * 8.4)) * 0.12); });
  plant(v, 300, 244, 0.8, { seed: 13 });
  carton(v, 350, 240, 0.5, 0.3, 0.4, { yaw: 0.3, color: 0x5a3a3a });
}
