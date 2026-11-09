import type { Family, Implant, Stats } from '../core/types';

export interface SynergyTier { count: number; name: string; description: string; modify: (s: Stats) => Stats }
export interface Synergy { family: Family; tiers: SynergyTier[] }

/** Carrying 2, then 3 implants of one family unlocks its set bonus (the tiers stack). */
export const SYNERGIES: Record<Family, Synergy> = {
  chrome: { family: 'chrome', tiers: [
    { count: 2, name: 'Blindage intégral', description: '+8 % de résistance', modify: s => ({ ...s, res: s.res + 0.08 }) },
    { count: 3, name: 'Forteresse', description: 'Renvoie 8 dégâts à qui te frappe au contact, +20 vie max, +1 tacle', modify: s => ({ ...s, thorns: s.thorns + 8, maxHp: s.maxHp + 20, tackle: s.tackle + 1 }) },
  ] },
  neural: { family: 'neural', tiers: [
    { count: 2, name: 'Esprit froid', description: '-20 % de psychose gagnée', modify: s => ({ ...s, psyResist: s.psyResist + 0.2 }) },
    { count: 3, name: 'Singularité', description: '+1 PA', modify: s => ({ ...s, pa: s.pa + 1 }) },
  ] },
  blood: { family: 'blood', tiers: [
    { count: 2, name: 'Soif', description: '+4 PV par élimination', modify: s => ({ ...s, killHeal: s.killHeal + 4 }) },
    { count: 3, name: 'Frénésie rouge', description: '+25 % de dégâts sous 40 % de vie, vol de vie 8 %', modify: s => ({ ...s, lowHpDamage: s.lowHpDamage + 0.25, lifesteal: s.lifesteal + 0.08 }) },
  ] },
  optic: { family: 'optic', tiers: [
    { count: 2, name: 'Visée assistée', description: '+10 % de critique', modify: s => ({ ...s, critChance: s.critChance + 0.1 }) },
    { count: 3, name: 'Œil de dieu', description: '+1 portée, critiques +x0,5', modify: s => ({ ...s, range: s.range + 1, critMult: s.critMult + 0.5 }) },
  ] },
};

export function familyCounts(implants: readonly Implant[]): Record<Family, number> {
  const c: Record<Family, number> = { chrome: 0, neural: 0, blood: 0, optic: 0 };
  for (const i of implants) if (i.family) c[i.family]++;
  return c;
}

/** Every unlocked tier, lowest first, e.g. [{ synergy: 'chrome', tier: 0 }]. */
export function activeSynergies(implants: readonly Implant[]): { synergy: Family; tier: number }[] {
  const counts = familyCounts(implants), out: { synergy: Family; tier: number }[] = [];
  for (const f of Object.keys(SYNERGIES) as Family[]) SYNERGIES[f].tiers.forEach((t, i) => { if (counts[f] >= t.count) out.push({ synergy: f, tier: i }); });
  return out;
}
