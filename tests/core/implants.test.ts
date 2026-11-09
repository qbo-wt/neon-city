import { describe, it, expect } from 'vitest';
import { applyOffer, offerImplants, rollRarity } from '../../src/core/implantOffer';
import { createRng } from '../../src/core/rng';
import { baseStats, computeStats, implantLoad, totalLoad } from '../../src/core/stats';
import { computeHitDamage } from '../../src/core/combat';
import { IMPLANTS, IMPLANT_BY_ID, MAX_LEVEL, canUpgrade } from '../../src/data/implants';
import { activeSynergies } from '../../src/data/synergies';
import type { Implant } from '../../src/core/types';

const get = (id: string, level = 1): Implant => ({ ...IMPLANT_BY_ID.get(id)!, level });

describe('implant catalogue', () => {
  it('has four families, three rarities and black-market dilemmas', () => {
    const fams = new Set(IMPLANTS.map(i => i.family).filter(Boolean));
    expect(fams).toEqual(new Set(['chrome', 'neural', 'blood', 'optic']));
    for (const r of ['common', 'rare', 'epic', 'black']) expect(IMPLANTS.some(i => i.rarity === r)).toBe(true);
    // Every family can reach its 3-implant synergy.
    for (const f of fams) expect(IMPLANTS.filter(i => i.family === f).length).toBeGreaterThanOrEqual(3);
  });
  it('upgrades scale the effect and the psychosis load', () => {
    const l1 = computeStats([get('arm-blades', 1)], []).damage, l3 = computeStats([get('arm-blades', 3)], []).damage;
    expect(l1).toBe(baseStats().damage + 6);
    expect(l3).toBe(baseStats().damage + 12);
    expect(implantLoad(get('arm-blades', 3))).toBeGreaterThan(implantLoad(get('arm-blades', 1)));
    expect(totalLoad([get('arm-blades', 2)], baseStats())).toBeCloseTo(12 * 1.3);
  });
  it('black-market implants have a drawback and cannot be upgraded', () => {
    const os = get('berserker-os');
    const s = computeStats([os], []);
    expect(s.damage).toBeGreaterThan(baseStats().damage);
    expect(s.parryLocked).toBe(1);
    expect(canUpgrade(os)).toBe(false);
    expect(computeStats([get('neuro-leak')], []).psyResist).toBeLessThan(0);
    expect(canUpgrade(get('arm-blades', MAX_LEVEL))).toBe(false);
  });
});

describe('synergies', () => {
  it('unlock at 2 then 3 implants of one family and stack', () => {
    expect(activeSynergies([get('arm-blades')])).toEqual([]);
    expect(activeSynergies([get('arm-blades'), get('dermal-armor')])).toEqual([{ synergy: 'chrome', tier: 0 }]);
    const three = [get('arm-blades'), get('dermal-armor'), get('subdermal-plate')];
    expect(activeSynergies(three)).toEqual([{ synergy: 'chrome', tier: 0 }, { synergy: 'chrome', tier: 1 }]);
    const s = computeStats(three, []);
    expect(s.thorns).toBeGreaterThan(0);
  });
  it('upgrading does not count twice toward a synergy', () => {
    expect(activeSynergies([get('arm-blades', 3)])).toEqual([]);
  });
});

describe('implant offers', () => {
  it('are deterministic, distinct and never offer what you already carry as new', () => {
    const owned = [get('arm-blades')];
    const a = offerImplants(createRng(4), owned, 3), b = offerImplants(createRng(4), owned, 3);
    expect(a).toEqual(b);
    expect(new Set(a.map(o => o.implant.id)).size).toBe(a.length);
    a.forEach(o => { if (o.implant.id === 'arm-blades') expect(o.upgrade).toBe(true); });
  });
  it('a family door mostly stocks that family', () => {
    let hits = 0, total = 0;
    for (let seed = 0; seed < 60; seed++) offerImplants(createRng(seed), [], 2, { family: 'neural' }).slice(0, 2).forEach(o => { total++; if (o.implant.family === 'neural') hits++; });
    expect(hits / total).toBeGreaterThan(0.9);
  });
  it('elite rewards respect the minimum rarity', () => {
    for (let seed = 0; seed < 40; seed++) offerImplants(createRng(seed), [], 0, { minRarity: 'rare' }).forEach(o => expect(['rare', 'epic']).toContain(o.implant.rarity));
  });
  it('black market only shows up when allowed', () => {
    for (let seed = 0; seed < 80; seed++) offerImplants(createRng(seed), [], 5).forEach(o => expect(o.implant.rarity).not.toBe('black'));
    let seen = false;
    for (let seed = 0; seed < 200 && !seen; seed++) seen = offerImplants(createRng(seed), [], 5, { allowBlack: true }).some(o => o.implant.rarity === 'black');
    expect(seen).toBe(true);
  });
  it('rarity improves with depth', () => {
    const epics = (room: number) => { let n = 0; const rng = createRng(9); for (let i = 0; i < 2000; i++) if (rollRarity(rng, room) === 'epic') n++; return n; };
    expect(epics(8)).toBeGreaterThan(epics(0));
  });
  it('taking an upgrade raises the level in place', () => {
    const owned = [get('arm-blades'), get('leech-glands')];
    const up = applyOffer(owned, { implant: owned[0], level: 2, upgrade: true });
    expect(up).toHaveLength(2);
    expect(up[0].level).toBe(2);
    expect(applyOffer(owned, { implant: IMPLANT_BY_ID.get('aim-optics')!, level: 1, upgrade: false })).toHaveLength(3);
  });
});

describe('damage modifiers', () => {
  const s = baseStats();
  it('crit uses the crit multiplier', () => {
    expect(computeHitDamage({ ...s, critChance: 1, critMult: 3 }, { countered: false, tier: 'stable', roll: 0 }).amount).toBe(30);
  });
  it('overclock scales with psychosis, berserk only under 40 % HP', () => {
    expect(computeHitDamage({ ...s, psyDamage: 0.003 }, { countered: false, tier: 'stable', roll: 1, psy: 100 }).amount).toBe(13);
    expect(computeHitDamage({ ...s, lowHpDamage: 0.5 }, { countered: false, tier: 'stable', roll: 1, hpRatio: 0.3 }).amount).toBe(15);
    expect(computeHitDamage({ ...s, lowHpDamage: 0.5 }, { countered: false, tier: 'stable', roll: 1, hpRatio: 0.8 }).amount).toBe(10);
  });
});
