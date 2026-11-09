import type { Family, Implant, Stats } from '../core/types';

export interface SynergyTier { count: number; name: string; description: string; modify: (s: Stats) => Stats }
export interface Synergy { family: Family; tiers: SynergyTier[] }

/** Carrying 2, then 3 implants of one family unlocks its set bonus (the tiers stack). */
export const SYNERGIES: Record<Family, Synergy> = {
  chrome: { family: 'chrome', tiers: [
    { count: 2, name: 'Blindage intégral', description: '-10 % de dégâts subis', modify: s => ({ ...s, damageTakenMult: s.damageTakenMult * 0.9 }) },
    { count: 3, name: 'Forteresse', description: 'Renvoie 10 dégâts à qui te frappe au corps à corps, +20 vie max', modify: s => ({ ...s, thorns: s.thorns + 10, maxHp: s.maxHp + 20 }) },
  ] },
  neural: { family: 'neural', tiers: [
    { count: 2, name: 'Esprit froid', description: 'Chaque parade parfaite retire 6 psychose', modify: s => ({ ...s, parryPsy: s.parryPsy - 6 }) },
    { count: 3, name: 'Singularité', description: '+10 % de critique, chaque critique retire 1,5 psychose', modify: s => ({ ...s, critChance: s.critChance + 0.1, critPsy: s.critPsy - 1.5 }) },
  ] },
  blood: { family: 'blood', tiers: [
    { count: 2, name: 'Soif', description: '+3 PV par élimination', modify: s => ({ ...s, killHeal: s.killHeal + 3 }) },
    { count: 3, name: 'Frénésie rouge', description: '+25 % de dégâts sous 40 % de vie, +2 PV par élimination', modify: s => ({ ...s, lowHpDamage: s.lowHpDamage + 0.25, killHeal: s.killHeal + 2 }) },
  ] },
  optic: { family: 'optic', tiers: [
    { count: 2, name: 'Visée assistée', description: '+10 % de critique', modify: s => ({ ...s, critChance: s.critChance + 0.1 }) },
    { count: 3, name: 'Œil de dieu', description: 'Critiques +x1, le dash recharge 20 % plus vite', modify: s => ({ ...s, critMult: s.critMult + 1, dashCooldownMult: s.dashCooldownMult * 0.8 }) },
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
