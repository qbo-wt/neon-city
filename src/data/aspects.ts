import type { Stats } from '../core/types';
import type { SpellDef } from '../tactics/types';
import { spell } from './spells';
import { WEAPONS, type Weapon, type WeaponId } from './weapons';

/**
 * Weapon aspects: each weapon has three. The first is its default form (owned, rank I); the other two
 * are unlocked at the apartment rack. Every aspect has three ranks bought with credits.
 * An aspect changes the weapon's spells (cost, range, cooldown, zone, damage…) and/or your stats.
 */
export interface Aspect {
  id: string;
  weapon: WeaponId;
  name: string;
  describe: (rank: number) => string;
  /** credits for rank 1 (unlock; 0 for the default aspect), 2 and 3 */
  costs: [number, number, number];
  apply: (kit: Kit, rank: number) => void;
}

/** A weapon's spells and the player's stats, mutable while an aspect is applied. */
export interface Kit { spells: SpellDef[]; stats: Stats }

export const MAX_ASPECT_RANK = 3;
const ALT: [number, number, number] = [120, 200, 320];
const BASE: [number, number, number] = [0, 200, 320];
const pick = <T>(r: number, v: [T, T, T]) => v[Math.max(1, Math.min(3, r)) - 1];

/** Changes one spell of the kit. */
const edit = (k: Kit, id: string, f: (s: SpellDef) => void) => { const s = k.spells.find(x => x.id === id); if (s) f(s); };
/** Scales every damage effect of a spell. */
const boost = (s: SpellDef, mult: number) => {
  s.effects = s.effects.map(e => (e.k === 'dmg' || e.k === 'dash' ? { ...e, min: Math.round(e.min * mult), max: Math.round(e.max * mult) } : e));
};

export const ASPECTS: Aspect[] = [
  // ----- Lame-mono -----
  { id: 'blade-0', weapon: 'blade', name: 'Aspect Ronin', costs: BASE,
    describe: r => `+${pick(r, [1, 2, 3])} dégât${r > 1 ? 's' : ''} sur chaque coup${r > 1 ? `, +${pick(r, [0, 5, 10])} % de critique` : ''}.`,
    apply: (k, r) => { k.stats.damage += pick(r, [1, 2, 3]); k.stats.critChance += pick(r, [0, 0.05, 0.1]); } },
  { id: 'blade-1', weapon: 'blade', name: 'Aspect Lune Rouge', costs: ALT,
    describe: r => `Entaille porte à 2 cases${r >= 2 ? ', Estoc à 3 cases' : ''}${r >= 3 ? ', +20 % de dégâts sur les deux' : ''}.`,
    apply: (k, r) => {
      edit(k, 'cut', s => { s.range = [1, 2]; s.line = true; if (r >= 3) boost(s, 1.2); });
      if (r >= 2) edit(k, 'thrust', s => { s.range = [1, 3]; if (r >= 3) boost(s, 1.2); });
    } },
  { id: 'blade-2', weapon: 'blade', name: 'Aspect Fantôme', costs: ALT,
    describe: r => `Tranche-vent : ${pick(r, ['portée 5', 'portée 5, relance 1 tour', 'portée 6, relance 1 tour, 2 PA'])}.`,
    apply: (k, r) => edit(k, 'windcut', s => { s.range = [2, r >= 3 ? 6 : 5]; if (r >= 2) s.cooldown = 1; if (r >= 3) s.pa = 2; }) },
  // ----- Lames mantes -----
  { id: 'mantis-0', weapon: 'mantis', name: 'Aspect Mante', costs: BASE,
    describe: r => `+${pick(r, [5, 10, 15])} % de critique.`,
    apply: (k, r) => { k.stats.critChance += pick(r, [0.05, 0.1, 0.15]); } },
  { id: 'mantis-1', weapon: 'mantis', name: 'Aspect Sangsue', costs: ALT,
    describe: r => `Chaque critique te soigne de ${pick(r, [3, 5, 7])} PV${r >= 2 ? ', Saignée fait saigner 7 PV' : ''}.`,
    apply: (k, r) => {
      k.stats.critHeal += pick(r, [3, 5, 7]);
      if (r >= 2) edit(k, 'bleed', s => { s.effects = s.effects.map(e => (e.k === 'bleed' ? { ...e, v: 7 } : e)); });
    } },
  { id: 'mantis-2', weapon: 'mantis', name: 'Aspect Prédateur', costs: ALT,
    describe: r => `Bond de mante : ${pick(r, ['+25 % de dégâts', '+25 % de dégâts, portée 5', '+50 % de dégâts, portée 5, relance 1 tour'])}.`,
    apply: (k, r) => edit(k, 'leap', s => { boost(s, r >= 3 ? 1.5 : 1.25); if (r >= 2) s.range = [2, 5]; if (r >= 3) s.cooldown = 1; }) },
  // ----- Poings Titan -----
  { id: 'gorilla-0', weapon: 'gorilla', name: 'Aspect Titan', costs: BASE,
    describe: r => `+${pick(r, [5, 8, 12])} % de résistance.`,
    apply: (k, r) => { k.stats.res += pick(r, [0.05, 0.08, 0.12]); } },
  { id: 'gorilla-1', weapon: 'gorilla', name: 'Aspect Séisme', costs: ALT,
    describe: r => `Onde de choc : ${pick(r, ['retire 2 PM', 'retire 2 PM, relance 2 tours', 'rayon 3, retire 2 PM, relance 2 tours'])}.`,
    apply: (k, r) => edit(k, 'shockwave', s => {
      s.effects = s.effects.map(e => (e.k === 'buff' ? { ...e, v: -2 } : e));
      if (r >= 2) s.cooldown = 2;
      if (r >= 3) s.zone = { shape: 'circle', r: 3 };
    }) },
  { id: 'gorilla-2', weapon: 'gorilla', name: 'Aspect Démolisseur', costs: ALT,
    describe: r => `+${pick(r, [6, 12, 18])} dommages de poussée${r >= 2 ? ', Uppercut repousse de 3' : ''}.`,
    apply: (k, r) => {
      k.stats.pushDamage += pick(r, [6, 12, 18]);
      if (r >= 2) edit(k, 'uppercut', s => { s.effects = s.effects.map(e => (e.k === 'push' ? { ...e, n: 3 } : e)); });
    } },
  // ----- Fil-mono -----
  { id: 'wire-0', weapon: 'wire', name: 'Aspect Araignée', costs: BASE,
    describe: r => `Fouet : +${pick(r, [10, 20, 30])} % de dégâts.`,
    apply: (k, r) => edit(k, 'whip', s => boost(s, 1 + pick(r, [0.1, 0.2, 0.3]))) },
  { id: 'wire-1', weapon: 'wire', name: 'Aspect Garrotteur', costs: ALT,
    describe: r => `Garrot : ${pick(r, ['-3 PM', '-3 PM et -1 PA', '-3 PM et -1 PA, relance 1 tour'])}.`,
    apply: (k, r) => edit(k, 'garrote', s => {
      s.effects = s.effects.map(e => (e.k === 'buff' ? { ...e, v: -3 } : e));
      if (r >= 2) s.effects.push({ k: 'buff', stat: 'pa', v: -1, turns: 1 });
      if (r >= 3) s.cooldown = 1;
    }) },
  { id: 'wire-2', weapon: 'wire', name: 'Aspect Marionnettiste', costs: ALT,
    describe: r => `+${pick(r, [15, 25, 35])} % de dégâts sur les ennemis ralentis${r >= 2 ? ', Harpon portée 6' : ''}.`,
    apply: (k, r) => {
      k.stats.dazedDamage += pick(r, [0.15, 0.25, 0.35]);
      if (r >= 2) edit(k, 'harpoon', s => { s.range = [2, 6]; });
    } },
  // ----- Pistolet -----
  { id: 'pistol-0', weapon: 'pistol', name: 'Aspect Vautour', costs: BASE,
    describe: r => `Tir : +${pick(r, [10, 20, 30])} % de dégâts.`,
    apply: (k, r) => edit(k, 'shot', s => boost(s, 1 + pick(r, [0.1, 0.2, 0.3]))) },
  { id: 'pistol-1', weapon: 'pistol', name: 'Aspect Ricochet', costs: ALT,
    describe: r => `Tir perçant : ${pick(r, ['3 PA', '3 PA, relance 1 tour', '3 PA, relance 1 tour, +25 % de dégâts'])}.`,
    apply: (k, r) => edit(k, 'pierce', s => { s.pa = 3; if (r >= 2) s.cooldown = 1; if (r >= 3) boost(s, 1.25); }) },
  { id: 'pistol-2', weapon: 'pistol', name: 'Aspect Tempête', costs: ALT,
    describe: r => `Rafale : ${pick(r, ['zone de rayon 2', 'zone de rayon 2, relance 1 tour', 'zone de rayon 2, relance 1 tour, +20 % de dégâts'])}.`,
    apply: (k, r) => edit(k, 'volley', s => { s.zone = { shape: 'circle', r: 2 }; if (r >= 2) s.cooldown = 1; if (r >= 3) boost(s, 1.2); }) },
];

export const ASPECT_BY_ID = new Map(ASPECTS.map(a => [a.id, a]));
export const aspectsOf = (w: WeaponId) => ASPECTS.filter(a => a.weapon === w);
export const defaultAspect = (w: WeaponId) => `${w}-0`;

/** Rank owned: the default aspect is always at least rank I. */
export function aspectRank(ranks: Record<string, number>, id: string): number {
  const r = ranks[id] ?? 0;
  return id.endsWith('-0') ? Math.max(1, r) : r;
}

/** The weapon's spells and the stats a run starts with, once the weapon and its aspect are applied. */
export function equip(weaponId: WeaponId, stats: Stats, aspectId?: string, rank = 1): { weapon: Weapon; spells: SpellDef[]; stats: Stats } {
  const w = WEAPONS[weaponId] ?? WEAPONS.blade;
  const kit: Kit = { spells: w.spells.map(spell), stats: { ...(w.modify ? w.modify(stats) : stats) } };
  const a = aspectId ? ASPECT_BY_ID.get(aspectId) : undefined;
  if (a && a.weapon === w.id && rank > 0) a.apply(kit, rank);
  return { weapon: w, spells: kit.spells, stats: kit.stats };
}
