import Phaser from 'phaser';
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

/** Which of the 3 'D' slots (sorted left to right) become exits for a given door count. */
export function doorPicks(count: number): number[] {
  return count >= 3 ? [0, 1, 2] : count === 2 ? [0, 2] : count === 1 ? [1] : [];
}

/** The collision layer of a room (invisible: the room itself is drawn in 3D, see src/three/Interior3D). */
export function buildRoom(scene: Phaser.Scene, template: RoomTemplate, doorCount: number): BuiltRoom {
  const wallAt = (x: number, y: number) => (walls.create(x, y, 'tile-wall') as Phaser.Physics.Arcade.Image).setVisible(false);
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
    if (ch === '#') { wallAt(x, y); return; }
    if (ch === 'D') {
      const isExit = [...exits].some(d => d.x === tx && d.y === ty);
      if (isExit) doorSlots.push({ x, y, locked: walls.create(x, y, 'door-locked') });
      else wallAt(x, y);
      return;
    }
    if (ch !== '.' && ch !== 'o' && ch !== 'P') {
      (marks[ch] ??= []).push({ x, y, obj: walls.create(x, y, 'tile-wall') });
      return;
    }
    if (ch === 'o') {
      const o = walls.create(x, y, 'tile-obstacle') as Phaser.Physics.Arcade.Image;
      o.setDepth(2);
      (o.body as Phaser.Physics.Arcade.StaticBody).setSize(26, 24).setOffset(3, 5);
    }
  }));
  doorSlots.sort((a, b) => a.x - b.x);

  const hasP = template.grid.some(r => r.includes('P'));
  const p = hasP ? findTile(template, 'P') : { x: 7, y: 6 };
  return {
    walls, doorSlots, marks,
    start: { x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 },
    width: template.grid[0].length * TILE, height: template.grid.length * TILE,
  };
}
