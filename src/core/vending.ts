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

/**
 * Its faces. The last five belong to the end of its arc: `alarm` (the recall notice), `dot` (hidden and
 * mute: one blinking LED), `corp` (the Psy-Sec machine that replaced it), `off` (the empty shell),
 * `drift` (leaving for the network, falling apart into pixels).
 */
export type VendingMood = 'neutral' | 'happy' | 'sad' | 'angry' | 'glitch' | 'love' | 'alarm' | 'dot' | 'corp' | 'off' | 'drift';

/**
 * How its arc ends, chosen once in the dilemma (Psy-Sec's recall notice): `mute` hidden in the
 * corridor but silent for good, `net` sent by Nyx into the city's vending network (a Psy-Sec machine
 * takes its place), `lo` its chip grafted by the Doc into the till of Lo's ramen stand.
 */
export type Fate = 'mute' | 'net' | 'lo';
export const FATES: readonly Fate[] = ['mute', 'net', 'lo'];

/**
 * Its story, one chapter per return to the corridor (one per run played), each behind a trust and a
 * quest step. After the last one and a run more, the dilemma; after the dilemma, two epilogue
 * chapters that depend on the ending.
 */
export const CHAPTERS = [
  { id: 'coin', trust: -1, stage: 0 },
  { id: 'dream', trust: 0, stage: 0 },
  { id: 'census', trust: 0, stage: 1 },
  { id: 'babs', trust: 1, stage: 1 },
  { id: 'name', trust: 1, stage: 2 },
  { id: 'lo', trust: 2, stage: 3 },
  { id: 'forgot', trust: 2, stage: 4 },
  { id: 'signal', trust: 3, stage: 4 },
] as const;
export type MainChapter = typeof CHAPTERS[number]['id'];
export type ChapterId = MainChapter | `${Fate}${1 | 2}`;
export const EPILOGUE = 2;
/** Trust needed for the recall notice to come (after the last chapter). */
export const DILEMMA_TRUST = 3;
/** Credits it slips into each street machine you break, once it lives in the network. */
export const NET_TIP = 10;

/**
 * Quest steps: 0 not taken yet, 1 break street vending machines, 2 beat the Lieutenant, 3 pay for a
 * memory module, 4 done (a free drink after every run).
 */
export type VendingStage = 0 | 1 | 2 | 3 | 4;

/** What Capsule hands over: each one acts once, at the start of the next normal run. */
export type GiftId = 'cherry' | 'zero' | 'mystery' | 'crowbar';

export const GIFTS: Record<GiftId, { name: string; effect: string }> = {
  cherry: { name: 'NEON COLA Cerise', effect: '+1 neuro-bloqueur au début du prochain run (+15¢ en run normale)' },
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
/** What a NEON COLA Cerise gives instead in a normal run, which has no neuro-blockers. */
export const CHERRY_CALM_CREDITS = 15;
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
  /** chapters of its story told (CHAPTERS, then the epilogue) */
  chapter: number;
  /** save.runs when the last chapter was told (or when you met): one chapter per run */
  chapterRun: number;
  /** what you answered to its questions, by chapter key: it brings them up later */
  memory: Record<string, string>;
  /** how its arc ended; absent until the dilemma */
  fate?: Fate;
  /** save.runs when Lo last talked about it (once per run) */
  loRun: number;
}

export function defaultVending(): VendingState {
  return { met: false, named: false, trust: 0, threats: 0, stage: 0, smashed: 0, warden: false, gifts: [], giftRun: 0, greeted: 0, secret: false, chapter: 0, chapterRun: 0, memory: {}, loRun: 0 };
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const WORD = /^[a-z]{1,12}$/;
const MEMORY_CAP = 16;

function parseMemory(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, val] of Object.entries(raw).slice(0, MEMORY_CAP)) if (WORD.test(k) && typeof val === 'string' && WORD.test(val)) out[k] = val;
  return out;
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Never throws; anything missing or broken falls back to the defaults. */
export function parseVending(raw: unknown): VendingState | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>, d = defaultVending();
  const stage = isCount(o.stage) && o.stage <= 4 ? (Math.floor(o.stage) as VendingStage) : d.stage;
  // An ending only exists once the quest is done.
  const fate = FATES.includes(o.fate as Fate) && stage === 4 ? (o.fate as Fate) : undefined;
  const chapter = isCount(o.chapter) ? Math.floor(o.chapter) : 0;
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
    // Saves from before the chapters simply start at the first one; an ending implies every main chapter.
    chapter: fate ? Math.min(CHAPTERS.length + EPILOGUE, Math.max(CHAPTERS.length, chapter)) : Math.min(CHAPTERS.length, chapter),
    chapterRun: isCount(o.chapterRun) ? Math.floor(o.chapterRun) : 0,
    memory: parseMemory(o.memory),
    ...(fate ? { fate } : {}),
    loRun: isCount(o.loRun) ? Math.floor(o.loRun) : 0,
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

/** The face on the corridor machine's screen when nobody is talking to it (with `runs`: the recall notice shows). */
export function idleMood(v: VendingState, runs?: number): VendingMood {
  if (v.fate === 'mute') return 'dot';
  if (v.fate === 'net') return 'corp';
  if (v.fate === 'lo') return 'off';
  if (runs !== undefined && dilemmaReady(v, runs)) return 'alarm';
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

/** Once the quest is done, one free drink per run played (while it still lives in its machine). */
export function loyaltyReady(save: SaveData): boolean {
  const v = vendingOf(save);
  return v.stage === 4 && save.runs > v.giftRun && (!v.fate || v.fate === 'mute');
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

/** Its face on the screen of Lo's till, once its chip lives there. */
export function standMood(v: VendingState): VendingMood | null {
  return v.fate === 'lo' ? (v.trust >= 4 ? 'love' : 'happy') : null;
}

/**
 * The chapter it has to tell now, if any: one per run played since the last one (or since you met),
 * the main ones behind their trust and quest gates, then the two of its ending.
 */
export function nextChapter(v: VendingState, runs: number): ChapterId | undefined {
  if (!v.met || runs <= v.chapterRun) return undefined;
  if (v.fate) {
    const k = v.chapter - CHAPTERS.length;
    return k >= 0 && k < EPILOGUE ? (`${v.fate}${k + 1}` as ChapterId) : undefined;
  }
  const c = CHAPTERS[v.chapter];
  return c && v.trust >= c.trust && v.stage >= c.stage ? c.id : undefined;
}

/** A chapter is due but it does not trust you enough to tell it (the quest gates just wait). */
export function chapterWithheld(v: VendingState, runs: number): boolean {
  const c = CHAPTERS[v.chapter];
  return !v.fate && v.met && runs > v.chapterRun && !!c && v.stage >= c.stage && v.trust < c.trust;
}

/** The chapter is told: the next one waits for another run; your answer (key, value) is remembered. */
export function tellChapter(v: VendingState, runs: number, answer?: [string, string]): VendingState {
  return { ...v, chapter: v.chapter + 1, chapterRun: runs, memory: answer ? { ...v.memory, [answer[0]]: answer[1] } : v.memory };
}

/** The recall notice: every main chapter told, the quest done, enough trust, and a run since the last chapter. */
export function dilemmaReady(v: VendingState, runs: number): boolean {
  return !v.fate && v.stage === 4 && v.chapter >= CHAPTERS.length && v.trust >= DILEMMA_TRUST && runs > v.chapterRun;
}

/**
 * The choice of the dilemma, once and for good; its epilogue starts after the next run. Grafted into
 * Lo's till, it hands over the last stock of its machine (three drinks at once, and no more after).
 */
export function chooseFate(save: SaveData, fate: Fate): SaveData {
  const v = vendingOf(save);
  if (!dilemmaReady(v, save.runs)) return save;
  let next: VendingState = { ...v, fate, chapterRun: save.runs };
  if (fate === 'lo') for (const g of DRINKS) next = give(next, g);
  return withVending(save, next);
}

/** Credits it leaves in each street machine you break, from the network (0 otherwise). */
export const streetTip = (v: VendingState | undefined): number => (v?.fate === 'net' ? NET_TIP : 0);

/** Lo talks about it at most once per run. */
export const loTalked = (v: VendingState, runs: number): VendingState => ({ ...v, loRun: runs });

/**
 * Debug jumps (`?debug` console): straight to the recall notice, or to one of the endings. The rest
 * of the save is kept; the quest is marked done and a few answers are filled in if missing.
 */
export function debugCapsule(save: SaveData, to: 'dilemma' | Fate): SaveData {
  const { fate: _old, ...v } = vendingOf(save);
  const base: VendingState = {
    ...v, met: true, named: true, stage: 4, trust: Math.max(DILEMMA_TRUST + 1, v.trust), warden: true, smashed: SMASH_GOAL, secret: true,
    chapter: CHAPTERS.length, chapterRun: Math.max(0, save.runs - 1),
    memory: { coin: 'kept', dream: 'sea', guard: 'hide', call: 'pal', lo: 'tell', remember: 'yes', ...v.memory },
  };
  const s = withVending({ ...save, runs: Math.max(1, save.runs) }, base);
  return to === 'dilemma' ? s : chooseFate(s, to);
}
