import { describe, it, expect } from 'vitest';
import { rollLoot, RELIC_CHANCE } from '../../src/core/loot';
import { createRng } from '../../src/core/rng';

describe('breakable loot', () => {
  it('drops a relic rarely (about RELIC_CHANCE)', () => {
    const rng = createRng(12);
    let relics = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) if (rollLoot(rng, true).kind === 'relic') relics++;
    expect(RELIC_CHANCE).toBeLessThanOrEqual(0.05);
    expect(relics / N).toBeGreaterThan(RELIC_CHANCE * 0.7);
    expect(relics / N).toBeLessThan(RELIC_CHANCE * 1.3);
  });
  it('never drops a relic when none is left to find', () => {
    const rng = createRng(3);
    for (let i = 0; i < 5000; i++) expect(rollLoot(rng, false).kind).not.toBe('relic');
  });
  it('heal and credit drops carry a positive amount; most breakables give something', () => {
    const rng = createRng(9);
    let something = 0;
    for (let i = 0; i < 2000; i++) {
      const l = rollLoot(rng, true);
      if (l.kind === 'heal' || l.kind === 'credits') expect(l.amount).toBeGreaterThan(0);
      if (l.kind !== 'nothing') something++;
    }
    expect(something / 2000).toBeGreaterThan(0.5);
  });
});
