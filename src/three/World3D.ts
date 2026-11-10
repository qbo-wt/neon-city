import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { createRng, pick, type Rng } from '../core/rng';
import type { Board, Pt } from '../tactics/types';

/** One board cell in metres: characters are ~1.8 m tall, props keep their real size. */
export const CELL = 1.5;
const PH = 'assets/ph/';

const NEON = [0x00f0ff, 0xff2a6d, 0xf5e663, 0x39ff88, 0xb84dff, 0xff8c2a];
const SIGNS = ['RAMEN', 'BAR', 'HÔTEL', '24/7', 'CLUB', 'PHARMA', 'ARCADE', 'SUSHI', 'MOTEL', 'KARAOKÉ', 'NOODLES', 'TATOUAGE'];

/** Board props → Poly Haven model and how it sits in its cell. */
const PROP_MODELS: Record<string, { id: string; node?: string; fit?: number; yaw?: number }> = {
  'car-0': { id: 'covered_car' }, 'car-1': { id: 'covered_car' }, 'car-2': { id: 'covered_car' },
  crate: { id: 'utility_box_02' }, barrel: { id: 'barrel_stove' }, dumpster: { id: 'metal_trash_can' },
  pillar: { id: 'utility_box_01' }, stall: { id: 'modular_street_seating', node: 'seat' }, container: { id: 'exterior_aircon_unit' },
  barrier: { id: 'concrete_road_barrier' }, planter: { id: 'old_tyre' }, vending: { id: 'utility_box_01' },
  lamp: { id: 'street_lamp_01' }, totem: { id: 'security_light' }, generator: { id: 'exterior_aircon_unit' },
};

/**
 * The 3D street of a sector: photo-scanned CC0 props and textures (Poly Haven), a night HDRI for
 * reflections, street lamps and neon signs as real lights, wet asphalt, rain and fog, bloom on
 * everything that glows. The camera is an orthographic isometric view: board +x goes down-right
 * on screen and +y down-left, like the 2D board.
 */
export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  private composer: EffectComposer;
  /** Glow on bright things: strong in the wet street, softer indoors. */
  bloom: UnrealBloomPass;
  private gltf = new GLTFLoader();
  private models = new Map<string, Promise<THREE.Group>>();
  private tex = new THREE.TextureLoader();
  /** Everything of the current place (street or interior); cleared when a new one is built. */
  readonly boardGroup = new THREE.Group();
  rain?: THREE.LineSegments;
  private clock = new THREE.Clock();
  private board?: Board;
  /** Called every frame before rendering (units animate here). */
  onFrame?: (dt: number) => void;

  constructor(readonly canvas: HTMLCanvasElement, w: number, h: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(w, h, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 200);
    this.scene.background = new THREE.Color(0x07040f);
    this.scene.fog = new THREE.FogExp2(0x120a24, 0.022);
    this.scene.add(this.boardGroup);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new SMAAPass());
    this.composer.setSize(w, h);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.frame();
  }

  /** Night sky for reflections and soft ambient light. */
  async loadEnvironment() {
    const hdr = await new HDRLoader().loadAsync(`${PH}hdri/modern_buildings_night.hdr`);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromEquirectangular(hdr).texture;
    this.scene.environmentIntensity = 0.7;
    hdr.dispose(); pm.dispose();
  }

  private model(id: string): Promise<THREE.Group> {
    let p = this.models.get(id);
    if (!p) {
      p = this.gltf.loadAsync(`${PH}${id}/${id}.gltf`).then(g => {
        g.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        return g.scene;
      });
      this.models.set(id, p);
    }
    return p;
  }

  /** A copy of one node of a model (or the whole model), with its own transform cleared. */
  async piece(id: string, node?: string): Promise<THREE.Object3D> {
    const root = await this.model(id);
    const src = node ? root.getObjectByName(node) : root;
    if (!src) throw new Error(`${id}: no node ${node}`);
    const c = src.clone(true);
    if (node) { c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); }
    return c;
  }

  pbr(id: string, repeat: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
    const load = (k: string, srgb = false) => {
      const t = this.tex.load(`${PH}tex/${id}/${k}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    return new THREE.MeshStandardMaterial({ map: load('diff', true), normalMap: load('nor'), roughnessMap: load('rough'), ...opts });
  }

  /** Centre of a cell on the ground, in world metres. */
  cellPos(p: Pt, y = 0) { return new THREE.Vector3((p.x + 0.5) * CELL, y + this.groundY(p), (p.y + 0.5) * CELL); }

  /** Top of the ground at a cell: the pavement along the back edges is a 6 cm curb. */
  private raised = new Set<string>();
  groundY(p: Pt) { return this.raised.has(`${Math.floor(p.x)},${Math.floor(p.y)}`) ? 0.06 : 0; }

  /** Frames the board: centred, the whole of it visible, `pad` metres of margin; `shiftUp` raises it (fraction of the view). */
  frameBoard(viewW: number, viewH: number, pad = 2, shiftUp = 0) {
    const b = this.board!;
    const centre = new THREE.Vector3(b.w * CELL / 2, 0, b.h * CELL / 2);
    const elev = THREE.MathUtils.degToRad(32);
    const dir = new THREE.Vector3(1, Math.SQRT2 * Math.tan(elev), 1).normalize();
    this.focus.copy(centre);
    this.home.copy(centre);
    this.camDir.copy(dir);
    this.camera.zoom = 1;
    this.placeCamera();
    // Screen width of the board diagonal decides the zoom.
    const span = (b.w + b.h) * CELL / Math.SQRT2 + pad * 2;
    const aspect = viewW / viewH;
    const halfW = span / 2, halfH = Math.max(halfW / aspect, (span * 0.62) / 2);
    const hw = Math.max(halfW, halfH * aspect);
    this.camera.left = -hw; this.camera.right = hw;
    const lift = shiftUp * 2 * hw / aspect;
    this.camera.top = hw / aspect - lift; this.camera.bottom = -hw / aspect - lift;
    this.camera.updateProjectionMatrix();
  }

  private focus = new THREE.Vector3();
  private home = new THREE.Vector3();
  private camDir = new THREE.Vector3(1, 1, 1).normalize();
  private placeCamera() {
    this.camera.position.copy(this.focus).addScaledVector(this.camDir, 60);
    this.camera.lookAt(this.focus);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  /** Moves the view on the ground by a screen-space amount (pixels of a viewW x viewH view). */
  panScreen(dx: number, dy: number, viewW: number) {
    const perPx = (this.camera.right - this.camera.left) / this.camera.zoom / viewW;
    const right = new THREE.Vector3(1, 0, -1).normalize(), down = new THREE.Vector3(1, 0, 1).normalize();
    const elev = Math.asin(this.camDir.y);
    this.focus.addScaledVector(right, dx * perPx).addScaledVector(down, (dy * perPx) / Math.sin(elev));
    this.clampFocus();
    this.placeCamera();
  }

  /** Zooms around a canvas pixel (keeps the ground point under it in place). */
  zoomAt(factor: number, px: number, py: number, w: number, h: number) {
    const before = this.groundAt(px, py, w, h);
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, 1, 3.2);
    this.placeCamera();
    const after = this.groundAt(px, py, w, h);
    if (before && after) this.focus.add(before.sub(after));
    if (this.camera.zoom <= 1.001) this.focus.copy(this.home);
    this.clampFocus();
    this.placeCamera();
  }

  get zoom() { return this.camera.zoom; }

  private clampFocus() {
    const b = this.board;
    if (!b) return;
    this.focus.x = THREE.MathUtils.clamp(this.focus.x, 0, b.w * CELL);
    this.focus.z = THREE.MathUtils.clamp(this.focus.z, 0, b.h * CELL);
    this.focus.y = 0;
  }

  private groundAt(px: number, py: number, w: number, h: number) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((px / w) * 2 - 1, -(py / h) * 2 + 1), this.camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) ? hit : null;
  }

  /** Builds the street of a board: ground, curbs, facades, props, lights, puddles, rain. */
  async buildBoard(b: Board, seed: number) {
    this.board = b;
    this.boardGroup.clear();
    this.renderer.toneMappingExposure = 1.35;
    this.bloom.strength = 0.55;
    this.scene.environmentIntensity = 0.7;
    this.scene.fog = new THREE.FogExp2(0x120a24, 0.022);
    this.scene.background = new THREE.Color(0x07040f);
    this.raised.clear();
    const rng = createRng(seed);
    const g = this.boardGroup;
    const cellOn = (x: number, y: number) => x >= 0 && y >= 0 && x < b.w && y < b.h && b.cells[y * b.w + x] !== 'void';

    // Ground: one tile per cell, asphalt in the street, pavement at the back edges.
    const road = this.pbr(b.style === 'market' || b.style === 'plaza' ? 'square_tiles_03' : b.style === 'alley' ? 'road_damaged' : 'asphalt_02', 0.5, { roughness: 0.42, metalness: 0.08 });
    const walk = this.pbr('concrete_pavement_02', 0.5, { roughness: 0.55 });
    road.envMapIntensity = 1.4; walk.envMapIntensity = 1.2;
    const tileGeo = new THREE.BoxGeometry(CELL, 0.2, CELL);
    const side = new THREE.MeshStandardMaterial({ color: 0x1c1826, roughness: 0.9 });
    // World-space UVs so the texture runs across tiles without seams.
    const uv = (geo: THREE.BufferGeometry, x: number, y: number) => {
      const g2 = geo.clone(), pos = g2.attributes.position, uvA = g2.attributes.uv;
      for (let i = 0; i < pos.count; i++) uvA.setXY(i, (pos.getX(i) + x * CELL) / 3, (pos.getZ(i) + y * CELL) / 3);
      return g2;
    };
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      if (!cellOn(x, y)) continue;
      const back = !cellOn(x, y - 1) || !cellOn(x - 1, y);
      const top = back ? walk : road;
      if (back) this.raised.add(`${x},${y}`);
      const m = new THREE.Mesh(uv(tileGeo, x, y), [side, side, top, side, side, side]);
      m.position.set((x + 0.5) * CELL, back ? -0.04 : -0.1, (y + 0.5) * CELL);
      m.receiveShadow = true;
      g.add(m);
    }
    // The tactical grid, very faint: lines between cells.
    const lines: number[] = [];
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      if (!cellOn(x, y)) continue;
      const x0 = x * CELL, z0 = y * CELL, h = 0.012;
      lines.push(x0, h, z0, x0 + CELL, h, z0, x0, h, z0, x0, h, z0 + CELL);
      if (!cellOn(x + 1, y)) lines.push(x0 + CELL, h, z0, x0 + CELL, h, z0 + CELL);
      if (!cellOn(x, y + 1)) lines.push(x0, h, z0 + CELL, x0 + CELL, h, z0 + CELL);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x8a86ff, transparent: true, opacity: 0.12 })));

    // The street goes on past the board, into the fog.
    const far = this.pbr('asphalt_02', 0.5, { roughness: 0.8, color: 0x8a8a9a });
    const out = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), far);
    out.geometry.attributes.uv.array.forEach((_, i, arr) => { (arr as Float32Array)[i] *= 40; });
    out.rotation.x = -Math.PI / 2;
    out.position.set(b.w * CELL / 2, -0.21, b.h * CELL / 2);
    out.receiveShadow = true;
    g.add(out);

    await this.buildFacades(b, rng);
    await this.buildProps(b, rng);
    this.buildLights(b, rng);
    this.buildRain(b);
  }

  /**
   * Apartment facades along the back edges: a plinth, a ground floor with doors, three floors of
   * windows, cornices and a crown. The modular pieces share one local frame per slot (wall from
   * x = -3 to 0, face on z = 0 looking at +z), so a wall and its window drop in at the same place.
   */
  private async buildFacades(b: Board, rng: Rng) {
    const id = 'modular_urban_apartments_facade';
    const cellOn = (x: number, y: number) => x >= 0 && y >= 0 && x < b.w && y < b.h && b.cells[y * b.w + x] !== 'void';
    const floors = 3;
    const upper = ['window_centered_double', 'window_centered_large', 'window_offset_small', 'window_centered_small'];
    const doors = ['door_centered_large', 'door_centered_small', 'door_offset_small'];
    const put = async (seg: THREE.Group, node: string, y: number) => {
      const o = await this.piece(id, node);
      o.position.set(3, y, 0);
      seg.add(o);
      return o;
    };
    const runs: { along: 'x' | 'z'; len: number }[] = [{ along: 'x', len: b.w * CELL }, { along: 'z', len: b.h * CELL }];
    for (const run of runs) {
      const n = Math.ceil(run.len / 3);
      for (let i = 0; i < n; i++) {
        const cx = run.along === 'x' ? Math.min(b.w - 1, Math.floor((i * 3 + 1.5) / CELL)) : 0;
        const cy = run.along === 'z' ? Math.min(b.h - 1, Math.floor((i * 3 + 1.5) / CELL)) : 0;
        if (!cellOn(cx, cy)) continue;
        const seg = new THREE.Group();
        await put(seg, 'base_standard_01', 0);
        // Ground floor: a door (and its frame) or a shop window; a lit doorway now and then.
        if (rng() < 0.6) {
          const d = pick(rng, doors);
          await put(seg, `wall_${d}_01`, 0);
          await put(seg, `${d}_01`, 0);
          if (rng() < 0.5) {
            const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.1), new THREE.MeshBasicMaterial({ color: pick(rng, [0xffb466, 0xff5fa8, 0x66ddff]), toneMapped: false }));
            glow.position.set(1.5, 1.05, -0.15);
            seg.add(glow);
          }
        } else {
          await put(seg, 'wall_window_centered_large_01', 0);
          await put(seg, 'window_centered_large_01', 0);
        }
        await put(seg, 'dado_standard_standard_01', 2.9);
        for (let f = 1; f <= floors; f++) {
          const w = pick(rng, upper), v = f === floors ? '03' : '02';
          const variant = w === 'window_offset_small' ? (f === floors ? '03' : '02') : v;
          await put(seg, `wall_${w}_${variant}`, f * 3).catch(() => put(seg, 'wall_standard_standard_01', f * 3));
          await put(seg, `${w}_${variant}`, f * 3).catch(() => undefined);
          if (rng() < 0.38) {
            const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.5), new THREE.MeshBasicMaterial({ color: pick(rng, [0xffc46b, 0xffe2a0, 0x7ad8ff, 0xff6fb0]) }));
            glow.position.set(1.5, f * 3 + 1.4, -0.06);
            seg.add(glow);
          }
          await put(seg, 'cornice_standard_standard_01', f * 3 + 2.9);
        }
        await put(seg, 'crown_standard_standard_01', (floors + 1) * 3);
        if (rng() < 0.5) seg.add(this.neonSign(pick(rng, SIGNS), pick(rng, NEON), 1.5, 3.55));
        seg.traverse(o => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || !(m.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
          const mat = (m.material as THREE.MeshStandardMaterial);
          if (!this.nightMats.has(mat)) { const c = mat.clone(); c.color.multiplyScalar(0.42); c.roughness = Math.min(c.roughness, 0.75); this.nightMats.set(mat, c); }
          m.material = this.nightMats.get(mat)!;
        });
        if (run.along === 'x') seg.position.set(i * 3, 0, 0);
        else { seg.rotation.y = Math.PI / 2; seg.position.set(0, 0, (i + 1) * 3); }
        this.boardGroup.add(seg);
      }
    }
  }

  private neonSign(word: string, color: number, x: number, y: number) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#05030f'; ctx.fillRect(0, 0, 256, 64);
    const hex = '#' + color.toString(16).padStart(6, '0');
    ctx.strokeStyle = hex; ctx.lineWidth = 3; ctx.strokeRect(4, 4, 248, 56);
    ctx.fillStyle = hex; ctx.font = 'bold 38px "Arial Black", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = hex; ctx.shadowBlur = 12;
    ctx.fillText(word, 128, 34);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    m.position.set(x, y, 0.35);
    (m.material as THREE.MeshBasicMaterial).color.setScalar(1.6);
    const grp = new THREE.Group();
    grp.add(m);
    const light = new THREE.PointLight(color, 14, 9, 1.6);
    light.position.set(x, y - 0.3, 1.2);
    grp.add(light);
    return grp;
  }

  /** The board's blocking props, at real scale, centred in their cell. */
  private async buildProps(b: Board, rng: Rng) {
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const prop = b.props[y * b.w + x], cell = b.cells[y * b.w + x];
      if (!prop) continue;
      if (cell === 'hole') {
        if (prop === 'water') {
          const w = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.05, CELL), new THREE.MeshPhysicalMaterial({ color: 0x020812, roughness: 0.05, clearcoat: 1, envMapIntensity: 2.5 }));
          w.position.copy(this.cellPos({ x, y }, -0.2));
          this.boardGroup.add(w);
        } else {
          const o = await this.piece('water_manhole_cover');
          o.position.copy(this.cellPos({ x, y }, 0.01));
          this.boardGroup.add(o);
        }
        continue;
      }
      if (prop === 'car-tail') continue;
      const def = PROP_MODELS[prop];
      if (!def) continue;
      const car = prop.startsWith('car-');
      const o = await this.piece(def.id, def.node);
      o.rotation.y = car ? Math.PI / 2 + (rng() < 0.5 ? Math.PI : 0) : def.yaw ?? (Math.floor(rng() * 4) * Math.PI) / 2;
      o.updateMatrixWorld(true);
      // Real size, but never wider than its cell (a car is shrunk to a compact one).
      const bb = new THREE.Box3().setFromObject(o), size = bb.getSize(new THREE.Vector3());
      const k = car ? Math.min(1, (CELL * 1.95) / size.x) : Math.min(1, (CELL * 0.95) / Math.max(size.x, size.z));
      o.scale.multiplyScalar(k);
      o.updateMatrixWorld(true);
      const bb2 = new THREE.Box3().setFromObject(o), c = bb2.getCenter(new THREE.Vector3());
      const at = car ? this.cellPos({ x: x + 0.5, y }) : this.cellPos({ x, y });
      o.position.add(new THREE.Vector3(at.x - c.x, -bb2.min.y, at.z - c.z));
      this.boardGroup.add(o);
    }
  }

  /** Moonlight with shadows, warm street lamps, a cold fill. */
  private buildLights(b: Board, rng: Rng) {
    const g = this.boardGroup;
    g.add(new THREE.HemisphereLight(0x5a4ab0, 0x1a0c22, 0.55));
    const moon = new THREE.DirectionalLight(0x8fa4ff, 0.9);
    const cx = b.w * CELL / 2, cz = b.h * CELL / 2;
    moon.position.set(cx - 10, 22, cz + 14);
    moon.target.position.set(cx, 0, cz);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const r = Math.max(b.w, b.h) * CELL;
    Object.assign(moon.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 80 });
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.02;
    g.add(moon, moon.target);
    // Lamps: every lamp prop is a warm light; a couple more over the street.
    let n = 0;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      if (b.props[y * b.w + x] !== 'lamp' || n > 4) continue;
      const l = new THREE.PointLight(0xffb066, 22, 11, 1.8);
      l.position.copy(this.cellPos({ x, y }, 3.6));
      g.add(l); n++;
    }
    for (let i = n; i < 3; i++) {
      const l = new THREE.PointLight(pick(rng, [0xffb066, 0x66ccff, 0xff5fa8]), 14, 10, 1.8);
      l.position.copy(this.cellPos({ x: Math.floor(rng() * b.w), y: Math.floor(rng() * b.h) }, 3.2));
      g.add(l);
    }
  }

  private nightMats = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  private rainVel: Float32Array = new Float32Array(0);
  private buildRain(b: Board) {
    const N = 900, pos = new Float32Array(N * 6), W = b.w * CELL + 8, D = b.h * CELL + 8;
    this.rainVel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * W - 4, y = Math.random() * 14, z = Math.random() * D - 4;
      pos.set([x, y, z, x + 0.03, y - 0.45, z + 0.03], i * 6);
      this.rainVel[i] = 14 + Math.random() * 6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fb6ff, transparent: true, opacity: 0.35 }));
    this.rain.frustumCulled = false;
    this.boardGroup.add(this.rain);
  }

  private tickRain(dt: number) {
    if (!this.rain) return;
    const a = this.rain.geometry.attributes.position as THREE.BufferAttribute, arr = a.array as Float32Array;
    for (let i = 0; i < this.rainVel.length; i++) {
      const o = i * 6, d = this.rainVel[i] * dt;
      arr[o + 1] -= d; arr[o + 4] -= d;
      if (arr[o + 4] < 0) { arr[o + 1] += 14; arr[o + 4] += 14; }
    }
    a.needsUpdate = true;
  }

  private layers = new Map<string, THREE.InstancedMesh>();
  private layerGeo = new THREE.PlaneGeometry(CELL * 0.92, CELL * 0.92).rotateX(-Math.PI / 2);
  private layerMat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

  /** Coloured cells on the ground, one named layer each (range, hover, markers, flashes). */
  setOverlay(layer: string, cells: { p: Pt; color: number; alpha: number }[], order = 0) {
    const old = this.layers.get(layer);
    if (old) { this.scene.remove(old); old.dispose(); this.layers.delete(layer); }
    if (!cells.length) return;
    const m = new THREE.InstancedMesh(this.layerGeo, this.layerMat, cells.length);
    const mx = new THREE.Matrix4(), col = new THREE.Color();
    cells.forEach((c, i) => {
      mx.makeTranslation(this.cellPos(c.p, 0.02 + order * 0.004));
      m.setMatrixAt(i, mx);
      m.setColorAt(i, col.setHex(c.color).multiplyScalar(c.alpha * 1.6));
    });
    m.renderOrder = 2 + order;
    this.scene.add(m);
    this.layers.set(layer, m);
  }

  /** Cells that light up then fade (blasts, zones of a spell that just went off). */
  flashCells(cells: Pt[], color: number, ms = 420) {
    const key = `flash-${Math.random()}`;
    this.setOverlay(key, cells.map(p => ({ p, color, alpha: 0.9 })), 3);
    const m = this.layers.get(key);
    if (!m) return;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / ms;
      if (t >= 1 || !this.layers.has(key)) { this.setOverlay(key, []); return; }
      (m.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      requestAnimationFrame(tick);
    };
    m.material = this.layerMat.clone();
    tick();
  }

  /** A real-scale prop model (breakables), centred on the origin with its base on y = 0. */
  async propModel(id: string, maxSize = CELL * 0.8): Promise<THREE.Object3D> {
    const o = await this.piece(id);
    o.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(o), size = bb.getSize(new THREE.Vector3());
    o.scale.multiplyScalar(Math.min(1, maxSize / Math.max(size.x, size.z)));
    o.updateMatrixWorld(true);
    const bb2 = new THREE.Box3().setFromObject(o), c = bb2.getCenter(new THREE.Vector3());
    o.position.sub(new THREE.Vector3(c.x, bb2.min.y, c.z));
    const g = new THREE.Group();
    g.add(o);
    return g;
  }

  /** Board cell under a canvas pixel, or undefined. */
  pickCell(px: number, py: number, w: number, h: number): Pt | undefined {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((px / w) * 2 - 1, -(py / h) * 2 + 1), this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return undefined;
    const p = { x: Math.floor(hit.x / CELL), y: Math.floor(hit.z / CELL) };
    const b = this.board;
    return b && p.x >= 0 && p.y >= 0 && p.x < b.w && p.y < b.h && b.cells[p.y * b.w + p.x] !== 'void' ? p : undefined;
  }

  /** Where a world point lands on the canvas (0..w, 0..h): floating texts, bars. */
  toScreen(v: THREE.Vector3, w: number, h: number) {
    const p = v.clone().project(this.camera);
    return { x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h };
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.tickRain(dt);
    this.onFrame?.(dt);
    this.composer.render(dt);
  }
}
