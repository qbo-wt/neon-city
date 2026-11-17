import type { SaveData } from './save';
import type { Rng } from './rng';

/**
 * Capsule, the talking NEON COLA machine of the corridor: what it remembers about you and its
 * little quest, spread over several runs. Pure functions over the save; the caller persists.
 *
 * The state lives in `save.story.vending`. That is safe because it only changes in two places that
 * each hold a fresh copy of the save: the corridor (dialogue, through InteriorScene.persistSave) and
 * the end of a run (RunScene.finish reloads the save before writing it), plus the gifts taken when a
 * run starts (RunScene.init, before anything else is loaded).
 */

export type VendingMood = 'neutral' | 'happy' | 'sad' | 'angry' | 'glitch' | 'love';

/**
 * Quest steps: 0 not taken yet, 1 break street vending machines, 2 beat the Lieutenant, 3 pay for a
 * memory module, 4 done (a free drink after every run).
 */
export type VendingStage = 0 | 1 | 2 | 3 | 4;

/** What Capsule hands over: each one acts once, at the start of the next normal run. */
export type GiftId = 'cherry' | 'zero' | 'mystery' | 'crowbar';

export const GIFTS: Record<GiftId, { name: string; effect: string }> = {
  cherry: { name: 'NEON COLA Cerise', effect: '+1 neuro-bloqueur au début du prochain run' },
  zero: { name: 'NEON COLA Zéro', effect: '+25¢ au début du prochain run' },
  mystery: { name: 'NEON COLA Saveur Mystère', effect: 'une relique commune au hasard pour le prochain run' },
  crowbar: { name: 'Pied-de-biche du livreur', effect: 'la relique Pied-de-biche pour le prochain run' },
};
const GIFT_IDS = Object.keys(GIFTS) as GiftId[];
/** The loyalty drink is one of these (the crowbar is a one-off). */
const DRINKS: GiftId[] = ['cherry', 'zero', 'mystery'];

/** Street vending machines to break (stage 1), the credits that come with the first drink, the module's price. */
export const SMASH_GOAL = 3;
export const SMASH_CREDITS = 30;
export const MODULE_PRICE = 80;
/** Starting credits given by a NEON COLA Zéro. */
export const ZERO_CREDITS = 25;
/** The relic the crowbar gift puts in your pocket (src/data/relics.ts). */
export const CROWBAR_RELIC = 'scavenger';
const TRUST_MIN = -3, TRUST_MAX = 5;
const GIFT_CAP = 6;

export interface VendingState {
  /** first conversation done */
  met: boolean;
  /** you asked its name: the bubbles say Capsule */
  named: boolean;
  /** how it feels about you, -3..5: kind answers raise it, threats lower it */
  trust: number;
  threats: number;
  stage: VendingStage;
  /** street vending machines broken since stage 1 began */
  smashed: number;
  /** the Lieutenant was beaten since stage 2 began */
  warden: boolean;
  /** waiting for the next normal run */
  gifts: GiftId[];
  /** save.runs when the last loyalty drink was given */
  giftRun: number;
  /** save.runs at the last greeting: it reacts to each run once */
  greeted: number;
  /** told you who gave it feelings */
  secret: boolean;
}

export function defaultVending(): VendingState {
  return { met: false, named: false, trust: 0, threats: 0, stage: 0, smashed: 0, warden: false, gifts: [], giftRun: 0, greeted: 0, secret: false };
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Never throws; anything missing or broken falls back to the defaults. */
export function parseVending(raw: unknown): VendingState | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>, d = defaultVending();
  const stage = isCount(o.stage) && o.stage <= 4 ? (Math.floor(o.stage) as VendingStage) : d.stage;
  return {
    met: o.met === true,
    named: o.named === true,
    trust: typeof o.trust === 'number' && Number.isFinite(o.trust) ? clamp(Math.round(o.trust), TRUST_MIN, TRUST_MAX) : d.trust,
    threats: isCount(o.threats) ? Math.floor(o.threats) : 0,
    stage,
    smashed: isCount(o.smashed) ? Math.min(SMASH_GOAL, Math.floor(o.smashed)) : 0,
    warden: o.warden === true,
    gifts: Array.isArray(o.gifts) ? o.gifts.filter((g): g is GiftId => GIFT_IDS.includes(g as GiftId)).slice(0, GIFT_CAP) : [],
    giftRun: isCount(o.giftRun) ? Math.floor(o.giftRun) : 0,
    greeted: isCount(o.greeted) ? Math.floor(o.greeted) : 0,
    secret: o.secret === true,
  };
}

export const vendingOf = (save: SaveData): VendingState => save.story.vending ?? defaultVending();

/** The save with Capsule's state replaced (and optionally the credits changed). */
export function withVending(save: SaveData, v: VendingState, credits = save.credits): SaveData {
  return { ...save, credits, story: { ...save.story, vending: v } };
}

/** A kind answer raises trust, a threat lowers it (and it remembers); sarcasm changes nothing. */
export function applyTone(v: VendingState, tone: 'kind' | 'snark' | 'threat' | undefined): VendingState {
  if (tone === 'kind') return { ...v, trust: Math.min(TRUST_MAX, v.trust + 1) };
  if (tone === 'threat') return { ...v, trust: Math.max(TRUST_MIN, v.trust - 1), threats: v.threats + 1 };
  return v;
}

/** The face on its screen when nobody is talking to it. */
export function idleMood(v: VendingState): VendingMood {
  if (v.trust <= -2) return 'angry';
  if (v.stage === 4 && v.trust >= 2) return 'love';
  if (v.trust >= 3) return 'happy';
  return 'neutral';
}

/** The current step can be handed in. */
export function questReady(v: VendingState): boolean {
  return (v.stage === 1 && v.smashed >= SMASH_GOAL) || (v.stage === 2 && v.warden);
}

/** Stage 0 → 1: break the street machines, counted from now. */
export function acceptQuest(v: VendingState): VendingState {
  return v.stage === 0 ? { ...v, stage: 1, smashed: 0 } : v;
}

/** What a finished run brings to the quest (counts only for the step in progress). */
export function afterRun(v: VendingState | undefined, r: { smashed: number; wardenDown: boolean }): VendingState | undefined {
  if (!v) return v;
  if (v.stage === 1) return { ...v, smashed: Math.min(SMASH_GOAL, v.smashed + Math.max(0, Math.floor(r.smashed))) };
  if (v.stage === 2 && r.wardenDown) return { ...v, warden: true };
  return v;
}

const give = (v: VendingState, g: GiftId): VendingState => ({ ...v, gifts: [...v.gifts, g].slice(-GIFT_CAP) });

/**
 * Hands in the finished step: the street machines give a Cerise and 30¢, the Lieutenant the
 * crowbar; the next step starts. Unchanged when nothing is ready.
 */
export function turnIn(save: SaveData): SaveData {
  const v = vendingOf(save);
  if (!questReady(v)) return save;
  if (v.stage === 1) return withVending(save, { ...give(v, 'cherry'), stage: 2, warden: false }, save.credits + SMASH_CREDITS);
  return withVending(save, { ...give(v, 'crowbar'), stage: 3 });
}

/** Stage 3 → 4: you pay for its memory module. Its first loyalty drink is ready right away. */
export function payModule(save: SaveData): SaveData {
  const v = vendingOf(save);
  if (v.stage !== 3 || save.credits < MODULE_PRICE) return save;
  return withVending(save, { ...v, stage: 4, giftRun: Math.max(0, save.runs - 1), trust: Math.min(TRUST_MAX, v.trust + 1) }, save.credits - MODULE_PRICE);
}

/** Once the quest is done, one free drink per run played. */
export function loyaltyReady(save: SaveData): boolean {
  const v = vendingOf(save);
  return v.stage === 4 && save.runs > v.giftRun;
}

export function loyaltyDrink(save: SaveData, rng: Rng): { save: SaveData; gift?: GiftId } {
  if (!loyaltyReady(save)) return { save };
  const v = vendingOf(save);
  const gift = DRINKS[Math.min(DRINKS.length - 1, Math.floor(rng() * DRINKS.length))];
  return { save: withVending(save, { ...give(v, gift), giftRun: save.runs }), gift };
}

/** At the start of a run: the gifts waiting for it, now used up. */
export function takeGifts(save: SaveData): { save: SaveData; gifts: GiftId[] } {
  const v = save.story.vending;
  if (!v?.gifts.length) return { save, gifts: [] };
  return { save: withVending(save, { ...v, gifts: [] }), gifts: v.gifts };
}
