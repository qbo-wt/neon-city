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
}

export interface Implant {
  id: string;
  name: string;
  description: string;
  load: number;
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
