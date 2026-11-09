import { CONFIG } from '../config';
import { SKILL_NODES } from '../data/skillNodes';
import { SYNERGIES, activeSynergies } from '../data/synergies';
import type { Implant, Relic, Stats } from './types';

export function baseStats(): Stats {
  return {
    maxHp: CONFIG.PLAYER_BASE_HP,
    damage: CONFIG.BASE_DAMAGE,
    speed: CONFIG.PLAYER_SPEED,
    dashCharges: 1,
    critChance: 0.05,
    psyResist: 0,
    creditMult: 1,
    implantLoadMult: 1,
    damageTakenMult: 1,
    regenOnClear: 0,
    finisherMult: CONFIG.FINISHER_MULT,
    dashCooldownMult: 1,
    parryBonusMs: 0,
    counterMult: CONFIG.COUNTER_MULT,
    startBlockers: 0,
    blockerAmount: CONFIG.BLOCKER_AMOUNT,
    bossBonusMult: 1,
    rangeMult: 1,
    gunDamage: 0,
    critMult: 2,
    thorns: 0,
    killHeal: 0,
    dashDamage: 0,
    parryLocked: 0,
    healMult: 1,
    parryPsy: 0,
    critPsy: 0,
    hitPsy: 0,
    lowHpDamage: 0,
    psyDamage: 0,
    psyRateMult: 1,
    attackSpeed: 1,
    critHeal: 0,
    dazedDamage: 0,
    pierce: 0,
  };
}

/** Skill nodes apply first (permanent body), then run implants (at their level), family synergies, then relics. */
export function computeStats(implants: readonly Implant[], ownedNodes: readonly string[], relics: readonly Relic[] = []): Stats {
  let s = baseStats();
  for (const node of SKILL_NODES) if (ownedNodes.includes(node.id)) s = node.modify(s);
  for (const imp of implants) s = imp.modify(s, imp.level ?? 1);
  for (const { synergy, tier } of activeSynergies(implants)) s = SYNERGIES[synergy].tiers[tier].modify(s);
  for (const r of relics) s = r.modify(s);
  // Negative resist is possible (black-market implants make psychosis climb faster).
  s.psyResist = Math.min(0.9, Math.max(-1, s.psyResist));
  return s;
}

/** Psychosis load of one carried implant: each upgrade adds 30 % of its base load. */
export function implantLoad(imp: Implant): number {
  return imp.load * (1 + 0.3 * ((imp.level ?? 1) - 1));
}

export function totalLoad(implants: readonly Implant[], stats: Stats): number {
  return implants.reduce((sum, i) => sum + implantLoad(i), 0) * stats.implantLoadMult;
}
