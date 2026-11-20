import type { RunMode } from './mode';

/**
 * The ending of a winning run, one per tier (normal, CyberHard, wanted posters), and what the
 * first win of each tier unlocks: a neon outline on the hero (see three/characters.ts).
 * Pure logic; the ending texts live in data/ending.ts. The first wins are kept in `SaveData.endings`.
 */
export type EndingTier = 'normal' | 'cyberhard' | 'wanted';
export const ENDING_TIERS: readonly EndingTier[] = ['normal', 'cyberhard', 'wanted'];
export const isEndingTier = (v: unknown): v is EndingTier => typeof v === 'string' && (ENDING_TIERS as readonly string[]).includes(v);

/** The hero's outline colour. 'none' is the original ink line. */
export type HeroLook = 'none' | 'cyan' | 'magenta' | 'gold';
export const HERO_LOOKS: readonly HeroLook[] = ['none', 'cyan', 'magenta', 'gold'];
export const LOOK_LABEL: Record<HeroLook, string> = { none: 'AUCUN', cyan: 'CYAN', magenta: 'MAGENTA', gold: 'OR' };
export const LOOK_COLOR: Record<Exclude<HeroLook, 'none'>, number> = { cyan: 0x00f0ff, magenta: 0xff2a6d, gold: 0xf5e663 };
export const TIER_LOOK: Record<EndingTier, Exclude<HeroLook, 'none'>> = { normal: 'cyan', cyberhard: 'magenta', wanted: 'gold' };
export const isHeroLook = (v: unknown): v is HeroLook => typeof v === 'string' && (HERO_LOOKS as readonly string[]).includes(v);

/** Which ending a winning run gets: posters (notoriety, CyberHard only), CyberHard, or normal. The daily run plays the CyberHard one. */
export function endingTier(run: { mode: RunMode; heat: number; daily?: boolean }): EndingTier {
  if (run.daily) return 'cyberhard';
  if (run.mode === 'normal') return 'normal';
  return run.heat > 0 ? 'wanted' : 'cyberhard';
}

/** After a winning run: the tiers beaten so far and, if this tier is a first win, which one. Daily runs unlock nothing. */
export function endingAfterRun(done: readonly EndingTier[], run: { mode: RunMode; heat: number; victory: boolean; daily?: boolean }): { done: EndingTier[]; fresh?: EndingTier } {
  const tier = endingTier(run);
  if (!run.victory || run.daily || done.includes(tier)) return { done: [...done] };
  return { done: [...done, tier], fresh: tier };
}

/** A look is available once the tier that gives it has been beaten. */
export const lookUnlocked = (done: readonly EndingTier[], look: HeroLook) =>
  look === 'none' || ENDING_TIERS.some(t => TIER_LOOK[t] === look && done.includes(t));
