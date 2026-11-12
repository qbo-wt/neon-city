import * as THREE from 'three';
import { puffTexture } from './paint';

/**
 * Everything in the street that moves on its own: flickering neon, scrolling screens and
 * holograms, spinning fans, swaying cables, rising steam, rain splashes. One instance per built
 * street, ticked by World3D every frame.
 */
export class StreetLife {
  private flickers: { mat: THREE.MeshBasicMaterial; base: THREE.Color; t: number; rate: number }[] = [];
  private scrolls: { t: THREE.Texture; sx: number; sy: number }[] = [];
  private spins: { o: THREE.Object3D; axis: 'x' | 'y' | 'z'; v: number }[] = [];
  private bobs: { o: THREE.Object3D; y: number; a: number; f: number; ph: number }[] = [];
  private holos: { mat: THREE.MeshBasicMaterial; base: number; ph: number }[] = [];
  private swings: { o: THREE.Object3D; a: number; f: number; ph: number }[] = [];
  private steam?: Steam;
  private time = 0;

  constructor(readonly group: THREE.Group) {}

  /** Neon that buzzes: mostly on, short drop-outs now and then. */
  flicker(mat: THREE.MeshBasicMaterial, rate = 1) { this.flickers.push({ mat, base: mat.color.clone(), t: Math.random() * 5, rate }); }
  scroll(t: THREE.Texture, sx: number, sy = 0) { this.scrolls.push({ t, sx, sy }); }
  spin(o: THREE.Object3D, axis: 'x' | 'y' | 'z', v: number) { this.spins.push({ o, axis, v }); }
  bob(o: THREE.Object3D, a = 0.08, f = 1) { this.bobs.push({ o, y: o.position.y, a, f, ph: Math.random() * 6 }); }
  holo(mat: THREE.MeshBasicMaterial) { this.holos.push({ mat, base: mat.opacity, ph: Math.random() * 6 }); }
  swing(o: THREE.Object3D, a = 0.03, f = 0.7) { this.swings.push({ o, a, f, ph: Math.random() * 6 }); }

  /** A steam vent at a world point (rises `h` metres). */
  vent(p: THREE.Vector3, strength = 1, h = 3) {
    this.steam ??= new Steam(this.group);
    this.steam.addVent(p, strength, h);
  }

  tick(dt: number) {
    this.time += dt;
    const t = this.time;
    for (const f of this.flickers) {
      f.t -= dt * f.rate;
      let k = 1;
      if (f.t < 0) {
        // In a drop-out: a few fast blinks.
        k = Math.sin(t * 60) > 0 ? 0.25 : 1;
        if (f.t < -0.35) f.t = 2 + Math.random() * 7;
      }
      f.mat.color.copy(f.base).multiplyScalar(k);
    }
    for (const s of this.scrolls) { s.t.offset.x = (s.t.offset.x + s.sx * dt) % 1; s.t.offset.y = (s.t.offset.y + s.sy * dt) % 1; }
    for (const s of this.spins) s.o.rotation[s.axis] += s.v * dt;
    for (const b of this.bobs) b.o.position.y = b.y + Math.sin(t * b.f + b.ph) * b.a;
    for (const h of this.holos) h.mat.opacity = h.base * (0.82 + 0.12 * Math.sin(t * 2.3 + h.ph) + (Math.random() < 0.02 ? -0.4 : 0));
    for (const s of this.swings) s.o.rotation.x = Math.sin(t * s.f + s.ph) * s.a;
    this.steam?.tick(dt);
  }
}

/** Soft puffs rising from vents: one Points draw call for the whole street. */
class Steam {
  private points: THREE.Points;
  private vents: { p: THREE.Vector3; k: number; h: number }[] = [];
  private N = 260;
  private pos: Float32Array;
  private life: Float32Array;
  private vel: Float32Array;
  private src: Int16Array;
  private alpha: Float32Array;
  private size: Float32Array;

  constructor(group: THREE.Group) {
    const N = this.N;
    this.pos = new Float32Array(N * 3); this.life = new Float32Array(N); this.vel = new Float32Array(N * 3);
    this.src = new Int16Array(N).fill(-1); this.alpha = new Float32Array(N); this.size = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: puffTexture() }, scale: { value: 1 }, fogColor: { value: new THREE.Color(0x2a1a5a) } },
      vertexShader: /* glsl */ `attribute float alpha; attribute float psize; varying float vA; uniform float scale;
        void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = psize * scale; }`,
      fragmentShader: /* glsl */ `uniform sampler2D map; varying float vA;
        void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vec3(0.62, 0.6, 0.85), t.a * vA); }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.points.onBeforeRender = (r, _s, cam) => {
      const c = cam as THREE.OrthographicCamera, h = r.getDrawingBufferSize(new THREE.Vector2()).y;
      // Metres to pixels for the orthographic camera.
      mat.uniforms.scale.value = (h / ((c.top - c.bottom) / c.zoom));
    };
    group.add(this.points);
  }

  addVent(p: THREE.Vector3, k: number, h: number) { this.vents.push({ p: p.clone(), k, h }); }

  tick(dt: number) {
    if (!this.vents.length) return;
    const N = this.N;
    for (let i = 0; i < N; i++) {
      if (this.src[i] < 0 || this.life[i] <= 0) {
        // Respawn at a vent, weighted by strength.
        // About 18 puffs alive per vent, spread over their life.
        if (i >= this.vents.length * 18 || Math.random() > dt * 0.4) { this.alpha[i] = 0; continue; }
        const v = this.vents[i % this.vents.length];
        this.src[i] = 1;
        this.pos.set([v.p.x + (Math.random() - 0.5) * 0.5, v.p.y + 0.35, v.p.z + (Math.random() - 0.5) * 0.5], i * 3);
        this.vel.set([(Math.random() - 0.5) * 0.25 + 0.15, (0.5 + Math.random() * 0.5) * v.h / 3, (Math.random() - 0.5) * 0.25 - 0.1], i * 3);
        this.life[i] = (2.2 + Math.random() * 1.5) * v.k;
        this.size[i] = 0;
      }
      this.life[i] -= dt;
      const o = i * 3;
      this.pos[o] += this.vel[o] * dt; this.pos[o + 1] += this.vel[o + 1] * dt; this.pos[o + 2] += this.vel[o + 2] * dt;
      const age = Math.max(0, this.life[i]);
      this.alpha[i] = Math.min(1, age * 0.5) * Math.min(1, (3.5 - age) * 1.5) * 0.16;
      this.size[i] = 0.5 + (3.5 - age) * 0.45;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true; g.attributes.psize.needsUpdate = true;
  }
}
