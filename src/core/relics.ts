import type { FightHooks } from '../tactics/fight';
import type { SpellDef } from '../tactics/types';
import type { Rng } from './rng';
import type { Relic, RelicRarity } from './types';

/** How often each rarity comes up when a relic is drawn. */
export const RELIC_WEIGHTS: Record<RelicRarity, number> = { common: 5, rare: 3, cursed: 2, legendary: 1 };
export const RELIC_RARITY_NAMES: Record<RelicRarity, string> = { common: 'COMMUNE', rare: 'RARE', legendary: 'LÉGENDAIRE', cursed: 'MAUDITE' };
export const RELIC_RARITY_COLORS: Record<RelicRarity, string> = { common: '#8a86b0', rare: '#00f0ff', legendary: '#f5e663', cursed: '#39ff88' };

/** Relics still to find in this run: not owned, and useful with this spell bar. */
export function relicPool(all: readonly Relic[], owned: readonly Relic[], spells: readonly SpellDef[]): Relic[] {
  const have = new Set(owned.map(r => r.id));
  return all.filter(r => !have.has(r.id) && (!r.fits || r.fits(spells)));
}

/**
 * Up to `count` different relics drawn by rarity weight. `noCommon` (boss and elite rewards) leaves the
 * common ones out, unless too few others are left to fill the offer.
 */
export function offerRelics(rng: Rng, pool: readonly Relic[], count = 1, noCommon = false): Relic[] {
  const better = pool.filter(r => r.rarity !== 'common');
  const left = [...(noCommon && better.length >= count ? better : pool)];
  const out: Relic[] = [];
  while (out.length < count && left.length) {
    const total = left.reduce((n, r) => n + RELIC_WEIGHTS[r.rarity], 0);
    let roll = rng() * total, i = 0;
    while (i < left.length - 1 && roll >= RELIC_WEIGHTS[left[i].rarity]) roll -= RELIC_WEIGHTS[left[i++].rarity];
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}

/** The fight listeners of the relics you carry. */
export const relicHooks = (relics: readonly Relic[]): FightHooks[] => relics.flatMap(r => (r.hooks ? [r.hooks] : []));

/** Applies the relics' spell changes to a spell bar of private copies (changed in place, returned). */
export function applyRelicSpells(spells: SpellDef[], relics: readonly Relic[]): SpellDef[] {
  for (const r of relics) if (r.editSpell) for (const s of spells) r.editSpell(s);
  return spells;
}
