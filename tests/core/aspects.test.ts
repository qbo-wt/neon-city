import { describe, it, expect } from 'vitest';
import { ASPECTS, MAX_ASPECT_RANK, aspectRank, aspectsOf, defaultAspect, equip } from '../../src/data/aspects';
import { WEAPONS, WEAPON_IDS } from '../../src/data/weapons';
import { baseStats } from '../../src/core/stats';
import { defaultSave, loadSave, SAVE_KEY } from '../../src/core/save';

const fake = (v: unknown) => ({ getItem: (k: string) => (k === SAVE_KEY ? JSON.stringify(v) : null) });

describe('weapon aspects', () => {
  it('every weapon has three aspects, the first one free and owned', () => {
    WEAPON_IDS.forEach(w => {
      const list = aspectsOf(w);
      expect(list).toHaveLength(3);
      expect(list[0].id).toBe(defaultAspect(w));
      expect(list[0].costs[0]).toBe(0);
      expect(aspectRank({}, list[0].id)).toBe(1);
      expect(aspectRank({}, list[1].id)).toBe(0);
    });
    expect(new Set(ASPECTS.map(a => a.id)).size).toBe(ASPECTS.length);
  });
  it('ranks make an aspect stronger and cost more', () => {
    const s = baseStats();
    expect(equip('blade', s, 'blade-0', 3).stats.damage).toBeGreaterThan(equip('blade', s, 'blade-0', 1).stats.damage);
    expect(equip('pistol', s, 'pistol-1', 2).stats.pierce).toBe(2);
    ASPECTS.forEach(a => { expect(a.costs[1]).toBeGreaterThan(a.costs[0]); expect(a.costs[2]).toBeGreaterThan(a.costs[1]); });
  });
  it('can change the weapon itself without touching the shared definition', () => {
    const s = baseStats();
    const storm = equip('pistol', s, 'pistol-2', 3).weapon;
    expect(storm.special.count).toBe((WEAPONS.pistol.special.count ?? 7) + 6);
    expect(storm.special.cooldownMs).toBeLessThan(WEAPONS.pistol.special.cooldownMs);
    expect(WEAPONS.pistol.special.count).toBe(7);
    const quake = equip('gorilla', s, 'gorilla-1', 2).weapon;
    expect(quake.special.radius).toBeGreaterThan(WEAPONS.gorilla.special.radius);
  });
  it('an aspect of another weapon, or an unowned rank, does nothing', () => {
    const s = baseStats();
    expect(equip('blade', s, 'mantis-0', 3).stats).toEqual(s);
    expect(equip('blade', s, 'blade-1', 0).stats).toEqual(s);
    // The weapon's own tweak still applies (mantis: +10 % crit).
    expect(equip('mantis', s).stats.critChance).toBeCloseTo(s.critChance + 0.1);
  });
  it('the save keeps known ranks (capped) and only equips owned aspects of the right weapon', () => {
    const save = loadSave(fake({ ...defaultSave(), aspects: { 'blade-1': 9, 'ghost-1': 2 }, aspect: { blade: 'blade-1', mantis: 'mantis-2', wire: 'blade-1' } }));
    expect(save.aspects).toEqual({ 'blade-1': MAX_ASPECT_RANK });
    expect(save.aspect).toEqual({ blade: 'blade-1' });
  });
});
