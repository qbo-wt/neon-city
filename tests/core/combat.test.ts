import { describe, it, expect } from 'vitest';
import { resolveParry, computeHitDamage } from '../../src/core/combat';
import { baseStats } from '../../src/core/stats';

describe('parry', () => {
  it('parries within [0, 150] ms of parry start', () => {
    expect(resolveParry(1000, 1000)).toBe('parried');
    expect(resolveParry(1000, 1150)).toBe('parried');
    expect(resolveParry(1000, 1151)).toBe('hit');
    expect(resolveParry(1000, 999)).toBe('hit');
  });
  it('a longer window (skill node) catches later hits', () => {
    expect(resolveParry(1000, 1190, 200)).toBe('parried');
    expect(resolveParry(1000, 1201, 200)).toBe('hit');
  });
});

describe('damage', () => {
  const s = { ...baseStats(), critChance: 0.1 };
  it('base hit', () => {
    expect(computeHitDamage(s, { countered: false, tier: 'stable', roll: 0.9 })).toEqual({ amount: 10, crit: false });
  });
  it('countered in crisis = 30', () => {
    expect(computeHitDamage(s, { countered: true, tier: 'crisis', roll: 0.9 }).amount).toBe(30);
  });
  it('counter uses the stats counter multiplier', () => {
    expect(computeHitDamage({ ...s, counterMult: 3 }, { countered: true, tier: 'stable', roll: 0.9 }).amount).toBe(30);
  });
  it('crit doubles', () => {
    expect(computeHitDamage(s, { countered: false, tier: 'stable', roll: 0.05 })).toEqual({ amount: 20, crit: true });
  });
});
