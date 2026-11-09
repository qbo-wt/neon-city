import { describe, it, expect } from 'vitest';
import { HEAT_PACTS, MAX_HEAT, heatCreditMult, heatEffects, heatPoints, heatRecordBonus } from '../../src/data/heat';
import { betterDaily, dailySeed, dateKey, recordDaily } from '../../src/core/daily';

describe('notoriety', () => {
  it('counts points per rank and caps ranks at their max', () => {
    expect(heatPoints({})).toBe(0);
    expect(heatPoints({ armor: 2, reflex: 1 })).toBe(2 + 2);
    expect(heatPoints({ armor: 9 })).toBe(2);
    expect(MAX_HEAT).toBe(HEAT_PACTS.reduce((s, p) => s + p.max * p.points, 0));
  });
  it('pays more credits the higher it is, and a one-off bonus above your record', () => {
    expect(heatCreditMult(0)).toBe(1);
    expect(heatCreditMult(5)).toBeCloseTo(1.5);
    expect(heatRecordBonus(4, 2)).toBe(80);
    expect(heatRecordBonus(2, 4)).toBe(0);
  });
  it('translates into enemy and run modifiers', () => {
    const none = heatEffects({});
    expect(none).toMatchObject({ hpMult: 1, damageMult: 1, pmBonus: 0, healMult: 1, psyRateMult: 1, squads: false });
    const hard = heatEffects({ armor: 2, rage: 1, nomercy: 1, smog: 2, squads: 1, bosses: 1 });
    expect(hard.hpMult).toBeCloseTo(1.5);
    expect(hard.damageMult).toBeCloseTo(1.2);
    expect(hard.healMult).toBe(0.5);
    expect(hard.psyRateMult).toBeCloseTo(1.8);
    expect(hard.squads).toBe(true);
    expect(hard.bossHpMult).toBeGreaterThan(1);
  });
});

describe('daily run', () => {
  it('uses the local date as key and a stable seed per date', () => {
    expect(dateKey(new Date(2026, 10, 9))).toBe('2026-11-09');
    expect(dailySeed('2026-11-09')).toBe(dailySeed('2026-11-09'));
    expect(dailySeed('2026-11-09')).not.toBe(dailySeed('2026-11-10'));
  });
  it('keeps only the best attempt of each day', () => {
    const a = { date: '2026-11-09', sector: 5, victory: false, timeMs: 1000, kills: 10 };
    const better = { ...a, sector: 7 }, worse = { ...a, sector: 3 };
    let r = recordDaily([], a);
    expect(r.best).toBe(true);
    r = recordDaily(r.list, worse);
    expect(r.best).toBe(false);
    expect(r.list).toEqual([a]);
    r = recordDaily(r.list, better);
    expect(r.list).toEqual([better]);
    expect(betterDaily({ ...a, victory: true, sector: 10 }, better)).toBe(true);
    expect(betterDaily({ ...better, timeMs: 500 }, better)).toBe(true);
  });
});
