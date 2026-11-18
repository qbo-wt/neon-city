import { describe, it, expect } from 'vitest';
import { RELICS } from '../../src/data/relics';
import { RELIC_SPECS, buildRelicModel } from '../../src/three/relicModels';

describe('relic models', () => {
  it('has a model spec for every relic id, with the relic rarity, and none for unknown ids', () => {
    for (const r of RELICS) { expect(RELIC_SPECS[r.id], r.id).toBeDefined(); expect(RELIC_SPECS[r.id].rarity, r.id).toBe(r.rarity); }
    for (const id of Object.keys(RELIC_SPECS)) expect(RELICS.some(r => r.id === id), id).toBe(true);
  });

  it('builds a non-empty model for each relic', () => {
    for (const r of RELICS) expect(buildRelicModel(r.id)!.children[0].children.length, r.id).toBeGreaterThan(3);
    expect(buildRelicModel('nope')).toBeNull();
  });
});
