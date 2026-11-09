import type { Stats } from '../core/types';
import { WEAPONS, type Weapon, type WeaponId } from './weapons';

/**
 * Weapon aspects: each weapon has three. The first is its default form (owned, rank I); the other two
 * are unlocked at the apartment rack. Every aspect has three ranks bought with credits.
 * An aspect changes the weapon itself (special radius, count, cooldown…) and/or your stats.
 */
export interface Aspect {
  id: string;
  weapon: WeaponId;
  name: string;
  describe: (rank: number) => string;
  /** credits for rank 1 (unlock; 0 for the default aspect), 2 and 3 */
  costs: [number, number, number];
  apply: (w: Weapon, s: Stats, rank: number) => { weapon: Weapon; stats: Stats };
}

export const MAX_ASPECT_RANK = 3;
const ALT: [number, number, number] = [120, 200, 320];
const BASE: [number, number, number] = [0, 200, 320];
const pick = (r: number, v: [number, number, number]) => v[Math.max(1, Math.min(3, r)) - 1];
const sp = (w: Weapon, o: Partial<Weapon['special']>): Weapon => ({ ...w, special: { ...w.special, ...o } });
const same = (w: Weapon, s: Stats) => ({ weapon: w, stats: s });

export const ASPECTS: Aspect[] = [
  // ----- Lame-mono -----
  { id: 'blade-0', weapon: 'blade', name: 'Aspect Ronin', costs: BASE,
    describe: r => `+${pick(r, [5, 10, 15])} % de dégâts.`,
    apply: (w, s, r) => same(w, { ...s, damage: s.damage * (1 + pick(r, [0.05, 0.1, 0.15])) }) },
  { id: 'blade-1', weapon: 'blade', name: 'Aspect Lune Rouge', costs: ALT,
    describe: r => `Portée +${pick(r, [20, 30, 40])} %, coup final +${pick(r, [30, 60, 90])} %.`,
    apply: (w, s, r) => same(w, { ...s, rangeMult: s.rangeMult * (1 + pick(r, [0.2, 0.3, 0.4])), finisherMult: s.finisherMult + pick(r, [0.3, 0.6, 0.9]) }) },
  { id: 'blade-2', weapon: 'blade', name: 'Aspect Fantôme', costs: ALT,
    describe: r => `Tranche-vent recharge ${pick(r, [20, 35, 50])} % plus vite, ton dash tranche (${pick(r, [8, 14, 20])} dégâts).`,
    apply: (w, s, r) => ({ weapon: sp(w, { cooldownMs: w.special.cooldownMs * (1 - pick(r, [0.2, 0.35, 0.5])) }), stats: { ...s, dashDamage: s.dashDamage + pick(r, [8, 14, 20]) } }) },
  // ----- Lames mantes -----
  { id: 'mantis-0', weapon: 'mantis', name: 'Aspect Mante', costs: BASE,
    describe: r => `+${pick(r, [5, 8, 12])} % de critique.`,
    apply: (w, s, r) => same(w, { ...s, critChance: s.critChance + pick(r, [0.05, 0.08, 0.12]) }) },
  { id: 'mantis-1', weapon: 'mantis', name: 'Aspect Sangsue', costs: ALT,
    describe: r => `Chaque coup critique soigne ${pick(r, [1, 2, 3])} PV.`,
    apply: (w, s, r) => same(w, { ...s, critHeal: s.critHeal + pick(r, [1, 2, 3]) }) },
  { id: 'mantis-2', weapon: 'mantis', name: 'Aspect Prédateur', costs: ALT,
    describe: r => `Bond de mante : zone +${pick(r, [25, 40, 60])} %, dégâts x${pick(r, [2.5, 3, 3.5])}.`,
    apply: (w, s, r) => same(sp(w, { radius: w.special.radius * (1 + pick(r, [0.25, 0.4, 0.6])), power: pick(r, [2.5, 3, 3.5]) }), s) },
  // ----- Poings Titan -----
  { id: 'gorilla-0', weapon: 'gorilla', name: 'Aspect Titan', costs: BASE,
    describe: r => `-${pick(r, [5, 10, 15])} % de dégâts subis.`,
    apply: (w, s, r) => same(w, { ...s, damageTakenMult: s.damageTakenMult * (1 - pick(r, [0.05, 0.1, 0.15])) }) },
  { id: 'gorilla-1', weapon: 'gorilla', name: 'Aspect Séisme', costs: ALT,
    describe: r => `Onde de choc : zone +${pick(r, [20, 40, 60])} %, étourdit ${pick(r, [1.2, 1.5, 1.8])} s.`,
    apply: (w, s, r) => same(sp(w, { radius: w.special.radius * (1 + pick(r, [0.2, 0.4, 0.6])), daze: pick(r, [1200, 1500, 1800]) }), s) },
  { id: 'gorilla-2', weapon: 'gorilla', name: 'Aspect Démolisseur', costs: ALT,
    describe: r => `+${pick(r, [25, 45, 70])} % de dégâts aux ennemis étourdis, coup final +${pick(r, [20, 40, 60])} %.`,
    apply: (w, s, r) => same(w, { ...s, dazedDamage: s.dazedDamage + pick(r, [0.25, 0.45, 0.7]), finisherMult: s.finisherMult + pick(r, [0.2, 0.4, 0.6]) }) },
  // ----- Fil-mono -----
  { id: 'wire-0', weapon: 'wire', name: 'Aspect Araignée', costs: BASE,
    describe: r => `Portée +${pick(r, [10, 20, 30])} %.`,
    apply: (w, s, r) => same(w, { ...s, rangeMult: s.rangeMult * (1 + pick(r, [0.1, 0.2, 0.3])) }) },
  { id: 'wire-1', weapon: 'wire', name: 'Aspect Garrotteur', costs: ALT,
    describe: r => `Garrot : portée +${pick(r, [25, 50, 75])} %, dégâts x${pick(r, [1.2, 1.6, 2])}.`,
    apply: (w, s, r) => same(sp(w, { radius: w.special.radius * (1 + pick(r, [0.25, 0.5, 0.75])), power: pick(r, [1.2, 1.6, 2]) }), s) },
  { id: 'wire-2', weapon: 'wire', name: 'Aspect Marionnettiste', costs: ALT,
    describe: r => `+${pick(r, [20, 35, 50])} % de dégâts aux ennemis étourdis, le coup final étourdit ${pick(r, [0.4, 0.6, 0.8])} s.`,
    apply: (w, s, r) => same({ ...w, finisherStun: pick(r, [400, 600, 800]) }, { ...s, dazedDamage: s.dazedDamage + pick(r, [0.2, 0.35, 0.5]) }) },
  // ----- Pistolet « Vautour » -----
  { id: 'pistol-0', weapon: 'pistol', name: 'Aspect Vautour', costs: BASE,
    describe: r => `+${pick(r, [10, 20, 30])} % de dégâts des balles.`,
    apply: (w, s, r) => same({ ...w, damageMult: w.damageMult * (1 + pick(r, [0.1, 0.2, 0.3])) }, s) },
  { id: 'pistol-1', weapon: 'pistol', name: 'Aspect Ricochet', costs: ALT,
    describe: r => `Tes balles traversent ${pick(r, [1, 2, 3])} ennemi${r > 1 ? 's' : ''}.`,
    apply: (w, s, r) => same(w, { ...s, pierce: s.pierce + pick(r, [1, 2, 3]) }) },
  { id: 'pistol-2', weapon: 'pistol', name: 'Aspect Tempête', costs: ALT,
    describe: r => `Rafale : +${pick(r, [2, 4, 6])} balles, recharge ${pick(r, [15, 30, 45])} % plus vite.`,
    apply: (w, s, r) => same(sp(w, { count: (w.special.count ?? 7) + pick(r, [2, 4, 6]), cooldownMs: w.special.cooldownMs * (1 - pick(r, [0.15, 0.3, 0.45])) }), s) },
];

export const ASPECT_BY_ID = new Map(ASPECTS.map(a => [a.id, a]));
export const aspectsOf = (w: WeaponId) => ASPECTS.filter(a => a.weapon === w);
export const defaultAspect = (w: WeaponId) => `${w}-0`;

/** Rank owned: the default aspect is always at least rank I. */
export function aspectRank(ranks: Record<string, number>, id: string): number {
  const r = ranks[id] ?? 0;
  return id.endsWith('-0') ? Math.max(1, r) : r;
}

/** The weapon and stats a run starts with, once its aspect is applied. */
export function equip(weaponId: WeaponId, stats: Stats, aspectId?: string, rank = 1): { weapon: Weapon; stats: Stats } {
  let w = WEAPONS[weaponId] ?? WEAPONS.blade;
  let s = w.modify ? w.modify(stats) : stats;
  const a = aspectId ? ASPECT_BY_ID.get(aspectId) : undefined;
  if (a && a.weapon === w.id && rank > 0) ({ weapon: w, stats: s } = a.apply(w, s, rank));
  return { weapon: w, stats: s };
}
