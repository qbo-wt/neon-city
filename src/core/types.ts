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
  /** 0 = body column, 1 = mind column (UI layout only) */
  column: 0 | 1;
  modify: (s: Stats) => Stats;
}
