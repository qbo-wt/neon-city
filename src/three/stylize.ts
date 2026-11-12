import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * The anime look, applied on top of the models: cel-shaded light (bands one stop apart instead of
 * smooth gradients, violet shadows, a halftone screen in the darkest band), no glossy reflections,
 * and an ink outline around shapes and along creases (see StylePass).
 *
 * Every lit material of the scene goes through `stylizeScene` once before it is first drawn, so
 * models, rooms and characters need no special code. Emissive and unlit materials (neon, screens,
 * halos) are left as they are: they are the colour accents of the night. Low-poly kit palettes and
 * canvas-drawn textures are kept; only photo textures are painted down to a few flat colours.
 */
const doneMats = new WeakSet<THREE.Material>();
const doneTex = new WeakMap<THREE.Texture, THREE.Texture>();

const CEL = /* glsl */ `
{
  vec3 celBase = max(diffuseColor.rgb, vec3(0.004));
  vec3 celIrr = max(outgoingLight - totalEmissiveRadiance, vec3(0.0)) / celBase;
  float celE = max(max(celIrr.r, celIrr.g), celIrr.b);
  if (celE > 1e-4) {
    float celX = log2(celE / CEL_KEY), celI = floor(celX);
    float celQ = max(exp2(celI + smoothstep(0.4, 0.6, celX - celI)), 0.3);
    float celShadow = clamp(-celX * 0.5, 0.0, 1.0);
    vec3 celTint = mix(vec3(1.0), vec3(0.64, 0.52, 1.0), celShadow);
    vec2 celQd = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / 4.5;
    float celDot = 1.0 - smoothstep(0.2, 0.28, length(fract(celQd) - 0.5));
    celQ *= 1.0 - 0.2 * celDot * smoothstep(0.55, 0.95, celShadow);
    outgoingLight = celBase * (celIrr / celE) * celQ * CEL_KEY * celTint + totalEmissiveRadiance;
  }
  #ifdef CEL_RIM
  float celRim = smoothstep(0.45, 0.8, 1.0 - abs(dot(normal, normalize(vViewPosition))));
  outgoingLight += (celBase * 0.8 + vec3(0.12, 0.22, 0.32)) * celRim;
  #endif
}
#include <opaque_fragment>`;

/** Soft brush-like patches in world space, so flat colours are not dead flat (and never tile). */
const PAINT_HEAD = /* glsl */ `#include <common>
varying vec3 vCelW;
float celHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float celNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(celHash(i), celHash(i + vec2(1.0, 0.0)), f.x), mix(celHash(i + vec2(0.0, 1.0)), celHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;
const PAINT = /* glsl */ `#include <color_fragment>
{
  vec2 celP = vCelW.xz + vCelW.y * 0.37;
  float celN = celNoise(celP * 0.6) * 0.6 + celNoise(celP * 2.3 + 7.3) * 0.4;
  diffuseColor.rgb *= 0.9 + 0.2 * celN;
}`;

function celShader(shader: { vertexShader: string; fragmentShader: string }) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vCelW;')
    .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 celW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  celW = instanceMatrix * celW;
  #endif
  vCelW = (modelMatrix * celW).xyz;
}`);
  shader.fragmentShader = '#define CEL_KEY 0.3\n' + shader.fragmentShader
    .replace('#include <common>', PAINT_HEAD)
    .replace('#include <color_fragment>', PAINT)
    .replace('#include <opaque_fragment>', CEL);
}

/** Painted version of a photo texture: tiny, saturated, a few light levels. Undefined until loaded. */
function paintTexture(t: THREE.Texture, size: number, sat: number, contrast = 1): THREE.Texture | undefined {
  const hit = doneTex.get(t);
  if (hit) return hit;
  const img = t.image as (HTMLImageElement | ImageBitmap | HTMLCanvasElement | { data?: unknown }) | undefined;
  if (!img || 'data' in img) return undefined;
  const w0 = (img as HTMLImageElement).naturalWidth || (img as ImageBitmap).width, h0 = (img as HTMLImageElement).naturalHeight || (img as ImageBitmap).height;
  if (!w0 || !h0 || ((img as HTMLImageElement).complete === false)) return undefined;
  // Halve step by step (a single big downscale skips pixels and flickers).
  let src: CanvasImageSource = img as CanvasImageSource, w = w0, h = h0;
  while (Math.max(w, h) > size) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w / 2)); c.height = Math.max(1, Math.round(h / 2));
    c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
    src = c; w = c.width; h = c.height;
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h), d = px.data, col = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
  // Mean light level, so the contrast can be pulled towards it (a calm, painted surface).
  let mean = 0;
  for (let i = 0; i < d.length; i += 4) mean += (d[i] + d[i + 1] + d[i + 2]) / 765;
  mean /= d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    col.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace);
    col.getHSL(hsl, THREE.SRGBColorSpace);
    const s = Math.min(1, hsl.s * sat + 0.04), l = Math.round((mean + (hsl.l - mean) * contrast) * 7) / 7;
    col.setHSL(hsl.h, s, Math.min(0.92, Math.max(0.04, l)), THREE.SRGBColorSpace);
    const rgb = col.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
    d[i] = rgb.r * 255; d[i + 1] = rgb.g * 255; d[i + 2] = rgb.b * 255;
  }
  ctx.putImageData(px, 0, 0);
  const out = new THREE.CanvasTexture(c);
  out.colorSpace = t.colorSpace;
  out.flipY = t.flipY;
  out.wrapS = t.wrapS; out.wrapT = t.wrapT;
  out.repeat.copy(t.repeat); out.offset.copy(t.offset); out.rotation = t.rotation; out.center.copy(t.center);
  out.channel = t.channel;
  out.anisotropy = 1;
  doneTex.set(t, out);
  return out;
}

/** A Kenney / KayKit palette texture (flat colour swatches mapped by UV): never flattened. */
function isPalette(t: THREE.Texture) {
  if (t.userData?.palette) return true;
  const img = t.image as { src?: string; currentSrc?: string } | undefined;
  const src = img?.currentSrc || img?.src || '';
  return /colormap|furniturebits|\/kenney\/|\/kaykit\//i.test(src) || /colormap|furniturebits/i.test(t.name ?? '');
}

function stylizeMaterial(m: THREE.Material, skinned: boolean) {
  if (doneMats.has(m)) return;
  const s = m as THREE.MeshStandardMaterial;
  if (!s.isMeshStandardMaterial || s.userData.noStyle) { doneMats.add(m); return; }
  if (s.map && !(s.map as THREE.CanvasTexture).isCanvasTexture && !isPalette(s.map)) {
    // Characters keep a small painted texture (face, clothes); everything else becomes one flat colour.
    const painted = skinned ? paintTexture(s.map, 128, 1.15) : paintTexture(s.map, 1, 1.2);
    if (!painted) return; // retried next frame, once the image is there
    s.map = painted;
  }
  s.normalMap = null;
  s.roughnessMap = null;
  s.metalnessMap = null;
  s.bumpMap = null;
  s.roughness = 1;
  s.metalness = 0;
  if ((s as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) (s as THREE.MeshPhysicalMaterial).clearcoat = 0;
  // Plain colours get the same saturation as the painted textures.
  if (!s.map && !s.userData.keepColor) { const hsl = { h: 0, s: 0, l: 0 }; s.color.getHSL(hsl); s.color.setHSL(hsl.h, Math.min(1, hsl.s * 1.25 + 0.04), hsl.l); }
  // Extra shader code of a material (wet ground reflections...) runs after the cel shading.
  const hook = s.userData.shaderHook as ((sh: THREE.WebGLProgramParametersWithUniforms, r: THREE.WebGLRenderer) => void) | undefined;
  s.onBeforeCompile = hook ? (sh, r) => { celShader(sh); hook(sh, r); } : celShader;
  // Characters get a light rim so they read against the night.
  if (skinned) { const d = s as unknown as { defines?: Record<string, string> }; d.defines = { ...d.defines, CEL_RIM: '' }; }
  const key = (skinned ? 'cel-rim' : 'cel') + (hook ? `-${s.userData.shaderKey ?? 'hook'}` : '');
  s.customProgramCacheKey = () => key;
  s.needsUpdate = true;
  doneMats.add(m);
}

/** Makes everything under `root` stylised (cheap once done: a set lookup per material). */
export function stylizeScene(root: THREE.Object3D) {
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh === true;
    if (Array.isArray(mesh.material)) mesh.material.forEach(m => stylizeMaterial(m, skinned));
    else stylizeMaterial(mesh.material, skinned);
  });
}

/**
 * Short-lived screen effects of a hit, driven by the game: `flash` (0..1, toward `flashColor`),
 * `invert` (0..1, a negative frame), `aberration` (pixels of colour split, from `centre`).
 */
export interface ScreenFx { flash: number; flashColor: THREE.Color; invert: number; aberration: number; centre: THREE.Vector2 }

/**
 * Replaces the plain render pass: renders the scene with its depth, then draws it with ink lines
 * where the depth breaks (silhouettes, overlaps) and where its slope breaks (creases: box edges,
 * the foot of a wall), a colour grade (saturation, violet lift in the shadows, vignette) and the
 * hit effects. The camera is orthographic, so depth is linear on screen and flat surfaces never
 * get false lines.
 */
export class StylePass extends Pass {
  private rt: THREE.WebGLRenderTarget;
  private quad: FullScreenQuad;
  private mat: THREE.ShaderMaterial;
  readonly fx: ScreenFx = { flash: 0, flashColor: new THREE.Color(1, 1, 1), invert: 0, aberration: 0, centre: new THREE.Vector2(0.5, 0.5) };
  /** Called between the scene render and the composite (the wet ground reflection runs before). */
  beforeRender?: (renderer: THREE.WebGLRenderer) => void;

  constructor(private scene: THREE.Scene, private camera: THREE.OrthographicCamera) {
    super();
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1) });
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, texel: { value: new THREE.Vector2() },
        near: { value: 0.1 }, far: { value: 200 }, fogNear: { value: 1e4 }, fogFar: { value: 2e4 }, ink: { value: new THREE.Color(0x0a0614) },
        thickness: { value: 1 }, strength: { value: 0.85 }, crease: { value: 0.7 }, outline: { value: 1 },
        flash: { value: 0 }, flashColor: { value: new THREE.Color() }, invert: { value: 0 }, aberration: { value: 0 }, centre: { value: new THREE.Vector2(0.5, 0.5) },
        vignette: { value: 0.35 },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel;
        uniform float near; uniform float far; uniform float fogNear; uniform float fogFar; uniform vec3 ink;
        uniform float thickness; uniform float strength; uniform float crease; uniform float outline;
        uniform float flash; uniform vec3 flashColor; uniform float invert; uniform float aberration; uniform vec2 centre;
        uniform float vignette;
        varying vec2 vUv;
        float z(vec2 uv) { return near + texture2D(tDepth, uv).x * (far - near); }
        void main() {
          vec2 o = texel * thickness;
          float d = z(vUv);
          float l = z(vUv - vec2(o.x, 0.0)), r = z(vUv + vec2(o.x, 0.0)), u = z(vUv + vec2(0.0, o.y)), dn = z(vUv - vec2(0.0, o.y));
          // Silhouettes: depth jumps (1 px and 2 px rings, so lines are 2-3 px wide).
          float lap = abs(l + r + u + dn - 4.0 * d);
          float l2 = z(vUv - vec2(o.x, 0.0) * 2.0), r2 = z(vUv + vec2(o.x, 0.0) * 2.0), u2 = z(vUv + vec2(0.0, o.y) * 2.0), d2 = z(vUv - vec2(0.0, o.y) * 2.0);
          float lap2 = abs(l2 + r2 + u2 + d2 - 4.0 * d);
          float sil = max(smoothstep(0.12, 0.32, lap), smoothstep(0.2, 0.5, lap2) * 0.8);
          // Creases: the slope of the depth changes (normal edges, without a normal buffer).
          float gx1 = d - l, gx2 = r - d, gy1 = d - dn, gy2 = u - d;
          float cx = abs(gx2 - gx1) / (abs(gx1) + abs(gx2) + 0.006);
          float cy = abs(gy2 - gy1) / (abs(gy1) + abs(gy2) + 0.006);
          float cr = smoothstep(0.45, 0.8, max(cx, cy)) * (1.0 - step(0.6, lap)) * crease;
          float edge = max(sil, cr) * outline;
          float fog = 1.0 - smoothstep(fogNear, fogFar, d);
          // Hit: colour split from the impact point.
          vec2 dir = (vUv - centre);
          vec2 ca = dir * aberration * texel.x * 2.0 / max(0.15, length(dir));
          vec3 col = vec3(texture2D(tColor, vUv + ca).r, texture2D(tColor, vUv).g, texture2D(tColor, vUv - ca).b);
          float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = max(mix(vec3(lum), col, 1.18), vec3(0.0));
          col *= 1.12;
          col += vec3(0.014, 0.004, 0.034) * (1.0 - smoothstep(0.0, 0.16, lum));
          col = mix(col, ink, edge * strength * fog);
          // Vignette toward the night colour.
          vec2 vd = (vUv - 0.5) * vec2(1.0, 0.8);
          col = mix(col, vec3(0.02, 0.012, 0.05), smoothstep(0.35, 0.85, length(vd)) * vignette);
          // Negative frame: inverted, pushed to the neon duotone.
          vec3 neg = vec3(1.0) - clamp(col, 0.0, 1.0);
          float nl = dot(neg, vec3(0.333));
          neg = mix(vec3(0.05, 0.0, 0.12), vec3(1.0, 0.95, 1.0), smoothstep(0.35, 0.85, nl)) + vec3(0.0, 0.35, 0.4) * smoothstep(0.75, 1.0, nl);
          col = mix(col, neg, invert);
          col = mix(col, flashColor, flash);
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mat);
  }

  /** Line weight and strength (interiors use softer lines). */
  setInk(strength: number, crease: number) { this.mat.uniforms.strength.value = strength; this.mat.uniforms.crease.value = crease; }

  setSize(w: number, h: number) {
    this.rt.setSize(w, h);
    this.mat.uniforms.texel.value.set(1 / w, 1 / h);
    this.mat.uniforms.thickness.value = Math.max(1, Math.round(w / 1700));
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget) {
    this.beforeRender?.(renderer);
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    const u = this.mat.uniforms, fog = this.scene.fog;
    u.tColor.value = this.rt.texture; u.tDepth.value = this.rt.depthTexture;
    u.near.value = this.camera.near; u.far.value = this.camera.far;
    if (fog && (fog as THREE.Fog).isFog) { u.fogNear.value = (fog as THREE.Fog).near; u.fogFar.value = (fog as THREE.Fog).far; }
    else if (fog && (fog as THREE.FogExp2).isFogExp2) { const k = (fog as THREE.FogExp2).density; u.fogNear.value = 0; u.fogFar.value = 1.6 / Math.max(1e-4, k); }
    else { u.fogNear.value = 1e4; u.fogFar.value = 2e4; }
    u.flash.value = this.fx.flash; u.flashColor.value.copy(this.fx.flashColor); u.invert.value = this.fx.invert;
    u.aberration.value = this.fx.aberration; u.centre.value.copy(this.fx.centre);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() { this.rt.dispose(); this.mat.dispose(); this.quad.dispose(); }
}
