import { describe, it, expect } from 'vitest';
import { ASPECTS, MAX_ASPECT_RANK, aspectRank, aspectsOf, defaultAspect, equip } from '../../src/data/aspects';
import { SPELLS } from '../../src/data/spells';
import { WEAPONS, WEAPON_IDS } from '../../src/data/weapons';
import { baseStats } from '../../src/core/stats';
import { defaultSave, loadSave, SAVE_KEY } from '../../src/core/save';

const fake = (v: unknown) => ({ getItem: (k: string) => (k === SAVE_KEY ? JSON.stringify(v) : null) });
const sp = (spells: { id: string }[], id: string) => spells.find(s => s.id === id)! as typeof SPELLS[string];

describe('weapons and aspects', () => {
  it('every weapon gives four existing spells, and has three aspects, the first one free and owned', () => {
    WEAPON_IDS.forEach(w => {
      expect(WEAPONS[w].spells).toHaveLength(4);
      WEAPONS[w].spells.forEach(id => expect(SPELLS[id]).toBeDefined());
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
    expect(sp(equip('blade', s, 'blade-2', 3).spells, 'windcut').range[1]).toBe(6);
    expect(sp(equip('blade', s, 'blade-2', 1).spells, 'windcut').range[1]).toBe(5);
    ASPECTS.forEach(a => { expect(a.costs[1]).toBeGreaterThan(a.costs[0]); expect(a.costs[2]).toBeGreaterThan(a.costs[1]); });
  });
  it('changes the run copy of the spells without touching the shared definitions', () => {
    const s = baseStats();
    const storm = sp(equip('pistol', s, 'pistol-2', 3).spells, 'volley');
    expect(storm.zone).toEqual({ shape: 'circle', r: 2 });
    expect(storm.cooldown).toBe(1);
    expect(SPELLS.volley.zone).toEqual({ shape: 'circle', r: 1 });
    expect(SPELLS.volley.cooldown).toBe(2);
    const quake = sp(equip('gorilla', s, 'gorilla-1', 3).spells, 'shockwave');
    expect(quake.zone).toEqual({ shape: 'circle', r: 3 });
    expect(SPELLS.shockwave.zone).toEqual({ shape: 'circle', r: 2 });
  });
  it('an aspect of another weapon, or an unowned rank, does nothing', () => {
    const s = baseStats();
    expect(equip('blade', s, 'mantis-0', 3).stats).toEqual(s);
    expect(equip('blade', s, 'blade-1', 0).spells.map(x => x.range)).toEqual(WEAPONS.blade.spells.map(id => SPELLS[id].range));
    // The weapon's own tweak still applies (mantis: +5 % crit, +1 dodge).
    expect(equip('mantis', s).stats.critChance).toBeCloseTo(s.critChance + 0.05);
  });
  it('the save keeps known ranks (capped) and only equips owned aspects of the right weapon', () => {
    const save = loadSave(fake({ ...defaultSave(), aspects: { 'blade-1': 9, 'ghost-1': 2 }, aspect: { blade: 'blade-1', mantis: 'mantis-2', wire: 'blade-1' } }));
    expect(save.aspects).toEqual({ 'blade-1': MAX_ASPECT_RANK });
    expect(save.aspect).toEqual({ blade: 'blade-1' });
  });
});
