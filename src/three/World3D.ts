import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, pick, type Rng } from '../core/rng';
import { onSettingsChange, settings, type GraphicsQuality } from '../core/settings';
import { AUTO_SAMPLES, AUTO_SKIP, autoQuality } from './quality';
import type { Board, Pt } from '../tactics/types';
import { StylePass, stylizeScene, type ScreenFx } from './stylize';
import { disposeTree } from './dispose';
import { KitLibrary, fitObject } from './street/kit';
import { StreetLife } from './street/life';
import { GroundReflection, REFLECT_LAYER } from './street/reflect';
import { themeOf, type Theme } from './street/styles';
import { fontsReady, glowTexture } from './street/paint';
import { paintGround, paintOuter } from './street/ground';
import { RANGE, buildCables, buildCity, buildPools, planCity, reflective, type StreetCtx } from './street/city';
import { carModel, dressStreet, makeHole, makeProp, trashBin } from './street/props';
import { HazardDecals, WarningDecals, type HazardView, type WarningView } from './street/hazards';

/** One board cell in metres: characters are ~1.8 m tall, props keep their real size. */
export const CELL = 1.5;
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
    this.composer.addPass(this.smaa);
    this.composer.setSize(w, h);
    this.reflection.setSize(w, h);
    this.reflection.enabled = false;
    this.size = { w, h };
    this.useQuality(settings().quality);
    onSettingsChange(st => this.useQuality(st.quality));
  }

  private smaa = new SMAAPass();
  private size = { w: 1, h: 1 };
  /** The quality in effect ('auto' resolves to one of them, see quality.ts). */
  private quality: 'high' | 'low' = 'high';
  /** What 'auto' decided this session, once measured. */
  private autoPick?: 'high' | 'low';
  /** Frame times being sampled for 'auto' (after `skip` frames of loading). */
  private autoRun?: { skip: number; ms: number[]; last: number };
  private frameNo = 0;
  private qualitySet = false;

  private useQuality(q: GraphicsQuality) {
    if (q !== 'auto') { this.autoRun = undefined; this.setQuality(q); return; }
    if (!this.autoPick) this.autoRun ??= { skip: AUTO_SKIP, ms: [], last: 0 };
    this.setQuality(this.autoPick ?? 'high');
  }

  /**
   * Low: at most one 3D pixel per CSS pixel (high-density screens), and the
   * wet reflection and the shadow map redrawn in turn, one frame each (see frame()). A lower
   * resolution was tried: slower on an Intel iGPU (the canvas then gets scaled when composited).
   */
  private setQuality(q: 'high' | 'low') {
    if (q === this.quality && this.qualitySet) return;
    this.qualitySet = true;
    this.quality = q;
    const pr = Math.min(q === 'low' ? 1 : 2, window.devicePixelRatio);
    this.smaa.enabled = true; // even in low: without it the ink outlines and hair of the characters turn jagged
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.resizeTargets(this.size.w, this.size.h);
  }

  private resizeTargets(w: number, h: number) {
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.reflection.setSize(w, h);
  }

  /** For 'auto': times frames once the place has settled, then picks the quality for the session. */
  private sampleAuto() {
    const a = this.autoRun!, now = performance.now(), dt = now - a.last;
    a.last = now;
    if (this.bake || a.skip-- > 0) return;
    a.ms.push(dt);
    if (a.ms.length < AUTO_SAMPLES) return;
    this.autoRun = undefined;
    this.autoPick = autoQuality(a.ms);
    if (settings().quality === 'auto') this.setQuality(this.autoPick);
  }

  resize(w: number, h: number) {
    this.resizeTargets(w, h);
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
    disposeTree(this.boardGroup);
    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);
    this.rain = undefined;
    this.splash = undefined;
    this.life = undefined;
    this.hazards = undefined;
    this.warnings = undefined;
    this.reflection.enabled = false;
    this.style.setInk(0.85, 0.7);
    this.bake = undefined;
    if (this.autoRun) { this.autoRun.skip = AUTO_SKIP; this.autoRun.ms = []; } // loading is not a frame time
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
    this.bakeShadows();
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
    mat.userData.wet = paint.wet;
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
    outMat.userData.wet = new THREE.CanvasTexture(wc);
    outMat.userData.shaderHook = this.reflection.groundHook(outMat.userData.wet);
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

  /** Arena hazards (traps, medkits…) drawn on the current board. */
  private hazards?: HazardDecals;
  setHazards(list: HazardView[]) {
    if (!this.hazards && !list.length) return;
    this.hazards ??= new HazardDecals(this.boardGroup, (p, y) => this.cellPos(p, y), CELL);
    this.hazards.sync(list);
  }

  /** Cells where a boss's announced attack will land (striped, throbbing). */
  private warnings?: WarningDecals;
  setWarnings(list: WarningView[]) {
    if (!this.warnings && !list.length) return;
    this.warnings ??= new WarningDecals(this.boardGroup, (p, y) => this.cellPos(p, y), CELL);
    this.warnings.sync(list);
  }

  private layers = new Map<string, THREE.InstancedMesh>();
  private layerGeo = new THREE.PlaneGeometry(CELL * 0.92, CELL * 0.92).rotateX(-Math.PI / 2);
  private layerMat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true });
  // A bright frame around each overlay cell, so ranges read against the patterned street tiles.
  private frames = new Map<string, THREE.InstancedMesh>();
  private frameGeo = (() => {
    const o = CELL * 0.46, i = CELL * 0.38;
    const sh = new THREE.Shape([new THREE.Vector2(-o, -o), new THREE.Vector2(o, -o), new THREE.Vector2(o, o), new THREE.Vector2(-o, o)]);
    sh.holes.push(new THREE.Path([new THREE.Vector2(-i, -i), new THREE.Vector2(-i, i), new THREE.Vector2(i, i), new THREE.Vector2(i, -i)]));
    return new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2);
  })();

  /** Coloured cells on the ground, one named layer each (range, hover, markers, flashes). */
  setOverlay(layer: string, cells: { p: Pt; color: number; alpha: number; edge?: boolean }[], order = 0) {
    const old = this.layers.get(layer);
    if (old) { this.scene.remove(old); old.dispose(); this.layers.delete(layer); }
    const oldF = this.frames.get(layer);
    if (oldF) { this.scene.remove(oldF); oldF.dispose(); this.frames.delete(layer); }
    if (!cells.length) return;
    const m = new THREE.InstancedMesh(this.layerGeo, this.layerMat, cells.length);
    // Only cells flagged `edge` (a spell's range) get the frame and a slightly stronger fill.
    const edged = cells.filter(c => c.edge);
    const f = edged.length ? new THREE.InstancedMesh(this.frameGeo, this.layerMat, edged.length) : undefined;
    const mx = new THREE.Matrix4(), col = new THREE.Color();
    cells.forEach((c, i) => {
      mx.makeTranslation(this.cellPos(c.p, 0.025 + order * 0.004));
      m.setMatrixAt(i, mx);
      m.setColorAt(i, col.setHex(c.color).multiplyScalar(c.alpha * (c.edge ? 0.7 : 0.55)));
    });
    edged.forEach((c, i) => {
      mx.makeTranslation(this.cellPos(c.p, 0.027 + order * 0.004));
      f!.setMatrixAt(i, mx);
      f!.setColorAt(i, col.setHex(c.color).multiplyScalar(c.alpha * 1.4));
    });
    m.renderOrder = 2 + order;
    this.scene.add(m);
    this.layers.set(layer, m);
    if (f) { f.renderOrder = 2 + order; this.scene.add(f); this.frames.set(layer, f); }
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
   * ('kenney/…'), or a street build ('street:crate', 'street:trash'…).
   */
  async propModel(id: string, maxSize = CELL * 0.8): Promise<THREE.Object3D> {
    let o: THREE.Object3D;
    if (id.startsWith('street:')) {
      const kind = id.slice(7);
      const ctx: StreetCtx = { group: this.boardGroup, theme: this.theme ?? themeOf('avenue'), rng: createRng(Math.floor(Math.random() * 1e9)), kit: this.kit, life: this.life ?? new StreetLife(this.boardGroup), CELL, glows: [], pools: [] };
      o = kind === 'trash' ? trashBin(CELL) : (await makeProp(ctx, kind, CELL)) ?? trashBin(CELL);
    } else o = await this.kit.clone(id);
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
   * With the "reduced screen effects" option: only a faint colour split, no negative, flash or shake.
   */
  impact(strength: number, u = 0.5, v = 0.5, color = 0xffffff) {
    const fx = this.style.fx;
    fx.centre.set(u, 1 - v);
    if (settings().reduceFx) { fx.aberration = Math.max(fx.aberration, 2 + strength * 3); return; }
    fx.aberration = Math.max(fx.aberration, 4 + strength * 10);
    if (strength >= 0.7) { fx.invert = 1; this.invertHold = 0.05; }
    fx.flash = Math.max(fx.flash, 0.12 + strength * 0.3);
    fx.flashColor.setHex(color);
    this.shake(0.05 + strength * 0.22);
  }

  /** Camera shake (metres at zoom 1), decays quickly. Off with the "reduced screen effects" option. */
  shake(amp: number) { if (!settings().reduceFx) this.shakeAmp = Math.max(this.shakeAmp, amp); }

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

  /**
   * The pieces of the place just built, watched before they are merged (see `bakeShadows`):
   * each mesh with its world matrix at the start of the watch.
   */
  private bake?: { group: THREE.Group; frames: number; list: { mesh: THREE.Mesh; m: THREE.Matrix4 }[] };

  /**
   * Called once a place is built. A street was ~1400 draws a frame (shadow map, wet reflection,
   * picture), at ~10 µs a draw on an integrated GPU: after a second of watching, the pieces that
   * never moved are merged.
   * - Shadow casters become one depth-only mesh drawn in the shadow pass only.
   * - Pieces sharing a material (and layers, shadow receiving, draw order) become one mesh per
   *   ~12 m tile of the street, so off-screen tiles are still culled; the originals stay in the
   *   scene on no layer (never drawn, children untouched).
   * Pieces still moving (swaying cables, fans, bobbing drones), cut-outs, see-through glass,
   * multi-material, skinned or instanced meshes, and everything added later (characters, units,
   * hazards) are left as they are, so the picture does not change.
   */
  bakeShadows() {
    const g = this.boardGroup;
    g.updateMatrixWorld(true);
    const list: { mesh: THREE.Mesh; m: THREE.Matrix4 }[] = [];
    g.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
      const geo = mesh.geometry;
      if (Object.keys(geo.morphAttributes).length || !geo.attributes.position || geo.drawRange.start !== 0 || geo.drawRange.count !== Infinity) return;
      list.push({ mesh, m: mesh.matrixWorld.clone() });
    });
    this.bake = { group: g, frames: 0, list };
  }

  private finishBake() {
    const b = this.bake!;
    this.bake = undefined;
    const g = b.group;
    if (g !== this.boardGroup) return;
    const shown = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p && p !== g; p = p.parent) if (!p.visible) return false; return true; };
    const inside = (o: THREE.Object3D) => { let p = o.parent; while (p && p !== g) p = p.parent; return p === g; };
    const still = b.list.filter(({ mesh, m }) => inside(mesh) && shown(mesh) && mesh.matrixWorld.equals(m)).map(x => x.mesh);
    const toLocal = g.matrixWorld.clone().invert();

    // Shadow casters: one depth-only mesh per shadow side.
    const bySide = new Map<THREE.Side, THREE.Mesh[]>();
    for (const mesh of still) {
      if (!mesh.castShadow || mesh.customDepthMaterial) continue;
      const side = shadowSideOf(mesh);
      if (side === undefined) continue;
      let a = bySide.get(side);
      if (!a) bySide.set(side, (a = []));
      a.push(mesh);
    }
    for (const [side, meshes] of bySide) {
      if (meshes.length < 2) continue;
      const geo = bakeGeometry(meshes, toLocal, ['position']);
      meshes.forEach(m => { m.castShadow = false; });
      const proxy = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, shadowSide: side }));
      proxy.name = 'shadow-proxy';
      proxy.castShadow = true;
      proxy.frustumCulled = false;
      proxy.matrixAutoUpdate = false;
      // Drawn by the shadow pass only: the main pass gets an empty range.
      proxy.onBeforeShadow = () => { geo.drawRange.count = Infinity; };
      proxy.onBeforeRender = () => { geo.drawRange.count = 0; };
      g.add(proxy);
    }

    // The picture and the reflection: one mesh per material and tile.
    const TILE = 12, c = new THREE.Vector3(), batches = new Map<string, THREE.Mesh[]>();
    for (const mesh of still) {
      const mat = mesh.material as THREE.Material;
      if (Array.isArray(mesh.material) || mesh.castShadow || !mat.visible || mesh.layers.mask === 0) continue;
      if (mat.transparent && mat.blending !== THREE.AdditiveBlending) continue; // see-through panes keep their sorting
      if (mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || mesh.geometry.attributes.tangent) continue;
      const geo = mesh.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      c.copy(geo.boundingSphere!.center).applyMatrix4(mesh.matrixWorld);
      const attrs = Object.keys(geo.attributes).sort().map(k => `${k}:${geo.attributes[k].itemSize}`).join(',');
      const key = `${mat.uuid}|${mesh.layers.mask}|${mesh.receiveShadow}|${mesh.renderOrder}|${attrs}|${Math.floor(c.x / TILE)},${Math.floor(c.z / TILE)}`;
      let a = batches.get(key);
      if (!a) batches.set(key, (a = []));
      a.push(mesh);
    }
    for (const meshes of batches.values()) {
      if (meshes.length < 2) continue;
      const first = meshes[0];
      const merged = new THREE.Mesh(bakeGeometry(meshes, toLocal, Object.keys(first.geometry.attributes)), first.material);
      merged.name = 'batch';
      merged.layers.mask = first.layers.mask;
      merged.receiveShadow = first.receiveShadow;
      merged.renderOrder = first.renderOrder;
      merged.matrixAutoUpdate = false;
      merged.userData.parts = meshes;
      for (const m of meshes) {
        m.layers.mask = 0;
        if (!m.geometry.userData.shared) m.geometry.dispose(); // its GPU copy (the CPU one stays for the batch's sake)
      }
      g.add(merged);
    }
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.lastDt = dt;
    this.tickRain(dt);
    this.life?.tick(dt);
    this.hazards?.tick(dt);
    this.warnings?.tick(dt);
    this.decayFx(dt);
    this.onFrame?.(dt);
    stylizeScene(this.scene);
    // Low quality: odd frames redraw the shadow map, even ones the wet reflection.
    const low = this.quality === 'low', odd = (++this.frameNo & 1) === 1;
    this.reflection.skip = low && odd;
    this.renderer.shadowMap.autoUpdate = !low;
    if (low && odd) this.renderer.shadowMap.needsUpdate = true;
    this.composer.render(dt);
    if (this.autoRun) this.sampleAuto();
    if (this.bake && ++this.bake.frames >= 60) this.finishBake();
  }
}

const DEPTH_SIDE: Record<THREE.Side, THREE.Side> = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };

/**
 * The face side a mesh draws into the shadow map (as WebGLShadowMap picks it), or undefined if its
 * shadow is more than plain depth (cut-outs, displacement, clipping, hidden or mixed materials).
 */
function shadowSideOf(mesh: THREE.Mesh): THREE.Side | undefined {
  const all = Array.isArray(mesh.material) ? mesh.geometry.groups.map(gr => (mesh.material as THREE.Material[])[gr.materialIndex ?? 0]) : [mesh.material];
  let side: THREE.Side | undefined;
  for (const m of all) {
    const x = m as THREE.MeshStandardMaterial;
    if (!x || !x.visible || x.wireframe || x.alphaTest > 0 || x.alphaToCoverage || (x.displacementMap && x.displacementScale !== 0) || x.clippingPlanes?.length) return undefined;
    const s = x.shadowSide ?? DEPTH_SIDE[x.side];
    if (side !== undefined && s !== side) return undefined;
    side = s;
  }
  return side;
}

/**
 * The meshes' geometries in `toLocal` space, in one indexed geometry with the attributes `names`
 * (positions and normals transformed, the rest copied; mirrored pieces re-wound).
 */
function bakeGeometry(meshes: THREE.Mesh[], toLocal: THREE.Matrix4, names: string[]) {
  let nv = 0, ni = 0;
  for (const m of meshes) { const geo = m.geometry; nv += geo.attributes.position.count; ni += geo.index ? geo.index.count : geo.attributes.position.count; }
  const out = names.map(n => { const size = meshes[0].geometry.attributes[n].itemSize; return { n, size, data: new Float32Array(nv * size) }; });
  const idx = new Uint32Array(ni), mx = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
  let ov = 0, oi = 0;
  for (const m of meshes) {
    const geo = m.geometry, count = geo.attributes.position.count, index = geo.index;
    mx.multiplyMatrices(toLocal, m.matrixWorld);
    nm.getNormalMatrix(mx);
    for (const { n, size, data } of out) {
      const a = geo.attributes[n];
      for (let i = 0; i < count; i++) {
        const o = (ov + i) * size;
        if (n === 'position' || n === 'normal') {
          v.fromBufferAttribute(a, i);
          if (n === 'position') v.applyMatrix4(mx); else v.applyMatrix3(nm).normalize();
          data[o] = v.x; data[o + 1] = v.y; data[o + 2] = v.z;
        } else for (let k = 0; k < size; k++) data[o + k] = a.getComponent(i, k);
      }
    }
    // A mirrored piece turns its triangles over: swap two corners to keep the faces the same way out.
    const flip = mx.determinant() < 0, n = index ? index.count : count;
    for (let i = 0; i < n; i += 3) {
      const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
      idx[oi + i] = ov + a; idx[oi + i + 1] = ov + (flip ? c : b); idx[oi + i + 2] = ov + (flip ? b : c);
    }
    ov += count; oi += n;
  }
  const geo = new THREE.BufferGeometry();
  for (const { n, size, data } of out) geo.setAttribute(n, new THREE.BufferAttribute(data, size));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}
