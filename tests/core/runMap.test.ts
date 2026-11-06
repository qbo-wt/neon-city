import { describe, it, expect } from 'vitest';
import { generateRun, spawnPoints, TILE } from '../../src/core/runMap';
import { ROOM_TEMPLATES, BOSS_ROOM } from '../../src/data/rooms';
import { createRng } from '../../src/core/rng';
import { CONFIG } from '../../src/config';

describe('run generation', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(generateRun(5))).toBe(JSON.stringify(generateRun(5)));
  });
  it('has 10 rooms with a boss every 5 rooms', () => {
    const run = generateRun(11);
    expect(CONFIG.ROOMS_PER_RUN).toBe(10);
    expect(run).toHaveLength(10);
    expect(run.filter(r => r.isBoss).map(r => r.index)).toEqual([4, 9]);
  });
  it('a boss room holds the boss alone, in a single wave', () => {
    const run = generateRun(3);
    expect(run[4].waves).toEqual([['warden']]);
    expect(run[9].waves).toEqual([['boss']]);
  });
  it('the mid-run boss opens doors, the final boss ends the run', () => {
    const run = generateRun(8);
    expect(run[4].doorRewards.length).toBeGreaterThanOrEqual(2);
    expect(run[9].doorRewards).toEqual([]);
  });
  it('the 3 new enemies appear in later sectors', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 40; seed++) generateRun(seed).filter(r => !r.isBoss).forEach(r => r.waves.flat().forEach(id => seen.add(id)));
    ['drone', 'bomber', 'hacker'].forEach(id => expect(seen.has(id)).toBe(true));
    generateRun(1)[0].waves.flat().forEach(id => expect(['runner', 'gunner']).toContain(id));
  });
  it('waves grow with index and doors offer 2-3 rewards', () => {
    for (let seed = 0; seed < 50; seed++) {
      const run = generateRun(seed);
      expect(run[0].waves).toHaveLength(1);
      expect(run[6].waves.length).toBeGreaterThanOrEqual(2);
      run.filter(r => !r.isBoss).forEach(r => {
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
