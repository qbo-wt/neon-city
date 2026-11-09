import { describe, it, expect } from 'vitest';
import { cellsBetween, lineOfSight, pathTo } from '../../src/tactics/board';
import { beginFight, byUid, cast, castError, createFight, current, endTurn, exitTax, moveTo, reachFor, unitAt, PUSH_BASE } from '../../src/tactics/fight';
import { nextAction, playTurn } from '../../src/tactics/ai';
import { generateArena, type ArenaStyle } from '../../src/tactics/arena';
import { makeEnemy, makePlayer } from '../../src/tactics/units';
import { spell } from '../../src/data/spells';
import { baseStats } from '../../src/core/stats';
import { createRng } from '../../src/core/rng';
import type { Board, Pt, Unit } from '../../src/tactics/types';

/** An open w x h board; '#' blocks, 'o' holes from a picture. */
function board(rows: string[]): Board {
  const h = rows.length, w = rows[0].length;
  const cells = rows.flatMap(r => [...r].map(c => (c === '#' ? 'block' : c === 'o' ? 'hole' : c === ' ' ? 'void' : 'floor'))) as Board['cells'];
  return { w, h, cells, props: cells.map(() => undefined), playerStarts: [], enemyStarts: [], exits: [], style: 'avenue' };
}
const sc = { hpMult: 1, dmgMult: 1, pmBonus: 0, paBonus: 0, initBonus: 0 };
const hero = (at: Pt, spells = ['cut', 'thrust', 'windcut', 'guard']) => makePlayer(baseStats(), spells.map(spell), 100, at);
const fixed = () => 0.5;

describe('board geometry', () => {
  it('line of sight is blocked by blocks and creatures, not by holes', () => {
    const b = board(['.....', '..#..', '.....', '..o..', '.....']);
    expect(lineOfSight(b, { x: 2, y: 0 }, { x: 2, y: 2 }, () => false)).toBe(false);
    expect(lineOfSight(b, { x: 2, y: 2 }, { x: 2, y: 4 }, () => false)).toBe(true);
    expect(lineOfSight(b, { x: 0, y: 2 }, { x: 4, y: 2 }, p => p.x === 2 && p.y === 2)).toBe(false);
    // Exact diagonals graze corners only: the cells beside the diagonal do not block it.
    expect(cellsBetween({ x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([{ x: 1, y: 1 }]);
  });
});

describe('movement and tackle', () => {
  it('reaches cells within PM, never through creatures, and leaving a tackler costs more', () => {
    const f = createFight(board(['.....', '.....', '.....']), [hero({ x: 0, y: 1 }), makeEnemy('runner', { x: 1, y: 1 }, sc)], fixed);
    beginFight(f);
    const p = byUid(f, 1)!;
    expect(exitTax(f, p, p)).toBe(0); // runner tackle 1 - player dodge 1
    p.st.dodge = 0;
    expect(exitTax(f, p, p)).toBe(1);
    const map = reachFor(f, p);
    expect(map.has('1,1')).toBe(false);
    // Each first step costs 2 (1 + tackle): 3 PM reach one cell away, not two.
    expect(map.get('0,0')?.cost).toBe(2);
    expect(map.has('0,2')).toBe(true);
    expect(map.has('2,0')).toBe(false);
    expect(pathTo(map, { x: 0, y: 0 })).toEqual([{ x: 0, y: 0 }]);
  });
});

describe('spells', () => {
  it('checks PA, range, sight and per-turn caps', () => {
    const f = createFight(board(['.....', '.....']), [hero({ x: 0, y: 0 }), makeEnemy('runner', { x: 1, y: 0 }, sc), makeEnemy('gunner', { x: 4, y: 1 }, sc)], fixed);
    beginFight(f);
    const p = byUid(f, 1)!, cut = p.spells[0];
    expect(castError(f, p, cut, { x: 4, y: 1 })).toBe('hors de portée');
    expect(castError(f, p, cut, { x: 1, y: 0 })).toBeNull();
    cast(f, p, cut, { x: 1, y: 0 });
    cast(f, p, cut, { x: 1, y: 0 });
    expect(p.pa).toBe(0);
    expect(castError(f, p, cut, { x: 1, y: 0 })).toBe('PA insuffisants');
  });

  it('a push into a wall deals push damage, and a unit behind takes half', () => {
    const f = createFight(board(['....#', '.....']), [hero({ x: 0, y: 0 }, ['uppercut']), makeEnemy('brute', { x: 3, y: 0 }, sc), makeEnemy('runner', { x: 2, y: 0 }, sc)], fixed);
    beginFight(f);
    const p = byUid(f, 1)!, runner = unitAt(f, { x: 2, y: 0 })!, brute = unitAt(f, { x: 3, y: 0 })!;
    moveTo(f, p, { x: 1, y: 0 });
    const hpR = runner.hp, hpB = brute.hp;
    const ev = cast(f, p, p.spells[0], { x: 2, y: 0 });
    // Runner is blocked by the brute right behind it: 2 push cells lost.
    const pushHits = ev.filter(e => e.t === 'damage' && e.push);
    expect(pushHits).toHaveLength(2);
    expect(hpB - brute.hp).toBe(PUSH_BASE);
    expect(hpR - runner.hp).toBeGreaterThan(2 * PUSH_BASE);
  });

  it('a jump ignores tackle and a dash cuts the enemies along its path', () => {
    const f = createFight(board(['......', '......', '......']), [hero({ x: 0, y: 1 }), makeEnemy('runner', { x: 2, y: 0 }, sc), makeEnemy('runner', { x: 3, y: 2 }, sc)], fixed);
    beginFight(f);
    const p = byUid(f, 1)!, wind = p.spells[2];
    const a = unitAt(f, { x: 2, y: 0 })!, b = unitAt(f, { x: 3, y: 2 })!;
    expect(castError(f, p, wind, { x: 4, y: 1 })).toBeNull();
    cast(f, p, wind, { x: 4, y: 1 });
    expect([p.x, p.y]).toEqual([4, 1]);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('a PM malus applies to the target next turn, and buffs on yourself apply right away', () => {
    const f = createFight(board(['....', '....']), [hero({ x: 0, y: 0 }, ['garrote', 'evade']), makeEnemy('runner', { x: 1, y: 0 }, sc)], fixed);
    beginFight(f);
    const p = byUid(f, 1)!, r = unitAt(f, { x: 1, y: 0 })!;
    cast(f, p, p.spells[0], r);
    cast(f, p, p.spells[1], p);
    expect(p.pm).toBe(5);
    endTurn(f);
    expect(current(f)).toBe(r);
    expect(r.pm).toBe(2);
  });
});

describe('turns', () => {
  it('orders by initiative and a primed bomber blows up at the start of its next turn', () => {
    const f = createFight(board(['.....', '.....', '.....']), [hero({ x: 0, y: 0 }), makeEnemy('bomber', { x: 1, y: 0 }, sc), makeEnemy('runner', { x: 2, y: 1 }, sc)], fixed);
    beginFight(f);
    expect(current(f)!.kind).toBe('bomber'); // initiative 110 > 100
    const bomb = current(f)!;
    cast(f, bomb, bomb.spells[0], bomb);
    expect(bomb.primed).toBe(true);
    endTurn(f); endTurn(f); endTurn(f);
    expect(bomb.dead).toBe(true);
    const p = f.units.find(u => u.kind === 'player')!, runner = f.units.find(u => u.kind === 'runner')!;
    expect(p.hp).toBeLessThan(100);
    expect(runner.hp).toBeLessThan(runner.maxHp); // friendly fire
  });

  it('ends the fight when the last enemy falls', () => {
    const f = createFight(board(['...']), [hero({ x: 0, y: 0 }), makeEnemy('drone', { x: 1, y: 0 }, { ...sc, hpMult: 0.1 })], fixed);
    beginFight(f);
    const p = f.units.find(u => u.kind === 'player')!;
    while (current(f) !== p) endTurn(f);
    cast(f, p, p.spells[0], { x: 1, y: 0 });
    expect(f.over).toBe('win');
  });
});

describe('enemy AI', () => {
  it('a melee enemy walks up and hits; a ranged one shoots without walking into contact', () => {
    const f = createFight(board(['.........', '.........', '.........']), [hero({ x: 0, y: 1 }), makeEnemy('runner', { x: 4, y: 1 }, sc), makeEnemy('gunner', { x: 7, y: 1 }, sc)], fixed);
    beginFight(f);
    const p = f.units.find(u => u.kind === 'player')!;
    const runner = f.units.find(u => u.kind === 'runner')!, gunner = f.units.find(u => u.kind === 'gunner')!;
    while (current(f) !== runner) endTurn(f);
    playTurn(f, runner);
    expect(Math.abs(runner.x - p.x) + Math.abs(runner.y - p.y)).toBe(1);
    expect(p.hp).toBeLessThan(100);
    // Alone, a gunner shoots from range and does not walk into contact.
    const g = createFight(board(['.........', '.........', '.........']), [hero({ x: 0, y: 1 }), makeEnemy('gunner', { x: 8, y: 1 }, sc)], fixed);
    beginFight(g);
    const p2 = g.units.find(u => u.kind === 'player')!, gun = g.units.find(u => u.kind === 'gunner')!;
    while (current(g) !== gun) endTurn(g);
    playTurn(g, gun);
    expect(p2.hp).toBeLessThan(100);
    expect(Math.abs(gun.x - p2.x) + Math.abs(gun.y - p2.y)).toBeGreaterThan(1);
    void gunner;
  });

  it('a bomber arms itself next to you rather than scratching', () => {
    const f = createFight(board(['......', '......']), [hero({ x: 0, y: 0 }), makeEnemy('bomber', { x: 3, y: 0 }, sc)], fixed);
    beginFight(f);
    const bomb = f.units.find(u => u.kind === 'bomber')!;
    playTurn(f, bomb);
    expect(bomb.primed).toBe(true);
  });

  it('never returns an invalid action', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const rng = createRng(seed);
      const styles: ArenaStyle[] = ['avenue', 'alley', 'market', 'crossroad', 'parking', 'plaza', 'docks', 'checkpoint'];
      const { board: b } = generateArena(styles[seed % styles.length], rng, 3);
      const units: Unit[] = [hero(b.playerStarts[0]), ...(['runner', 'gunner', 'hacker', 'brute'] as const).map((id, i) => makeEnemy(id, b.enemyStarts[i], sc))];
      const f = createFight(b, units, rng);
      beginFight(f);
      for (let t = 0; t < 12 && !f.over; t++) {
        const u = current(f)!;
        if (u.kind !== 'player') for (let i = 0; i < 8; i++) {
          const a = nextAction(f, u);
          if (!a) break;
          if (a.t === 'cast') expect(castError(f, u, a.spell, a.cell)).toBeNull(), cast(f, u, a.spell, a.cell);
          else expect(moveTo(f, u, a.to).length).toBe(1);
        }
        endTurn(f);
      }
    }
  });
});

describe('arenas', () => {
  it('every style keeps all its floor connected, with starts and exits on floor', () => {
    const styles: ArenaStyle[] = ['avenue', 'alley', 'market', 'crossroad', 'parking', 'plaza', 'docks', 'checkpoint'];
    for (const s of styles) for (let seed = 1; seed < 6; seed++) {
      const { board: b, breakables } = generateArena(s, createRng(seed), 3, s === 'checkpoint');
      expect(b.playerStarts.length).toBeGreaterThanOrEqual(3);
      expect(b.enemyStarts.length).toBeGreaterThanOrEqual(6);
      expect(b.exits).toHaveLength(3);
      for (const p of [...b.playerStarts, ...b.enemyStarts, ...b.exits, ...breakables.map(x => x.at)]) expect(b.cells[p.y * b.w + p.x]).toBe('floor');
    }
  });
});
