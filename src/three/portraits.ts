import * as THREE from 'three';
import { VRMUtils } from '@pixiv/three-vrm';
import type Phaser from 'phaser';
import { CAST, CharacterRig } from './characters';
import { DroneRig, type Rig } from './rigs';

/**
 * Bust portraits of the anime characters for the interface (bestiary…): each avatar is rendered
 * once, upper body, three-quarter view, by a small offscreen renderer shared by all portraits.
 */
const SIZE = 208;
let renderer: THREE.WebGLRenderer | undefined;
let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, Promise<HTMLCanvasElement | null>>();

function getRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

async function render(kind: string): Promise<HTMLCanvasElement | null> {
  const rig: Rig = kind === 'drone' ? new DroneRig() : new CharacterRig(CAST[kind] ?? kind);
  if (rig instanceof CharacterRig && !(await rig.ready)) return null;
  rig.play('idle');
  for (let i = 0; i < 40; i++) rig.update(1 / 60);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xd8d0ff, 0x2a1a5a, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-1.5, 2.5, 3);
  const rim = new THREE.DirectionalLight(0xff2a6d, 2.2); rim.position.set(2.5, 1.5, -2);
  const fill = new THREE.DirectionalLight(0x00f0ff, 0.8); fill.position.set(-3, 0.5, -1);
  scene.add(key, rim, fill);
  rig.root.rotation.y = -0.4;
  scene.add(rig.root);
  rig.root.updateMatrixWorld(true);
  // Frame on the head bone (skinned bounding boxes and the nominal height are unreliable).
  const drone = kind === 'drone';
  const head = (rig as unknown as { vrm?: { humanoid: { getNormalizedBoneNode(n: string): THREE.Object3D | null } } }).vrm?.humanoid.getNormalizedBoneNode('head');
  const headY = head ? head.getWorldPosition(new THREE.Vector3()).y : rig.height * 0.9;
  const span = drone ? 1.1 : headY * 0.3;
  const cy = drone ? 1.3 : headY * 0.97;
  const cam = new THREE.PerspectiveCamera(22, 1, 0.05, 50);
  const dist = (span / 2) / Math.tan(THREE.MathUtils.degToRad(11)) + 0.2;
  cam.position.set(0, cy + (drone ? dist * 0.45 : span * 0.08), dist);
  cam.lookAt(0, cy, 0);
  const r = getRenderer();
  r.render(scene, cam);
  const out = document.createElement('canvas');
  out.width = out.height = SIZE;
  out.getContext('2d')!.drawImage(r.domElement, 0, 0);
  scene.remove(rig.root);
  VRMUtils.deepDispose(rig.root);
  return out;
}

/** The portrait of a unit kind ('runner', 'boss', 'drone'…), rendered once and cached. */
export function portrait(kind: string): Promise<HTMLCanvasElement | null> {
  let p = cache.get(kind);
  if (!p) {
    // One render at a time: they share the renderer.
    p = queue.then(() => render(kind)).catch(() => null);
    queue = p;
    cache.set(kind, p);
  }
  return p;
}

/** A canvas of the same portrait filled near-black: the silhouette of a locked file. */
function silhouette(src: HTMLCanvasElement) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#1a1040';
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/**
 * Registers `portrait-<kind>` and `portrait-<kind>-dark` as Phaser textures once the portrait is
 * ready; resolves with the key (or null if the avatar could not load).
 */
export async function portraitTexture(scene: Phaser.Scene, kind: string, dark = false): Promise<string | null> {
  const key = `portrait-${kind}${dark ? '-dark' : ''}`;
  if (scene.textures.exists(key)) return key;
  const c = await portrait(kind);
  if (!c || !scene.sys?.textures) return null;
  if (!scene.textures.exists(`portrait-${kind}`)) scene.textures.addCanvas(`portrait-${kind}`, c);
  if (!scene.textures.exists(`portrait-${kind}-dark`)) scene.textures.addCanvas(`portrait-${kind}-dark`, silhouette(c));
  // Smooth filtering (the game is pixelArt): these are downscaled renders, not pixel art.
  for (const k of [`portrait-${kind}`, `portrait-${kind}-dark`]) scene.textures.get(k).setFilter(0);
  return key;
}
