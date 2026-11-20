import { describe, it, expect } from 'vitest';
import {
  ITEM_CHANCE, challengeAvailable, challengeCredits, challengeFailed, challengeInstance, challengeLine, challengeSucceeded,
  drawChallenges, newTally, rollReward, trackEvent, type ChallengeCtx, type ChallengeInstance, type TrackEnv,
} from '../../src/core/challenges';
import { CHALLENGES, CHALLENGE_BY_ID, type ChallengeId } from '../../src/data/challenges';
import { createRng } from '../../src/core/rng';
import type { FightEvent } from '../../src/tactics/types';

const HERO = 1;
const KINDS: Record<number, { team: number; kind: string }> = {
  10: { team: 1, kind: 'runner' }, 11: { team: 1, kind: 'brute' }, 12: { team: 1, kind: 'hacker' }, 13: { team: 1, kind: 'runner' },
  50: { team: 2, kind: 'crate' },
};
const TAGS: Record<string, string> = { slash: 'melee', shoot: 'ranged', dash: 'move' };
let round = 1, psy = 0;
const env = (): TrackEnv => ({ heroUid: HERO, round, psy, info: u => KINDS[u], tag: s => TAGS[s] });
const feed = (t: ReturnType<typeof newTally>, ...evs: FightEvent[]) => evs.forEach(e => trackEvent(t, e, env()));
const cast = (spell: string): FightEvent => ({ t: 'cast', uid: HERO, spell, cell: { x: 0, y: 0 }, crit: false });
const death = (uid: number, by = HERO): FightEvent => ({ t: 'death', uid, by });
const hit = (uid: number, amount: number): FightEvent => ({ t: 'damage', uid, amount, crit: false, absorbed: 0 });
const inst = (id: ChallengeId, target = 0): ChallengeInstance => ({ id, target });

const ctx = (o: Partial<ChallengeCtx> = {}): ChallengeCtx => ({
  ri: 3, enemies: ['runner', 'gunner', 'brute', 'hacker'], spellTags: ['melee', 'ranged', 'melee', 'move'], attackSpells: 3,
  psyOn: false, traps: true, maxHp: 40, ...o,
});

describe('challenge rules, on hand-built fights', () => {
  it('intact: held until the hero loses a point, failed after', () => {
    const t = newTally();
    feed(t, hit(10, 5), cast('slash'));
    expect(challengeSucceeded(inst('intact'), t)).toBe(true);
    feed(t, hit(HERO, 3));
    expect(challengeFailed(inst('intact'), t)).toBe(true);
    expect(challengeSucceeded(inst('intact'), t)).toBe(false);
  });

  it('rapide: the round counter decides', () => {
    const t = newTally();
    round = 3; feed(t, hit(10, 1));
    expect(challengeSucceeded(inst('rapide', 3), t)).toBe(true);
    round = 4; feed(t, hit(10, 1));
    expect(challengeSucceeded(inst('rapide', 3), t)).toBe(false);
    expect(challengeFailed(inst('rapide', 4), t)).toBe(false);
    round = 1;
  });

  it('variete: failed by the same spell twice in a row, not by a spell cast again later', () => {
    const t = newTally();
    feed(t, cast('slash'), cast('shoot'), cast('slash'));
    expect(challengeFailed(inst('variete'), t)).toBe(false);
    feed(t, cast('slash'));
    expect(challengeFailed(inst('variete'), t)).toBe(true);
  });

  it('lame: needs a kill by the hero right after a melee spell', () => {
    const t = newTally();
    feed(t, cast('shoot'), death(10));
    expect(challengeSucceeded(inst('lame'), t)).toBe(false);
    feed(t, cast('slash'), death(13));
    expect(challengeSucceeded(inst('lame'), t)).toBe(true);
    const u = newTally();
    feed(u, cast('slash'), death(10, 99)); // killed by something else (a barrel): does not count
    expect(challengeSucceeded(inst('lame'), u)).toBe(false);
  });

  it('pied_ferme: any hero move fails it, an enemy move does not', () => {
    const t = newTally();
    feed(t, { t: 'move', uid: 10, path: [] });
    expect(challengeFailed(inst('pied_ferme'), t)).toBe(false);
    feed(t, { t: 'move', uid: HERO, path: [{ x: 1, y: 1 }] });
    expect(challengeFailed(inst('pied_ferme'), t)).toBe(true);
  });

  it('colosse / signal: the first enemy to fall decides, objects do not count', () => {
    const t = newTally();
    feed(t, death(50));
    expect(challengeFailed(inst('colosse'), t)).toBe(false);
    feed(t, death(11), death(10));
    expect(challengeSucceeded(inst('colosse'), t)).toBe(true);
    expect(challengeFailed(inst('signal'), t)).toBe(true);
    const u = newTally();
    feed(u, death(12));
    expect(challengeSucceeded(inst('signal'), u)).toBe(true);
    expect(challengeSucceeded(inst('colosse'), u)).toBe(false);
  });

  it('fauchage: two kills inside one hero turn; the count resets on the next turn', () => {
    const t = newTally();
    feed(t, { t: 'turn', uid: HERO }, death(10), { t: 'turn', uid: HERO }, death(11));
    expect(challengeSucceeded(inst('fauchage'), t)).toBe(false);
    feed(t, { t: 'turn', uid: HERO }, death(12), death(13));
    expect(challengeSucceeded(inst('fauchage'), t)).toBe(true);
  });

  it('economie: casts of the hero only, up to the target', () => {
    const t = newTally();
    feed(t, cast('slash'), cast('shoot'), { t: 'cast', uid: 10, spell: 'e-knife', cell: { x: 0, y: 0 }, crit: false });
    expect(challengeSucceeded(inst('economie', 2), t)).toBe(true);
    feed(t, cast('slash'));
    expect(challengeFailed(inst('economie', 2), t)).toBe(true);
  });

  it('main_nue and distance fail on the opposite tag only', () => {
    const t = newTally();
    feed(t, cast('slash'), cast('dash'));
    expect(challengeFailed(inst('main_nue'), t)).toBe(false);
    expect(challengeFailed(inst('distance'), t)).toBe(true);
    feed(t, cast('shoot'));
    expect(challengeFailed(inst('main_nue'), t)).toBe(true);
  });

  it('egratignures: counts the HP actually lost, up to the target', () => {
    const t = newTally();
    feed(t, hit(HERO, 6), hit(HERO, 4), hit(10, 99));
    expect(challengeSucceeded(inst('egratignures', 10), t)).toBe(true);
    feed(t, hit(HERO, 1));
    expect(challengeFailed(inst('egratignures', 10), t)).toBe(true);
  });

  it('sol: a trap on the hero fails it, a bonus cell does not', () => {
    const t = newTally();
    feed(t, { t: 'trap', uid: HERO, kind: 'medkit', at: { x: 0, y: 0 } });
    expect(challengeFailed(inst('sol'), t)).toBe(false);
    feed(t, { t: 'trap', uid: 10, kind: 'shock', at: { x: 0, y: 0 } });
    expect(challengeFailed(inst('sol'), t)).toBe(false);
    feed(t, { t: 'trap', uid: HERO, kind: 'shock', at: { x: 0, y: 0 } });
    expect(challengeFailed(inst('sol'), t)).toBe(true);
  });

  it('sang_froid: psychosis gained since the start of the fight', () => {
    const t = newTally(20);
    psy = 25; feed(t, hit(10, 1));
    expect(challengeSucceeded(inst('sang_froid', 8), t)).toBe(true);
    psy = 31; feed(t, hit(10, 1));
    expect(challengeFailed(inst('sang_froid', 8), t)).toBe(true);
    psy = 0;
  });

  it('every challenge has a rule that can pass AND fail (nothing is always met or always lost)', () => {
    // a perfect fight and a terrible one, both ending in a win
    const good = newTally(), bad = newTally(0);
    round = 1; psy = 0;
    feed(good, { t: 'turn', uid: HERO }, cast('slash'), death(11), death(10), death(12));
    round = 9; psy = 90;
    feed(bad, hit(HERO, 30), { t: 'move', uid: HERO, path: [] }, cast('slash'), cast('slash'), cast('shoot'), cast('slash'), cast('slash'), cast('slash'),
      cast('slash'), cast('slash'), cast('slash'), { t: 'trap', uid: HERO, kind: 'shock', at: { x: 0, y: 0 } }, death(13, 99), { t: 'turn', uid: HERO }, death(12, 99));
    round = 1; psy = 0;
    // signal vs colosse, distance vs main_nue ask opposite things: one fight cannot pass both (each is covered above)
    for (const d of CHALLENGES.filter(c => c.id !== 'signal' && c.id !== 'distance')) {
      const i = challengeInstance(d.id, ctx({ psyOn: true }));
      expect(challengeSucceeded(i, good), `${d.id} passes on a clean fight`).toBe(true);
      expect(challengeSucceeded(i, bad), `${d.id} fails on a messy fight`).toBe(false);
    }
  });

  it('the live line says en cours, then raté', () => {
    const t = newTally();
    expect(challengeLine(inst('intact'), t)).toEqual({ text: 'DÉFI INTOUCHABLE : EN COURS', state: 'run' });
    feed(t, hit(HERO, 1));
    expect(challengeLine(inst('intact'), t)).toEqual({ text: 'DÉFI INTOUCHABLE : RATÉ', state: 'failed' });
  });
});

describe('which challenges are offered', () => {
  const ids = (c: ChallengeCtx) => CHALLENGES.filter(d => challengeAvailable(d, c)).map(d => d.id);

  it('never offers a challenge the room cannot hold', () => {
    const lone = ctx({ enemies: ['gunner', 'gunner', 'drone'], traps: false, spellTags: ['melee'], attackSpells: 1 });
    const a = ids(lone);
    for (const gone of ['colosse', 'signal', 'sol', 'main_nue', 'distance', 'variete', 'pied_ferme', 'sang_froid'] as ChallengeId[]) expect(a, gone).not.toContain(gone);
    // and many seeds never draw one either
    for (let s = 0; s < 200; s++) for (const o of drawChallenges(createRng(s), lone)) expect(a).toContain(o.id);
  });

  it('colosse needs a brute AND someone else, fauchage three enemies, sol traps', () => {
    expect(ids(ctx({ enemies: ['brute'] }))).not.toContain('colosse');
    expect(ids(ctx({ enemies: ['brute', 'runner'] }))).toContain('colosse');
    expect(ids(ctx({ enemies: ['runner', 'runner'] }))).not.toContain('fauchage');
    expect(ids(ctx({ traps: false }))).not.toContain('sol');
  });

  it('psychosis challenges only exist in CyberHard', () => {
    expect(ids(ctx({ psyOn: false }))).not.toContain('sang_froid');
    expect(ids(ctx({ psyOn: true }))).toContain('sang_froid');
    for (let s = 0; s < 300; s++) for (const o of drawChallenges(createRng(s), ctx({ psyOn: false }))) expect(CHALLENGE_BY_ID.get(o.id)!.psyOnly).toBeFalsy();
  });

  it('the draw is stable for a seed, two distinct ones, and varies across seeds', () => {
    const c = ctx();
    const a = drawChallenges(createRng(77 * 61 + 3 * 997 + 5), c);
    expect(drawChallenges(createRng(77 * 61 + 3 * 997 + 5), c)).toEqual(a);
    expect(a).toHaveLength(2);
    expect(a[0].id).not.toBe(a[1].id);
    expect(new Set(Array.from({ length: 40 }, (_, s) => drawChallenges(createRng(s), c)[0].id)).size).toBeGreaterThan(3);
  });

  it('sets the numbers from the room: rapide by enemy count, egratignures by max HP', () => {
    expect(challengeInstance('rapide', ctx({ enemies: ['runner', 'runner', 'gunner'] })).target).toBe(3);
    expect(challengeInstance('rapide', ctx({ enemies: Array(7).fill('runner') })).target).toBe(5);
    expect(challengeInstance('egratignures', ctx({ maxHp: 40 })).target).toBe(10);
  });
});

describe('rewards', () => {
  it('pay grows with difficulty and depth', () => {
    expect(challengeCredits(1, 0)).toBeLessThan(challengeCredits(2, 0));
    expect(challengeCredits(2, 0)).toBeLessThan(challengeCredits(3, 0));
    expect(challengeCredits(2, 2)).toBeLessThan(challengeCredits(2, 8));
  });

  it('the item chance is real, low and matches the table, whatever the seed', () => {
    for (const d of [1, 2, 3] as const) {
      const def = CHALLENGES.find(c => c.difficulty === d)!;
      let hits = 0;
      const N = 4000;
      for (let s = 0; s < N; s++) if (rollReward(createRng(s * 7 + 1), def, 4, 1, true).item !== 'none') hits++;
      expect(hits / N).toBeGreaterThan(ITEM_CHANCE[d] - 0.03);
      expect(hits / N).toBeLessThan(ITEM_CHANCE[d] + 0.03);
    }
    expect(ITEM_CHANCE[3]).toBeLessThanOrEqual(0.25);
    expect(ITEM_CHANCE[1]).toBeGreaterThanOrEqual(0.1);
  });

  it('is the same roll for the same seed, and falls back to an implant without relics left', () => {
    const def = CHALLENGES.find(c => c.difficulty === 3)!;
    expect(rollReward(createRng(5), def, 2, 1, true)).toEqual(rollReward(createRng(5), def, 2, 1, true));
    for (let s = 0; s < 500; s++) expect(rollReward(createRng(s), def, 2, 1, false).item).not.toBe('relic');
  });

  it('scales credits by the credit multiplier', () => {
    const def = CHALLENGES[0];
    expect(rollReward(createRng(1), def, 4, 2, true).credits).toBe(Math.round(challengeCredits(def.difficulty, 4) * 2));
  });
});
