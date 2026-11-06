import { CONFIG } from '../config';
import { crisisMultipliers, type PsyTier } from './psychosis';
import type { Stats } from './types';

export function resolveParry(parryStartMs: number, hitAtMs: number, windowMs: number = CONFIG.PARRY_WINDOW_MS): 'parried' | 'hit' {
  const dt = hitAtMs - parryStartMs;
  return dt >= 0 && dt <= windowMs ? 'parried' : 'hit';
}

export function computeHitDamage(
  stats: Stats,
  opts: { countered: boolean; tier: PsyTier; roll: number; mult?: number },
): { amount: number; crit: boolean } {
  const crit = opts.roll < stats.critChance;
  let amount = stats.damage * (opts.mult ?? 1);
  if (crit) amount *= 2;
  if (opts.countered) amount *= stats.counterMult;
  amount *= crisisMultipliers(opts.tier).damage;
  return { amount: Math.round(amount), crit };
}
