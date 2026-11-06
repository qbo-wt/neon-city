import Phaser from 'phaser';
import { COLORS } from '../config';
import { TILE, findTile } from '../core/runMap';
import type { RoomTemplate } from '../data/rooms';

export interface BuiltRoom {
  walls: Phaser.Physics.Arcade.StaticGroup;
  start: { x: number; y: number };
  /** World size in px. */
  width: number;
  height: number;
  /** Locked exit doors, replaced by real doors when the room is cleared. */
  doorSlots: { x: number; y: number; locked: Phaser.GameObjects.GameObject }[];
  /** Pixel centres of every letter tile other than # . o P D (interior doors, elevator…), drawn as solid wall. */
  marks: Record<string, { x: number; y: number; obj: Phaser.Physics.Arcade.Image }[]>;
}

export interface RoomOptions {
  /** null = no floor tiles (the scene paints its own ground) */
  floorKey?: string | null;
  wallKey?: string;
  streetLights?: boolean;
  obstacleKey?: () => string;
}

/** Which of the 3 'D' slots (sorted left to right) become exits for a given door count. */
export function doorPicks(count: number): number[] {
  return count >= 3 ? [0, 1, 2] : count === 2 ? [0, 2] : count === 1 ? [1] : [];
}

export function buildRoom(scene: Phaser.Scene, template: RoomTemplate, doorCount: number, opts: RoomOptions = {}): BuiltRoom {
  const { floorKey = 'tile-floor', wallKey = 'tile-wall', streetLights = true, obstacleKey = () => 'tile-obstacle' } = opts;
  const walls = scene.physics.add.staticGroup();
  const marks: BuiltRoom['marks'] = {};
  const doorTiles: { x: number; y: number }[] = [];
  template.grid.forEach((row, ty) => [...row].forEach((ch, tx) => { if (ch === 'D') doorTiles.push({ x: tx, y: ty }); }));
  doorTiles.sort((a, b) => a.x - b.x);
  const exits = new Set(doorPicks(doorCount).map(i => doorTiles[i]).filter(Boolean));
  const doorSlots: BuiltRoom['doorSlots'] = [];

  template.grid.forEach((row, ty) => [...row].forEach((ch, tx) => {
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
    if (ch === ' ') return; // void outside the map
    if (ch === '#') { walls.create(x, y, wallKey); return; }
    if (ch === 'D') {
      const isExit = [...exits].some(d => d.x === tx && d.y === ty);
      if (isExit) doorSlots.push({ x, y, locked: walls.create(x, y, 'door-locked') });
      else walls.create(x, y, wallKey);
      return;
    }
    if (ch !== '.' && ch !== 'o' && ch !== 'P') {
      (marks[ch] ??= []).push({ x, y, obj: walls.create(x, y, wallKey) });
      return;
    }
    if (floorKey) scene.add.image(x, y, floorKey).setDepth(0);
    if (ch === 'o') {
      const o = walls.create(x, y, obstacleKey()) as Phaser.Physics.Arcade.Image;
      o.setDepth(2);
      (o.body as Phaser.Physics.Arcade.StaticBody).setSize(26, 24).setOffset(3, 5);
    }
  }));
  doorSlots.sort((a, b) => a.x - b.x);

  // Neon light pools spilling from the walls onto the wet street.
  const neon = [COLORS.magenta, COLORS.cyan, COLORS.yellow];
  for (let tx = 1; streetLights && tx < 14; tx += 3) {
    scene.add.image(tx * TILE + 16, 40, 'glow').setTint(neon[tx % 3]).setAlpha(0.22).setScale(1.4, 0.8)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(1);
  }

  const hasP = template.grid.some(r => r.includes('P'));
  const p = hasP ? findTile(template, 'P') : { x: 7, y: 6 };
  return {
    walls, doorSlots, marks,
    start: { x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 },
    width: template.grid[0].length * TILE, height: template.grid.length * TILE,
  };
}
