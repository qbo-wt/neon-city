import { CONFIG } from '../config';

export type PsyTier = 'stable' | 'glitch' | 'drain' | 'crisis';

const clamp = (v: number) => Math.min(100, Math.max(0, v));

export function psyTier(v: number): PsyTier {
  if (v >= 100) return 'crisis';
  if (v >= 75) return 'drain';
  if (v >= 50) return 'glitch';
  return 'stable';
}

/** Psychosis at the start of one of your turns: a base rise plus the load of your implants. */
export function psyOnTurn(v: number, load: number, resist: number, rateMult = 1): number {
  return clamp(v + (CONFIG.PSY_PER_TURN + load * CONFIG.PSY_PER_TURN_PER_LOAD) * rateMult * (1 - resist));
}

/** A gain from an effect (kill, hack, Surchauffe), reduced by your resistance. Losses are not. */
export function addPsy(v: number, amount: number, resist: number): number {
  return clamp(v + (amount > 0 ? amount * (1 - resist) : amount));
}

export function psyOnKill(v: number, resist: number): number {
  return addPsy(v, CONFIG.PSY_PER_KILL, resist);
}

export function applyBlocker(v: number, amount: number): number {
  return clamp(v - amount);
}

/** Fraction of max HP lost at the start of each turn at this tier. */
export function hpDrainPerTurn(tier: PsyTier): number {
  if (tier === 'crisis') return CONFIG.PSY_DRAIN_FAST;
  if (tier === 'drain') return CONFIG.PSY_DRAIN_SLOW;
  return 0;
}

/** Psychosis is risk and reward: the higher it climbs, the harder you hit (and the faster you burn). */
export function psyDamageMult(tier: PsyTier): number {
  if (tier === 'crisis') return CONFIG.CRISIS_DAMAGE_MULT;
  if (tier === 'drain') return CONFIG.PSY_DRAIN_DAMAGE;
  if (tier === 'glitch') return CONFIG.PSY_GLITCH_DAMAGE;
  return 1;
}
