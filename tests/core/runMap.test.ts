import { describe, it, expect } from 'vitest';
import { generateRun, spawnPoints, TILE } from '../../src/core/runMap';
import { ROOM_TEMPLATES, BOSS_ROOM } from '../../src/data/rooms';
import { createRng } from '../../src/core/rng';
import { CONFIG } from '../../src/config';

describe('run generation', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(generateRun(5))).toBe(JSON.stringify(generateRun(5)));
  });
  it('has 8 rooms, only the last is the boss', () => {
    const run = generateRun(11);
    expect(run).toHaveLength(CONFIG.ROOMS_PER_RUN);
    expect(run.filter(r => r.isBoss).map(r => r.index)).toEqual([CONFIG.ROOMS_PER_RUN - 1]);
    expect(run[run.length - 1].doorRewards).toEqual([]);
  });
  it('waves grow with index and doors offer 2-3 rewards', () => {
    for (let seed = 0; seed < 50; seed++) {
      const run = generateRun(seed);
      expect(run[0].waves).toHaveLength(1);
      expect(run[6].waves.length).toBeGreaterThanOrEqual(2);
      run.slice(0, -1).forEach(r => {
        expect(r.doorRewards.length).toBeGreaterThanOrEqual(2);
        expect(r.doorRewards.length).toBeLessThanOrEqual(3);
      });
    }
  });
  it('templates are 15x8 with exactly one P', () => {
    expect(ROOM_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    [...ROOM_TEMPLATES, BOSS_ROOM].forEach(t => {
      expect(t.grid).toHaveLength(8);
      t.grid.forEach(row => expect(row).toHaveLength(15));
      expect(t.grid.join('').split('P').length - 1).toBe(1);
    });
  });
  it('spawn points are on floor and far from the player', () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = createRng(seed);
      const t = ROOM_TEMPLATES[seed % ROOM_TEMPLATES.length];
      const player = { x: 7, y: 6 };
      const pts = spawnPoints(t, 4, player, rng);
      expect(pts).toHaveLength(4);
      pts.forEach(p => {
        const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
        expect(['.', 'P']).toContain(t.grid[ty][tx]);
        const d = Math.hypot(p.x - (player.x + 0.5) * TILE, p.y - (player.y + 0.5) * TILE);
        expect(d).toBeGreaterThanOrEqual(CONFIG.MIN_SPAWN_DIST);
      });
    }
  });
});
