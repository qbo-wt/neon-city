import * as THREE from 'three';
import { at, BACK_Y as B, MY, type Interior3D } from '../Interior3D';
import { ecg, graph, terminal } from './fx';
import { canvasTex, FONT_TITLE, radial, rng } from './paint';
import { books, carton, halo, plant } from './props';

/**
 * Doc Kessler's back-alley clinic: the surgical chair in the middle under a hard white operating
 * light (the focal point), a robot arm working beside it, vitals on the wall, chrome limbs on
 * racks, jars glowing on shelves; cyan-white tiles, a bit grimy, red accents.
 */
export const CLINIC = {
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
  chair: { x: 240, y: 168 },
  doc: { x: 286, y: 150 },
  exit: { x: 424, y: 100 },
  spawn: { x: 424, y: 112 },
  blockers: [
    [38, 80, 104, 16], // workbench under the limb racks
    [147, 80, 42, 14], // cabinet
    [286, 80, 68, 14], // jar cabinet
    [224, 132, 32, 38], // chair
    [185, 148, 20, 16], // robot arm
    [278, 118, 14, 12], // drip stand
    [260, 170, 20, 13], // tray
    [43, 178, 74, 24], // gurney
    [122, 156, 8, 42], // curtain
    [360, 178, 70, 34], // desk + stool
    [416, 132, 30, 18], // bins
    [430, 206, 20, 16], // box
    [438, 92, 12, 14], // plant
  ] as [number, number, number, number][],
};

export async function buildClinic(v: Interior3D) {
  const white = v.mat(0xe8f4f8, { rough: 0.5 }), steel = v.mat(0x9ab0c0, { rough: 0.35, metal: 0.5 }), dark = v.mat(0x1a2028);
  v.door(CLINIC.exit.x, 0xff3b3b, { panel: 0x8aa0b0 });
  v.neon('SORTIE', CLINIC.exit.x - 4, 2.86, 0.8, 0xff3b3b, { light: 3 });
  v.neon('PROTHÈSES', 90, 2.86, 0.7, 0x00f0ff, { light: 3 });
  v.neon('STÉRILE (À PEU PRÈS)', 318, 2.9, 0.5, 0xff3b3b, { broken: true });

  // Left: racks of chrome limbs over a workbench with parts.
  v.box(v.onWall(90, 1.15, 0.02), 3.0, 1.5, 0.04, v.mat(0x2a3440));
  for (let i = 0; i < 6; i++) limb(v, 48 + i * 17, i % 2 ? 2.15 : 1.95, i % 3 === 2 ? 'leg' : 'arm', i);
  v.box(v.onWall(90, 2.42, 0.08), 3.0, 0.03, 0.1, v.glow(0x00f0ff, 1.4));
  v.box(at(90, B + 0.3 * MY), 3.0, 0.88, 0.6, v.mat(0x3a4450, { rough: 0.6 }));
  v.box(at(90, B + 0.3 * MY, 0.88), 3.05, 0.05, 0.62, steel);
  const r = rng(5);
  for (let i = 0; i < 8; i++) v.box(at(48 + r() * 84, B + 0.2 * MY + r() * 8, 0.93), 0.08 + r() * 0.15, 0.04 + r() * 0.08, 0.06 + r() * 0.1, [steel, dark, v.mat(0xff3b3b)][i % 3], { yaw: r() * 3 });
  v.screen(at(118, B + 0.15 * MY, 1.15), 0.4, 0.26, terminal('#00f0ff', ['> calib bras_G', 'SERVO 3 ... OK', 'SERVO 4 ... ERR', '> firmware 2.1.7', 'flash 63%', 'NERF ULNAIRE: ok']), { yaw: -0.2, bezel: 0x15101e });
  v.wash(90, 1.8, 3.4, 2.0, 0x00f0ff, 0.15);

  // X-ray lightbox over a cabinet with a red cross.
  const xray = canvasTex(128, 112, (c) => {
    c.fillStyle = '#cfefff'; c.fillRect(0, 0, 128, 112);
    c.fillStyle = '#204050';
    c.fillRect(60, 10, 8, 80); for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(64, 28 + i * 9, 26 - i * 2, 3, 0, 0, Math.PI * 2); c.fill(); }
    c.beginPath(); c.arc(64, 8, 9, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff3b3b'; c.fillRect(84, 34, 26, 4); c.fillRect(90, 38, 4, 40); // a chrome arm, in red
  });
  const xm = new THREE.MeshBasicMaterial({ map: xray, toneMapped: false }); xm.color.setScalar(1.2);
  v.box(v.onWall(168, 1.55, 0.02), 0.95, 0.82, 0.05, dark);
  v.plane(v.onWall(168, 1.96, 0.05), 0.85, 0.72, xm);
  v.wash(168, 1.9, 1.8, 1.6, 0xbfefff, 0.3);
  v.box(at(168, B + 0.25 * MY), 1.1, 1.0, 0.5, white);
  v.box(at(168, B + 0.5 * MY, 0.5), 0.3, 0.08, 0.01, v.glow(0xff3b3b, 1.6));
  v.box(at(168, B + 0.5 * MY, 0.39), 0.08, 0.3, 0.01, v.glow(0xff3b3b, 1.6));
  carton(v, 160, B + 6, 0.3, 0.2, 0.25, { h: 1.0, color: 0xe8e8f0 });

  // Vitals on the wall above the chair: heart line, body scan, readouts.
  v.box(v.onWall(240, 1.95, 0.02), 2.3, 0.75, 0.06, dark);
  v.screen(v.onWall(214, 1.95, 0.07), 0.75, 0.6, ecg('#39ff88'), { fps: 20, res: 160 });
  v.screen(v.onWall(240, 1.95, 0.07), 0.55, 0.6, bodyScan(), { fps: 10, res: 96 });
  v.screen(v.onWall(266, 1.95, 0.07), 0.75, 0.6, graph('#00f0ff', 9), { fps: 6, res: 160 });
  v.wash(240, 1.9, 3.2, 1.6, 0x39ff88, 0.16);
  v.cable([v.onWall(250, 1.55, 0.05), v.onWall(252, 0.6, 0.05), at(250, B + 6, 0.02), at(244, 140, 0.02), at(242, 146, 0.4)], 0.015, 0x15101e);
  v.cable([v.onWall(226, 1.55, 0.05), v.onWall(224, 0.4, 0.05), at(222, B + 8, 0.02), at(205, 150, 0.02)], 0.02, 0x2a0c14);

  // Right: shelves of glowing jars, a medicine cabinet.
  v.box(at(320, B + 0.25 * MY), 1.9, 0.95, 0.5, v.mat(0x5a6a78));
  for (const h of [1.35, 1.8]) {
    v.box(v.onWall(320, h, 0.12), 2.0, 0.04, 0.24, steel);
    for (let i = 0; i < 6; i++) jar(v, 296 + i * 9.5, h + 0.04, [0x39ff88, 0x00f0ff, 0xff6fb0, 0xf5e663][(i + Math.round(h * 3)) % 4]);
  }
  for (let i = 0; i < 4; i++) jar(v, 300 + i * 13, 0.95, [0xff6fb0, 0x39ff88][i % 2]);
  v.wash(320, 1.6, 2.6, 1.4, 0x39ff88, 0.15);

  await surgery(v, white, steel, dark);
  corners(v, white, steel);

  // Light: the operating lamp (hard white), cold fill, red accents, a warm desk lamp.
  v.light(240, 160, 2.3, 0xf4fbff, 9, 5, 1.4);
  v.light(120, 150, 2.6, 0x7ad8ff, 3, 7);
  v.light(380, 150, 2.6, 0x7ad8ff, 3, 7);
  v.light(390, 186, 1.2, 0xffb070, 2.5, 3);
  v.light(40, 200, 1.5, 0xff3b3b, 2.5, 4);
  v.pool(240, 166, 1.6, 0xffffff, 0.35, 0.8);
  v.pool(240, 166, 3.0, 0x9adfff, 0.12, 0.8);
}

/** A chrome arm or leg hanging on the rack. */
function limb(v: Interior3D, px: number, h: number, kind: 'arm' | 'leg', seed: number) {
  const chrome = v.mat(0xc8d4e0, { rough: 0.25, metal: 0.6 }), joint = v.mat(0x2a3440);
  const g = new THREE.Group();
  g.position.copy(v.onWall(px, h, 0.12));
  const segs = kind === 'arm' ? [0.32, 0.28] : [0.42, 0.4];
  let y = 0;
  segs.forEach((len, i) => {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05 - i * 0.01, 0.045 - i * 0.012, len, 8), chrome);
    s.position.y = y - len / 2; s.castShadow = true;
    const j = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), joint);
    j.position.y = y;
    g.add(s, j);
    y -= len;
  });
  const end = new THREE.Mesh(new THREE.BoxGeometry(kind === 'arm' ? 0.08 : 0.1, kind === 'arm' ? 0.12 : 0.05, kind === 'arm' ? 0.04 : 0.18), chrome);
  end.position.y = y - 0.05;
  g.add(end);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.12, 0.012), v.glow([0x00f0ff, 0xff3b3b, 0x39ff88][seed % 3], 1.8));
  led.position.set(0, -segs[0] / 2, 0.05);
  g.add(led);
  g.rotation.z = (seed % 2 ? 1 : -1) * 0.06;
  v.add(g);
  v.sway(g, 0.02, 0.7);
}

function jar(v: Interior3D, px: number, h: number, color: number) {
  const p = v.onWall(px, h, 0.12);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, toneMapped: false }));
  glass.position.copy(p).add(new THREE.Vector3(0, 0.1, 0));
  v.add(glass);
  const lid = v.cyl(p.clone().add(new THREE.Vector3(0, 0.2, 0)), 0.072, 0.072, 0.03, v.mat(0x2a3440));
  void lid;
  const thing = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), v.mat(0xf0f0f0));
  thing.position.copy(p).add(new THREE.Vector3(0, 0.1, 0));
  v.add(thing);
  const ph = Math.random() * 6;
  v.anim.add(t => { thing.position.y = p.y + 0.1 + Math.sin(t * 0.8 + ph) * 0.03; thing.rotation.y = t * 0.5 + ph; });
}

function bodyScan() {
  return (c: CanvasRenderingContext2D, t: number, w: number, h: number) => {
    c.fillStyle = '#020a10'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#00f0ff'; c.lineWidth = 2;
    const cx = w / 2;
    c.beginPath(); c.arc(cx, h * 0.12, h * 0.07, 0, Math.PI * 2); c.stroke();
    c.strokeRect(cx - w * 0.14, h * 0.21, w * 0.28, h * 0.34);
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * w * 0.14, h * 0.23); c.lineTo(cx + s * w * 0.3, h * 0.52); c.moveTo(cx + s * w * 0.07, h * 0.55); c.lineTo(cx + s * w * 0.09, h * 0.95); c.stroke(); }
    c.strokeStyle = '#ff3b3b'; c.beginPath(); c.moveTo(cx + w * 0.14, h * 0.23); c.lineTo(cx + w * 0.3, h * 0.52); c.stroke();
    const y = ((t * 0.4) % 1) * h;
    c.fillStyle = 'rgba(0,240,255,0.35)'; c.fillRect(0, y, w, 3);
    c.fillStyle = '#f5e663'; c.font = `600 ${Math.round(h * 0.09)}px ${FONT_TITLE}`; c.fillText('BRAS D. 87%', 3, h * 0.98);
  };
}

/** The chair, the operating lamp on its boom, the robot arm, drip, tray. */
async function surgery(v: Interior3D, white: THREE.Material, steel: THREE.Material, dark: THREE.Material) {
  const { x } = CLINIC.chair, cy = 150;
  const red = v.mat(0xd82a3a, { rough: 0.45 });
  const g = new THREE.Group();
  g.position.copy(at(x, cy));
  const part = (w: number, h: number, d: number, px: number, py: number, pz: number, m: THREE.Material, rx = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(px, py, pz); b.rotation.x = rx; b.castShadow = true; b.receiveShadow = true; g.add(b); return b;
  };
  part(0.7, 0.06, 0.5, 0, 0.03, 0, dark);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.5, 10), steel); col.position.y = 0.3; g.add(col);
  part(0.66, 0.12, 0.62, 0, 0.6, 0, white);
  part(0.62, 0.86, 0.12, 0, 1.0, -0.42, white, -0.38);
  part(0.64, 0.05, 0.13, 0, 0.75, -0.3, red, -0.38);
  part(0.3, 0.2, 0.1, 0, 1.5, -0.63, white, -0.38);
  part(0.56, 0.1, 0.6, 0, 0.5, 0.5, white, 0.55);
  for (const s of [-1, 1]) {
    part(0.08, 0.06, 0.5, s * 0.38, 0.82, -0.02, dark);
    part(0.1, 0.02, 0.06, s * 0.38, 0.86, 0.12, v.glow(0x00f0ff, 1.5));
  }
  v.add(g);
  v.blob(x, cy + 2, 1.3, 1.2, 0.45);
  // Operating lamp on a boom from the wall, a hard cone of light.
  const top = at(x, cy - 6, 2.55);
  v.cable([v.onWall(x, 3.25, 0.1), at(x, cy - 30, 3.15), at(x, cy - 8, 2.75)], 0.045, 0xb8c8d8);
  const lampG = new THREE.Group();
  lampG.position.copy(top);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 0.16, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8e4ec, side: THREE.DoubleSide, roughness: 0.4 }));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), v.glow(0xffffff, 2.4));
  disc.rotation.x = Math.PI / 2; disc.position.y = -0.07;
  lampG.add(shade, disc);
  v.add(lampG);
  v.sway(lampG, 0.015, 0.4, 'x');
  v.cone(at(x, cy - 6, 2.48), 0.34, 0.95, 2.2, 0xe8f8ff, 0.12);
  halo(v, at(x, cy - 6, 2.45), 1.6, 0xffffff, 0.5);
  v.dust(at(x, cy, 1.3), new THREE.Vector3(1.4, 2.0, 1.2), 0xffffff, 30);
  // Robot arm: base, two segments, a tool with a red laser, slowly working.
  const base = at(195, 156);
  v.cyl(base, 0.2, 0.24, 0.25, dark, 12);
  const j1 = new THREE.Group(); j1.position.copy(base).add(new THREE.Vector3(0, 0.25, 0));
  const seg1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.12), steel); seg1.position.y = 0.42; seg1.castShadow = true;
  const j2 = new THREE.Group(); j2.position.y = 0.85;
  const seg2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), steel); seg2.position.y = 0.35; seg2.castShadow = true;
  const tool = new THREE.Group(); tool.position.y = 0.7;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.18, 8), dark); head.position.y = 0.09;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), v.glow(0xff3b3b, 2.5)); tip.position.y = 0.19;
  tool.add(head, tip); j2.add(seg2, tool); j1.add(seg1, j2);
  for (const j of [j1, j2]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), v.mat(0xd82a3a)); j.add(k); }
  v.add(j1);
  const tipHalo = new THREE.SpriteMaterial({ map: radial(0.25), color: 0xff3b3b, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const tipS = new THREE.Sprite(tipHalo); tipS.scale.setScalar(0.35); tipS.position.y = 0.19; tool.add(tipS);
  v.anim.add(t => {
    j1.rotation.y = -0.9 + Math.sin(t * 0.35) * 0.35;
    j1.rotation.z = -0.35 + Math.sin(t * 0.5) * 0.08;
    j2.rotation.z = -1.35 + Math.sin(t * 0.7 + 1) * 0.15;
    tool.rotation.z = -0.6 + Math.sin(t * 1.3) * 0.2;
    tipHalo.opacity = Math.sin(t * 9) > 0.3 ? 0.9 : 0.3;
  });
  // Drip stand, instrument tray, a monitor cart.
  v.cyl(at(285, 124), 0.015, 0.015, 1.9, steel);
  v.cyl(at(285, 124), 0.2, 0.22, 0.04, dark);
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.05), new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.7, toneMapped: false }));
  bag.position.copy(at(285, 124, 1.7)); v.add(bag);
  v.cable([at(285, 124, 1.56), at(276, 136, 1.0), at(255, 146, 0.9)], 0.006, 0x8adfa0);
  v.cyl(at(270, 176), 0.02, 0.02, 0.85, steel);
  v.box(at(270, 176, 0.85), 0.5, 0.03, 0.34, steel);
  for (let i = 0; i < 5; i++) v.box(at(264 + i * 3, 176, 0.88), 0.02, 0.01, 0.22, v.mat(0xe8f0f8, { metal: 0.6, rough: 0.2 }), { yaw: (i - 2) * 0.1 });
  v.box(at(276, 175, 0.88), 0.12, 0.02, 0.08, v.mat(0xd82a3a));
}

/** Gurney and curtain (front left), the doc's desk (front right), bins, floor grime. */
function corners(v: Interior3D, white: THREE.Material, steel: THREE.Material) {
  // Gurney with a rumpled sheet, behind a plastic curtain on a rail.
  v.box(at(80, 190, 0.7), 2.1, 0.12, 0.75, v.mat(0xb8d8e0));
  for (const dx of [-28, 28]) for (const dy of [-6, 6]) v.cyl(at(80 + dx, 190 + dy), 0.02, 0.02, 0.7, steel);
  v.box(at(80, 190, 0.82), 1.9, 0.05, 0.7, white);
  v.box(at(56, 190, 0.86), 0.4, 0.08, 0.35, v.mat(0xf4f4ff));
  const curtain = canvasTex(64, 128, (c) => { const g = c.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(200,240,255,0.5)'); g.addColorStop(1, 'rgba(200,240,255,0.25)'); c.fillStyle = g; c.fillRect(0, 0, 64, 128); c.fillStyle = 'rgba(40,60,70,0.4)'; for (let x = 0; x < 64; x += 8) c.fillRect(x, 0, 2, 128); c.fillStyle = 'rgba(120,30,40,0.35)'; c.fillRect(20, 100, 14, 20); });
  const cm = new THREE.MeshStandardMaterial({ map: curtain, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6 });
  for (let i = 0; i < 5; i++) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 2.1), cm);
    const gg = new THREE.Group();
    gg.position.copy(at(126, 160 + i * 7, 2.3));
    strip.position.y = -1.05; strip.rotation.y = Math.PI / 2 + 0.15 * (i % 2 ? 1 : -1);
    gg.add(strip); v.add(gg);
    v.sway(gg, 0.03, 0.5 + i * 0.07, 'x');
  }
  v.box(at(126, 174, 2.3), 0.03, 0.03, 1.5, steel);
  // Doc's desk: terminal, files, coffee, a lamp; a stool.
  v.box(at(394, 190, 0.74), 1.9, 0.05, 0.8, v.mat(0x4a5868));
  for (const dx of [-26, 26]) v.box(at(394 + dx, 190), 0.05, 0.74, 0.7, v.mat(0x2a3440));
  v.screen(at(400, 184, 1.02), 0.55, 0.36, terminal('#39ff88', ['PATIENT 0412', 'bras G: rejet 12%', 'facture: 1200¢', '> stock neuro', 'RUPTURE', 'appel: Nyx?']), { bezel: 0x15101e, tilt: -0.1 });
  books(v, 374, 192, 0.77, 4, false, 7);
  v.cyl(at(414, 194, 0.77), 0.045, 0.04, 0.1, v.mat(0xf4f4ff));
  v.cyl(at(380, 186, 0.77), 0.06, 0.08, 0.04, v.mat(0x2a3440));
  v.cyl(at(380, 186, 0.81), 0.012, 0.012, 0.35, v.mat(0x2a3440));
  v.cyl(at(382, 186, 1.13), 0.05, 0.09, 0.1, v.mat(0xff8c2a, { emissive: 0xff8c2a, ei: 0.6 }));
  v.pool(386, 192, 0.9, 0xffb070, 0.25);
  v.cyl(at(398, 206), 0.03, 0.04, 0.5, v.mat(0x2a3440));
  v.cyl(at(398, 206, 0.5), 0.18, 0.18, 0.06, v.mat(0xd82a3a), 12);
  // Biohazard bins and boxes, a sad plant.
  v.cyl(at(424, 140), 0.18, 0.16, 0.6, v.mat(0xf5c83a), 10);
  v.cyl(at(438, 142), 0.18, 0.16, 0.6, v.mat(0xd82a3a), 10);
  carton(v, 440, 214, 0.5, 0.4, 0.4, { color: 0xc8c8d0, yaw: 0.2 });
  plant(v, 448, 100, 0.8, { seed: 30, leaf: 0x4a7a5a });
  // Drain grate and stains.
  v.decal(240, 196, 0.5, 0.5, new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (c) => { c.fillStyle = '#1a2228'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#05080a'; for (let i = 0; i < 6; i++) c.fillRect(6, 6 + i * 9, 52, 5); }), roughness: 0.6 }), 0.005);
  const rr = rng(3);
  for (let i = 0; i < 7; i++) {
    const m = new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, i < 2 ? 'rgba(110,20,30,0.55)' : 'rgba(40,50,40,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }), transparent: true, depthWrite: false });
    v.decal(60 + rr() * 360, 110 + rr() * 100, 0.4 + rr() * 0.8, 0.3 + rr() * 0.5, m, 0.004, rr() * 3).renderOrder = 1;
  }
}
