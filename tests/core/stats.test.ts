import { describe, it, expect } from 'vitest';
import { baseStats, computeStats, totalLoad } from '../../src/core/stats';
import { IMPLANTS } from '../../src/data/implants';
import { SKILL_NODES } from '../../src/data/skillNodes';
import { RELICS } from '../../src/data/relics';
import type { Implant } from '../../src/core/types';

const dmg5: Implant = { id: 't-dmg', name: 't', description: '', load: 10, modify: s => ({ ...s, damage: s.damage + 5 }) };
const hpImpl: Implant = { id: 't-hp', name: 't', description: '', load: 5, modify: s => ({ ...s, maxHp: s.maxHp + 20 }) };

describe('stats', () => {
  it('no implants and no nodes equals base stats', () => {
    expect(computeStats([], [])).toEqual(baseStats());
  });
  it('implant +5 damage gives 15', () => {
    expect(computeStats([dmg5], []).damage).toBe(15);
  });
  it('node +20 hp combined with implant +20 hp gives 140', () => {
    const node = SKILL_NODES.find(n => n.id === 'body-hp-1')!;
    expect(node.modify(baseStats()).maxHp).toBe(120);
    expect(computeStats([hpImpl], ['body-hp-1']).maxHp).toBe(140);
  });
  it('totalLoad applies implantLoadMult', () => {
    expect(totalLoad([dmg5, hpImpl], { ...baseStats(), implantLoadMult: 0.8 })).toBeCloseTo(12);
  });
  it('unknown node ids are ignored', () => {
    expect(computeStats([], ['nope'])).toEqual(baseStats());
  });
});

describe('relics', () => {
  it('katana adds damage and reach, pistols add a gun shot, neither adds psychosis load', () => {
    const katana = RELICS.find(r => r.id === 'katana')!;
    const pistols = RELICS.find(r => r.id === 'pistols')!;
    const k = computeStats([], [], [katana]);
    expect(k.damage).toBeGreaterThan(baseStats().damage);
    expect(k.rangeMult).toBeGreaterThan(1);
    expect(baseStats().gunDamage).toBe(0);
    expect(computeStats([], [], [pistols]).gunDamage).toBeGreaterThan(0);
    expect(totalLoad([], k)).toBe(0);
  });
});

describe('content data', () => {
  it('has 8 implants with positive load and unique ids', () => {
    expect(IMPLANTS).toHaveLength(8);
    IMPLANTS.forEach(i => expect(i.load).toBeGreaterThan(0));
    expect(new Set(IMPLANTS.map(i => i.id)).size).toBe(8);
  });
  it('has 16 body and 8 mind nodes with unique ids and valid prerequisites', () => {
    expect(SKILL_NODES.filter(n => n.tree === 'body')).toHaveLength(16);
    expect(SKILL_NODES.filter(n => n.tree === 'mind')).toHaveLength(8);
    const ids = new Set(SKILL_NODES.map(n => n.id));
    expect(ids.size).toBe(24);
    SKILL_NODES.forEach(n => { if (n.requires) expect(ids.has(n.requires)).toBe(true); });
  });
  it('each of the 6 branches is a 4-node chain with rising costs', () => {
    for (let b = 0; b < 6; b++) {
      const chain = SKILL_NODES.filter(n => n.branch === b);
      expect(chain).toHaveLength(4);
      expect(chain[0].requires).toBeUndefined();
      for (let i = 1; i < 4; i++) {
        expect(chain[i].requires).toBe(chain[i - 1].id);
        expect(chain[i].cost).toBeGreaterThan(chain[i - 1].cost);
      }
    }
  });
  it('keeps the ids of earlier saves so purchases are not lost', () => {
    const ids = new Set(SKILL_NODES.map(n => n.id));
    ['body-hp-1', 'body-dmg-1', 'body-dash-1', 'body-hp-2', 'mind-resist-1', 'mind-credits-1', 'mind-load-1', 'mind-resist-2']
      .forEach(id => expect(ids.has(id)).toBe(true));
  });
  it('full tree costs at least 5000 credits (long-term progression)', () => {
    expect(SKILL_NODES.reduce((sum, n) => sum + n.cost, 0)).toBeGreaterThanOrEqual(5000);
  });
});
