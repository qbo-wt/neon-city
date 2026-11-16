import { describe, it, expect } from 'vitest';
import { DIRS, pathTo, walkable } from '../../src/tactics/board';
import { beginFight, byUid, cast, castError, cloneFight, createFight, current, endTurn, hurt, moveTo, previewCast, reachFor, unitAt, type Fight } from '../../src/tactics/fight';
import { playTurn } from '../../src/tactics/ai';
import { generateArena, type ArenaStyle } from '../../src/tactics/arena';
import { hazardAt } from '../../src/tactics/hazards';
import { BARREL_BLAST, COVER_MULT, TERRAIN_HOOKS, addHazard, inCover, removeHazard } from '../../src/tactics/terrain';
import { makeBreakable, makeEnemy, makePlayer } from '../../src/tactics/units';
import { spell } from '../../src/data/spells';
import { baseStats } from '../../src/core/stats';
import { createRng } from '../../src/core/rng';
import type { Board, FightEvent, Pt, Unit } from '../../src/tactics/types';

function board(rows: string[]): Board {
  const h = rows.length, w = rows[0].length;
  const cells = rows.flatMap(r => [...r].map(c => (c === '#' ? 'block' : c === 'o' ? 'hole' : c === ' ' ? 'void' : 'floor'))) as Board['cells'];
  return { w, h, cells, props: cells.map(() => undefined), playerStarts: [], enemyStarts: [], exits: [], style: 'avenue' };
}
const sc = { hpMult: 1, dmgMult: 1, pmBonus: 0, paBonus: 0, initBonus: 0 };
const hero = (at: Pt, spells: string[]) => makePlayer(baseStats(), spells.map(spell), 100, at);
const fixed = () => 0.5;
/** A fight with the arena rules plugged in, started, and turned to the player. */
function arenaFight(rows: string[], units: Unit[]): Fight {
  const f = createFight(board(rows), units, fixed);
  f.hooks = [TERRAIN_HOOKS];
  beginFight(f);
  while (current(f)?.kind !== 'player') endTurn(f);
  return f;
}
const player = (f: Fight) => f.units.find(u => u.kind === 'player')!;

describe('cover', () => {
  it('a block straight between blocks the shot; at an angle it lets it through for less damage', () => {
    const units = () => [hero({ x: 0, y: 0 }, ['shot']), makeEnemy('runner', { x: 4, y: 2 }, { ...sc, hpMult: 5 })];
    // Straight behind the block: no line of sight at all.
    const straight = arenaFight(['.....', '.....', '...#.'], [hero({ x: 0, y: 2 }, ['shot']), makeEnemy('runner', { x: 4, y: 2 }, sc)]);
    expect(castError(straight, player(straight), player(straight).spells[0], { x: 4, y: 2 })).toBe('pas de ligne de vue');
    // From an angle, a block touching the target on the shooter's side: the shot passes, weakened.
    const open = arenaFight(['.....', '.....', '.....'], units());
    const covered = arenaFight(['.....', '....#', '.....'], units());
    const p = player(covered), shot = p.spells[0], target = { x: 4, y: 2 };
    expect(castError(covered, p, shot, target)).toBeNull();
    expect(inCover(covered, p, target)).toBe(true);
    expect(inCover(open, player(open), target)).toBe(false);
    const full = previewCast(open, player(open), shot, target)[0].lost, half = previewCast(covered, p, shot, target)[0].lost;
    expect(half).toBeLessThan(full);
    expect(half).toBe(Math.round(full * COVER_MULT));
    // Point blank, cover does nothing.
    expect(inCover(covered, { x: 4, y: 1 }, target)).toBe(false);
  });
});

describe('explosive barrels', () => {
  it('a barrel destroyed blows up the 3 x 3 around it, and sets off the next barrel', () => {
    const f = arenaFight(['.......', '.......'], [hero({ x: 0, y: 1 }, ['shot']), makeBreakable('barrel', { x: 2, y: 0 }), makeBreakable('barrel', { x: 3, y: 0 }),
      makeEnemy('runner', { x: 4, y: 1 }, sc), makeEnemy('gunner', { x: 6, y: 1 }, sc)]);
    const p = player(f), a = unitAt(f, { x: 2, y: 0 })!, b = unitAt(f, { x: 3, y: 0 })!;
    const runner = unitAt(f, { x: 4, y: 1 })!, gunner = unitAt(f, { x: 6, y: 1 })!;
    a.hp = 4;
    const ev = cast(f, p, p.spells[0], { x: 2, y: 0 });
    expect(a.dead).toBe(true);
    expect(b.dead).toBe(true);
    expect(ev.filter(e => e.t === 'explode')).toHaveLength(2);
    // The runner is out of the first blast (2 cells from it) but inside the second.
    expect(runner.maxHp - runner.hp).toBeGreaterThanOrEqual(BARREL_BLAST - 3);
    expect(gunner.hp).toBe(gunner.maxHp);
    // The player is 2 cells from the first barrel: safe.
    expect(p.hp).toBe(100);
  });

  it('a creature pushed into a barrel makes it blow up; the preview shows it', () => {
    const units = () => [hero({ x: 0, y: 0 }, ['uppercut']), makeEnemy('runner', { x: 1, y: 0 }, { ...sc, hpMult: 3 }), makeBreakable('barrel', { x: 3, y: 0 })];
    const f = arenaFight(['.....', '.....'], units());
    const p = player(f), runner = unitAt(f, { x: 1, y: 0 })!, barrel = unitAt(f, { x: 3, y: 0 })!;
    const prev = previewCast(f, p, p.spells[0], runner);
    expect(prev.find(r => r.uid === barrel.uid)?.dies).toBe(true);
    expect(barrel.dead).toBe(false); // the preview ran on a copy
    const ev = cast(f, p, p.spells[0], runner);
    expect(barrel.dead).toBe(true);
    expect(ev.some(e => e.t === 'explode' && e.uid === barrel.uid)).toBe(true);
    expect([runner.x, runner.y]).toEqual([2, 0]);
    // Without the arena rules the same push only bumps.
    const g = createFight(board(['.....', '.....']), units(), fixed);
    beginFight(g);
    while (current(g)?.kind !== 'player') endTurn(g);
    cast(g, player(g), player(g).spells[0], unitAt(g, { x: 1, y: 0 })!);
    expect(g.units.find(u => u.kind === 'barrel')!.dead).toBe(false);
  });
});

describe('traps', () => {
  it('a push onto a live cable hurts on entering, and again at the start of the turn spent on it', () => {
    const f = arenaFight(['.....'], [hero({ x: 0, y: 0 }, ['uppercut']), makeEnemy('runner', { x: 1, y: 0 }, { ...sc, hpMult: 3 })]);
    addHazard(f, 'shock', { x: 3, y: 0 }, { v: 9 });
    const ref = cloneFight(f);
    ref.hazards = [];
    const p = player(f), runner = unitAt(f, { x: 1, y: 0 })!;
    const ev = cast(f, p, p.spells[0], runner);
    cast(ref, byUid(ref, p.uid)!, p.spells[0], byUid(ref, runner.uid)!);
    expect([runner.x, runner.y]).toEqual([3, 0]);
    expect(ev.some(e => e.t === 'trap' && e.kind === 'shock' && e.uid === runner.uid)).toBe(true);
    expect(byUid(ref, runner.uid)!.hp - runner.hp).toBe(9);
    const before = runner.hp;
    endTurn(f);
    expect(current(f)).toBe(runner);
    expect(before - runner.hp).toBe(9);
  });

  it('paths go around traps when it costs no more', () => {
    const f = arenaFight(['.....', '.....', '.....'], [hero({ x: 0, y: 2 }, ['cut']), makeEnemy('runner', { x: 4, y: 0 }, sc)]);
    addHazard(f, 'shock', { x: 3, y: 0 });
    const runner = unitAt(f, { x: 4, y: 0 })!;
    // (3, 1) is two steps away through the cable at (3, 0) or through (4, 1): same cost, no cable.
    runner.pm = 4;
    const map = reachFor(f, runner);
    expect(map.get('3,1')?.cost).toBe(2);
    expect(pathTo(map, { x: 3, y: 1 })).toEqual([{ x: 4, y: 1 }, { x: 3, y: 1 }]);
    // Walking onto the cable itself is still allowed.
    expect(pathTo(map, { x: 3, y: 0 })).toEqual([{ x: 3, y: 0 }]);
  });

  it('a melee enemy takes the free cell next to you rather than the one on a cable', () => {
    const f = arenaFight(['.....', '.....', '.....'], [hero({ x: 2, y: 1 }, ['cut']), makeEnemy('runner', { x: 4, y: 1 }, sc)]);
    addHazard(f, 'shock', { x: 3, y: 1 });
    const runner = unitAt(f, { x: 4, y: 1 })!;
    while (current(f) !== runner) endTurn(f);
    playTurn(f, runner);
    expect(hazardAt(f, runner)).toBeUndefined();
    expect(Math.abs(runner.x - 2) + Math.abs(runner.y - 1)).toBe(1);
    expect(runner.hp).toBe(runner.maxHp);
    expect(player(f).hp).toBeLessThan(100);
  });

  it('a vent only burns on its eruption rounds; acid corrodes over turns', () => {
    const f = arenaFight(['....'], [hero({ x: 0, y: 0 }, ['cut']), makeEnemy('runner', { x: 3, y: 0 }, sc)]);
    const p = player(f);
    // round 1: (1 + 1) % 3 !== 0, dormant; round 2 erupts.
    addHazard(f, 'steam', { x: 1, y: 0 }, { v: 12, phase: 1 });
    const hp = p.hp;
    moveTo(f, p, { x: 1, y: 0 });
    expect(p.hp).toBe(hp);
    f.round = 2;
    const ev: FightEvent[] = [];
    TERRAIN_HOOKS.turnStart!(f, p, ev);
    expect(hp - p.hp).toBe(12);
    addHazard(f, 'acid', { x: 2, y: 0 }, { v: 4 });
    moveTo(f, p, { x: 2, y: 0 });
    expect(p.bleed).toEqual([{ v: 4, turns: 2 }]);
  });

  it('a medkit heals the first one to step on it and is gone; the move preview does not use it up', () => {
    const f = arenaFight(['....'], [hero({ x: 0, y: 0 }, ['cut']), makeEnemy('runner', { x: 3, y: 0 }, sc)]);
    const p = player(f);
    p.hp = 50;
    addHazard(f, 'medkit', { x: 1, y: 0 }, { v: 20 });
    const sim = cloneFight(f);
    moveTo(sim, byUid(sim, p.uid)!, { x: 1, y: 0 });
    expect(hazardAt(f, { x: 1, y: 0 })?.kind).toBe('medkit');
    moveTo(f, p, { x: 1, y: 0 });
    expect(p.hp).toBe(70);
    expect(hazardAt(f, { x: 1, y: 0 })).toBeUndefined();
  });
});

describe('hazard API (boss rules)', () => {
  it('lays a timed hazard with an event, which expires on its own; only on floor', () => {
    const f = arenaFight(['...#'], [hero({ x: 0, y: 0 }, ['cut']), makeEnemy('runner', { x: 2, y: 0 }, sc)]);
    const ev: FightEvent[] = [];
    expect(addHazard(f, 'shock', { x: 3, y: 0 }, {}, ev)).toBeNull();
    const h = addHazard(f, 'shock', { x: 1, y: 0 }, { rounds: 2 }, ev)!;
    expect(h.until).toBe(f.round + 2);
    expect(ev).toEqual([{ t: 'hazard', kind: 'shock', at: { x: 1, y: 0 }, on: true }]);
    const start = f.round;
    while (f.round < start + 2) endTurn(f);
    expect(hazardAt(f, { x: 1, y: 0 })).toBeUndefined();
    addHazard(f, 'acid', { x: 1, y: 0 });
    expect(removeHazard(f, { x: 1, y: 0 }, ev)).toBe(true);
    expect(ev.at(-1)).toEqual({ t: 'hazard', kind: 'acid', at: { x: 1, y: 0 }, on: false });
    expect(removeHazard(f, { x: 1, y: 0 })).toBe(false);
  });
});

describe('arena generation with terrain', () => {
  const styles: ArenaStyle[] = ['avenue', 'alley', 'market', 'crossroad', 'parking', 'plaza', 'docks', 'checkpoint'];
  it('traps and barrels never touch the start cells, never wall anything in, and every style gets some', () => {
    for (const s of styles) {
      let traps = 0, barrels = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const boss = s === 'checkpoint';
        const { board: b, breakables, hazards } = generateArena(s, createRng(seed), 3, boss, seed % 9);
        const k = (p: Pt) => `${p.x},${p.y}`;
        const starts = new Set([...b.playerStarts, ...b.enemyStarts, ...b.exits].map(k));
        const harmful = hazards.filter(h => h.kind === 'shock' || h.kind === 'acid' || h.kind === 'steam');
        traps += harmful.length;
        barrels += breakables.filter(o => o.kind === 'barrel').length;
        const things = [...hazards, ...breakables.map(o => o.at)];
        expect(new Set(things.map(k)).size).toBe(things.length);
        for (const p of things) {
          expect(b.cells[p.y * b.w + p.x]).toBe('floor');
          expect(starts.has(k(p))).toBe(false);
        }
        for (const p of [...harmful, ...breakables.filter(o => o.kind === 'barrel').map(o => o.at)])
          for (const st of b.playerStarts) expect(Math.max(Math.abs(st.x - p.x), Math.abs(st.y - p.y))).toBeGreaterThan(1);
        // Every floor cell that is neither a trap nor an object is reachable from the player's start
        // without stepping on a trap or through an object: enemies are never walled in.
        const blocked = new Set([...harmful, ...breakables.map(o => o.at)].map(k));
        const seen = new Set([k(b.playerStarts[0])]), q = [b.playerStarts[0]];
        while (q.length) {
          const p = q.shift()!;
          for (const d of DIRS) {
            const n = { x: p.x + d.x, y: p.y + d.y };
            if (!seen.has(k(n)) && walkable(b, n) && !blocked.has(k(n))) { seen.add(k(n)); q.push(n); }
          }
        }
        for (const e of b.enemyStarts) expect(seen.has(k(e))).toBe(true);
        let open = 0;
        for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (walkable(b, { x, y }) && !blocked.has(`${x},${y}`)) open++;
        expect(seen.size).toBe(open);
      }
      expect(traps).toBeGreaterThan(0);
      expect(barrels).toBeGreaterThan(0);
    }
  });
});
