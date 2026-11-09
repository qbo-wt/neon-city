import { IMPLANTS, canUpgrade } from '../data/implants';
import type { Family, Implant, Rarity } from './types';
import type { Rng } from './rng';

/** One card of an implant choice: a new implant at level 1, or the next level of one you carry. */
export interface Offer { implant: Implant; level: number; upgrade: boolean }

export interface OfferOpts {
  /** door hint: most cards come from this family */
  family?: Family;
  /** elite rewards: nothing below this rarity */
  minRarity?: 'rare' | 'epic';
  /** black-market cards can show up (from sector 3) */
  allowBlack?: boolean;
  count?: number;
}

const ORDER: Rarity[] = ['common', 'rare', 'epic'];

/** Rarity odds shift toward rare and epic deeper in the run. */
export function rollRarity(rng: Rng, roomIndex: number, min?: OfferOpts['minRarity']): Rarity {
  const epic = 0.06 + 0.02 * roomIndex, rare = 0.28 + 0.02 * roomIndex, r = rng();
  const rarity: Rarity = r < epic ? 'epic' : r < epic + rare ? 'rare' : 'common';
  return min && ORDER.indexOf(rarity) < ORDER.indexOf(min) ? min : rarity;
}

export function offerImplants(rng: Rng, owned: readonly Implant[], roomIndex: number, opts: OfferOpts = {}): Offer[] {
  const count = opts.count ?? 3;
  const ownedIds = new Set(owned.map(i => i.id));
  const used = new Set<string>();
  const offers: Offer[] = [];
  const upgradable = owned.filter(canUpgrade);
  const fresh = (pred: (i: Implant) => boolean) => IMPLANTS.filter(i => !ownedIds.has(i.id) && !used.has(i.id) && pred(i));
  const take = (list: Implant[]) => list.length ? list[Math.floor(rng() * list.length)] : undefined;

  for (let slot = 0; slot < count; slot++) {
    let pick: Offer | undefined;
    // An upgrade of something you carry (30 % per card, never two of the same).
    const ups = upgradable.filter(i => !used.has(i.id) && (!opts.family || i.family === opts.family || slot === count - 1));
    if (ups.length && rng() < 0.3 && !opts.minRarity) {
      const cur = take(ups)!;
      pick = { implant: cur, level: (cur.level ?? 1) + 1, upgrade: true };
    }
    // One black-market card now and then: a big edge with a drawback.
    if (!pick && opts.allowBlack && slot === count - 1 && rng() < 0.22) {
      const b = take(fresh(i => i.rarity === 'black'));
      if (b) pick = { implant: b, level: 1, upgrade: false };
    }
    if (!pick) {
      const rarity = rollRarity(rng, roomIndex, opts.minRarity);
      // The door's family for the first two cards, anything for the last one.
      const fam = opts.family && slot < count - 1 ? opts.family : undefined;
      const i = take(fresh(x => x.rarity === rarity && (!fam || x.family === fam)))
        ?? take(fresh(x => x.rarity !== 'black' && (!fam || x.family === fam)))
        ?? take(fresh(x => x.rarity !== 'black'));
      if (i) pick = { implant: i, level: 1, upgrade: false };
    }
    if (!pick) {
      const up = upgradable.find(i => !used.has(i.id));
      if (up) pick = { implant: up, level: (up.level ?? 1) + 1, upgrade: true };
    }
    if (!pick) break;
    used.add(pick.implant.id);
    offers.push(pick);
  }
  return offers;
}

/** The carried copy after taking an offer. */
export function applyOffer(owned: readonly Implant[], o: Offer): Implant[] {
  return o.upgrade
    ? owned.map(i => (i.id === o.implant.id ? { ...i, level: o.level } : i))
    : [...owned, { ...o.implant, level: 1 }];
}
