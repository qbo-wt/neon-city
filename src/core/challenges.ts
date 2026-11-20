import type { FightEvent } from '../tactics/types';
import { CHALLENGES, CHALLENGE_BY_ID, type ChallengeDef, type ChallengeId } from '../data/challenges';
import type { Rng } from './rng';

/**
 * Sector challenges, pure so the rules are tested apart from the scene. The scene feeds every REAL
 * fight event (never the AI's or a preview's, which play on copies) to `trackEvent`; the counters
 * live in a `ChallengeTally` owned by the scene, not in the fight hooks.
 *
 * Tuning: ITEM_CHANCE (odds of an item per difficulty), `challengeCredits` (pay) and the targets in
 * `RULES` below.
 */

/** What the room holds, to know which challenges make sense in it. */
export interface ChallengeCtx {
  /** sector index */
  ri: number;
  /** every enemy of every wave (kind ids) */
  enemies: readonly string[];
  /** `tag` of each of the hero's spells */
  spellTags: readonly (string | undefined)[];
  /** number of spells that can hurt (melee or ranged) */
  attackSpells: number;
  psyOn: boolean;
  /** the arena has traps (bonus cells do not count) */
  traps: boolean;
  maxHp: number;
}

export interface ChallengeInstance { id: ChallengeId; target: number }

export interface ChallengeTally {
  round: number;
  hitsTaken: number;
  hpLost: number;
  moves: number;
  casts: number;
  /** same spell twice in a row */
  repeats: number;
  lastSpell?: string;
  lastTag?: string;
  meleeCasts: number;
  rangedCasts: number;
  meleeKills: number;
  kills: number;
  /** kind of the first enemy that fell */
  firstKill?: string;
  turnKills: number;
  bestTurnKills: number;
  trapHits: number;
  psyStart: number;
  psyNow: number;
}

export const newTally = (psy = 0): ChallengeTally => ({
  round: 1, hitsTaken: 0, hpLost: 0, moves: 0, casts: 0, repeats: 0, meleeCasts: 0, rangedCasts: 0, meleeKills: 0,
  kills: 0, turnKills: 0, bestTurnKills: 0, trapHits: 0, psyStart: psy, psyNow: psy,
});

export interface TrackEnv {
  heroUid: number;
  round: number;
  psy: number;
  /** who a uid is (undefined once it is gone) */
  info: (uid: number) => { team: number; kind: string } | undefined;
  /** the tag of a spell id */
  tag: (spell: string) => string | undefined;
}

const BONUS_CELLS = ['medkit', 'relay'];

/** Folds one real fight event into the counters. */
export function trackEvent(t: ChallengeTally, e: FightEvent, env: TrackEnv): void {
  t.round = Math.max(t.round, env.round);
  t.psyNow = env.psy;
  switch (e.t) {
    case 'turn':
      if (e.uid === env.heroUid) t.turnKills = 0;
      break;
    case 'move':
      if (e.uid === env.heroUid) t.moves++;
      break;
    case 'cast': {
      if (e.uid !== env.heroUid) break;
      const tag = env.tag(e.spell);
      t.casts++;
      if (t.lastSpell === e.spell) t.repeats++;
      t.lastSpell = e.spell;
      t.lastTag = tag;
      if (tag === 'melee') t.meleeCasts++;
      if (tag === 'ranged') t.rangedCasts++;
      break;
    }
    case 'damage':
      if (e.uid === env.heroUid) { t.hitsTaken++; t.hpLost += e.amount; }
      break;
    case 'trap':
      if (e.uid === env.heroUid && !BONUS_CELLS.includes(e.kind)) t.trapHits++;
      break;
    case 'death': {
      const u = env.info(e.uid);
      if (!u || u.team !== 1) break;
      t.kills++;
      t.firstKill ??= u.kind;
      t.turnKills++;
      t.bestTurnKills = Math.max(t.bestTurnKills, t.turnKills);
      if (e.by === env.heroUid && t.lastTag === 'melee') t.meleeKills++;
      break;
    }
    default:
  }
}

interface Rule {
  available: (c: ChallengeCtx) => boolean;
  /** the number the rule is set to in this room (shown in the text) */
  target?: (c: ChallengeCtx) => number;
  /** already impossible */
  failed: (t: ChallengeTally, n: number) => boolean;
  /** goal reached (checked when the fight is won); avoidance rules are always met until they fail */
  done: (t: ChallengeTally, n: number) => boolean;
  /** live detail after the state, empty when there is nothing to count */
  detail?: (t: ChallengeTally, n: number) => string;
}

const has = (c: ChallengeCtx, kind: string) => c.enemies.includes(kind);
const always = () => true;
const other = (c: ChallengeCtx, kind: string) => c.enemies.some(k => k !== kind);

const RULES: Record<ChallengeId, Rule> = {
  intact: { available: always, failed: t => t.hpLost > 0, done: always },
  rapide: {
    available: c => c.enemies.length >= 2,
    target: c => (c.enemies.length <= 3 ? 3 : c.enemies.length <= 5 ? 4 : 5),
    failed: (t, n) => t.round > n, done: (t, n) => t.round <= n,
    detail: (t, n) => `round ${Math.min(t.round, n)}/${n}`,
  },
  variete: { available: c => c.attackSpells >= 3, failed: t => t.repeats > 0, done: always },
  lame: {
    available: c => c.spellTags.includes('melee'),
    failed: () => false, done: t => t.meleeKills >= 1,
    detail: t => (t.meleeKills ? 'fait' : 'à faire'),
  },
  pied_ferme: {
    available: c => has(c, 'runner') || has(c, 'brute') || has(c, 'bomber'),
    failed: t => t.moves > 0, done: always,
  },
  colosse: {
    available: c => has(c, 'brute') && other(c, 'brute'),
    failed: t => t.firstKill !== undefined && t.firstKill !== 'brute', done: t => t.firstKill === 'brute',
  },
  signal: {
    available: c => has(c, 'hacker') && other(c, 'hacker'),
    failed: t => t.firstKill !== undefined && t.firstKill !== 'hacker', done: t => t.firstKill === 'hacker',
  },
  fauchage: {
    available: c => c.enemies.length >= 3,
    failed: () => false, done: t => t.bestTurnKills >= 2,
    detail: t => `${Math.min(2, t.bestTurnKills)}/2`,
  },
  economie: {
    available: c => c.attackSpells >= 1 && c.enemies.length >= 2,
    target: c => c.enemies.length + 3,
    failed: (t, n) => t.casts > n, done: (t, n) => t.casts <= n,
    detail: (t, n) => `${t.casts}/${n} sorts`,
  },
  main_nue: {
    available: c => c.spellTags.includes('melee') && c.spellTags.includes('ranged'),
    failed: t => t.rangedCasts > 0, done: always,
  },
  distance: {
    available: c => c.spellTags.includes('melee') && c.spellTags.includes('ranged'),
    failed: t => t.meleeCasts > 0, done: always,
  },
  egratignures: {
    available: always,
    target: c => Math.max(1, Math.round(c.maxHp * 0.25)),
    failed: (t, n) => t.hpLost > n, done: (t, n) => t.hpLost <= n,
    detail: (t, n) => `${t.hpLost}/${n} PV`,
  },
  sol: { available: c => c.traps, failed: t => t.trapHits > 0, done: always },
  sang_froid: {
    available: c => c.psyOn,
    target: c => 6 + 2 * c.enemies.length,
    failed: (t, n) => t.psyNow - t.psyStart > n, done: (t, n) => t.psyNow - t.psyStart <= n,
    detail: (t, n) => `${Math.max(0, Math.round(t.psyNow - t.psyStart))}/${n}`,
  },
};

export function challengeAvailable(def: ChallengeDef, c: ChallengeCtx): boolean {
  if (def.psyOnly && !c.psyOn) return false;
  return RULES[def.id].available(c);
}

export const challengeInstance = (id: ChallengeId, c: ChallengeCtx): ChallengeInstance => ({ id, target: RULES[id].target?.(c) ?? 0 });

/**
 * The two challenges offered for a sector, drawn from the rng (seed it with the run seed and the
 * room index: quitting and resuming cannot re-roll them). Two different ones, of different
 * difficulty when possible; fewer when the room allows fewer.
 */
export function drawChallenges(rng: Rng, c: ChallengeCtx): ChallengeInstance[] {
  const pool = CHALLENGES.filter(d => challengeAvailable(d, c));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  if (pool.length < 2) return pool.map(d => challengeInstance(d.id, c));
  const first = pool[0];
  const second = pool.find(d => d !== first && d.difficulty !== first.difficulty) ?? pool[1];
  return [first, second].map(d => challengeInstance(d.id, c));
}

export const challengeText = (i: ChallengeInstance) => CHALLENGE_BY_ID.get(i.id)!.text(i.target);
export const challengeFailed = (i: ChallengeInstance, t: ChallengeTally) => RULES[i.id].failed(t, i.target);
/** The fight is won: was the challenge held and its goal reached? */
export const challengeSucceeded = (i: ChallengeInstance, t: ChallengeTally) => !challengeFailed(i, t) && RULES[i.id].done(t, i.target);

export type ChallengeState = 'run' | 'failed';

/** Live line for the combat bar. */
export function challengeLine(i: ChallengeInstance, t: ChallengeTally): { text: string; state: ChallengeState } {
  const name = CHALLENGE_BY_ID.get(i.id)!.name.toUpperCase();
  if (challengeFailed(i, t)) return { text: `DÉFI ${name} : RATÉ`, state: 'failed' };
  const d = RULES[i.id].detail?.(t, i.target);
  return { text: `DÉFI ${name} : EN COURS${d ? ` (${d})` : ''}`, state: 'run' };
}

// ---------- rewards ----------

/** Odds of an item (relic or implant) when the challenge is held, by difficulty. */
export const ITEM_CHANCE: Record<1 | 2 | 3, number> = { 1: 0.12, 2: 0.18, 3: 0.25 };
const CREDIT_MULT: Record<1 | 2 | 3, number> = { 1: 1, 2: 1.6, 3: 2.4 };

/** Credits paid for a held challenge at sector `ri`, before the credit multiplier. */
export const challengeCredits = (d: 1 | 2 | 3, ri: number) => Math.round((4 + ri * 0.5) * CREDIT_MULT[d]);

/** Share of the item rolls that give a relic (the rest: an implant to choose among). */
export const RELIC_SHARE = 0.6;

export interface ChallengeReward { credits: number; item: 'none' | 'relic' | 'implant' }

/** Rolled from the seed, never from Math.random: a resumed sector pays the same. */
export function rollReward(rng: Rng, def: ChallengeDef, ri: number, creditMult: number, relicsLeft: boolean): ChallengeReward {
  const credits = Math.round(challengeCredits(def.difficulty, ri) * creditMult);
  if (rng() >= ITEM_CHANCE[def.difficulty]) return { credits, item: 'none' };
  return { credits, item: relicsLeft && rng() < RELIC_SHARE ? 'relic' : 'implant' };
}
