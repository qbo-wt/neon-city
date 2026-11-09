import { CONFIG } from '../config';

export type PsyTier = 'stable' | 'glitch' | 'drain' | 'crisis';

const clamp = (v: number) => Math.min(100, Math.max(0, v));

export function psyTier(v: number): PsyTier {
  if (v >= 100) return 'crisis';
  if (v >= 75) return 'drain';
  if (v >= 50) return 'glitch';
  return 'stable';
}

export function tickPsychosis(v: number, load: number, dtMs: number, resist: number, rateMult = 1): number {
  const dtSec = Math.min(dtMs, CONFIG.MAX_DT_MS) / 1000;
  return clamp(v + (CONFIG.PSY_BASE_RATE + load * CONFIG.PSY_RATE_PER_LOAD) * rateMult * (1 - resist) * dtSec);
}

export function psyOnKill(v: number, resist: number): number {
  return clamp(v + CONFIG.PSY_PER_KILL * (1 - resist));
}

export function applyBlocker(v: number, amount: number): number {
  return clamp(v - amount);
}

export function hpDrainPerSec(tier: PsyTier): number {
  if (tier === 'crisis') return CONFIG.PSY_DRAIN_FAST;
  if (tier === 'drain') return CONFIG.PSY_DRAIN_SLOW;
  return 0;
}

/** Psychosis is risk and reward: the higher it climbs, the harder you hit (and the faster you burn). */
export function psyMultipliers(tier: PsyTier): { damage: number; speed: number } {
  if (tier === 'crisis') return { damage: CONFIG.CRISIS_DAMAGE_MULT, speed: CONFIG.CRISIS_SPEED_MULT };
  if (tier === 'drain') return { damage: CONFIG.PSY_DRAIN_DAMAGE, speed: CONFIG.PSY_DRAIN_SPEED };
  if (tier === 'glitch') return { damage: CONFIG.PSY_GLITCH_DAMAGE, speed: 1 };
  return { damage: 1, speed: 1 };
}
export const crisisMultipliers = psyMultipliers;
