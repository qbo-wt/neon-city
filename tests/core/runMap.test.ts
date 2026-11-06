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
  it('maps are big, varied in shape, closed and fully walkable from the start', () => {
    expect(ROOM_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    [...ROOM_TEMPLATES, BOSS_ROOM].forEach(t => {
      const g = t.grid, h = g.length, w = g[0].length;
      g.forEach(row => expect(row).toHaveLength(w));
      expect(w * h).toBeGreaterThanOrEqual(15 * 8 * 2); // at least twice the old screen-sized rooms
      expect(g.join('').split('P').length - 1).toBe(1);
      const at = (x: number, y: number) => (y < 0 || y >= h || x < 0 || x >= w ? ' ' : g[y][x]);
      const walk = (c: string) => c === '.' || c === 'P' || c === 'o';
      // Closed: no walkable tile touches the void or the edge.
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (walk(g[y][x]))
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => expect(at(x + dx, y + dy)).not.toBe(' '));
      // Doors sit in a wall with floor right below.
      const doors: number[][] = [];
      g.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'D') doors.push([x, y]); }));
      expect(doors.length).toBe(3);
      doors.forEach(([x, y]) => expect(walk(at(x, y + 1))).toBe(true));
      // Every floor tile is reachable from P.
      const p = g.findIndex(r => r.includes('P')), start = [g[p].indexOf('P'), p];
      const seen = new Set([start.join()]), queue = [start];
      while (queue.length) {
        const [x, y] = queue.pop()!;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
          const k = [x + dx, y + dy].join();
          if (!seen.has(k) && (at(x + dx, y + dy) === '.' || at(x + dx, y + dy) === 'P')) { seen.add(k); queue.push([x + dx, y + dy]); }
        });
      }
      const floor = g.join('').split('').filter(c => c === '.' || c === 'P').length;
      expect(seen.size).toBe(floor);
    });
    // Not all rectangles: at least 3 templates contain void tiles.
    expect(ROOM_TEMPLATES.filter(t => t.grid.join('').includes(' ')).length).toBeGreaterThanOrEqual(3);
  });
  it('spawn points skip blocked tiles', () => {
    const t = ROOM_TEMPLATES[0];
    const py = t.grid.findIndex(r => r.includes('P'));
    const blocked = new Set<string>();
    t.grid.forEach((row, y) => [...row].forEach((c, x) => { if (c === '.' && (x + y) % 2) blocked.add(`${x},${y}`); }));
    spawnPoints(t, 20, { x: t.grid[py].indexOf('P'), y: py }, createRng(4), blocked).forEach(p => {
      expect(blocked.has(`${Math.floor(p.x / TILE)},${Math.floor(p.y / TILE)}`)).toBe(false);
    });
  });
  it('spawn points are on floor and far from the player', () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = createRng(seed);
      const t = ROOM_TEMPLATES[seed % ROOM_TEMPLATES.length];
      const py = t.grid.findIndex(r => r.includes('P'));
      const player = { x: t.grid[py].indexOf('P'), y: py };
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
