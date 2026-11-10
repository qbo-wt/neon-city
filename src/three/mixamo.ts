import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { AnimName, Rig } from './rigs';

/**
 * Real characters from Mixamo (FBX, one skeleton naming for all of them): one model per unit kind
 * in assets/mixamo/characters, shared animation clips in assets/mixamo/anims (downloaded "without
 * skin"). Missing files simply leave the stand-in figures in place.
 */
const BASE = 'assets/mixamo/';
const MODEL_FOR: Record<string, string> = {
  player: 'hero', runner: 'runner', gunner: 'gunner', brute: 'brute', hacker: 'hacker', bomber: 'bomber',
  warden: 'warden', boss: 'boss', npc: 'civil1', 'npc-doc': 'civil4', 'npc-old': 'civil1', 'npc-man': 'civil2', 'npc-girl': 'civil3',
};
const ANIMS: AnimName[] = ['idle', 'walk', 'slash', 'punch', 'kick', 'shoot', 'cast', 'jump', 'roll', 'hit', 'death', 'victory', 'talk'];
/** Clips that play once and hand back to idle. */
const ONCE = new Set<AnimName>(['slash', 'punch', 'kick', 'shoot', 'cast', 'jump', 'roll', 'hit', 'death', 'victory']);

const loader = new FBXLoader();
/** Mixamo prefixes bones with mixamorig, mixamorig1, mixamorig4… depending on the export: strip it on both sides. */
const bare = (name: string) => name.replace(/^mixamorig\d*:?/, '');
/** A loaded model and the scale that turns it into metres (the raw FBX is in centimetres). */
type Model = { group: THREE.Group; unit: number };
const models = new Map<string, Promise<Model | null>>();
const gltf = new GLTFLoader();
let clips: Promise<Map<AnimName, THREE.AnimationClip>> | undefined;
let available: Promise<boolean> | undefined;

const exists = (url: string) => fetch(url, { method: 'HEAD' }).then(r => r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')).catch(() => false);

/** True once the hero model is there (the rest is optional, kind by kind). */
export function mixamoAvailable(): Promise<boolean> {
  available ??= exists(`${BASE}glb/hero.glb`).then(ok => ok || exists(`${BASE}characters/hero.fbx`));
  return available;
}

/**
 * The compact GLB made by scripts/convert-mixamo.mjs when it is there (metres, PBR, 1024 px
 * textures), the raw Mixamo FBX otherwise (centimetres, Phong materials made PBR here).
 */
function loadModel(name: string): Promise<Model | null> {
  let p = models.get(name);
  if (!p) {
    p = (async (): Promise<Model | null> => {
      let group: THREE.Group | null = null, unit = 1;
      if (await exists(`${BASE}glb/${name}.glb`)) group = (await gltf.loadAsync(`${BASE}glb/${name}.glb`)).scene;
      else if (await exists(`${BASE}characters/${name}.fbx`)) {
        group = await loader.loadAsync(`${BASE}characters/${name}.fbx`);
        unit = 0.01;
        group.traverse(o => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const old = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshPhongMaterial[];
          const next = old.map(o2 => new THREE.MeshStandardMaterial({ map: o2.map ?? null, normalMap: o2.normalMap ?? null, color: o2.map ? 0xffffff : o2.color, roughness: 0.6, metalness: 0.1, transparent: o2.transparent, opacity: o2.opacity }));
          m.material = Array.isArray(m.material) ? next : next[0];
        });
      }
      if (!group) return null;
      group.traverse(o => {
        if ((o as THREE.Bone).isBone) o.name = bare(o.name);
        const m = o as THREE.Mesh;
        if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
      });
      return { group, unit };
    })().catch(() => null);
    models.set(name, p);
  }
  return p;
}

/** Root motion off: the board moves the units, the clips only move the body in place. */
function inPlace(clip: THREE.AnimationClip): THREE.AnimationClip {
  for (const t of clip.tracks) {
    if (!/Hips\.position$/.test(t.name)) continue;
    const v = t.values, x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  return clip;
}

function loadClips(): Promise<Map<AnimName, THREE.AnimationClip>> {
  clips ??= Promise.all(ANIMS.map(async name => {
    const url = `${BASE}anims/${name}.fbx`;
    if (!(await exists(url))) return null;
    const g = await loader.loadAsync(url).catch(() => null);
    const clip = g?.animations[0];
    if (!clip) return null;
    clip.name = name;
    for (const t of clip.tracks) t.name = bare(t.name);
    return [name, inPlace(clip)] as const;
  })).then(list => new Map(list.filter((x): x is readonly [AnimName, THREE.AnimationClip] => !!x)));
  return clips;
}

/** A Mixamo character: skinned model, animation mixer, cross-fades between clips. */
export class MixamoRig implements Rig {
  root = new THREE.Group();
  height = 1.8;
  private mixer?: THREE.AnimationMixer;
  private actions = new Map<AnimName, THREE.AnimationAction>();
  private current?: THREE.AnimationAction;
  private pending: AnimName = 'idle';
  private mats: THREE.MeshStandardMaterial[] = [];
  ready: Promise<boolean>;

  constructor(kind: string, scale = 1, modelName?: string) {
    this.ready = Promise.all([loadModel(modelName ?? MODEL_FOR[kind] ?? 'civil1'), loadClips()]).then(([model, cl]) => {
      if (!model) return false;
      const body = cloneSkinned(model.group) as THREE.Group;
      body.scale.multiplyScalar(model.unit * scale);
      body.traverse(o => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const list = (Array.isArray(m.material) ? m.material : [m.material]).map(x => (x as THREE.MeshStandardMaterial).clone());
        this.mats.push(...list);
        m.material = Array.isArray(m.material) ? list : list[0];
      });
      this.root.add(body);
      // Mixamo characters come at assorted sizes: bring every one to a human height (x scale).
      body.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(body, true), h = box.max.y - box.min.y, target = 1.78 * scale;
      if (h > 0.2 && h < 20) body.scale.multiplyScalar(target / h);
      this.height = target;
      this.mixer = new THREE.AnimationMixer(body);
      for (const [name, clip] of cl) {
        const a = this.mixer.clipAction(clip);
        if (ONCE.has(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
        this.actions.set(name, a);
      }
      this.mixer.addEventListener('finished', e => {
        const done = [...this.actions.entries()].find(([, a]) => a === e.action)?.[0];
        if (done && done !== 'death') this.play('idle');
      });
      this.play(this.pending);
      return true;
    });
  }

  play(name: AnimName) {
    this.pending = name;
    if (!this.mixer) return;
    // Missing clips fall back to something close.
    const fallback: Partial<Record<AnimName, AnimName>> = { punch: 'slash', kick: 'punch', shoot: 'cast', cast: 'punch', roll: 'jump', talk: 'idle', victory: 'idle' };
    let n: AnimName | undefined = name;
    while (n && !this.actions.has(n)) n = fallback[n];
    const next = this.actions.get(n ?? 'idle');
    if (!next || next === this.current && !ONCE.has(name)) return;
    next.reset().setEffectiveWeight(1).fadeIn(0.15).play();
    if (this.current && this.current !== next) this.current.fadeOut(0.15);
    this.current = next;
  }

  update(dt: number) { this.mixer?.update(dt); }

  flash(color: number) {
    for (const m of this.mats) m.emissive.setHex(color);
    setTimeout(() => this.mats.forEach(m => m.emissive.setHex(0)), 110);
  }
}
