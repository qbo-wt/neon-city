import type { EliteMod } from '../core/runMap';

/** A cell of the board. Floor: walk and see. Block: neither. Hole: see across, not walk. Void: off the board. */
export type Cell = 'floor' | 'block' | 'hole' | 'void';

export interface Pt { x: number; y: number }

export interface Board {
  w: number;
  h: number;
  cells: Cell[];
  /** what stands on a block / hole cell, for the renderer (crate, car, pillar…) */
  props: (string | undefined)[];
  playerStarts: Pt[];
  enemyStarts: Pt[];
  /** border cells that become the sector's exits once it is cleared */
  exits: Pt[];
  /** visual style of the street */
  style: string;
}

// ---------- spells ----------

/** Area hit around the target cell. 'line' runs away from the caster, 'perp' across the caster's axis. */
export type Zone =
  | { shape: 'cell' }
  | { shape: 'cross'; r: number }
  | { shape: 'circle'; r: number }
  | { shape: 'line'; len: number }
  | { shape: 'perp'; r: number };

export type BuffStat = 'pa' | 'pm' | 'dmg' | 'res' | 'range' | 'pushDmg';

export type Effect =
  /** damage to every opposing unit in the zone (and allies when the spell is friendly) */
  | { k: 'dmg'; min: number; max: number }
  /** heal the units in the zone (self spells: the caster) */
  | { k: 'heal'; min: number; max: number }
  /** push away from the caster (or from the target cell with fromCell) */
  | { k: 'push'; n: number; fromCell?: boolean }
  /** pull toward the caster */
  | { k: 'pull'; n: number }
  /** the caster rushes in a straight line next to the target unit (target must be in line) */
  | { k: 'charge' }
  /** the caster dashes to the target cell; enemies next to the path take the damage */
  | { k: 'dash'; min: number; max: number }
  /** the caster jumps to the target cell */
  | { k: 'jump' }
  /** a stat change for `turns` turns of the affected unit (negative = malus) */
  | { k: 'buff'; stat: BuffStat; v: number; turns: number; self?: boolean }
  | { k: 'shield'; v: number; turns: number; self?: boolean }
  /** damage at the start of each of the unit's turns */
  | { k: 'bleed'; v: number; turns: number }
  | { k: 'summon'; unit: string }
  /** psychosis added to the player when hit */
  | { k: 'psy'; v: number }
  /** bomber: arm itself, blow up at the start of its next turn */
  | { k: 'prime' }
  /** the caster dies (after a blast) */
  | { k: 'selfDestruct' };

export interface SpellDef {
  id: string;
  name: string;
  desc: string;
  /** two-letter label drawn on the spell button */
  icon: string;
  color: number;
  pa: number;
  range: [number, number];
  /** needs a clear line of sight */
  los: boolean;
  /** only in a straight line */
  line: boolean;
  /** range bonus applies */
  rangeMod: boolean;
  /** turns before it can be cast again (0 = every turn) */
  cooldown: number;
  /** casts per turn (0 = no limit) */
  perTurn: number;
  /** casts per target per turn (0 = no limit) */
  perTarget?: number;
  target: 'enemy' | 'unit' | 'empty' | 'any' | 'self';
  zone: Zone;
  effects: Effect[];
  /** the zone also hits the caster's allies */
  friendly?: boolean;
  /** extra crit chance */
  crit?: number;
  /** melee / ranged / mobility / utility: aspects and implants key on it */
  tag?: 'melee' | 'ranged' | 'move' | 'util';
  /** visual cue for the renderer */
  fx?: 'slash' | 'shot' | 'blast' | 'wire' | 'hack' | 'buff' | 'jump' | 'heal';
}

// ---------- units ----------

export interface UnitStats {
  /** damage bonus, 0.2 = +20 % */
  dmgPct: number;
  /** flat damage added to each damage roll */
  flat: number;
  crit: number;
  critMult: number;
  /** damage reduction, 0.2 = -20 % */
  res: number;
  pushDmg: number;
  tackle: number;
  dodge: number;
  range: number;
  /** fraction of damage dealt healed back */
  lifesteal: number;
  /** damage back to a unit that hits you in melee */
  thorns: number;
  killHeal: number;
  critHeal: number;
  /** extra damage under 40 % HP */
  lowHpDamage: number;
  /** multiplier set from outside (psychosis tier) */
  extraMult: number;
  /** extra damage on units that lost PM or PA this round (Démolisseur, Marionnettiste) */
  dazedDamage: number;
  /** PA gained on a kill, once per turn */
  killPa: number;
  /** psychosis-like cost: psy added per spell cast (only the player reads it) */
  castPsy: number;
}

export interface Buff { stat: BuffStat; v: number; turns: number }

export type AiKind = 'melee' | 'ranged' | 'coward' | 'bomber' | 'boss' | 'turret' | 'none';

export interface Unit {
  uid: number;
  /** 0: the player's side, 1: enemies, 2: neutral objects (breakables) */
  team: 0 | 1 | 2;
  /** 'player', an enemy id, a summon id or a breakable kind */
  kind: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  shield: number;
  shieldTurns: number;
  pa: number;
  pm: number;
  maxPa: number;
  maxPm: number;
  init: number;
  st: UnitStats;
  spells: SpellDef[];
  /** turns left before each spell can be cast again */
  cd: Record<string, number>;
  /** casts this turn, per spell and per spell+target */
  casts: Record<string, number>;
  buffs: Buff[];
  bleed: { v: number; turns: number }[];
  ai: AiKind;
  boss?: boolean;
  elite?: EliteMod;
  primed?: boolean;
  /** the round it lost PA / PM to a malus (dazed) */
  dazedRound?: number;
  killPaUsed?: boolean;
  summoner?: number;
  /** bosses: bonuses gained when HP drops under 50 % then 25 % (each applied once) */
  phases?: { pa: number; pm: number; dmg: number }[];
  phase?: number;
  dead: boolean;
  /** last facing on the board, for the renderer */
  face: Pt;
}

// ---------- events (what the renderer animates, in order) ----------

export type FightEvent =
  | { t: 'turn'; uid: number }
  | { t: 'move'; uid: number; path: Pt[] }
  | { t: 'cast'; uid: number; spell: string; cell: Pt; crit: boolean }
  | { t: 'damage'; uid: number; amount: number; crit: boolean; absorbed: number; push?: boolean; bleed?: boolean }
  | { t: 'heal'; uid: number; amount: number }
  | { t: 'shove'; uid: number; path: Pt[]; kind: 'push' | 'pull' | 'charge' | 'dash' | 'jump' }
  | { t: 'stat'; uid: number; stat: BuffStat; v: number }
  | { t: 'shield'; uid: number; v: number }
  | { t: 'death'; uid: number; by?: number }
  | { t: 'summon'; uid: number; by: number }
  | { t: 'psy'; uid: number; v: number }
  | { t: 'prime'; uid: number }
  | { t: 'explode'; uid: number; cells: Pt[] }
  | { t: 'phase'; uid: number; phase: number };
