import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, pick, type Rng } from '../core/rng';
import type { Board, Pt } from '../tactics/types';
import { StylePass, stylizeScene, type ScreenFx } from './stylize';
import { KitLibrary, fitObject } from './street/kit';
import { StreetLife } from './street/life';
import { GroundReflection, REFLECT_LAYER } from './street/reflect';
import { themeOf, type Theme } from './street/styles';
import { fontsReady, glowTexture } from './street/paint';
import { paintGround, paintOuter } from './street/ground';
import { RANGE, buildCables, buildCity, buildPools, planCity, reflective, type StreetCtx } from './street/city';
import { carModel, dressStreet, makeHole, makeProp, trashBin } from './street/props';

/** One board cell in metres: characters are ~1.8 m tall, props keep their real size. */
export const CELL = 1.5;
const PH = 'assets/ph/';
/** Coloured point lights of a street: always this many (a changing light count recompiles every shader). */
const POINT_LIGHTS = 8;
/** Distance from the camera to its focus point (the fog starts behind the board). */
const CAM_DIST = 60;

/**
 * The 3D street of a sector, in the anime-cyberpunk look: low-poly kit models recoloured for the
 * night, custom facades covered in neon signs, holograms and lit windows, a painted wet ground
 * that reflects the neon, steam, rain and cables, cel shading with ink lines and bloom. The camera
 * is an orthographic isometric view: board +x goes down-right on screen and +y down-left, like
 * the 2D board. Interiors reuse the same renderer (resetBoard, pbr, piece, propModel).
 */
export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  private composer: EffectComposer;
  private style: StylePass;
  /** Glow on bright things: strong in the wet street, softer indoors. */
  bloom: UnrealBloomPass;
  private gltf = new GLTFLoader();
  private models = new Map<string, Promise<THREE.Group>>();
  private tex = new THREE.TextureLoader();
  readonly kit = new KitLibrary(this.gltf);
  private reflection = new GroundReflection(0.42);
  /** Everything of the current place (street or interior); replaced when a new one is built. */
  boardGroup = new THREE.Group();
  rain?: THREE.LineSegments;
  private life?: StreetLife;
  private clock = new THREE.Clock();
  private board?: Board;
  /** Called every frame before rendering (units animate here). */
  onFrame?: (dt: number) => void;

  constructor(readonly canvas: HTMLCanvasElement, w: number, h: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(w, h, false);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 200);
    this.camera.layers.enable(0);
    this.scene.background = new THREE.Color(0x0b0820);
    this.scene.fog = new THREE.FogExp2(0x120a24, 0.022);
    this.scene.add(this.boardGroup);
    this.composer = new EffectComposer(this.renderer);
    this.style = new StylePass(this.scene, this.camera);
    this.style.beforeRender = r => this.reflection.update(r, this.scene, this.camera, this.lastDt);
    this.composer.addPass(this.style);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new SMAAPass());
    this.composer.setSize(w, h);
    this.reflection.setSize(w, h);
    this.reflection.enabled = false;
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.reflection.setSize(w, h);
    this.frame();
  }

  /**
   * Soft ambient light for the materials: a generated night sky (indigo above, a magenta and cyan
   * glow of the city at the horizon). No file to load.
   */
  async loadEnvironment() {
    const env = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP; void main() {
        float y = vP.y;
        vec3 top = vec3(0.05, 0.03, 0.16), hor = vec3(0.45, 0.12, 0.42), low = vec3(0.06, 0.04, 0.12);
        vec3 c = y > 0.0 ? mix(hor, top, smoothstep(0.0, 0.6, y)) : mix(hor, low, smoothstep(0.0, 0.3, -y));
        c += vec3(0.0, 0.35, 0.45) * pow(max(0.0, dot(vP, normalize(vec3(-1.0, 0.15, 0.3)))), 6.0);
        c += vec3(0.6, 0.1, 0.3) * pow(max(0.0, dot(vP, normalize(vec3(0.7, 0.2, -0.6)))), 5.0);
        gl_FragColor = vec4(c, 1.0); }`,
    }));
    env.add(sky);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(env, 0.04).texture;
    this.scene.environmentIntensity = 0.7;
    pm.dispose();
    sky.geometry.dispose(); (sky.material as THREE.Material).dispose();
  }

  /** A Poly Haven model (interiors) or a kit model ('kenney/…', 'kaykit/…'). */
  private model(id: string): Promise<THREE.Group> {
    if (KitLibrary.isKitPath(id)) return this.kit.load(id);
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

  /** A photo-textured material (interiors; flattened to paint by the style). */
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
  private shakeAmp = 0;
  private shakeT = 0;
  private placeCamera() {
    this.camera.position.copy(this.focus).addScaledVector(this.camDir, CAM_DIST);
    this.camera.lookAt(this.focus);
    if (this.shakeAmp > 0.001) {
      // Shake in the screen plane (world units scaled by the zoom, so it feels the same zoomed in).
      const right = new THREE.Vector3(1, 0, -1).normalize(), up = new THREE.Vector3().crossVectors(right, this.camDir).normalize();
      const k = this.shakeAmp / this.camera.zoom, t = this.shakeT;
      this.camera.position.addScaledVector(right, Math.sin(t * 91) * k).addScaledVector(up, Math.cos(t * 73) * k * 0.8);
    }
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

  /**
   * A new, empty place. The old one leaves the scene; a build still loading for it keeps adding to
   * its own detached group, so a place left early (menu, quick scene change) never leaks into the next.
   */
  resetBoard() {
    this.scene.remove(this.boardGroup);
    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);
    this.rain = undefined;
    this.splash = undefined;
    this.life = undefined;
    this.reflection.enabled = false;
    this.style.setInk(0.85, 0.7);
    return this.boardGroup;
  }

  /** Builds the street of a board: ground, buildings, signs, props, lights, puddles, rain. */
  async buildBoard(b: Board, seed: number) {
    this.board = b;
    const g = this.resetBoard();
    const theme = themeOf(b.style);
    this.theme = theme;
    this.renderer.toneMappingExposure = 1.25;
    this.bloom.strength = 0.6; this.bloom.radius = 0.55; this.bloom.threshold = 0.86;
    this.scene.environmentIntensity = 0.55;
    this.scene.fog = new THREE.Fog(theme.fog, CAM_DIST + 4, CAM_DIST + 62);
    this.scene.background = new THREE.Color(0x0b0820);
    this.raised.clear();
    const rng = createRng(seed);
    await fontsReady();
    if (this.boardGroup !== g) return;
    const life = new StreetLife(g);
    this.life = life;
    const ctx: StreetCtx = { group: g, theme, rng, kit: this.kit, life, CELL, glows: [], pools: [] };
    const cellOn = (x: number, y: number) => x >= 0 && y >= 0 && x < b.w && y < b.h && b.cells[y * b.w + x] !== 'void';
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (cellOn(x, y) && (!cellOn(x, y - 1) || !cellOn(x - 1, y)) && b.props[y * b.w + x] !== 'water') this.raised.add(`${x},${y}`);

    this.buildGround(b, theme, rng);
    const plan = planCity(b, rng, theme, CELL);
    await buildCity(ctx, plan);
    if (this.boardGroup !== g) return;
    buildCables(ctx, plan, b);
    await this.buildProps(b, ctx);
    if (this.boardGroup !== g) return;
    await dressStreet(ctx, plan, b);
    if (this.boardGroup !== g) return;
    buildPools(ctx);
    this.buildLights(b, ctx);
    if (theme.rain) this.buildRain(b);
    this.reflection.enabled = true;
    this.reflection.uniforms.uReflStrength.value = 0.9 + theme.wet * 0.5;
  }

  private theme?: Theme;

  /** The painted ground: merged cell tiles on the board (kerb on the raised back row), the street around. */
  private buildGround(b: Board, theme: Theme, rng: Rng) {
    const g = this.boardGroup;
    const cellOn = (x: number, y: number) => x >= 0 && y >= 0 && x < b.w && y < b.h && b.cells[y * b.w + x] !== 'void';
    const paint = paintGround(b, theme, rng, CELL, this.raised);
    const mat = new THREE.MeshStandardMaterial({ map: paint.map, roughness: 1, emissiveMap: paint.glow, emissive: paint.glow ? 0xffffff : 0x000000, emissiveIntensity: 1.6 });
    mat.userData.shaderHook = this.reflection.groundHook(paint.wet);
    mat.userData.shaderKey = 'wet';
    const tops: THREE.BufferGeometry[] = [], sides: THREE.BufferGeometry[] = [];
    const bw = b.w * CELL, bh = b.h * CELL;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      if (!cellOn(x, y)) continue;
      if (b.props[y * b.w + x] === 'water') continue;
      const top = this.raised.has(`${x},${y}`) ? 0.06 : 0;
      const p = new THREE.PlaneGeometry(CELL, CELL).rotateX(-Math.PI / 2).translate((x + 0.5) * CELL, top, (y + 0.5) * CELL);
      const uv = p.attributes.uv, pos = p.attributes.position;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / bw, 1 - pos.getZ(i) / bh);
      tops.push(p);
      if (top > 0) sides.push(new THREE.BoxGeometry(CELL, top + 0.02, CELL).translate((x + 0.5) * CELL, top / 2 - 0.02, (y + 0.5) * CELL));
    }
    const ground = new THREE.Mesh(mergeGeometries(tops), mat);
    ground.receiveShadow = true;
    g.add(ground);
    if (sides.length) {
      const s = new THREE.Mesh(mergeGeometries(sides), new THREE.MeshStandardMaterial({ color: 0x8a86aa, roughness: 1 }));
      s.receiveShadow = true;
      g.add(s);
    }
    // The tactical grid, very faint: lines between cells.
    const lines: number[] = [];
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      if (!cellOn(x, y)) continue;
      const x0 = x * CELL, z0 = y * CELL, h = 0.015 + this.groundY({ x, y });
      lines.push(x0, h, z0, x0 + CELL, h, z0, x0, h, z0, x0, h, z0 + CELL);
      if (!cellOn(x + 1, y)) lines.push(x0 + CELL, h, z0, x0 + CELL, h, z0 + CELL);
      if (!cellOn(x, y + 1)) lines.push(x0, h, z0 + CELL, x0 + CELL, h, z0 + CELL);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x9a96ff, transparent: true, opacity: 0.16, depthWrite: false })));
    // Board edge: a thin neon line where the play area ends (reads as the kerb at night).
    // The street around the board, into the fog (it reflects too, a little).
    const size = (Math.max(b.w, b.h) + RANGE * 2 + 8) * CELL;
    const outMat = new THREE.MeshStandardMaterial({ map: paintOuter(theme, rng, size), roughness: 1 });
    const { c: wc } = { c: document.createElement('canvas') };
    wc.width = wc.height = 4;
    const wctx = wc.getContext('2d')!; wctx.fillStyle = `rgb(${Math.round(60 * theme.wet)},0,0)`; wctx.fillRect(0, 0, 4, 4);
    outMat.userData.shaderHook = this.reflection.groundHook(new THREE.CanvasTexture(wc));
    outMat.userData.shaderKey = 'wet';
    const out = new THREE.Mesh(new THREE.PlaneGeometry(size, size), outMat);
    out.rotation.x = -Math.PI / 2;
    out.position.set(bw / 2, -0.005, bh / 2);
    out.receiveShadow = true;
    g.add(out);
    // Dock water: a dark, very reflective strip below the quay.
    const water = b.props.some(p => p === 'water');
    if (water) {
      const wcv = document.createElement('canvas'); wcv.width = wcv.height = 4;
      const w2 = wcv.getContext('2d')!; w2.fillStyle = '#fff'; w2.fillRect(0, 0, 4, 4);
      const wm = new THREE.MeshStandardMaterial({ color: 0x101838, roughness: 1, map: new THREE.CanvasTexture(wcv) });
      wm.userData.shaderHook = this.reflection.groundHook(new THREE.CanvasTexture(wcv));
      wm.userData.shaderKey = 'wet';
      const wmesh = new THREE.Mesh(new THREE.PlaneGeometry(size, CELL * (RANGE + 2)), wm);
      wmesh.rotation.x = -Math.PI / 2;
      wmesh.position.set(bw / 2, -0.35, bh - CELL + CELL * (RANGE + 2) / 2);
      g.add(wmesh);
      // Quay wall face.
      const wall = new THREE.Mesh(new THREE.BoxGeometry(size, 0.4, 0.1), new THREE.MeshStandardMaterial({ color: 0x3a3852, roughness: 1 }));
      wall.position.set(bw / 2, -0.17, bh - CELL);
      g.add(wall);
    }
  }

  /** The board's blocking props, fitted to their cells; holes; cars along two cells. */
  private async buildProps(b: Board, ctx: StreetCtx) {
    const group = this.boardGroup;
    const { rng } = ctx;
    const jobs: Promise<void>[] = [];
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const prop = b.props[y * b.w + x], cell = b.cells[y * b.w + x];
      if (!prop || prop === 'car-tail') continue;
      const at = this.cellPos({ x, y });
      if (cell === 'hole') {
        const o = makeHole(ctx, prop, CELL);
        if (o) { o.position.copy(at); group.add(o); }
        if (prop === 'grate' || prop === 'manhole') ctx.life.vent(at.clone().setY(0.05), prop === 'grate' ? 1 : 0.6, 2.6);
        continue;
      }
      if (prop.startsWith('car-')) {
        const path = carModel(ctx);
        const flip = rng() < 0.5;
        jobs.push(this.kit.clone(path).then(o => {
          o.rotation.y = Math.PI / 2 + (flip ? Math.PI : 0);
          fitObject(o, CELL * 1.92, CELL * 1.0);
          const holder = new THREE.Group();
          holder.add(o);
          holder.position.copy(this.cellPos({ x: x + 0.5, y }));
          // Headlights and tail lights as glows (cars are part of the reflections).
          const front = flip ? -1 : 1;
          for (const [dx, col, k] of [[front * 1.3, 0xfff0c0, 0.55], [-front * 1.3, 0xff2a3a, 0.4]] as [number, number, number][]) {
            const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: k }));
            s.scale.setScalar(0.9); s.position.set(dx, 0.55, 0);
            holder.add(s);
          }
          group.add(reflective(holder));
        }));
        continue;
      }
      jobs.push(makeProp(ctx, prop, CELL, at).then(o => {
        if (!o) return;
        if (prop !== 'dumpster' && prop !== 'barrier') o.rotation.y += (Math.floor(rng() * 4) * Math.PI) / 2;
        o.position.add(at);
        group.add(prop === 'lamp' || prop === 'vending' || prop === 'totem' ? reflective(o) : o);
        if (prop === 'lamp') { ctx.glows.push({ p: at.clone().setY(4.2), color: 0xffc890, power: 3 }); ctx.pools.push({ x: at.x, z: at.z, r: 3.4, color: 0xffb070, a: 0.3 }); }
        if (prop === 'totem') ctx.pools.push({ x: at.x, z: at.z, r: 4, color: ctx.theme.neon[0], a: 0.35 });
      }));
    }
    await Promise.all(jobs);
  }

  /** Moonlight with violet shadows, the night sky, coloured neon point lights. */
  private lights: THREE.PointLight[] = [];
  private buildLights(b: Board, ctx: StreetCtx) {
    const g = this.boardGroup, theme = ctx.theme;
    const hemi = new THREE.HemisphereLight(theme.sky, theme.bounce, 1.5);
    const moon = new THREE.DirectionalLight(0xa8c8ff, 1.5);
    const cx = b.w * CELL / 2, cz = b.h * CELL / 2;
    moon.position.set(cx + 8, 24, cz + 16);
    moon.target.position.set(cx, 0, cz);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const r = Math.max(b.w, b.h) * CELL * 0.9;
    Object.assign(moon.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 90 });
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.03;
    // A cool rim from behind the buildings, so silhouettes catch a line of light.
    const rim = new THREE.DirectionalLight(0xff5ab8, 0.7);
    rim.position.set(cx - 20, 14, cz - 18);
    rim.target.position.set(cx, 0, cz);
    g.add(hemi, moon, moon.target, rim, rim.target);
    // The strongest glows become real lights, spread out over the street.
    const picked: { p: THREE.Vector3; color: number; power: number }[] = [];
    const sorted = [...ctx.glows].sort((a, c) => c.power - a.power);
    const near = (p: THREE.Vector3) => p.x > -6 && p.z > -6 && p.x < b.w * CELL + 6 && p.z < b.h * CELL + 6;
    for (const gl of sorted) {
      if (picked.length >= POINT_LIGHTS) break;
      if (!near(gl.p) || picked.some(o => o.p.distanceTo(gl.p) < 5.5)) continue;
      picked.push(gl);
    }
    this.lights = [];
    for (let i = 0; i < POINT_LIGHTS; i++) {
      const gl = picked[i];
      const l = new THREE.PointLight(gl?.color ?? 0, gl ? 5 + gl.power * 2 : 0, 9, 1.8);
      if (gl) l.position.copy(gl.p);
      g.add(l);
      this.lights.push(l);
    }
    g.traverse(o => { if ((o as THREE.Light).isLight) o.layers.enable(REFLECT_LAYER); });
  }

  private rainVel: Float32Array = new Float32Array(0);
  private splash?: THREE.InstancedMesh;
  private splashT: Float32Array = new Float32Array(0);
  private buildRain(b: Board) {
    const N = 1300, pos = new Float32Array(N * 6), W = b.w * CELL + 14, D = b.h * CELL + 14;
    this.rainVel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * W - 7, y = Math.random() * 16, z = Math.random() * D - 7;
      pos.set([x, y, z, x + 0.04, y - 0.55, z + 0.02], i * 6);
      this.rainVel[i] = 15 + Math.random() * 6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xb8c8ff, transparent: true, opacity: 0.32, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.boardGroup.add(this.rain);
    // Splashes: little rings that open on the ground.
    const ring = new THREE.RingGeometry(0.05, 0.065, 12).rotateX(-Math.PI / 2);
    const M = 90;
    this.splash = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0xc8d8ff, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false }), M);
    this.splash.frustumCulled = false;
    this.splashT = new Float32Array(M).map(() => Math.random());
    this.boardGroup.add(this.splash);
  }

  private tickRain(dt: number) {
    if (this.rain) {
      const a = this.rain.geometry.attributes.position as THREE.BufferAttribute, arr = a.array as Float32Array;
      for (let i = 0; i < this.rainVel.length; i++) {
        const o = i * 6, d = this.rainVel[i] * dt;
        arr[o + 1] -= d; arr[o + 4] -= d;
        if (arr[o + 4] < 0) { arr[o + 1] += 16; arr[o + 4] += 16; }
      }
      a.needsUpdate = true;
    }
    const s = this.splash, b = this.board;
    if (s && b) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
      for (let i = 0; i < this.splashT.length; i++) {
        this.splashT[i] += dt * 2.2;
        if (this.splashT[i] >= 1) {
          this.splashT[i] = 0;
          const x = Math.floor(Math.random() * b.w), y = Math.floor(Math.random() * b.h);
          s.userData[i] = [(x + Math.random()) * CELL, 0.03 + this.groundY({ x, y }), (y + Math.random()) * CELL];
        }
        const at = s.userData[i] as number[] | undefined;
        if (!at) continue;
        const k = this.splashT[i];
        m.compose(p.set(at[0], at[1], at[2]), q, sc.setScalar(0.3 + k * 1.6));
        s.setMatrixAt(i, m);
      }
      s.instanceMatrix.needsUpdate = true;
    }
  }

  private layers = new Map<string, THREE.InstancedMesh>();
  private layerGeo = new THREE.PlaneGeometry(CELL * 0.92, CELL * 0.92).rotateX(-Math.PI / 2);
  private layerMat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true });

  /** Coloured cells on the ground, one named layer each (range, hover, markers, flashes). */
  setOverlay(layer: string, cells: { p: Pt; color: number; alpha: number }[], order = 0) {
    const old = this.layers.get(layer);
    if (old) { this.scene.remove(old); old.dispose(); this.layers.delete(layer); }
    if (!cells.length) return;
    const m = new THREE.InstancedMesh(this.layerGeo, this.layerMat, cells.length);
    const mx = new THREE.Matrix4(), col = new THREE.Color();
    cells.forEach((c, i) => {
      mx.makeTranslation(this.cellPos(c.p, 0.025 + order * 0.004));
      m.setMatrixAt(i, mx);
      m.setColorAt(i, col.setHex(c.color).multiplyScalar(c.alpha * 0.55));
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

  /**
   * A prop model centred on the origin with its base on y = 0, at most `maxSize` wide: a kit path
   * ('kenney/…'), a street build ('street:crate', 'street:trash'…) or a Poly Haven id (interiors).
   */
  async propModel(id: string, maxSize = CELL * 0.8): Promise<THREE.Object3D> {
    let o: THREE.Object3D;
    if (id.startsWith('street:')) {
      const kind = id.slice(7);
      const ctx: StreetCtx = { group: this.boardGroup, theme: this.theme ?? themeOf('avenue'), rng: createRng(Math.floor(Math.random() * 1e9)), kit: this.kit, life: this.life ?? new StreetLife(this.boardGroup), CELL, glows: [], pools: [] };
      o = kind === 'trash' ? trashBin(CELL) : (await makeProp(ctx, kind, CELL)) ?? trashBin(CELL);
    } else o = await this.piece(id);
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

  /** Screen effects of hits (flash, negative frame, colour split), decayed every frame. */
  get screenFx(): ScreenFx { return this.style.fx; }

  /**
   * An anime hit on the 3D picture: `strength` 0..1; at (u, v) in 0..1 screen space (top-left
   * origin). Big hits get a one-frame negative and a white flash, all get a colour split and shake.
   */
  impact(strength: number, u = 0.5, v = 0.5, color = 0xffffff) {
    const fx = this.style.fx;
    fx.centre.set(u, 1 - v);
    fx.aberration = Math.max(fx.aberration, 4 + strength * 10);
    if (strength >= 0.7) { fx.invert = 1; this.invertHold = 0.05; }
    fx.flash = Math.max(fx.flash, 0.12 + strength * 0.3);
    fx.flashColor.setHex(color);
    this.shake(0.05 + strength * 0.22);
  }

  /** Camera shake (metres at zoom 1), decays quickly. */
  shake(amp: number) { this.shakeAmp = Math.max(this.shakeAmp, amp); }

  private invertHold = 0;
  private lastDt = 0;
  private decayFx(dt: number) {
    const fx = this.style.fx;
    if (this.invertHold > 0) this.invertHold -= dt;
    else fx.invert = Math.max(0, fx.invert - dt * 14);
    fx.flash = Math.max(0, fx.flash - dt * 4.5);
    fx.aberration = Math.max(0, fx.aberration - dt * 40);
    if (this.shakeAmp > 0) {
      this.shakeT += dt;
      this.shakeAmp = Math.max(0, this.shakeAmp - dt * (0.6 + this.shakeAmp * 4));
      this.placeCamera();
    }
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.lastDt = dt;
    this.tickRain(dt);
    this.life?.tick(dt);
    this.decayFx(dt);
    this.onFrame?.(dt);
    stylizeScene(this.scene);
    this.composer.render(dt);
  }
}


