import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type MToonMaterial, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import type { AnimName, Rig } from './rigs';

/**
 * Anime characters: VRM avatars (assets/vrm, VIPE Heroes by Polygonal Mind, CC-BY, see CREDITS.md),
 * cel-shaded by their own MToon materials, animated with the shared Mixamo clips
 * (assets/mixamo/anims) retargeted onto the VRM humanoid. The retargeting follows the
 * three-vrm "humanoidAnimation" example (MIT).
 */
const VRM_BASE = 'assets/vrm/';
const ANIM_BASE = 'assets/mixamo/anims/';

/** Which avatar plays which unit kind. */
export const CAST: Record<string, string> = {
  player: 'hero', runner: 'runner', gunner: 'gunner', brute: 'brute', hacker: 'hacker', bomber: 'bomber',
  warden: 'warden', boss: 'boss', npc: 'res0',
};
/** Everyone, for the preloader. */
export const ALL_AVATARS = ['hero', 'lo', 'doc', 'nyx', 'runner', 'gunner', 'brute', 'bomber', 'hacker', 'warden', 'boss', ...Array.from({ length: 10 }, (_, i) => `res${i}`)];

const ANIMS: AnimName[] = ['idle', 'walk', 'slash', 'punch', 'kick', 'shoot', 'cast', 'jump', 'roll', 'hit', 'death', 'victory', 'talk'];
/** Clips that play once and hand back to idle. */
const ONCE = new Set<AnimName>(['slash', 'punch', 'kick', 'shoot', 'cast', 'jump', 'roll', 'hit', 'death', 'victory']);

/** Mixamo bone (without its mixamorig prefix) → VRM humanoid bone. */
const RIG: Record<string, VRMHumanBoneName> = {
  Hips: 'hips', Spine: 'spine', Spine1: 'chest', Spine2: 'upperChest', Neck: 'neck', Head: 'head',
  LeftShoulder: 'leftShoulder', LeftArm: 'leftUpperArm', LeftForeArm: 'leftLowerArm', LeftHand: 'leftHand',
  RightShoulder: 'rightShoulder', RightArm: 'rightUpperArm', RightForeArm: 'rightLowerArm', RightHand: 'rightHand',
  LeftUpLeg: 'leftUpperLeg', LeftLeg: 'leftLowerLeg', LeftFoot: 'leftFoot', LeftToeBase: 'leftToes',
  RightUpLeg: 'rightUpperLeg', RightLeg: 'rightLowerLeg', RightFoot: 'rightFoot', RightToeBase: 'rightToes',
  LeftHandThumb1: 'leftThumbMetacarpal', LeftHandThumb2: 'leftThumbProximal', LeftHandThumb3: 'leftThumbDistal',
  LeftHandIndex1: 'leftIndexProximal', LeftHandIndex2: 'leftIndexIntermediate', LeftHandIndex3: 'leftIndexDistal',
  LeftHandMiddle1: 'leftMiddleProximal', LeftHandMiddle2: 'leftMiddleIntermediate', LeftHandMiddle3: 'leftMiddleDistal',
  LeftHandRing1: 'leftRingProximal', LeftHandRing2: 'leftRingIntermediate', LeftHandRing3: 'leftRingDistal',
  LeftHandPinky1: 'leftLittleProximal', LeftHandPinky2: 'leftLittleIntermediate', LeftHandPinky3: 'leftLittleDistal',
  RightHandThumb1: 'rightThumbMetacarpal', RightHandThumb2: 'rightThumbProximal', RightHandThumb3: 'rightThumbDistal',
  RightHandIndex1: 'rightIndexProximal', RightHandIndex2: 'rightIndexIntermediate', RightHandIndex3: 'rightIndexDistal',
  RightHandMiddle1: 'rightMiddleProximal', RightHandMiddle2: 'rightMiddleIntermediate', RightHandMiddle3: 'rightMiddleDistal',
  RightHandRing1: 'rightRingProximal', RightHandRing2: 'rightRingIntermediate', RightHandRing3: 'rightRingDistal',
  RightHandPinky1: 'rightLittleProximal', RightHandPinky2: 'rightLittleIntermediate', RightHandPinky3: 'rightLittleDistal',
};
const bare = (name: string) => name.replace(/^mixamorig\d*:?/, '');

/**
 * A Mixamo clip with its rotations already moved into world rest space (that part is the same for
 * every avatar); only the bone names, the VRM 0 axis flip and the hips scale are per avatar.
 */
type Motion = { clip: THREE.AnimationClip; hipsHeight: number };
let motions: Promise<Map<AnimName, Motion>> | undefined;

function loadMotions(): Promise<Map<AnimName, Motion>> {
  motions ??= (async () => {
    const fbx = new FBXLoader();
    const list = await Promise.all(ANIMS.map(async name => {
      const asset = await fbx.loadAsync(`${ANIM_BASE}${name}.fbx`).catch(() => null);
      const src = asset?.animations[0];
      if (!asset || !src) return null;
      const nodes = new Map<string, THREE.Object3D>();
      asset.traverse(o => nodes.set(bare(o.name), o));
      asset.updateMatrixWorld(true);
      const hips = nodes.get('Hips');
      const tracks: THREE.KeyframeTrack[] = [];
      const restInv = new THREE.Quaternion(), parentRest = new THREE.Quaternion(), q = new THREE.Quaternion();
      for (const t of src.tracks) {
        const [rigName, prop] = t.name.split('.');
        const bone = bare(rigName);
        const node = nodes.get(bone);
        if (!RIG[bone] || !node) continue;
        if (t instanceof THREE.QuaternionKeyframeTrack) {
          node.getWorldQuaternion(restInv).invert();
          node.parent!.getWorldQuaternion(parentRest);
          const v = t.values.slice();
          for (let i = 0; i < v.length; i += 4) {
            q.fromArray(v, i).premultiply(parentRest).multiply(restInv);
            q.toArray(v, i);
          }
          tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.${prop}`, t.times, v));
        } else if (t instanceof THREE.VectorKeyframeTrack && bone === 'Hips' && prop === 'position') {
          // In place: the board moves the units, the clip only moves the body up and down.
          const v = t.values.slice(), x0 = v[0], z0 = v[2];
          for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
          tracks.push(new THREE.VectorKeyframeTrack(`${bone}.${prop}`, t.times, v));
        }
      }
      return [name, { clip: new THREE.AnimationClip(name, src.duration, tracks), hipsHeight: hips?.position.y || 100 }] as const;
    }));
    return new Map(list.filter((x): x is readonly [AnimName, Motion] => !!x));
  })();
  return motions;
}

/** The clip for one avatar: VRM node names, VRM 0 axis flip, hips scaled to its height. */
function retarget(m: Motion, vrm: VRM): THREE.AnimationClip {
  const v0 = vrm.meta?.metaVersion === '0';
  const tmp = new THREE.Vector3();
  const hipsY = vrm.humanoid.getNormalizedBoneNode('hips')!.getWorldPosition(tmp).y - vrm.scene.getWorldPosition(new THREE.Vector3()).y;
  const scale = Math.abs(hipsY) / m.hipsHeight;
  const tracks: THREE.KeyframeTrack[] = [];
  for (const t of m.clip.tracks) {
    const [bone, prop] = t.name.split('.');
    const node = vrm.humanoid.getNormalizedBoneNode(RIG[bone]);
    if (!node) continue;
    if (t instanceof THREE.QuaternionKeyframeTrack) {
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.${prop}`, t.times, t.values.map((x, i) => (v0 && i % 2 === 0 ? -x : x))));
    } else {
      tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.${prop}`, t.times, t.values.map((x, i) => (v0 && i % 3 !== 1 ? -x : x) * scale)));
    }
  }
  return new THREE.AnimationClip(m.clip.name, m.clip.duration, tracks);
}

/** Raw files, fetched once; each character parses its own copy (a VRM cannot be cloned). */
const files = new Map<string, Promise<ArrayBuffer | null>>();
function file(name: string) {
  let p = files.get(name);
  if (!p) {
    p = fetch(`${VRM_BASE}${name}.vrm`).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
    files.set(name, p);
  }
  return p;
}

/** Fetches every avatar and the animation clips (the loading screen waits on this). */
export function preloadCharacters(onProgress?: (done: number, total: number) => void) {
  const jobs: Promise<unknown>[] = [...ALL_AVATARS.map(file), loadMotions()];
  let done = 0;
  return Promise.all(jobs.map(j => j.finally(() => onProgress?.(++done, jobs.length))));
}

const loader = new GLTFLoader();
loader.register(parser => new VRMLoaderPlugin(parser));

async function parse(name: string): Promise<VRM | null> {
  const data = await file(name);
  if (!data) return null;
  const gltf = await loader.parseAsync(data.slice(0), '');
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) return null;
  VRMUtils.removeUnnecessaryVertices(vrm.scene);
  VRMUtils.combineSkeletons(vrm.scene);
  VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; }
  });
  return vrm;
}

/** An anime character: VRM avatar, animation mixer with cross-fades, blinking, talking mouth. */
export class CharacterRig implements Rig {
  root = new THREE.Group();
  height = 1.7;
  ready: Promise<boolean>;
  private vrm?: VRM;
  private mixer?: THREE.AnimationMixer;
  private actions = new Map<AnimName, THREE.AnimationAction>();
  private current?: THREE.AnimationAction;
  private currentName: AnimName = 'idle';
  private pending: AnimName = 'idle';
  private t = Math.random() * 10;
  private nextBlink = 1 + Math.random() * 3;
  private mood?: { name: string; until: number };

  /** `avatar`: file name in assets/vrm; `scale` 1 = a person of 1.7 m. */
  constructor(avatar: string, scale = 1) {
    this.ready = Promise.all([parse(avatar), loadMotions()]).then(([vrm, mo]) => {
      if (!vrm) return false;
      this.vrm = vrm;
      vrm.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(vrm.scene, true), h = box.max.y - box.min.y;
      const k = h > 0.3 && h < 5 ? (1.7 * scale) / h : scale;
      this.root.scale.setScalar(k);
      this.height = 1.7 * scale;
      // The ink line around the body: a fixed few millimetres in the world (the avatars' own
      // settings assume a perspective camera and blow up under our orthographic one).
      vrm.scene.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as MToonMaterial[]) {
          if (!mat.isMToonMaterial) continue;
          mat.outlineWidthMode = 'worldCoordinates';
          mat.outlineWidthFactor = 0.012 / k;
          mat.outlineColorFactor.setHex(0x0a0614);
          mat.outlineLightingMixFactor = 0;
        }
      });
      this.root.add(vrm.scene);
      this.mixer = new THREE.AnimationMixer(vrm.scene);
      for (const [name, m] of mo) {
        const a = this.mixer.clipAction(retarget(m, vrm));
        if (ONCE.has(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
        this.actions.set(name, a);
      }
      this.mixer.addEventListener('finished', e => {
        const done = [...this.actions.entries()].find(([, a]) => a === e.action)?.[0];
        if (done && done !== 'death') this.play('idle');
      });
      this.play(this.pending);
      return true;
    }).catch(() => false);
  }

  play(name: AnimName) {
    this.pending = name;
    if (!this.mixer) return;
    const fallback: Partial<Record<AnimName, AnimName>> = { punch: 'slash', kick: 'punch', shoot: 'cast', cast: 'punch', roll: 'jump', talk: 'idle', victory: 'idle' };
    let n: AnimName | undefined = name;
    while (n && !this.actions.has(n)) n = fallback[n];
    const next = this.actions.get(n ?? 'idle');
    if (!next || (next === this.current && !ONCE.has(name))) return;
    next.reset().setEffectiveWeight(1).fadeIn(0.15).play();
    if (this.current && this.current !== next) this.current.fadeOut(0.15);
    this.current = next;
    this.currentName = name;
    if (name === 'hit') this.setMood('angry', 0.8);
    if (name === 'victory') this.setMood('happy', 2);
    if (name === 'death') this.setMood('sad', 999);
  }

  /** A facial expression for a while (happy, angry, sad…). */
  setMood(name: string, seconds: number) { this.mood = { name, until: this.t + seconds }; }

  update(dt: number) {
    this.t += dt;
    this.mixer?.update(dt);
    const em = this.vrm?.expressionManager;
    if (em) {
      // Blinks every few seconds; the mouth moves while talking.
      let blink = 0;
      if (this.t > this.nextBlink) { blink = 1; if (this.t > this.nextBlink + 0.12) this.nextBlink = this.t + 2 + Math.random() * 3.5; }
      em.setValue('blink', blink);
      em.setValue('aa', this.currentName === 'talk' ? Math.max(0, Math.sin(this.t * 14)) * 0.6 : 0);
      for (const m of ['happy', 'angry', 'sad']) em.setValue(m, this.mood && this.mood.name === m && this.t < this.mood.until ? 0.8 : 0);
    }
    this.vrm?.update(dt);
  }

  flash(color: number) {
    const mats: { emissive?: THREE.Color }[] = [];
    this.vrm?.scene.traverse(o => {
      const m = (o as THREE.Mesh).material;
      if (m) for (const x of Array.isArray(m) ? m : [m]) if ((x as { emissive?: THREE.Color }).emissive) mats.push(x as { emissive?: THREE.Color });
    });
    mats.forEach(m => m.emissive!.setHex(color));
    setTimeout(() => mats.forEach(m => m.emissive!.setHex(0)), 110);
  }
}
