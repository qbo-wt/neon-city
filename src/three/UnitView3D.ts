import Phaser from 'phaser';
import * as THREE from 'three';
import { COLORS, CONFIG } from '../config';
import type { Pt, Unit } from '../tactics/types';
import { CELL, type World3D } from './World3D';
import { DroneRig, MannequinRig, PropRig, type AnimName, type Rig } from './rigs';

export type PoseKind = 'windup' | 'strike' | 'hurt' | 'charge';

/** Which body animation a spell plays, from its look. */
const FX_ANIM: Record<string, AnimName> = { slash: 'slash', blast: 'punch', shot: 'shoot', wire: 'slash', hack: 'cast', buff: 'cast', heal: 'cast', jump: 'jump' };
/** Breakables: the CC0 prop that stands for each kind. */
const BREAKABLE_MODEL: Record<string, string> = { crate: 'utility_box_02', barrel: 'barrel_stove', trash: 'metal_trash_can', vending: 'utility_box_01' };

/** Turns a step on the board into a yaw: board +x is world +x, board +y is world +z. */
const yawOf = (d: Pt) => Math.atan2(d.x, d.y);

/**
 * One unit in the 3D street: its rig (stand-in figure today, rigged character later), a ring at its
 * feet on its turn, a health bar drawn by Phaser at the projected head position. Movement is tweened
 * in the world; x / y give its screen position (Phaser world coordinates) for texts and effects.
 */
export class UnitView3D {
  private rig: Rig;
  private holder = new THREE.Group();
  private bar: Phaser.GameObjects.Graphics;
  private ring?: THREE.Mesh;
  private primeLight?: THREE.PointLight;
  private cell: Pt;
  private busy = 0;
  private dead = false;
  showBar = false;

  constructor(private scene: Phaser.Scene, private world: World3D, readonly unit: Unit, _weaponArt?: string, npcKey?: string) {
    const k = unit.kind;
    if (k === 'drone') this.rig = new DroneRig();
    else if (unit.team === 2 && !npcKey) {
      // Placeholder until the prop model is loaded.
      const g = new THREE.Group();
      this.rig = new PropRig(g);
      void world.propModel(BREAKABLE_MODEL[k] ?? 'utility_box_02').then(o => {
        o.traverse(m => { const mesh = m as THREE.Mesh; if (mesh.isMesh) mesh.material = (mesh.material as THREE.Material).clone(); });
        g.add(o);
        this.rig.height = new THREE.Box3().setFromObject(g).max.y || 1;
      });
    } else if (k === 'turret') {
      const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x44425e, roughness: 0.4, metalness: 0.7 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.5, 12), mat); base.position.y = 0.25;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.5), mat); head.position.y = 0.62;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0x00f0ff, toneMapped: false })); eye.position.set(0, 0.62, 0.26);
      [base, head].forEach(m => { m.castShadow = true; });
      g.add(base, head, eye);
      this.rig = new PropRig(g);
    } else this.rig = new MannequinRig(npcKey ? 'npc' : k);
    this.holder.add(this.rig.root);
    if (unit.elite === 'cloak') this.holder.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) { m.transparent = true; m.opacity = 0.45; } });
    if (unit.elite === 'frenzy' || unit.elite === 'explosive') {
      const l = new THREE.PointLight(unit.elite === 'frenzy' ? 0xff3b3b : COLORS.yellow, 3, 2.5);
      l.position.y = 1; this.holder.add(l);
    }
    world.scene.add(this.holder);
    this.cell = { x: unit.x, y: unit.y };
    this.bar = scene.add.graphics().setDepth(900);
    this.place(unit);
  }

  /** Screen position of the feet, in Phaser world units. */
  get x() { return this.screen(0).x; }
  get y() { return this.screen(0).y; }
  private screen(h: number) { return this.world.toScreen(this.holder.position.clone().setY(h), CONFIG.WIDTH, CONFIG.HEIGHT); }

  place(p: Pt) {
    this.cell = { x: p.x, y: p.y };
    this.holder.position.copy(this.world.cellPos(p));
    this.sync();
  }

  face(d: Pt) {
    if (!d.x && !d.y) return;
    this.holder.rotation.y = yawOf(d);
  }

  idle() { if (!this.dead) this.rig.play(this.unit.team === 2 ? 'idle' : 'idle'); }
  rest() { this.idle(); }

  pose(kind: PoseKind, spellId?: string, fx?: string) {
    if (this.dead) return;
    if (kind === 'hurt') this.rig.play('hit', true);
    else if (kind === 'charge') this.rig.play('roll', true);
    else if (kind === 'windup') this.rig.play(FX_ANIM[fx ?? ''] ?? (spellId ? 'slash' : 'slash'), true);
  }

  /** Tweens the holder between points (world metres). */
  private tween(to: THREE.Vector3, ms: number, arc = 0): Promise<void> {
    const from = this.holder.position.clone();
    return new Promise(res => {
      this.scene.tweens.addCounter({
        from: 0, to: 1, duration: ms, ease: arc ? 'Sine.easeInOut' : 'Linear',
        onUpdate: tw => {
          const t = tw.getValue() ?? 0;
          this.holder.position.lerpVectors(from, to, t);
          if (arc) this.holder.position.y = Math.sin(t * Math.PI) * arc;
        },
        onComplete: () => { this.holder.position.copy(to); res(); },
      });
    });
  }

  async walk(path: Pt[], msPerCell = 260): Promise<void> {
    this.rig.play('walk');
    let from = this.cell;
    for (const c of path) {
      this.face({ x: c.x - from.x, y: c.y - from.y });
      await this.tween(this.world.cellPos(c), msPerCell);
      from = c;
    }
    this.cell = path[path.length - 1] ?? this.cell;
    this.idle();
  }

  async shove(path: Pt[], kind: 'push' | 'pull' | 'charge' | 'dash' | 'jump'): Promise<void> {
    const end = path[path.length - 1];
    if (!end) return;
    if (kind === 'jump') {
      this.face({ x: end.x - this.cell.x, y: end.y - this.cell.y });
      this.rig.play('jump', true);
      await this.tween(this.world.cellPos(end), 420, 1.1);
    } else {
      if (kind === 'charge' || kind === 'dash') { this.face({ x: end.x - this.cell.x, y: end.y - this.cell.y }); this.rig.play('roll', true); }
      else this.rig.play('hit', true);
      for (const c of path) await this.tween(this.world.cellPos(c), kind === 'push' || kind === 'pull' ? 110 : 90);
    }
    this.cell = end;
    this.idle();
  }

  flash(color = 0xffffff) { this.rig.flash(color); }

  /** Called every frame by the scene: animation, ring, bar. */
  update(dt: number) {
    this.rig.update(dt);
    if (this.ring) this.ring.rotation.z += dt * 0.8;
    if (this.primeLight) this.primeLight.intensity = 4 + Math.sin(performance.now() / 90) * 3;
    this.sync();
  }

  sync() { this.drawBar(); }

  drawBar() {
    const g = this.bar, u = this.unit;
    g.clear();
    if (!this.showBar || u.dead || this.dead) return;
    const top = this.screen(this.rig.height + 0.25);
    const w = u.boss ? 24 : 16, x = top.x - w / 2, y = top.y;
    g.fillStyle(0x05030f, 0.85).fillRect(x - 1, y - 1, w + 2, 4);
    const col = u.team === 0 ? COLORS.cyan : u.team === 2 ? 0x8a86b0 : COLORS.magenta;
    g.fillStyle(0x221d35).fillRect(x, y, w, 2);
    g.fillStyle(col).fillRect(x, y, Math.max(0, Math.round((w * u.hp) / u.maxHp)), 2);
    if (u.shield > 0) g.fillStyle(0xe8e8ff).fillRect(x, y - 1, Math.min(w, Math.round((w * u.shield) / u.maxHp)), 1);
  }

  /** Primed bomber: a pulsing yellow light on it. */
  setPrimed(on: boolean) {
    if (on && !this.primeLight) {
      this.primeLight = new THREE.PointLight(0xf5e663, 6, 3.5);
      this.primeLight.position.y = 1.2;
      this.holder.add(this.primeLight);
    } else if (!on && this.primeLight) { this.holder.remove(this.primeLight); this.primeLight = undefined; }
  }

  /** A glowing ring at the feet of the unit whose turn it is. */
  setActive(on: boolean) {
    if (on && !this.ring) {
      const color = this.unit.team === 0 ? COLORS.cyan : COLORS.magenta;
      this.ring = new THREE.Mesh(new THREE.RingGeometry(CELL * 0.36, CELL * 0.42, 40, 1, 0, Math.PI * 1.7),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.y = 0.03;
      this.holder.add(this.ring);
    } else if (!on && this.ring) { this.holder.remove(this.ring); this.ring = undefined; }
  }

  async die(): Promise<void> {
    this.setPrimed(false); this.setActive(false);
    this.dead = true;
    this.bar.clear();
    this.rig.play('death', true);
    if (this.unit.kind === 'player') return;
    await new Promise<void>(res => this.scene.time.delayedCall(900, () => res()));
    if (this.unit.team === 2) { this.destroy(); return; }
    // Bodies sink away after a moment.
    await this.tween(this.holder.position.clone().setY(-0.6), 700);
    this.destroy();
  }

  destroy() {
    this.world.scene.remove(this.holder);
    this.bar.destroy();
    void this.busy;
  }
}
