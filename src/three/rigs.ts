import * as THREE from 'three';

/** What a character model can play. Real characters map these to their animation clips. */
export type AnimName = 'idle' | 'walk' | 'slash' | 'punch' | 'kick' | 'shoot' | 'cast' | 'jump' | 'roll' | 'hit' | 'death' | 'victory' | 'talk';

export interface Rig {
  root: THREE.Object3D;
  /** Height of the head, for the health bar. */
  height: number;
  play(name: AnimName, once?: boolean): void;
  update(dt: number): void;
  /** Brief white flash (hit). */
  flash(color: number): void;
}

/** Look of a stand-in figure per unit kind: armour colour, glow colour, size. */
const LOOKS: Record<string, { body: number; glow: number; scale: number }> = {
  player: { body: 0x3a5a8a, glow: 0x00f0ff, scale: 1 },
  runner: { body: 0x7a2a44, glow: 0xff2a6d, scale: 0.95 },
  gunner: { body: 0x7a4a24, glow: 0xff8c2a, scale: 1 },
  brute: { body: 0x8a8a9a, glow: 0xff3b3b, scale: 1.3 },
  hacker: { body: 0x2a5a3a, glow: 0x39ff88, scale: 0.95 },
  bomber: { body: 0x7a6a2a, glow: 0xf5e663, scale: 0.95 },
  warden: { body: 0x4a4a5e, glow: 0xff2a6d, scale: 1.35 },
  boss: { body: 0x6a1a34, glow: 0xff2a6d, scale: 1.5 },
  npc: { body: 0x5a4a8a, glow: 0xb84dff, scale: 1 },
};

/**
 * A stand-in humanoid made of capsules, animated by code (bob, steps, lunges, falls), until the
 * real rigged characters are in. Same interface as the real ones.
 */
export class MannequinRig implements Rig {
  root = new THREE.Group();
  height: number;
  private body = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  private arms: THREE.Mesh[] = [];
  private mats: THREE.MeshStandardMaterial[] = [];
  private anim: AnimName = 'idle';
  private t = 0;
  private once = false;
  private flashT = 0;

  constructor(kind: string) {
    const look = LOOKS[kind] ?? LOOKS.npc;
    const armour = new THREE.MeshStandardMaterial({ color: look.body, roughness: 0.35, metalness: 0.6 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x111018, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x8a6a5a, roughness: 0.6 });
    const glow = new THREE.MeshBasicMaterial({ color: look.glow, toneMapped: false });
    this.mats.push(armour, cloth, skin);
    const cap = (r: number, l: number, m: THREE.Material) => { const x = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 12), m); x.castShadow = true; return x; };
    const torso = cap(0.2, 0.42, armour); torso.position.y = 1.18; torso.scale.set(1.15, 1, 0.75);
    const hips = cap(0.17, 0.12, cloth); hips.position.y = 0.88; hips.scale.set(1.1, 1, 0.8);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 16), skin); head.position.y = 1.62; head.castShadow = true;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.06), glow); visor.position.set(0, 1.64, 0.1);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.02), glow); stripe.position.set(0.08, 1.2, 0.16);
    for (const side of [-1, 1]) {
      const leg = cap(0.075, 0.68, cloth); leg.geometry.translate(0, -0.42, 0); leg.position.set(side * 0.1, 0.86, 0);
      const arm = cap(0.06, 0.5, armour); arm.geometry.translate(0, -0.3, 0); arm.position.set(side * 0.27, 1.42, 0);
      this.legs.push(leg); this.arms.push(arm);
      this.body.add(leg, arm);
    }
    this.body.add(torso, hips, head, visor, stripe);
    this.body.scale.setScalar(look.scale);
    this.root.add(this.body);
    const key = new THREE.PointLight(look.glow, 2.2, 3, 2);
    key.position.set(0.4, 2.1, 0.6);
    this.root.add(key);
    this.height = 1.8 * look.scale;
  }

  play(name: AnimName, once = false) {
    if (this.anim === name && !once) return;
    this.anim = name; this.t = 0; this.once = once;
  }

  flash(color: number) {
    this.flashT = 0.12;
    for (const m of this.mats) m.emissive.setHex(color);
  }

  update(dt: number) {
    this.t += dt;
    if (this.flashT > 0 && (this.flashT -= dt) <= 0) for (const m of this.mats) m.emissive.setHex(0);
    const t = this.t, b = this.body;
    b.rotation.set(0, 0, 0); b.position.set(0, 0, 0);
    this.legs.forEach(l => l.rotation.set(0, 0, 0));
    this.arms.forEach(a => a.rotation.set(0, 0, 0));
    const swing = Math.sin(t * 9);
    switch (this.anim) {
      case 'idle': case 'talk':
        b.position.y = Math.sin(t * 2.2) * 0.012;
        this.arms.forEach((a, i) => { a.rotation.z = (i ? -1 : 1) * 0.08; });
        break;
      case 'walk':
        b.position.y = Math.abs(Math.sin(t * 9)) * 0.04;
        this.legs[0].rotation.x = swing * 0.55; this.legs[1].rotation.x = -swing * 0.55;
        this.arms[0].rotation.x = -swing * 0.45; this.arms[1].rotation.x = swing * 0.45;
        break;
      case 'slash': case 'punch': case 'kick': case 'shoot': case 'cast': {
        const k = Math.min(1, t / 0.18), back = t < 0.18 ? k : Math.max(0, 1 - (t - 0.18) / 0.3);
        b.rotation.x = 0.25 * back;
        const arm = this.arms[1];
        arm.rotation.x = this.anim === 'shoot' || this.anim === 'cast' ? -1.5 * back : t < 0.18 ? 1.2 * k : -1.6 * back;
        if (this.anim === 'kick') this.legs[1].rotation.x = -1.2 * back;
        break;
      }
      case 'hit':
        b.rotation.x = -0.35 * Math.max(0, 1 - t / 0.3);
        break;
      case 'jump': case 'roll':
        b.position.y = Math.sin(Math.min(1, t / 0.35) * Math.PI) * 0.3;
        this.legs.forEach(l => { l.rotation.x = 0.6; });
        break;
      case 'death':
        b.rotation.x = -Math.min(1, t / 0.5) * Math.PI / 2;
        b.position.y = Math.min(1, t / 0.5) * 0.15;
        break;
      case 'victory':
        this.arms.forEach(a => { a.rotation.z = (a === this.arms[0] ? 1 : -1) * 2.6; });
        break;
    }
    if (this.once && t > 0.6 && this.anim !== 'death') this.play('idle');
  }
}

/** A hovering surveillance drone: a disc, a lens and four spinning rotors. */
export class DroneRig implements Rig {
  root = new THREE.Group();
  height = 1.6;
  private hull = new THREE.Group();
  private rotors: THREE.Mesh[] = [];
  private mat = new THREE.MeshStandardMaterial({ color: 0x2a2a38, roughness: 0.3, metalness: 0.8 });
  private t = Math.random() * 10;
  private dead = false;

  constructor() {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.12, 20), this.mat); disc.castShadow = true;
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff2a6d, toneMapped: false }));
    lens.position.set(0, -0.06, 0.22);
    this.hull.add(disc, lens);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.04), this.mat); arm.rotation.y = a; arm.position.set(Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.2);
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.01, 16), new THREE.MeshBasicMaterial({ color: 0x8a86b0, transparent: true, opacity: 0.4 }));
      rotor.position.set(Math.cos(a) * 0.4, 0.06, Math.sin(a) * 0.4);
      this.rotors.push(rotor);
      this.hull.add(arm, rotor);
    }
    this.hull.position.y = 1.3;
    this.root.add(this.hull);
  }
  play(name: AnimName) { if (name === 'death') this.dead = true; }
  flash(color: number) { this.mat.emissive.setHex(color); setTimeout(() => this.mat.emissive.setHex(0), 120); }
  update(dt: number) {
    this.t += dt;
    if (this.dead) { this.hull.position.y = Math.max(0.1, this.hull.position.y - dt * 3); this.hull.rotation.z += dt * 4; return; }
    this.hull.position.y = 1.3 + Math.sin(this.t * 2.5) * 0.06;
    this.rotors.forEach(r => { r.rotation.y += dt * 40; });
  }
}

/** A static object (breakable crate, turret): flashes and falls apart, no animation. */
export class PropRig implements Rig {
  height: number;
  constructor(public root: THREE.Object3D) {
    const bb = new THREE.Box3().setFromObject(root);
    this.height = Math.max(0.6, bb.max.y);
  }
  play(name: AnimName) {
    if (name === 'death') this.root.scale.multiplyScalar(0.001);
  }
  update() { /* static */ }
  flash(color: number) {
    this.root.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m?.emissive) { m.emissive.setHex(color); setTimeout(() => m.emissive.setHex(0), 120); }
    });
  }
}
