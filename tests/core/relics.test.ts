import { describe, it, expect } from 'vitest';
import { RELICS, RELIC_BY_ID } from '../../src/data/relics';
import { RELIC_WEIGHTS, applyRelicSpells, offerRelics, relicHooks, relicPool } from '../../src/core/relics';
import { baseStats, computeStats } from '../../src/core/stats';
import { psyOnKill } from '../../src/core/psychosis';
import { rollLoot } from '../../src/core/loot';
import { createRng } from '../../src/core/rng';
import { IMPLANT_BY_ID } from '../../src/data/implants';
import { SPELLS, spell } from '../../src/data/spells';
import { WEAPONS } from '../../src/data/weapons';
import { eventOptions, type EventCtx } from '../../src/systems/streetEvents';
import { beginFight, byUid, cast, cloneFight, createFight, current, damageMult, endTurn, hurt, previewCast, type Fight } from '../../src/tactics/fight';
import { makeEnemy, makePlayer } from '../../src/tactics/units';
import type { Implant, Relic } from '../../src/core/types';
import type { Board, Pt } from '../../src/tactics/types';

const relic = (id: string) => RELIC_BY_ID.get(id)!;
const sc = { hpMult: 1, dmgMult: 1, pmBonus: 0, paBonus: 0, initBonus: 0 };
const open = (w: number, h: number): Board => {
  const cells = Array.from({ length: w * h }, () => 'floor' as const);
  return { w, h, cells, props: cells.map(() => undefined), playerStarts: [], enemyStarts: [], exits: [], style: 'avenue' };
};

/** Player (uid 1) at (0,0) with 100/120 HP, a runner (uid 2) next to it, a gunner (uid 3) far away. Player's turn. */
function duel(relics: Relic[], runnerAt: Pt = { x: 1, y: 0 }): Fight {
  const p = makePlayer(baseStats(), ['cut', 'thrust'].map(spell), 100, { x: 0, y: 0 });
  const f = createFight(open(6, 3), [p, makeEnemy('runner', runnerAt, sc), makeEnemy('gunner', { x: 5, y: 2 }, sc)], () => 0.5);
  f.hooks = relicHooks(relics);
  beginFight(f);
  return f;
}
/** Ends the player's turn and skips the enemies' turns (they do nothing) back to the player. */
const nextPlayerTurn = (f: Fight) => { do endTurn(f); while (current(f)?.kind !== "player" && !f.over); };

describe('relic content', () => {
  it('has a score of relics with unique ids, every rarity, and existing spells', () => {
    expect(RELICS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(RELICS.map(r => r.id)).size).toBe(RELICS.length);
    for (const rarity of Object.keys(RELIC_WEIGHTS)) expect(RELICS.some(r => r.rarity === rarity)).toBe(true);
    RELICS.forEach(r => { if (r.spell) expect(SPELLS[r.spell]).toBeDefined(); });
  });
  it('keeps descriptions short enough for the choice panel, and every cursed relic states its price', () => {
    RELICS.forEach(r => { expect(r.description.length).toBeGreaterThan(10); expect(r.description.length).toBeLessThanOrEqual(95); });
    RELICS.filter(r => r.rarity === 'cursed').forEach(r => expect(r.description).toMatch(/mais/i));
  });
});

describe('relic offers', () => {
  it('never offers the same relic twice, nor one already owned', () => {
    const owned = [relic('katana'), relic('cleaver')];
    const pool = relicPool(RELICS, owned, WEAPONS.blade.spells.map(spell));
    const rng = createRng(4);
    for (let i = 0; i < 200; i++) {
      const offer = offerRelics(rng, pool, 3);
      expect(new Set(offer.map(r => r.id)).size).toBe(3);
      offer.forEach(r => expect(['katana', 'cleaver']).not.toContain(r.id));
    }
  });
  it('draws commons far more often than legendaries', () => {
    const rng = createRng(11), hits: Record<string, number> = {};
    for (let i = 0; i < 30000; i++) { const r = offerRelics(rng, RELICS)[0]; hits[r.rarity] = (hits[r.rarity] ?? 0) + 1; }
    const perRelic = (rarity: string) => hits[rarity] / RELICS.filter(r => r.rarity === rarity).length;
    const ratio = perRelic('common') / perRelic('legendary');
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(7);
  });
  it('boss offers leave commons out, unless too few others are left', () => {
    const rng = createRng(2);
    for (let i = 0; i < 100; i++) offerRelics(rng, RELICS, 3, true).forEach(r => expect(r.rarity).not.toBe('common'));
    const small = [relic('hunt-coil'), relic('scavenger'), relic('cleaver')];
    expect(offerRelics(rng, small, 3, true)).toHaveLength(3);
  });
  it('only offers the piston gloves to a spell bar that pushes', () => {
    expect(relicPool(RELICS, [], WEAPONS.blade.spells.map(spell)).some(r => r.id === 'piston-gloves')).toBe(true);
    expect(relicPool(RELICS, [], WEAPONS.pistol.spells.map(spell)).some(r => r.id === 'piston-gloves')).toBe(false);
  });
});

describe('relic stats and spells', () => {
  const noop = (id: string): Implant => ({ id, name: id, description: '', load: 1, modify: s => s });
  it('Nœud de convergence opens a synergy with a single implant of the family', () => {
    const one = [IMPLANT_BY_ID.get('dermal-armor')!];
    expect(computeStats(one, []).res).toBe(baseStats().res);
    expect(computeStats(one, [], [relic('convergence')]).res).toBeCloseTo(baseStats().res + 0.08);
  });
  it('Chrome vivant scales with the number of implants carried', () => {
    const base = baseStats().maxHp;
    expect(computeStats([], [], [relic('living-chrome')]).maxHp).toBe(base);
    expect(computeStats([noop('a'), noop('b'), noop('c')], [], [relic('living-chrome')]).maxHp).toBe(base + 15);
  });
  it('Cerveau en feu: no psychosis drain, no neuro-blockers, less max HP', () => {
    const s = computeStats([], [], [relic('burning-mind')]);
    expect(s.psyDrainMult).toBe(0);
    expect(s.blockerAmount).toBe(0);
    expect(s.maxHp).toBe(Math.round(baseStats().maxHp * 0.7));
  });
  it('Gants à piston push one cell further and leave spells without a push alone', () => {
    const [thrust, cut] = applyRelicSpells([spell('thrust'), spell('cut')], [relic('piston-gloves')]);
    expect(thrust.effects.find(e => e.k === 'push')).toEqual({ k: 'push', n: 2 });
    expect(cut.effects).toEqual(spell('cut').effects);
    // The shared definition is untouched.
    expect(SPELLS.thrust.effects.find(e => e.k === 'push')).toEqual({ k: 'push', n: 1 });
  });
  it('Purgeur neural: kills lower psychosis', () => {
    const s = computeStats([], [], [relic('purger')]);
    expect(psyOnKill(50, 0, s.psyPerKill)).toBe(47);
  });
  it('Pied-de-biche: breakables never come up empty', () => {
    const rng = createRng(5);
    let empty = 0;
    for (let i = 0; i < 3000; i++) { expect(rollLoot(rng, false, true).kind).not.toBe('nothing'); if (rollLoot(rng, false).kind === 'nothing') empty++; }
    expect(empty).toBeGreaterThan(0);
  });
  it('street prices go through the discount', () => {
    const spent: number[] = [];
    const ctx = { rng: () => 0.5, price: (n: number) => Math.round(n / 2), credits: () => 100, spend: (n: number) => spent.push(n), healFraction: () => undefined,
      relicLeft: () => undefined, canUpgrade: () => false } as unknown as EventCtx;
    const stim = eventOptions('merchant', ctx).find(o => o.label === 'Stimpack')!;
    expect(stim.cost).toBe('8¢');
    stim.pick();
    expect(spent).toEqual([8]);
  });
});

describe('relics in a fight', () => {
  it('Couperet finishes an enemy left under 15 % (and the preview shows it)', () => {
    for (const withRelic of [false, true]) {
      const f = duel(withRelic ? [relic('cleaver')] : []), p = byUid(f, 1)!, runner = byUid(f, 2)!;
      runner.maxHp = 100; runner.hp = 15;
      expect(previewCast(f, p, p.spells[0], runner)[0].dies).toBe(withRelic);
      cast(f, p, p.spells[0], runner);
      expect(runner.dead).toBe(withRelic);
      if (!withRelic) expect(runner.hp).toBeGreaterThan(0);
    }
  });
  it('Couperet spares bosses', () => {
    const f = duel([relic('cleaver')]), p = byUid(f, 1)!, runner = byUid(f, 2)!;
    runner.boss = true; runner.maxHp = 100; runner.hp = 15;
    cast(f, p, p.spells[0], runner);
    expect(runner.dead).toBe(false);
  });
  it('Dernier souffle saves you once per fight', () => {
    const f = duel([relic('last-breath')]), p = byUid(f, 1)!, runner = byUid(f, 2)!;
    hurt(f, p, 500, [], runner);
    expect(p.dead).toBe(false);
    expect(p.hp).toBe(1);
    expect(p.shield).toBe(15);
    hurt(f, p, 500, [], runner);
    expect(p.dead).toBe(true);
    expect(f.over).toBe('lose');
  });
  it('Bobine de traque: a kill gives +1 PM on the next turn only', () => {
    const f = duel([relic('hunt-coil')]), p = byUid(f, 1)!, runner = byUid(f, 2)!;
    runner.hp = 1;
    cast(f, p, p.spells[0], runner);
    expect(runner.dead).toBe(true);
    expect(p.pm).toBe(p.maxPm);
    nextPlayerTurn(f);
    expect(p.pm).toBe(p.maxPm + 1);
    nextPlayerTurn(f);
    expect(p.pm).toBe(p.maxPm);
  });
  it('Cape « Solitaire » hits harder with no enemy adjacent, Blouson à clous with one', () => {
    const near = duel([]), far = duel([], { x: 3, y: 0 });
    const base = damageMult(near, byUid(near, 1)!, byUid(near, 2)!);
    const cloak = relicHooks([relic('loner-cloak')]), jacket = relicHooks([relic('spiked-jacket')]);
    near.hooks = cloak; far.hooks = cloak;
    expect(damageMult(near, byUid(near, 1)!, byUid(near, 2)!)).toBeCloseTo(base);
    expect(damageMult(far, byUid(far, 1)!, byUid(far, 2)!)).toBeCloseTo(base * 1.25);
    near.hooks = jacket; far.hooks = jacket;
    expect(damageMult(near, byUid(near, 1)!, byUid(near, 2)!)).toBeCloseTo(base * 1.1);
    expect(damageMult(far, byUid(far, 1)!, byUid(far, 2)!)).toBeCloseTo(base);
  });
  it('Batterie de secours turns unspent PA into a shield that lasts until your next turn', () => {
    const f = duel([relic('backup-cell')]), p = byUid(f, 1)!;
    p.pa = 4;
    endTurn(f);
    expect(p.shield).toBe(12);
    endTurn(f); endTurn(f);
    expect(p.shield).toBe(0);
  });
  it('Lame affamée bites at the end of a turn without a kill, not after one', () => {
    const f = duel([relic('hungry-blade')]), p = byUid(f, 1)!, runner = byUid(f, 2)!;
    nextPlayerTurn(f);
    expect(p.hp).toBe(94);
    runner.hp = 1;
    cast(f, p, p.spells[0], runner);
    nextPlayerTurn(f);
    expect(p.hp).toBe(94);
  });
  it('Rancune stacks with blows taken, up to +30 %', () => {
    const f = duel([relic('grudge')]), p = byUid(f, 1)!, runner = byUid(f, 2)!;
    const before = damageMult(f, p, runner);
    for (let i = 0; i < 3; i++) hurt(f, p, 2, [], runner);
    expect(damageMult(f, p, runner)).toBeCloseTo(before * 1.15);
    for (let i = 0; i < 10; i++) hurt(f, p, 2, [], runner);
    expect(damageMult(f, p, runner)).toBeCloseTo(before * 1.3);
  });
  it('Gel cicatrisant heals at turn start only if nobody hurt you', () => {
    const f = duel([relic('scar-gel')]), p = byUid(f, 1)!, runner = byUid(f, 2)!;
    // The first turn of the fight already counts as a quiet one.
    expect(p.hp).toBe(106);
    nextPlayerTurn(f);
    expect(p.hp).toBe(112);
    hurt(f, p, 10, [], runner);
    nextPlayerTurn(f);
    expect(p.hp).toBe(102);
  });
  it('Métronome gives +2 PA on rounds 3, 6, 9 only', () => {
    const f = duel([relic('metronome')]), p = byUid(f, 1)!;
    const pa: number[] = [];
    for (let i = 0; i < 6; i++) { pa.push(p.pa); nextPlayerTurn(f); }
    expect(f.round).toBe(7);
    expect(pa).toEqual([6, 6, 8, 6, 6, 8]);
  });
  it('previews run on a copy: hook memory of the real fight is untouched', () => {
    const f = duel([relic('grudge')]), p = byUid(f, 1)!;
    const g = cloneFight(f);
    hurt(g, byUid(g, 1)!, 2, [], byUid(g, 2)!);
    expect(byUid(g, 1)!.mem.grudge).toBe(1);
    expect(p.mem.grudge).toBeUndefined();
  });
});
