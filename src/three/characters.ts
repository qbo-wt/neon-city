import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type MToonMaterial, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import type { AnimName, Rig } from './rigs';
import { installCyberware } from './cyberware';
import { LOOK_COLOR } from '../core/ending';
import { assetUrl } from './assetUrl';
import { settings } from '../core/settings';

/**
 * Anime characters: VRM avatars (assets/vrm, VIPE Heroes by Polygonal Mind, CC-BY, see CREDITS.md),
 * cel-shaded by their own MToon materials, animated with the shared Quaternius clips
 * (assets/anims/ual.glb, Universal Animation Library, CC0) retargeted onto the VRM humanoid. The retargeting follows the
 * three-vrm "humanoidAnimation" example (MIT).
 */
const VRM_BASE = 'assets/vrm/';
const ANIM_FILE = 'assets/anims/ual.glb';

/** Which avatar plays which unit kind. */
export const CAST: Record<string, string> = {
  player: 'hero', runner: 'runner', gunner: 'gunner', brute: 'brute', hacker: 'hacker', bomber: 'bomber',
  warden: 'warden', boss: 'boss', npc: 'res0',
};
/** Everyone, for the preloader. */
export const ALL_AVATARS = ['hero', 'lo', 'doc', 'nyx', 'runner', 'gunner', 'brute', 'bomber', 'hacker', 'warden', 'boss', ...Array.from({ length: 10 }, (_, i) => `res${i}`)];

/** Which clip of the Quaternius pack plays each role. Roles without their own clip share the nearest one. */
const ROLE_CLIP: Record<AnimName, string> = {
  idle: 'Idle_Loop', walk: 'Walk_Loop', jog: 'Jog_Fwd_Loop', ready: 'Sword_Idle',
  slash: 'Sword_Attack', punch: 'Punch_Jab', kick: 'Punch_Cross', shoot: 'Pistol_Shoot', cast: 'Spell_Simple_Shoot',
  hack: 'Interact', buff: 'Spell_Simple_Enter', jump: 'Jump_Start', roll: 'Roll', hit: 'Hit_Chest', death: 'Death01',
  victory: 'Dance_Loop', dance: 'Dance_Loop', talk: 'Idle_Talking_Loop', phone: 'Idle_Torch_Loop',
  sit: 'Sitting_Idle_Loop', sitTalk: 'Sitting_Talking_Loop',
};
const ANIMS = Object.keys(ROLE_CLIP) as AnimName[];
/** Clips that play once and hand back to idle. */
const ONCE = new Set<AnimName>(['slash', 'punch', 'kick', 'shoot', 'cast', 'hack', 'buff', 'jump', 'roll', 'hit', 'death', 'victory']);

/** Quaternius bone → VRM humanoid bone (the *_leaf end bones and the root are dropped). */
const RIG: Record<string, VRMHumanBoneName> = {
  pelvis: 'hips', spine_01: 'spine', spine_02: 'chest', spine_03: 'upperChest', neck_01: 'neck', Head: 'head',
  clavicle_l: 'leftShoulder', upperarm_l: 'leftUpperArm', lowerarm_l: 'leftLowerArm', hand_l: 'leftHand',
  clavicle_r: 'rightShoulder', upperarm_r: 'rightUpperArm', lowerarm_r: 'rightLowerArm', hand_r: 'rightHand',
  thigh_l: 'leftUpperLeg', calf_l: 'leftLowerLeg', foot_l: 'leftFoot', ball_l: 'leftToes',
  thigh_r: 'rightUpperLeg', calf_r: 'rightLowerLeg', foot_r: 'rightFoot', ball_r: 'rightToes',
  thumb_01_l: 'leftThumbMetacarpal', thumb_02_l: 'leftThumbProximal', thumb_03_l: 'leftThumbDistal',
  index_01_l: 'leftIndexProximal', index_02_l: 'leftIndexIntermediate', index_03_l: 'leftIndexDistal',
  middle_01_l: 'leftMiddleProximal', middle_02_l: 'leftMiddleIntermediate', middle_03_l: 'leftMiddleDistal',
  ring_01_l: 'leftRingProximal', ring_02_l: 'leftRingIntermediate', ring_03_l: 'leftRingDistal',
  pinky_01_l: 'leftLittleProximal', pinky_02_l: 'leftLittleIntermediate', pinky_03_l: 'leftLittleDistal',
  thumb_01_r: 'rightThumbMetacarpal', thumb_02_r: 'rightThumbProximal', thumb_03_r: 'rightThumbDistal',
  index_01_r: 'rightIndexProximal', index_02_r: 'rightIndexIntermediate', index_03_r: 'rightIndexDistal',
  middle_01_r: 'rightMiddleProximal', middle_02_r: 'rightMiddleIntermediate', middle_03_r: 'rightMiddleDistal',
  ring_01_r: 'rightRingProximal', ring_02_r: 'rightRingIntermediate', ring_03_r: 'rightRingDistal',
  pinky_01_r: 'rightLittleProximal', pinky_02_r: 'rightLittleIntermediate', pinky_03_r: 'rightLittleDistal',
};

/**
 * Time (seconds into the clip) of the blow of each attack. The combat gives a cast 110 ms
 * between the start of the animation and its impact (RunScene 'cast' event), so the clip skips
 * its wind-up and starts at peak - 110 ms (scaled by the clip's speed).
 */
const IMPACT: Partial<Record<AnimName, number>> = { slash: 0.4, punch: 0.17, kick: 0.23 };
const startOf = (name: AnimName, speed: number) => Math.max(0, (IMPACT[name] ?? 0) - 0.11 * speed);

/** How a unit moves: heavy ones swing slowly, light ones are quick and jog instead of walking. */
export type Build = 'light' | 'heavy';
const ATTACKS = new Set<AnimName>(['slash', 'punch', 'kick', 'shoot', 'cast', 'hack']);

/**
 * A clip with its rotations already moved into world rest space (that part is the same for
 * every avatar); only the bone names, the VRM 0 axis flip and the hips scale are per avatar.
 */
type Motion = { clip: THREE.AnimationClip; hipsHeight: number };
let motions: Promise<Map<string, Motion>> | undefined;

function loadMotions(): Promise<Map<string, Motion>> {
  motions ??= (async () => {
    const asset = await new GLTFLoader().loadAsync(ANIM_FILE).catch(e => { console.error('[neon] animations not loaded:', ANIM_FILE, e); return null; });
    if (!asset) return new Map<string, Motion>();
    const nodes = new Map<string, THREE.Object3D>();
    asset.scene.traverse(o => nodes.set(o.name, o));
    asset.scene.updateMatrixWorld(true);
    const hipsHeight = nodes.get('pelvis')!.getWorldPosition(new THREE.Vector3()).y || 1;
    const restInv = new THREE.Quaternion(), parentRest = new THREE.Quaternion(), q = new THREE.Quaternion();
    const out = new Map<string, Motion>();
    for (const src of asset.animations) {
      const tracks: THREE.KeyframeTrack[] = [];
      for (const t of src.tracks) {
        const dot = t.name.lastIndexOf('.');
        const bone = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
        const node = nodes.get(bone);
        if (!RIG[bone] || !node?.parent) continue;
        node.parent.getWorldQuaternion(parentRest);
        if (t instanceof THREE.QuaternionKeyframeTrack) {
          node.getWorldQuaternion(restInv).invert();
          const v = t.values.slice();
          for (let i = 0; i < v.length; i += 4) {
            q.fromArray(v, i).premultiply(parentRest).multiply(restInv);
            q.toArray(v, i);
          }
          tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.${prop}`, t.times, v));
        } else if (t instanceof THREE.VectorKeyframeTrack && bone === 'pelvis' && prop === 'position') {
          // The rig is Z-up under its root: bring the track to world axes, then in place (the
          // board moves the units, the clip only moves the body up and down).
          const v = t.values.slice(), p = new THREE.Vector3();
          for (let i = 0; i < v.length; i += 3) { p.fromArray(v, i).applyQuaternion(parentRest); p.toArray(v, i); }
          const x0 = v[0], z0 = v[2];
          for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
          tracks.push(new THREE.VectorKeyframeTrack(`${bone}.${prop}`, t.times, v));
        }
      }
      out.set(src.name, { clip: new THREE.AnimationClip(src.name, src.duration, tracks), hipsHeight });
    }
    if (!out.size) console.error('[neon] animation file has no usable clips:', ANIM_FILE);
    return out;
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
    p = fetch(assetUrl(`${VRM_BASE}${name}.vrm`)).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
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
  private pace = 1;
  private phase = 0;

  /** `avatar`: file name in assets/vrm; `scale` 1 = a person of 1.7 m. */
  constructor(avatar: string, scale = 1, private build?: Build) {
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
      // The hero's outline can be a neon colour, unlocked by a first win (core/ending.ts).
      const pick = settings().look;
      const look = avatar === 'hero' && pick !== 'none' ? LOOK_COLOR[pick] : 0x0a0614;
      vrm.scene.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as MToonMaterial[]) {
          if (!mat.isMToonMaterial) continue;
          mat.outlineWidthMode = 'worldCoordinates';
          mat.outlineWidthFactor = (look === 0x0a0614 ? 0.012 : 0.02) / k;
          mat.outlineColorFactor.setHex(look);
          mat.outlineLightingMixFactor = 0;
        }
      });
      // Mechanical arms, visors, implants (see cyberware.ts), fitted while the avatar is at rest.
      installCyberware(avatar, vrm);
      this.root.add(vrm.scene);
      this.mixer = new THREE.AnimationMixer(vrm.scene);
      // Everyone breathes at their own pace and starts at their own moment of the loop.
      this.pace = 0.92 + Math.random() * 0.16;
      this.phase = Math.random();
      for (const name of ANIMS) {
        const m = mo.get(ROLE_CLIP[name]);
        if (!m) continue;
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
    }).catch(e => { console.error('[neon] character setup failed:', avatar, e); return false; });
  }

  play(name: AnimName) {
    this.pending = name;
    if (!this.mixer) return;
    const fallback: Partial<Record<AnimName, AnimName>> = {
      punch: 'slash', kick: 'punch', shoot: 'cast', cast: 'punch', hack: 'cast', buff: 'cast', roll: 'jump', talk: 'idle', victory: 'idle',
      jog: 'walk', ready: 'idle', phone: 'idle', dance: 'talk', sit: 'idle', sitTalk: 'sit',
    };
    if (this.build === 'light' && name === 'walk') name = 'jog';
    let n: AnimName | undefined = name;
    while (n && !this.actions.has(n)) n = fallback[n];
    const next = this.actions.get(n ?? 'idle');
    if (!next || (next === this.current && !ONCE.has(name))) return;
    next.reset().setEffectiveWeight(1).fadeIn(0.15).play();
    const role = n ?? 'idle';
    const speed = this.build && ATTACKS.has(role) ? (this.build === 'heavy' ? 0.8 : 1.25) : ONCE.has(role) ? 1 : this.pace;
    next.setEffectiveTimeScale(speed);
    next.time = ONCE.has(role) ? startOf(role, speed) : this.phase * next.getClip().duration;
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
      em.setValue('aa', this.currentName === 'talk' || this.currentName === 'sitTalk' ? Math.max(0, Math.sin(this.t * 14)) * 0.6 : 0);
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
