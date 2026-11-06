import { CONFIG } from '../config';
import { SKILL_NODES } from '../data/skillNodes';
import type { Implant, Stats } from './types';

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
  };
}

/** Skill nodes apply first (permanent body), then run implants on top. */
export function computeStats(implants: readonly Implant[], ownedNodes: readonly string[]): Stats {
  let s = baseStats();
  for (const node of SKILL_NODES) if (ownedNodes.includes(node.id)) s = node.modify(s);
  for (const imp of implants) s = imp.modify(s);
  s.psyResist = Math.min(0.9, Math.max(0, s.psyResist));
  return s;
}

export function totalLoad(implants: readonly Implant[], stats: Stats): number {
  return implants.reduce((sum, i) => sum + i.load, 0) * stats.implantLoadMult;
}
