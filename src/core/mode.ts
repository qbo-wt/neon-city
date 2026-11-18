import type { Stats } from './types';

/**
 * Run tiers, unlocked in order:
 * 1. `normal`: no cyberpsychosis and softer streets (NORMAL_TUNING). The default.
 * 2. `cyberhard`: the original rules (psychosis, neuro-blockers, Surchauffe for psychosis), +50 % credits.
 *    Unlocked by winning any run.
 * 3. the wanted posters (notoriety, data/heat.ts): CyberHard runs only, unlocked by winning one.
 * The daily run keeps the CyberHard rules without notoriety or credit bonus.
 */
export type RunMode = 'normal' | 'cyberhard';

export const isRunMode = (v: unknown): v is RunMode => v === 'normal' || v === 'cyberhard';
export const MODE_NAMES: Record<RunMode, string> = { normal: 'RUN NORMALE', cyberhard: 'RUN CYBERHARD' };

/** Psychosis (gauge, neuro-blockers, tiers, the content built around it) only exists in CyberHard. */
export const hasPsychosis = (mode: RunMode) => mode === 'cyberhard';

/** Everything that makes the normal run gentler, in one place. Factors stack on the depth scaling. */
export const NORMAL_TUNING = {
  /** enemy HP and damage */
  enemyHp: 0.8,
  enemyDamage: 0.85,
  /** bosses get these on top of the enemy factors */
  bossHp: 0.9,
  bossDamage: 0.9,
  /** every heal you receive (heal doors, medkits, stimpacks, kill heals…) */
  heal: 1.25,
  /** Surchauffe costs this fraction of max HP instead of psychosis */
  overheatHp: 0.06,
  /** credits banked at the end of the run */
  credits: 1,
};

/** CyberHard pays more: factor on the credits banked at the end of a CyberHard run (not the daily one). */
export const CYBERHARD_CREDIT_MULT = 1.5;

/** Credits factor at the end of a run of this mode. */
export const modeCreditMult = (mode: RunMode, daily = false) =>
  daily ? 1 : mode === 'normal' ? NORMAL_TUNING.credits : CYBERHARD_CREDIT_MULT;

/** Enemy HP / damage factors of a mode. */
export function modeScaling(mode: RunMode, boss: boolean): { hp: number; dmg: number } {
  if (mode !== 'normal') return { hp: 1, dmg: 1 };
  const T = NORMAL_TUNING;
  return { hp: T.enemyHp * (boss ? T.bossHp : 1), dmg: T.enemyDamage * (boss ? T.bossDamage : 1) };
}

/** The build's stats under a mode: without psychosis, the psychosis-bound stats do nothing and heals are stronger. */
export function modeStats(s: Stats, mode: RunMode): Stats {
  if (hasPsychosis(mode)) return s;
  return {
    ...s, healMult: s.healMult * NORMAL_TUNING.heal * (1 + s.calmHeal),
    castPsy: 0, psyDamage: 0, edgePa: 0, edgePm: 0, startBlockers: 0,
  };
}

/** Surchauffe's HP price in a normal run. */
export const overheatHpCost = (maxHp: number) => Math.max(1, Math.round(maxHp * NORMAL_TUNING.overheatHp));

/** What the elevator offers: CyberHard after a first victory, the wanted posters after a CyberHard one. */
export interface Unlocks { cyberhard: boolean; wanted: boolean }
export type UnlockId = keyof Unlocks;
export const UNLOCK_TITLES: Record<UnlockId, string> = { cyberhard: 'RUN CYBERHARD DÉBLOQUÉE', wanted: 'AVIS DE RECHERCHE DÉBLOQUÉS' };
export const UNLOCK_LINES: Record<UnlockId, string> = {
  cyberhard: 'L\'ascenseur propose la run CyberHard : la cyberpsychose entre en jeu, +50 % de crédits.',
  wanted: 'L\'ascenseur propose les avis de recherche : des handicaps en CyberHard contre plus de crédits.',
};

/** Unlocks after a run, and which ones are new. Any victory opens CyberHard; a CyberHard one (not daily) the posters. */
export function unlockAfterRun(u: Unlocks, run: { mode: RunMode; victory: boolean; daily?: boolean }): { unlocks: Unlocks; fresh: UnlockId[] } {
  if (!run.victory) return { unlocks: { ...u }, fresh: [] };
  const next: Unlocks = { cyberhard: true, wanted: u.wanted || (run.mode === 'cyberhard' && !run.daily) };
  return { unlocks: next, fresh: (['cyberhard', 'wanted'] as const).filter(k => next[k] && !u[k]) };
}
