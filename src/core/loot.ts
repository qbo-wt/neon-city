import type { Rng } from './rng';

export type Loot =
  | { kind: 'nothing' }
  | { kind: 'credits'; amount: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'relic' };

/** Chance that a broken object hides a relic (katana, golden pistols). */
export const RELIC_CHANCE = 0.005;

/** What falls out of a broken crate, barrel or vending machine. */
export function rollLoot(rng: Rng, canRelic: boolean): Loot {
  const r = rng();
  if (canRelic && r < RELIC_CHANCE) return { kind: 'relic' };
  if (r < 0.38) return { kind: 'credits', amount: 2 + Math.floor(rng() * 4) };
  if (r < 0.66) return { kind: 'heal', amount: 6 + Math.floor(rng() * 7) };
  return { kind: 'nothing' };
}
