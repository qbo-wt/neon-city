import * as THREE from 'three';
import { World3D } from './World3D';
import { generateArena, type ArenaStyle } from '../tactics/arena';
import { createRng } from '../core/rng';

/** Dev-only page (preview3d.html?style=avenue&seed=3): one sector in 3D, to judge the look. */
const q = new URLSearchParams(location.search);
const style = (q.get('style') ?? 'avenue') as ArenaStyle;
const seed = Number(q.get('seed') ?? 3);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const w = innerWidth, h = innerHeight;
const world = new World3D(canvas, w, h);
const { board } = generateArena(style, createRng(seed), 3, style === 'checkpoint');

/** Stand-in figure until the real characters arrive. */
function mannequin(color: number) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 6, 12), mat);
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), mat);
  head.position.y = 1.65;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x00f0ff, toneMapped: false }));
  visor.position.set(0, 1.67, 0.13);
  [body, head].forEach(m => { m.castShadow = true; });
  g.add(body, head, visor);
  return g;
}

await world.loadEnvironment();
await world.buildBoard(board, seed);
world.frameBoard(w, h);
const hero = mannequin(0x2a6aff);
hero.position.copy(world.cellPos(board.playerStarts[0]));
world.scene.add(hero);
board.enemyStarts.slice(0, 3).forEach(p => { const m = mannequin(0xff2a6d); m.position.copy(world.cellPos(p)); world.scene.add(m); });
const range: { p: { x: number; y: number }; color: number; alpha: number }[] = [];
const s = board.playerStarts[0];
for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
  const p = { x: s.x + dx, y: s.y + dy };
  if (Math.abs(dx) + Math.abs(dy) > 3 || !(dx || dy) || p.x < 0 || p.y < 0 || p.x >= board.w || p.y >= board.h || board.cells[p.y * board.w + p.x] !== 'floor') continue;
  range.push({ p, color: 0x39ff88, alpha: 0.35 });
}
world.setOverlay('range', range);
const loop = () => { world.frame(); requestAnimationFrame(loop); };
loop();
(window as unknown as { __READY__: boolean }).__READY__ = true;
