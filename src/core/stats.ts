import { CONFIG } from '../config';
import { SKILL_NODES } from '../data/skillNodes';
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
  };
}

/** Skill nodes apply first (permanent body), then run implants, then relics. */
export function computeStats(implants: readonly Implant[], ownedNodes: readonly string[], relics: readonly Relic[] = []): Stats {
  let s = baseStats();
  for (const node of SKILL_NODES) if (ownedNodes.includes(node.id)) s = node.modify(s);
  for (const imp of implants) s = imp.modify(s);
  for (const r of relics) s = r.modify(s);
  s.psyResist = Math.min(0.9, Math.max(0, s.psyResist));
  return s;
}

export function totalLoad(implants: readonly Implant[], stats: Stats): number {
  return implants.reduce((sum, i) => sum + i.load, 0) * stats.implantLoadMult;
}
