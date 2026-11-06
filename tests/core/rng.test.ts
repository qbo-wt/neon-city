import { describe, it, expect } from 'vitest';
import { createRng, randInt, pick } from '../../src/core/rng';

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42), b = createRng(42);
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
  });
  it('differs between seeds', () => {
    const a = createRng(1), b = createRng(2);
    expect(Array.from({ length: 5 }, a)).not.toEqual(Array.from({ length: 5 }, b));
  });
  it('randInt stays within inclusive bounds and hits all', () => {
    const r = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = randInt(r, 1, 3);
      expect([1, 2, 3]).toContain(v);
      seen.add(v);
    }
    expect(seen.size).toBe(3);
  });
  it('pick returns an element', () => {
    expect(['a', 'b']).toContain(pick(createRng(3), ['a', 'b']));
  });
});
