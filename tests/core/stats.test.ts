import { describe, it, expect } from 'vitest';
import { baseStats, computeStats, totalLoad } from '../../src/core/stats';
import { IMPLANTS } from '../../src/data/implants';
import { SKILL_NODES } from '../../src/data/skillNodes';
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

describe('content data', () => {
  it('has 8 implants with positive load and unique ids', () => {
    expect(IMPLANTS).toHaveLength(8);
    IMPLANTS.forEach(i => expect(i.load).toBeGreaterThan(0));
    expect(new Set(IMPLANTS.map(i => i.id)).size).toBe(8);
  });
  it('has 8 skill nodes with unique ids and valid prerequisites', () => {
    expect(SKILL_NODES).toHaveLength(8);
    const ids = new Set(SKILL_NODES.map(n => n.id));
    expect(ids.size).toBe(8);
    SKILL_NODES.forEach(n => { if (n.requires) expect(ids.has(n.requires)).toBe(true); });
  });
});
