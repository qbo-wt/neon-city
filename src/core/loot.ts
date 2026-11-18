import type { Rng } from './rng';

export type Loot =
  | { kind: 'nothing' }
  | { kind: 'credits'; amount: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'relic' };

/** Chance that a broken object hides a relic. */
export const RELIC_CHANCE = 0.02;

/** What falls out of a broken crate, barrel or vending machine. `lucky` (relic): never empty. */
export function rollLoot(rng: Rng, canRelic: boolean, lucky = false): Loot {
  const r = rng();
  if (canRelic && r < RELIC_CHANCE) return { kind: 'relic' };
  if (r < 0.38 || (lucky && r >= 0.66)) return { kind: 'credits', amount: 2 + Math.floor(rng() * 4) };
  if (r < 0.66) return { kind: 'heal', amount: 6 + Math.floor(rng() * 7) };
  return { kind: 'nothing' };
}

/** Credits of the CRÉDITS door at sector index `ri` (before the credit multipliers). */
export const doorCredits = (ri: number) => 8 + ri * 2;

/** The COFFRE door: a little more credits than the CRÉDITS door, a relic one time in three, a neuro-blocker in CyberHard. */
export const CHEST_RELIC_CHANCE = 0.35;
export const chestCredits = (ri: number) => 10 + ri * 2;
