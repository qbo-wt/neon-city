import { CONFIG } from '../config';
import { SKILL_NODES } from '../data/skillNodes';
import { SYNERGIES, activeSynergies } from '../data/synergies';
import type { Implant, Relic, Stats } from './types';

export function baseStats(): Stats {
  return {
    maxHp: CONFIG.PLAYER_BASE_HP, pa: CONFIG.PLAYER_PA, pm: CONFIG.PLAYER_PM, range: 0, initiative: CONFIG.PLAYER_INIT,
    damage: 0, damagePct: 0, critChance: 0.05, critMult: 1.5, res: 0, pushDamage: 0, tackle: 1, dodge: 1,
    lifesteal: 0, thorns: 0, killHeal: 0, critHeal: 0, lowHpDamage: 0, psyDamage: 0, dazedDamage: 0, killPa: 0, castPsy: 0,
    psyResist: 0, implantLoadMult: 1, psyRateMult: 1, creditMult: 1, regenOnClear: 0, healMult: 1,
    startBlockers: 0, blockerAmount: CONFIG.BLOCKER_AMOUNT, bossBonusMult: 1,
    overheatPa: CONFIG.OVERHEAT_PA, overheatPsy: CONFIG.OVERHEAT_PSY,
    psyPerKill: CONFIG.PSY_PER_KILL, psyDrainMult: 1, edgePa: 0, edgePm: 0, priceMult: 1, interest: 0, foeDamage: 0, lootBonus: 0,
  };
}

/** Extra implants each carried family counts for the synergies (relics). */
export const synergyBonus = (relics: readonly Relic[] = []) => relics.reduce((n, r) => n + (r.synergyBonus ?? 0), 0);

/** Skill nodes apply first (permanent body), then run implants (at their level), family synergies, then relics. */
export function computeStats(implants: readonly Implant[], ownedNodes: readonly string[], relics: readonly Relic[] = []): Stats {
  let s = baseStats();
  for (const node of SKILL_NODES) if (ownedNodes.includes(node.id)) s = node.modify(s);
  for (const imp of implants) s = imp.modify(s, imp.level ?? 1);
  for (const { synergy, tier } of activeSynergies(implants, synergyBonus(relics))) s = SYNERGIES[synergy].tiers[tier].modify(s);
  for (const r of relics) s = r.modify(s, implants);
  // Negative resist is possible (black-market implants make psychosis climb faster).
  s.psyResist = Math.min(0.9, Math.max(-1, s.psyResist));
  s.res = Math.min(0.6, s.res);
  s.pa = Math.max(3, s.pa);
  s.pm = Math.max(1, s.pm);
  return s;
}

/** Spells added by implants and relics, in the order they were found. */
export function grantedSpells(implants: readonly Implant[], relics: readonly Relic[] = []): string[] {
  return [...implants.map(i => i.spell), ...relics.map(r => r.spell)].filter((s): s is string => !!s);
}

/** Psychosis load of one carried implant: each upgrade adds 30 % of its base load. */
export function implantLoad(imp: Implant): number {
  return imp.load * (1 + 0.3 * ((imp.level ?? 1) - 1));
}

export function totalLoad(implants: readonly Implant[], stats: Stats): number {
  return implants.reduce((sum, i) => sum + implantLoad(i), 0) * stats.implantLoadMult;
}
