import type { FightHooks } from '../tactics/fight';
import type { SpellDef } from '../tactics/types';

/** The player's build: base values, then skill nodes, implants, synergies, relics and the weapon aspect. */
export interface Stats {
  maxHp: number;
  /** action / movement points per turn */
  pa: number;
  pm: number;
  /** range bonus on spells whose range can be changed */
  range: number;
  initiative: number;
  /** flat damage added to every damage roll */
  damage: number;
  /** damage bonus, 0.2 = +20 % */
  damagePct: number;
  critChance: number;
  critMult: number;
  /** damage reduction, 0.2 = -20 % taken */
  res: number;
  /** extra damage per push cell blocked */
  pushDamage: number;
  tackle: number;
  dodge: number;
  /** fraction of the damage you deal healed back */
  lifesteal: number;
  /** damage back to whoever hits you in melee */
  thorns: number;
  killHeal: number;
  critHeal: number;
  /** extra damage under 40 % HP */
  lowHpDamage: number;
  /** extra damage per psychosis point (0.003 = +30 % at 100 %) */
  psyDamage: number;
  /** extra damage on units that lost PM or PA */
  dazedDamage: number;
  /** PA gained on the first kill of a turn */
  killPa: number;
  /** psychosis added by each spell you cast */
  castPsy: number;
  /** 0..0.9 — fraction of psychosis gain ignored (negative: gained faster) */
  psyResist: number;
  implantLoadMult: number;
  psyRateMult: number;
  creditMult: number;
  /** fraction of max HP healed when a sector is cleared */
  regenOnClear: number;
  healMult: number;
  startBlockers: number;
  /** psychosis removed by one neuro-blocker */
  blockerAmount: number;
  bossBonusMult: number;
  /** Surchauffe: PA gained and psychosis paid */
  overheatPa: number;
  overheatPsy: number;
  /** psychosis change on each kill (negative: kills calm you down) */
  psyPerKill: number;
  /** factor on the HP lost each turn at high psychosis */
  psyDrainMult: number;
  /** PA / PM gained at the start of your turns from 50 % psychosis */
  edgePa: number;
  edgePm: number;
  /** factor on the prices of street encounters */
  priceMult: number;
  /** fraction of the run's credits paid as interest when you leave a sector */
  interest: number;
  /** extra damage dealt by enemies (0.2 = +20 %) */
  foeDamage: number;
  /** breakables always drop something, credits x(1 + lootBonus) */
  lootBonus: number;
}

export type Family = 'chrome' | 'neural' | 'blood' | 'optic';
export type Rarity = 'common' | 'rare' | 'epic' | 'black';

export interface Implant {
  id: string;
  name: string;
  /** level 1 text; `describe` gives the text for higher levels */
  description: string;
  load: number;
  /** `level` 1-3: upgrades of an implant you already carry */
  modify: (s: Stats, level?: number) => Stats;
  describe?: (level: number) => string;
  family?: Family;
  rarity?: Rarity;
  /** the level carried in this run (owned copies only) */
  level?: number;
  /** a spell this implant adds to your bar */
  spell?: string;
}

/** Cursed relics give a big edge with a real drawback. */
export type RelicRarity = 'common' | 'rare' | 'legendary' | 'cursed';

/**
 * A run-long find, no psychosis load. It can change your stats (`modify`, which also sees your implants),
 * add a spell, rework your spells, count as extra implants for the synergies, or listen to fight events.
 */
export interface Relic {
  id: string;
  name: string;
  description: string;
  rarity: RelicRarity;
  texture?: string;
  modify: (s: Stats, implants: readonly Implant[]) => Stats;
  spell?: string;
  /** applied to every spell of your bar (a private copy) */
  editSpell?: (s: SpellDef) => void;
  /** each family you carry counts this many more implants for the synergies */
  synergyBonus?: number;
  /** fight listeners; they act for the player's unit only */
  hooks?: FightHooks;
  /** only offered when it can do something for this spell bar */
  fits?: (spells: readonly SpellDef[]) => boolean;
}

export interface SkillNode {
  id: string;
  name: string;
  description: string;
  cost: number;
  requires?: string;
  tree: 'body' | 'mind';
  /** 0-3 body branches, 4-5 mind branches; each branch is one UI column */
  branch: number;
  modify: (s: Stats) => Stats;
}
