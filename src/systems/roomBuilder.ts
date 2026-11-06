import Phaser from 'phaser';
import { COLORS } from '../config';
import { TILE, findTile } from '../core/runMap';
import type { RoomTemplate } from '../data/rooms';

export interface BuiltRoom {
  walls: Phaser.Physics.Arcade.StaticGroup;
  start: { x: number; y: number };
  /** Locked door tiles in the top wall, replaced by real doors when the room is cleared. */
  doorSlots: { x: number; y: number; locked: Phaser.GameObjects.GameObject }[];
}

export function doorColumns(count: number): number[] {
  return count === 3 ? [3, 7, 11] : count === 2 ? [5, 9] : count === 1 ? [7] : [];
}

export function buildRoom(scene: Phaser.Scene, template: RoomTemplate, doorCount: number, floorKey = 'tile-floor', streetLights = true, wallKey = 'tile-wall'): BuiltRoom {
  const walls = scene.physics.add.staticGroup();
  const cols = doorColumns(doorCount);
  const doorSlots: BuiltRoom['doorSlots'] = [];

  template.grid.forEach((row, ty) => [...row].forEach((ch, tx) => {
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
    if (ch === '#') {
      if (ty === 0 && cols.includes(tx)) {
        const locked = walls.create(x, y, 'door-locked');
        doorSlots.push({ x, y, locked });
      } else {
        walls.create(x, y, wallKey);
      }
      return;
    }
    scene.add.image(x, y, floorKey).setDepth(0);
    if (ch === 'o') {
      const o = walls.create(x, y, 'tile-obstacle') as Phaser.Physics.Arcade.Image;
      (o.body as Phaser.Physics.Arcade.StaticBody).setSize(26, 24).setOffset(3, 5);
    }
  }));

  // Neon light pools spilling from the walls onto the wet street.
  const neon = [COLORS.magenta, COLORS.cyan, COLORS.yellow];
  for (let tx = 1; streetLights && tx < 14; tx += 3) {
    scene.add.image(tx * TILE + 16, 40, 'glow').setTint(neon[tx % 3]).setAlpha(0.22).setScale(1.4, 0.8)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(1);
  }

  const p = findTile(template, 'P');
  return { walls, start: { x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 }, doorSlots };
}
