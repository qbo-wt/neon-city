import { describe, it, expect } from 'vitest';
import { buildFlowField, nextStep, reachableCount, UNREACHABLE } from '../../src/core/flowField';

/** '#' blocked, anything else passable. */
const grid = (rows: string[]) => ({
  w: rows[0].length, h: rows.length,
  passable: (x: number, y: number) => rows[y]?.[x] !== undefined && rows[y][x] !== '#',
});

describe('flow field', () => {
  it('measures walking distance around obstacles, not straight-line distance', () => {
    const g = grid([
      '.....',
      '.###.',
      '.....',
    ]);
    const f = buildFlowField(g.passable, g.w, g.h, { x: 2, y: 2 });
    expect(f[2 * g.w + 2]).toBe(0);
    // (2,0) is right above the target but the wall forces a detour.
    expect(f[0 * g.w + 2]).toBeGreaterThan(2);
    expect(f[1 * g.w + 2]).toBe(UNREACHABLE);
  });
  it('next step goes around a wall toward the target', () => {
    const g = grid([
      '.....',
      '.###.',
      '.....',
    ]);
    const f = buildFlowField(g.passable, g.w, g.h, { x: 2, y: 2 });
    let p = { x: 2, y: 0 };
    for (let i = 0; i < 10 && !(p.x === 2 && p.y === 2); i++) {
      const n = nextStep(f, g.w, g.h, p, g.passable)!;
      expect(g.passable(n.x, n.y)).toBe(true);
      p = n;
    }
    expect(p).toEqual({ x: 2, y: 2 });
  });
  it('never cuts a corner diagonally between two blocked tiles', () => {
    const g = grid([
      '.#.',
      '#..',
      '...',
    ]);
    const f = buildFlowField(g.passable, g.w, g.h, { x: 2, y: 2 });
    // From (0,0) the only neighbours are blocked or a diagonal squeezed between two walls.
    expect(nextStep(f, g.w, g.h, { x: 0, y: 0 }, g.passable)).toBeNull();
  });
  it('returns null when the target cannot be reached', () => {
    const g = grid([
      '..#..',
      '..#..',
    ]);
    const f = buildFlowField(g.passable, g.w, g.h, { x: 4, y: 0 });
    expect(nextStep(f, g.w, g.h, { x: 0, y: 0 }, g.passable)).toBeNull();
  });
});

describe('reachableCount', () => {
  it('counts every tile reachable from a start, so a prop that cuts a corridor can be detected', () => {
    const open = grid(['.....', '###.#', '.....']);
    expect(reachableCount(open.passable, open.w, open.h, { x: 0, y: 0 })).toBe(11);
    const cut = grid(['.....', '#####', '.....']);
    expect(reachableCount(cut.passable, cut.w, cut.h, { x: 0, y: 0 })).toBe(5);
  });
});
