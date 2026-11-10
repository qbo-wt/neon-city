import * as THREE from 'three';
import type { World3D } from './World3D';
import { MixamoRig, mixamoAvailable } from './mixamo';
import { MannequinRig, type AnimName, type Rig } from './rigs';

/**
 * Interiors in 3D (apartment, corridor, clinic, den) drawn under the Phaser scene that still runs
 * them (physics, NPCs, interactions, panels). The camera looks north, 35° down, orthographic, and
 * the mapping keeps Phaser's pixels exact: a ground point (px, py) is world (px·K, 0, py·K / sin 35°),
 * and a height h rises h·K⁻¹·cos 35° pixels on screen. So 2D positions, prompts and speech bubbles
 * stay where they were; a 1.8 m character is about 26 px tall, close to the old sprites.
 */
export const K = 0.056;
const PITCH = THREE.MathUtils.degToRad(35);
const SIN = Math.sin(PITCH), COS = Math.cos(PITCH);
const TILE = 32;
export const at = (px: number, py: number, h = 0) => new THREE.Vector3(px * K, h, (py * K) / SIN);
/** Height (metres) at which something seen at screen y stands, given its ground y. */
const heightFor = (screenY: number, groundY: number) => ((groundY - screenY) * K) / COS;

export type InteriorStyle = 'home' | 'corridor' | 'clinic' | 'den';
const STYLES: Record<InteriorStyle, { floor: string; wall: string; tint: number; ambient: number; sky: number }> = {
  home: { floor: 'laminate_floor_02', wall: 'grey_plaster_02', tint: 0x5a5672, ambient: 0.45, sky: 0x4a3a8a },
  corridor: { floor: 'worn_tile_floor', wall: 'worn_plaster_wall', tint: 0x4a4258, ambient: 0.45, sky: 0x3a2a6a },
  clinic: { floor: 'interior_tiles', wall: 'worn_plaster_wall', tint: 0x7a7a88, ambient: 0.5, sky: 0x5a3a4a },
  den: { floor: 'concrete_floor_worn_001', wall: 'concrete_block_wall', tint: 0x6a7a70, ambient: 0.35, sky: 0x1a4a2a },
};
const WALL_H = 2.7, LOW_H = 0.25;

/** Door colours per letter in the room grids. */
const DOOR: Record<string, number> = { A: 0x00f0ff, a: 0x8a86b0, L: 0xf5e663, C: 0xff3b3b, N: 0x39ff88, X: 0xe8e8ff };

type Follow = { x: number; y: number; body?: unknown };
interface Char { rig: Rig; holder: THREE.Group; src: Follow; face: () => { x: number; y: number } | null; anim: () => AnimName; offsetY: number }

const canvasTex = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
};
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export class Interior3D {
  private chars: Char[] = [];
  private blink: { m: THREE.MeshBasicMaterial; base: number; t: number }[] = [];
  private grid: string[] = [];

  constructor(private world: World3D, private style: InteriorStyle) {}

  private add(o: THREE.Object3D) { this.world.boardGroup.add(o); return o; }

  /** Floor, walls (full height at the back and sides, low at the front so the room stays visible), doors. */
  async build(grid: string[]) {
    const w = this.world, st = STYLES[this.style];
    this.grid = grid;
    w.boardGroup.clear();
    w.rain = undefined;
    w.scene.fog = null;
    w.scene.background = new THREE.Color(0x030208);
    w.renderer.toneMappingExposure = 0.9;
    w.bloom.strength = 0.22;
    w.scene.environmentIntensity = 0.12;
    const floorMat = w.pbr(st.floor, 1, { roughness: 0.55 });
    const wallMat = w.pbr(st.wall, 1, { roughness: 0.9, color: st.tint });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15121e, roughness: 0.8 });
    const floorAt = (tx: number, ty: number) => '.oP'.includes(grid[ty]?.[tx] ?? '#');
    const uvBox = (sx: number, sy: number, sz: number, ox: number, oz: number) => {
      const g = new THREE.BoxGeometry(sx, sy, sz), pos = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + ox, y = pos.getY(i), z = pos.getZ(i) + oz;
        // Faces pointing up use x/z, the others the plane they stand in.
        const n = g.attributes.normal;
        uv.setXY(i, Math.abs(n.getY(i)) > 0.5 ? x / 2 : (Math.abs(n.getX(i)) > 0.5 ? z : x) / 2, Math.abs(n.getY(i)) > 0.5 ? z / 2 : y / 2);
      }
      return g;
    };
    const cw = TILE * K, cd = (TILE * K) / SIN;
    grid.forEach((row, ty) => [...row].forEach((ch, tx) => {
      const c = at(tx * TILE + 16, ty * TILE + 16);
      if (floorAt(tx, ty)) {
        const m = new THREE.Mesh(uvBox(cw, 0.1, cd, c.x, c.z), floorMat);
        m.position.set(c.x, -0.05, c.z); m.receiveShadow = true;
        this.add(m);
        return;
      }
      if (ch === ' ') return;
      // A wall with floor in front of it (south) is a full wall; one with floor behind it is a low front edge.
      const low = !floorAt(tx, ty + 1) && floorAt(tx, ty - 1);
      const h = low ? LOW_H : WALL_H;
      const m = new THREE.Mesh(uvBox(cw, h, cd, c.x, c.z), [wallMat, wallMat, dark, dark, wallMat, wallMat]);
      m.position.set(c.x, h / 2, c.z); m.castShadow = !low; m.receiveShadow = true;
      this.add(m);
      if (DOOR[ch] !== undefined) this.door(tx, ty, ch);
    }));
    // A skirting line of light along the back wall foot.
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(grid[0].length * cw, 0.03, 0.02), new THREE.MeshBasicMaterial({ color: 0xff2a6d, toneMapped: false }));
    skirt.position.copy(at(grid[0].length * 16, TILE, 0.06)).add(new THREE.Vector3(0, 0, 0.02));
    this.add(skirt);
    // Ambient: a dim bluish fill and a cool key light from the front-left for soft shadows.
    this.add(new THREE.HemisphereLight(st.sky, 0x0a0610, st.ambient));
    const key = new THREE.DirectionalLight(0xb8c4ff, 0.55);
    const mid = at(240, 128);
    key.position.copy(mid).add(new THREE.Vector3(-6, 12, 10));
    key.target.position.copy(mid);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
    this.add(key); this.add(key.target);
    this.framePhaser();
  }

  /** Orthographic camera covering exactly what the Phaser camera shows (x 0-480, y -14-256). */
  framePhaser(scrollY = -14, viewW = 480, viewH = 270) {
    const cam = this.world.camera;
    const centre = at(viewW / 2, scrollY + viewH / 2);
    const fwd = new THREE.Vector3(0, -SIN, -COS);
    cam.position.copy(centre).addScaledVector(fwd, -40);
    cam.up.set(0, 1, 0);
    cam.lookAt(centre);
    cam.zoom = 1;
    cam.left = (-viewW / 2) * K; cam.right = (viewW / 2) * K;
    cam.top = (viewH / 2) * K; cam.bottom = (-viewH / 2) * K;
    cam.near = 0.1; cam.far = 120;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  private door(tx: number, ty: number, ch: string) {
    const color = DOOR[ch];
    const g = new THREE.Group();
    const side = tx === 0 ? 'w' : tx === this.grid[0].length - 1 ? 'e' : 'n';
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.1, 0.06), new THREE.MeshStandardMaterial({ color: ch === 'L' ? 0x6a6a78 : 0x1c1828, roughness: 0.35, metalness: ch === 'L' ? 0.9 : 0.4 }));
    panel.position.y = 1.05;
    const frameMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    for (const [w, h, x, y] of [[1.05, 0.04, 0, 2.12], [0.04, 2.12, -0.5, 1.06], [0.04, 2.12, 0.5, 1.06]] as const) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), frameMat); f.position.set(x, y, 0.04); g.add(f);
    }
    if (ch === 'L') { const split = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.05, 0.08), new THREE.MeshBasicMaterial({ color: 0x111111 })); split.position.y = 1.05; g.add(split); panel.scale.x = 1.9; }
    g.add(panel);
    const light = new THREE.PointLight(color, 1.2, 3, 1.8);
    light.position.set(0, 1.9, 0.6);
    g.add(light);
    const c = at(tx * TILE + 16, ty * TILE + 16);
    if (side === 'n') g.position.set(c.x + (ch === 'L' && this.grid[ty][tx + 1] === 'L' ? TILE * K / 2 : 0), 0, ((ty + 1) * TILE * K) / SIN + 0.01);
    else if (side === 'w') { g.position.set((tx + 1) * TILE * K + 0.01, 0, c.z); g.rotation.y = Math.PI / 2; }
    else { g.position.set(tx * TILE * K - 0.01, 0, c.z); g.rotation.y = -Math.PI / 2; }
    if (ch === 'L' && this.grid[ty][tx - 1] === 'L') return; // the elevator's second tile
    this.add(g);
  }

  /** A real model standing where a 2D prop was, fitted to that prop's width. */
  private async model(id: string, x: number, y: number, width: number, o: { yaw?: number; h?: number; maxScale?: number; minScale?: number; depth?: number } = {}) {
    const m = await this.world.propModel(id, 99);
    m.rotation.y = o.yaw ?? 0;
    m.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    const k = THREE.MathUtils.clamp(width / Math.max(0.01, size.x), o.minScale ?? 0.4, o.maxScale ?? 1.6);
    m.scale.multiplyScalar(k);
    m.position.copy(at(x, y, o.h ?? 0));
    if (o.depth) m.position.z += o.depth;
    this.add(m);
    return m;
  }

  /** Emissive box (vending machines, arcade cabinets, servers…). */
  private glowBox(x: number, y: number, w: number, h: number, d: number, body: number, screen: THREE.Texture | number, screenH = 0.6, screenY = 0.6) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: body, roughness: 0.35, metalness: 0.6 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); box.position.y = h / 2; box.castShadow = true; box.receiveShadow = true;
    const sm = typeof screen === 'number' ? new THREE.MeshBasicMaterial({ color: screen, toneMapped: false }) : new THREE.MeshBasicMaterial({ map: screen, toneMapped: false });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, screenH), sm); s.position.set(0, screenY + screenH / 2, d / 2 + 0.005);
    g.add(box, s);
    g.position.copy(at(x, y));
    this.add(g);
    return { group: g, screen: sm };
  }

  private serverRack(x: number, y: number) {
    const leds = canvasTex(64, 128, c => {
      c.fillStyle = '#05080a'; c.fillRect(0, 0, 64, 128);
      for (let r = 0; r < 14; r++) { c.fillStyle = '#10161a'; c.fillRect(4, 4 + r * 9, 56, 7); for (let i = 0; i < 5; i++) { c.fillStyle = Math.random() < 0.5 ? '#39ff88' : Math.random() < 0.5 ? '#00f0ff' : '#0a2a1a'; c.fillRect(8 + i * 5, 6 + r * 9, 2, 2); } }
    });
    const r = this.glowBox(x, y, 0.62, 1.95, 0.7, 0x16181e, leds, 1.75, 0.1);
    this.blink.push({ m: r.screen, base: 1, t: Math.random() * 10 });
  }

  /** A 2D prop or decor image → its 3D version (unknown keys are skipped). */
  async decor(key: string, x: number, y: number, w: number, h: number, flip = false) {
    const yaw0 = 0, wall = (screenY: number) => heightFor(screenY, TILE) ; // mounted on the back wall face
    const backZ = (TILE * K) / SIN + 0.02;
    const onWall = (o: THREE.Object3D, screenY: number) => { o.position.z = backZ; o.position.y = Math.max(0.3, wall(screenY)); };
    switch (key) {
      // ----- apartment -----
      case 'desk': { await this.model('metal_office_desk', x, y, w * K * 1.1); const l = await this.model('classic_laptop', x, y, 0.36, { h: 0.76 }); l.rotation.y = 0; break; }
      case 'rack': this.serverRack(x, y); break;
      case 'bed': {
        const frame = await this.model('old_bed_frame', x, y, w * K * 1.15, { yaw: Math.PI / 2 });
        const bb = new THREE.Box3().setFromObject(frame), size = bb.getSize(new THREE.Vector3());
        const mattress = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.92, 0.22, size.z * 0.9), new THREE.MeshStandardMaterial({ color: 0x3a3048, roughness: 0.95 }));
        mattress.position.set((bb.min.x + bb.max.x) / 2, bb.min.y + size.y * 0.55, (bb.min.z + bb.max.z) / 2);
        mattress.castShadow = mattress.receiveShadow = true;
        this.add(mattress);
        await this.model('throw_pillows_01', x, y - h * 0.3, size.x * 0.5, { h: mattress.position.y + 0.1 });
        break;
      }
      case 'couch': await this.model('sofa_02', x, y, w * K, { yaw: Math.PI }); break;
      case 'table': await this.model('modern_coffee_table_01', x, y, w * K); break;
      case 'kitchen': {
        const cab = await this.model('drawer_cabinet', x - w / 3, y, w * K * 0.33);
        const top = new THREE.Box3().setFromObject(cab).max.y;
        await this.model('drawer_cabinet', x, y, w * K * 0.33);
        await this.model('electric_stove', x + w / 3, y, w * K * 0.32);
        await this.model('vintage_microwave', x - w / 3, y, 0.45, { h: top });
        break;
      }
      case 'plant': await this.model(flip ? 'potted_plant_02' : 'potted_plant_01', x, y, 0.55, { maxScale: 1.4 }); break;
      case 'gun-rack': { const m = await this.model('katana_stand_01', x, y, w * K * 0.8); onWall(m, y + 4); break; }
      case 'window-city': this.window(x, y, w, h); break;
      case 'rug': { const r = new THREE.Mesh(new THREE.PlaneGeometry(w * K, (h * K) / SIN), new THREE.MeshStandardMaterial({ map: canvasTex(128, 96, c => { c.fillStyle = '#2a1640'; c.fillRect(0, 0, 128, 96); c.strokeStyle = '#ff2a6d'; c.lineWidth = 3; c.strokeRect(6, 6, 116, 84); for (let i = 0; i < 6; i++) { c.fillStyle = '#3a2258'; c.fillRect(18 + i * 16, 18, 8, 60); } }), roughness: 1 })); r.rotation.x = -Math.PI / 2; r.position.copy(at(x, y, 0.005)); r.receiveShadow = true; this.add(r); break; }
      // ----- corridor -----
      case 'vending': { const t = canvasTex(64, 96, c => { c.fillStyle = '#0a0a14'; c.fillRect(0, 0, 64, 96); for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) { c.fillStyle = ['#ff2a6d', '#00f0ff', '#f5e663', '#39ff88'][(r + i) % 4]; c.fillRect(6 + i * 13, 8 + r * 18, 9, 12); } c.fillStyle = '#ff8c2a'; c.fillRect(0, 84, 64, 12); }); this.glowBox(x, y, 0.75, 1.85, 0.7, 0xc85a18, t, 1.2, 0.5); break; }
      case 'arcade-cab': { const t = canvasTex(64, 48, c => { const g = c.createLinearGradient(0, 0, 0, 48); g.addColorStop(0, '#6a2cff'); g.addColorStop(1, '#00f0ff'); c.fillStyle = g; c.fillRect(0, 0, 64, 48); c.fillStyle = '#f5e663'; c.fillRect(28, 30, 8, 8); c.fillStyle = '#ff2a6d'; c.fillRect(10, 10, 6, 6); }); const r = this.glowBox(x, y, 0.62, 1.75, 0.75, 0x1a1030, t, 0.5, 1.05); this.blink.push({ m: r.screen, base: 1, t: Math.random() * 10 }); break; }
      case 'boxes': { await this.model('cardboard_box_01', x, y, 0.55); await this.model('cardboard_box_01', x + 4, y - 2, 0.45, { h: 0.42 }); break; }
      case 'mop-bucket': await this.model('WetFloorSign_01', x, y, 0.35, { maxScale: 1.3 }); break;
      case 'noodle-cart': await this.model('CoffeeCart_01', x, y, w * K, { maxScale: 1.4 }); break;
      case 'bench': await this.model('painted_wooden_bench', x, y, w * K); break;
      case 'laundry': { await this.model('plastic_crate_01', x, y, 0.55); await this.model('plastic_crate_01', x, y, 0.55, { h: 0.33 }); break; }
      case 'couch-old': await this.model('sofa_03', x, y, w * K); break;
      case 'trashcan': await this.model('metal_trash_can', x, y, 0.5, { maxScale: 1.2 }); break;
      case 'bike': await this.model('tool_cart', x, y, w * K * 0.8); break;
      case 'poster-0': case 'poster-1': case 'poster-2': case 'poster-3': case 'noticeboard': this.poster(key, x, y, w, h); break;
      case 'elevator': break; // drawn as the L door
      case 'doormat': { const r = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 1 })); r.rotation.x = -Math.PI / 2; r.position.copy(at(x, y, 0.005)); this.add(r); break; }
      case 'ad-screen': this.adScreen(x, y, w, h); break;
      // ----- clinic -----
      case 'surgery-chair': await this.model('BarberShopChair_01', x, y, w * K * 0.9, { maxScale: 1.3 }); break;
      case 'surgical-arm': { const m = await this.model('desk_lamp_arm_01', x - 10, y + 30, 0.9, { maxScale: 3 }); m.rotation.y = Math.PI / 4; break; }
      case 'med-monitor': { await this.model('metal_stool_01', x, y, 0.4); await this.model('television_02', x, y, 0.5, { h: 0.62 }); break; }
      case 'limb-rack': await this.model('steel_frame_shelves_02', x, y, w * K); break;
      case 'med-cabinet': {
        const cab = await this.model('drawer_cabinet', x, y, w * K * 0.8);
        await this.model('medical_box', x, y, 0.4, { h: new THREE.Box3().setFromObject(cab).max.y }).catch(() => undefined);
        break;
      }
      // ----- den -----
      case 'server': this.serverRack(x, y); break;
      case 'net-desk': {
        await this.model('metal_office_desk', x, y, w * K);
        for (const dx of [-14, 0, 14]) { const m = await this.model('television_02', x + dx, y, 0.42, { h: 0.76 }); m.rotation.y = dx * -0.02; }
        break;
      }
      case 'net-chair': break; // Nyx works standing at her desk
      case 'cables': this.cables(x, y, w, flip); break;
    }
    void yaw0;
  }

  private window(x: number, y: number, w: number, h: number) {
    const t = canvasTex(256, 96, c => {
      const g = c.createLinearGradient(0, 0, 0, 96); g.addColorStop(0, '#05030f'); g.addColorStop(1, '#3a0f3a'); c.fillStyle = g; c.fillRect(0, 0, 256, 96);
      let bx = 0;
      while (bx < 256) {
        const bw = 10 + Math.random() * 22, bh = 30 + Math.random() * 60;
        c.fillStyle = '#0a0618'; c.fillRect(bx, 96 - bh, bw, bh);
        for (let wy = 96 - bh + 4; wy < 92; wy += 6) for (let wx = bx + 2; wx < bx + bw - 2; wx += 4) if (Math.random() < 0.15) { c.fillStyle = ['#f5e663', '#ff2a6d', '#00f0ff'][Math.floor(Math.random() * 3)]; c.fillRect(wx, wy, 2, 2); }
        bx += bw + 2;
      }
    });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w * K * 0.95, h * K / COS * 0.9), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    pane.position.set(x * K, heightFor(y, TILE), (TILE * K) / SIN + 0.012);
    this.add(pane);
    const light = new THREE.PointLight(0xff2a6d, 1.5, 6, 1.6);
    light.position.set(x * K, 1.6, (TILE * K) / SIN + 1.2);
    this.add(light);
  }

  private poster(key: string, x: number, y: number, w: number, h: number) {
    const col = ['#ff2a6d', '#00f0ff', '#f5e663', '#39ff88'][Number(key.slice(-1)) || 0];
    const t = canvasTex(64, 90, c => {
      c.fillStyle = key === 'noticeboard' ? '#3a2a1a' : '#120a20'; c.fillRect(0, 0, 64, 90);
      if (key === 'noticeboard') { for (let i = 0; i < 7; i++) { c.fillStyle = ['#e8e8d0', '#f5e663', '#a8c8ff'][i % 3]; c.fillRect(6 + (i % 3) * 18, 8 + Math.floor(i / 3) * 26, 14, 18); } }
      else { c.fillStyle = col; c.fillRect(8, 10, 48, 40); c.fillStyle = '#e8e8ff'; c.font = 'bold 10px Arial'; c.fillText('NEON', 14, 66); c.fillRect(8, 74, 48, 3); }
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w * K, h * K / COS), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.15 }));
    p.position.set(x * K, Math.max(0.6, heightFor(y, TILE)), (TILE * K) / SIN + 0.012);
    this.add(p);
  }

  private adScreen(x: number, y: number, w: number, h: number) {
    const t = canvasTex(256, 48, c => { c.fillStyle = '#05030f'; c.fillRect(0, 0, 256, 48); c.fillStyle = '#f5e663'; c.font = 'bold 22px Arial'; c.fillText('BIÈRE NEON — GOÛTE LA NUIT', 8, 32); });
    t.wrapS = THREE.RepeatWrapping;
    const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w * K, h * K / COS), m);
    p.position.set(x * K, heightFor(y, TILE), (TILE * K) / SIN + 0.012);
    this.add(p);
    this.scroll = t;
  }
  private scroll?: THREE.Texture;

  private cables(x: number, y: number, w: number, flip: boolean) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4 });
    for (let i = 0; i < 4; i++) {
      const pts = Array.from({ length: 6 }, (_, j) => at(x + (flip ? -1 : 1) * (j - 2.5) * (w / 6), y + Math.sin(j + i) * 6 + i * 3, 0.03));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.045, 8), mat);
      tube.castShadow = true;
      this.add(tube);
    }
  }

  /** A neon sign at the place a 2D sign was seen, standing 2.3 m up (on the wall it belonged to). */
  sign(x: number, y: number, label: string, color: number) {
    const H = 2.3, groundY = y + (H * COS) / K;
    const t = canvasTex(512, 96, c => {
      c.fillStyle = '#05030f'; c.fillRect(0, 0, 512, 96);
      c.strokeStyle = hex(color); c.lineWidth = 4; c.strokeRect(6, 6, 500, 84);
      c.fillStyle = hex(color); c.shadowColor = hex(color); c.shadowBlur = 16;
      c.font = 'bold 46px "Arial Black", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, 256, 50);
    });
    const width = Math.min(3.2, 0.32 + label.length * 0.16);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.19), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, transparent: true }));
    (p.material as THREE.MeshBasicMaterial).color.setScalar(1.5);
    p.position.copy(at(x, Math.min(groundY, 24 * 8), H));
    this.add(p);
    this.blink.push({ m: p.material as THREE.MeshBasicMaterial, base: 1.5, t: Math.random() * 20 });
  }

  /** A light where the 2D scene had a glow pool. */
  light(x: number, y: number, color: number, alpha: number, sx: number) {
    const l = new THREE.PointLight(color, 1.2 + alpha * 7, 2.5 + sx * 2.5, 1.8);
    l.position.copy(at(x, y, 2.1));
    this.add(l);
  }

  /** A character following a Phaser sprite (player, NPC): position, facing and animation. */
  character(src: Follow, kind: string, model: string | undefined, face: () => { x: number; y: number } | null, anim: () => AnimName, offsetY = 0) {
    const holder = new THREE.Group();
    let rig: Rig = new MannequinRig(kind === 'player' ? 'player' : 'npc');
    holder.add(rig.root);
    this.add(holder);
    const c: Char = { rig, holder, src, face, anim, offsetY };
    this.chars.push(c);
    void mixamoAvailable().then(ok => {
      if (!ok) return;
      const real = new MixamoRig(kind, 1, model);
      void real.ready.then(loaded => { if (!loaded) return; holder.remove(rig.root); holder.add(real.root); rig = real; c.rig = real; });
    });
  }

  update(dt: number) {
    for (const c of this.chars) {
      c.holder.position.copy(at(c.src.x, c.src.y + 7 + c.offsetY));
      const f = c.face();
      if (f && (f.x || f.y)) {
        const target = Math.atan2(f.x, f.y / SIN);
        let d = target - c.holder.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        c.holder.rotation.y += d * Math.min(1, dt * 12);
      }
      c.rig.play(c.anim());
      c.rig.update(dt);
    }
    for (const b of this.blink) { b.t += dt; b.m.color.setScalar(b.base * (Math.sin(b.t * 7) > 0.96 ? 0.3 : 1)); }
    if (this.scroll) this.scroll.offset.x = (this.scroll.offset.x + dt * 0.08) % 1;
  }
}
