export interface Stats {
  maxHp: number;
  damage: number;
  speed: number;
  dashCharges: number;
  critChance: number;
  /** 0..0.9 — fraction of psychosis gain ignored */
  psyResist: number;
  creditMult: number;
  implantLoadMult: number;
  /** incoming damage multiplier (armor) */
  damageTakenMult: number;
  /** fraction of max HP healed when a sector is cleared */
  regenOnClear: number;
  /** damage multiplier of the 3rd combo hit */
  finisherMult: number;
  dashCooldownMult: number;
  /** extra ms added to the parry window */
  parryBonusMs: number;
  counterMult: number;
  startBlockers: number;
  /** psychosis removed by one neuro-blocker */
  blockerAmount: number;
  bossBonusMult: number;
  /** attack reach multiplier (katana) */
  rangeMult: number;
  /** golden pistols: fraction of damage fired as a bullet on each swing (0 = no gun) */
  gunDamage: number;
  /** crit damage multiplier */
  critMult: number;
  /** damage dealt back to a melee attacker that hits you */
  thorns: number;
  /** HP regained per kill */
  killHeal: number;
  /** damage dealt to every enemy you dash through */
  dashDamage: number;
  /** > 0: parrying is impossible (OS Berserker) */
  parryLocked: number;
  /** multiplier on heals from pickups, doors and sector regen */
  healMult: number;
  /** psychosis change on each perfect parry (negative calms you down) */
  parryPsy: number;
  /** psychosis change on each critical hit */
  critPsy: number;
  /** psychosis added by each hit you land */
  hitPsy: number;
  /** extra damage multiplier while under 40 % HP */
  lowHpDamage: number;
  /** extra damage per psychosis point (0.003 = +30 % at 100 %) */
  psyDamage: number;
  /** multiplier on the passive psychosis rise */
  psyRateMult: number;
  /** attack rate multiplier (higher = faster swings) */
  attackSpeed: number;
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
}

export interface Relic {
  id: string;
  name: string;
  description: string;
  texture: string;
  modify: (s: Stats) => Stats;
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
