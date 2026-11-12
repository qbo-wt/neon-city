import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * The stylised look, applied on top of the real models: cel-shaded light (bands one stop apart
 * instead of smooth gradients), no glossy reflections or photo micro-detail, textures reduced to a
 * few painted, saturated colour patches, and an ink outline around shapes (see StylePass).
 *
 * Every lit material of the scene goes through `stylizeScene` once before it is first drawn, so
 * models, rooms and characters need no special code. Emissive and unlit materials (neon, screens,
 * halos) are left as they are: they are the colour accents of the night.
 */
const doneMats = new WeakSet<THREE.Material>();
const doneTex = new WeakMap<THREE.Texture, THREE.Texture>();

const CEL = /* glsl */ `
{
  vec3 celBase = max(diffuseColor.rgb, vec3(0.004));
  vec3 celIrr = max(outgoingLight - totalEmissiveRadiance, vec3(0.0)) / celBase;
  float celE = max(max(celIrr.r, celIrr.g), celIrr.b);
  if (celE > 1e-4) {
    float celX = log2(celE), celI = floor(celX);
    float celQ = max(exp2(celI + smoothstep(0.38, 0.62, celX - celI)), 0.22);
    outgoingLight = celBase * (celIrr / celE) * celQ + totalEmissiveRadiance;
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
  diffuseColor.rgb *= 0.86 + 0.28 * celN;
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
  shader.fragmentShader = shader.fragmentShader
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

function stylizeMaterial(m: THREE.Material, skinned: boolean) {
  if (doneMats.has(m)) return;
  const s = m as THREE.MeshStandardMaterial;
  if (!s.isMeshStandardMaterial) { doneMats.add(m); return; }
  // Drawn textures (rugs, posters, screens made from the 2D art) are already stylised: kept.
  if (s.map && !(s.map as THREE.CanvasTexture).isCanvasTexture) {
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
  if (!s.map) { const hsl = { h: 0, s: 0, l: 0 }; s.color.getHSL(hsl); s.color.setHSL(hsl.h, Math.min(1, hsl.s * 1.25 + 0.04), hsl.l); }
  s.onBeforeCompile = celShader;
  // Characters get a light rim so they read against the night.
  if (skinned) { const d = s as unknown as { defines?: Record<string, string> }; d.defines = { ...d.defines, CEL_RIM: '' }; }
  s.customProgramCacheKey = () => (skinned ? 'cel-rim' : 'cel');
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
 * Replaces the plain render pass: renders the scene with its depth, then draws it with ink
 * outlines where the depth breaks (silhouettes, steps, overlaps) and a light colour grade
 * (more saturation, violet shadows). The camera is orthographic, so depth is linear on screen and
 * flat surfaces never get false lines.
 */
export class StylePass extends Pass {
  private rt: THREE.WebGLRenderTarget;
  private quad: FullScreenQuad;
  private mat: THREE.ShaderMaterial;

  constructor(private scene: THREE.Scene, private camera: THREE.OrthographicCamera) {
    super();
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1) });
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, texel: { value: new THREE.Vector2() },
        near: { value: 0.1 }, far: { value: 200 }, fogDensity: { value: 0 }, ink: { value: new THREE.Color(0x0a0614) },
        thickness: { value: 1 }, strength: { value: 0.75 },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel;
        uniform float near; uniform float far; uniform float fogDensity; uniform vec3 ink;
        uniform float thickness; uniform float strength;
        varying vec2 vUv;
        float z(vec2 uv) { return near + texture2D(tDepth, uv).x * (far - near); }
        void main() {
          vec4 c = texture2D(tColor, vUv);
          vec2 o = texel * thickness;
          float d = z(vUv);
          float lap = abs(z(vUv + vec2(o.x, 0.0)) + z(vUv - vec2(o.x, 0.0)) + z(vUv + vec2(0.0, o.y)) + z(vUv - vec2(0.0, o.y)) - 4.0 * d);
          float edge = smoothstep(0.15, 0.45, lap);
          float fog = exp(-fogDensity * fogDensity * d * d);
          vec3 col = c.rgb;
          float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = max(mix(vec3(lum), col, 1.15), vec3(0.0));
          col *= 1.2;
          col += vec3(0.006, 0.0, 0.016) * (1.0 - smoothstep(0.0, 0.12, lum));
          col = mix(col, ink, edge * strength * fog);
          gl_FragColor = vec4(col, c.a);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mat);
  }

  setSize(w: number, h: number) {
    this.rt.setSize(w, h);
    this.mat.uniforms.texel.value.set(1 / w, 1 / h);
    this.mat.uniforms.thickness.value = Math.max(1, Math.round(w / 1400));
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    const u = this.mat.uniforms, fog = this.scene.fog as THREE.FogExp2 | null;
    u.tColor.value = this.rt.texture; u.tDepth.value = this.rt.depthTexture;
    u.near.value = this.camera.near; u.far.value = this.camera.far;
    u.fogDensity.value = fog && (fog as THREE.FogExp2).isFogExp2 ? fog.density : 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() { this.rt.dispose(); this.mat.dispose(); this.quad.dispose(); }
}
