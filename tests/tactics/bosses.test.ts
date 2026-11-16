import { describe, it, expect } from 'vitest';
import { walkable } from '../../src/tactics/board';
import { beginFight, byUid, cloneFight, createFight, current, endTurn, kill, moveTo, previewCast, unitAt, type Fight } from '../../src/tactics/fight';
import { playTurn } from '../../src/tactics/ai';
import { BOSS_HOOKS, BOSS_TUNING, guarded } from '../../src/tactics/bosses';
import { hazardAt } from '../../src/tactics/hazards';
import { TERRAIN_HOOKS, addHazard } from '../../src/tactics/terrain';
import { makeBreakable, makeEnemy, makePlayer, makeSummon } from '../../src/tactics/units';
import { spell } from '../../src/data/spells';
import { baseStats } from '../../src/core/stats';
import type { Board, FightEvent, Pt, Unit } from '../../src/tactics/types';

function board(w: number, h: number): Board {
  const cells = Array.from({ length: w * h }, () => 'floor') as Board['cells'];
  return { w, h, cells, props: cells.map(() => undefined), playerStarts: [], enemyStarts: [], exits: [], style: 'checkpoint' };
}
const sc = { hpMult: 1, dmgMult: 1, pmBonus: 0, paBonus: 0, initBonus: 0 };
const hero = (at: Pt, spells = ['cut', 'thrust', 'windcut', 'shot']) => makePlayer(baseStats(), spells.map(spell), 120, at);
const fixed = () => 0.5;
const player = (f: Fight) => f.units.find(u => u.kind === 'player')!;

function bossFight(w: number, h: number, units: Unit[]): Fight {
  const f = createFight(board(w, h), units, fixed, makeSummon);
  f.hooks = [TERRAIN_HOOKS, BOSS_HOOKS];
  beginFight(f);
  return f;
}
/** Ends turns until it is uid's turn; returns every event on the way (its turn start included). */
function toTurn(f: Fight, uid: number): FightEvent[] {
  const ev: FightEvent[] = [];
  do ev.push(...endTurn(f)); while (current(f)?.uid !== uid && !f.over);
  return ev;
}
const sameCells = (a: Pt[], b: Pt[]) => {
  const k = (l: Pt[]) => l.map(p => `${p.x},${p.y}`).sort();
  return expect(k(a)).toEqual(k(b));
};

describe('Lieutenant des Rats', () => {
  it('changes phase under 50 % HP, not above, and calls the pack once', () => {
    const f = bossFight(11, 11, [hero({ x: 5, y: 9 }), makeEnemy('warden', { x: 5, y: 1 }, sc)]);
    const w = f.units.find(u => u.kind === 'warden')!;
    w.hp = Math.ceil(w.maxHp * 0.5) + 1;
    toTurn(f, w.uid);
    expect(w.phase ?? 0).toBe(0);
    expect(f.units.filter(u => !u.dead && u.summoner === w.uid)).toHaveLength(0);

    w.hp = Math.floor(w.maxHp * 0.5) - 1;
    const ev = toTurn(f, w.uid);
    expect(w.phase).toBe(1);
    expect(ev.some(e => e.t === 'phase' && e.phase === 1)).toBe(true);
    const pack = f.units.filter(u => u.summoner === w.uid);
    expect(pack.map(u => u.kind).sort()).toEqual([...BOSS_TUNING.warden.pack].sort());
    expect(f.units.filter(u => u.kind === 'barrel')).toHaveLength(BOSS_TUNING.warden.barrels);
    // The Rats come from far away and wait for the next round: none of them acts before the player.
    for (const r of pack) expect(Math.abs(r.x - 5) + Math.abs(r.y - 9)).toBeGreaterThanOrEqual(4);
    const order = f.order.slice(f.turnIdx + 1);
    for (const r of pack) expect(order.indexOf(r.uid)).toBe(-1);

    // Next turn: no second call.
    toTurn(f, w.uid);
    expect(f.units.filter(u => u.summoner === w.uid)).toHaveLength(pack.length);
  });

  it('reinforcements never land on a trap, a bonus cell or a creature', () => {
    const f = bossFight(11, 11, [hero({ x: 5, y: 9 }), makeEnemy('warden', { x: 5, y: 1 }, sc), makeBreakable('crate', { x: 0, y: 0 }), makeBreakable('crate', { x: 10, y: 0 })]);
    const w = f.units.find(u => u.kind === 'warden')!;
    // Everything far from the player is covered, except two rim cells.
    const left = [{ x: 0, y: 5 }, { x: 10, y: 5 }];
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
      const p = { x, y };
      if (Math.abs(x - 5) + Math.abs(y - 9) < 4 || left.some(l => l.x === x && l.y === y) || unitAt(f, p)) continue;
      addHazard(f, (x + y) % 2 ? 'medkit' : 'acid', p);
    }
    w.hp = Math.floor(w.maxHp * 0.4);
    toTurn(f, w.uid);
    const pack = f.units.filter(u => u.summoner === w.uid);
    sameCells(pack, left);
    for (const u of f.units.filter(o => !o.dead)) {
      expect(f.units.filter(o => !o.dead && o.x === u.x && o.y === u.y)).toHaveLength(1);
      if (u.summoner === w.uid || u.kind === 'barrel') expect(hazardAt(f, u)).toBeUndefined();
    }
  });

  it('the mortar hits the announced cells, and only them, at the start of its next turn', () => {
    const f = bossFight(9, 9, [hero({ x: 2, y: 6 }), makeEnemy('warden', { x: 6, y: 1 }, sc),
      makeEnemy('runner', { x: 3, y: 6 }, sc), makeEnemy('runner', { x: 3, y: 7 }, sc), makeBreakable('barrel', { x: 2, y: 7 })]);
    const p = player(f), w = f.units.find(u => u.kind === 'warden')!;
    const inZone = unitAt(f, { x: 3, y: 6 })!, outside = unitAt(f, { x: 3, y: 7 })!, barrel = unitAt(f, { x: 2, y: 7 })!;
    const ev = toTurn(f, p.uid);
    const laid = ev.find(e => e.t === 'telegraph' && e.on);
    expect(laid).toBeDefined();
    const cells = f.telegraphs![0].cells;
    // A cross of 5 on the player.
    sameCells(cells, [{ x: 2, y: 6 }, { x: 1, y: 6 }, { x: 3, y: 6 }, { x: 2, y: 5 }, { x: 2, y: 7 }]);
    // Announced only: nobody hurt yet.
    expect(ev.some(e => e.t === 'damage')).toBe(false);

    expect(moveTo(f, p, { x: 1, y: 5 }).length).toBeGreaterThan(0);
    const hp = { p: p.hp, a: inZone.hp, b: outside.hp, w: w.hp };
    const boom = toTurn(f, w.uid);
    const strike = boom.find(e => e.t === 'strike');
    expect(strike && strike.t === 'strike' && strike.cells).toEqual(cells);
    const hit = new Set(boom.filter(e => e.t === 'damage').map(e => (e as { uid: number }).uid));
    expect([...hit]).toEqual([inZone.uid]);
    expect(inZone.hp).toBeLessThan(hp.a);
    expect([p.hp, outside.hp, w.hp]).toEqual([hp.p, hp.b, hp.w]);
    // Objects in the zone are left alone (a barrel would blow up cells nobody was warned about).
    expect(barrel.dead).toBe(false);
    expect(f.telegraphs ?? []).toHaveLength(0);
  });

  it('does not announce a mortar the player could not walk out of', () => {
    const f = bossFight(9, 9, [hero({ x: 2, y: 6 }), makeEnemy('warden', { x: 6, y: 1 }, sc)]);
    const p = player(f), w = f.units.find(u => u.kind === 'warden')!;
    p.maxPm = 0;
    toTurn(f, w.uid);
    toTurn(f, p.uid);
    expect(f.telegraphs ?? []).toHaveLength(0);
    // With PM again, the next turn it does.
    p.maxPm = 3;
    toTurn(f, w.uid);
    toTurn(f, p.uid);
    expect(f.telegraphs).toHaveLength(1);
  });

  it('takes less spell damage while one of his Rats stands, full damage once it falls', () => {
    const f = bossFight(9, 9, [hero({ x: 1, y: 4 }), makeEnemy('warden', { x: 5, y: 4 }, sc)]);
    const p = player(f), w = f.units.find(u => u.kind === 'warden')!;
    while (current(f)?.uid !== p.uid) endTurn(f);
    const shot = p.spells.find(s => s.id === 'shot')!;
    const full = previewCast(f, p, shot, w)[0].lost;
    const rat = makeSummon('runner', 1, { x: 8, y: 8 }, w);
    rat.uid = f.nextUid++; rat.summoner = w.uid; f.units.push(rat);
    expect(guarded(f, w)).toBe(true);
    const less = previewCast(f, p, shot, w)[0].lost;
    expect(less).toBeLessThan(full);
    expect(less).toBe(Math.max(1, Math.round(full * BOSS_TUNING.warden.guardMult)));
    const ev: FightEvent[] = [];
    kill(f, rat, ev, p);
    expect(ev.some(e => e.t === 'callout' && e.text.includes('GARDE'))).toBe(true);
    expect(previewCast(f, p, shot, w)[0].lost).toBe(full);
  });

  it('the AI plays the Lieutenant on a copy of the fight without touching the real one', () => {
    const f = bossFight(11, 11, [hero({ x: 5, y: 9 }), makeEnemy('warden', { x: 5, y: 2 }, sc)]);
    const w = f.units.find(u => u.kind === 'warden')!;
    w.hp = Math.floor(w.maxHp * 0.45);
    toTurn(f, w.uid);
    const before = JSON.stringify({ u: f.units.map(u => [u.uid, u.x, u.y, u.hp, u.dead]), t: f.telegraphs, h: f.hazards });
    const g = cloneFight(f), gw = byUid(g, w.uid)!;
    expect(() => playTurn(g, gw)).not.toThrow();
    g.telegraphs?.[0]?.cells.push({ x: 0, y: 0 });
    expect(JSON.stringify({ u: f.units.map(u => [u.uid, u.x, u.y, u.hp, u.dead]), t: f.telegraphs, h: f.hazards })).toBe(before);
  });

  it('a whole fight played by the AI on both sides ends cleanly', () => {
    const f = bossFight(13, 13, [hero({ x: 6, y: 11 }), makeEnemy('warden', { x: 6, y: 1 }, { ...sc, hpMult: 1.24, dmgMult: 1.12 })]);
    const p = player(f);
    p.ai = 'melee';
    for (let i = 0; i < 400 && !f.over && f.round < 40; i++) {
      const u = current(f)!;
      playTurn(f, u);
      for (const t of f.telegraphs ?? []) for (const c of t.cells) expect(walkable(f.board, c)).toBe(true);
      if (!f.over) endTurn(f);
    }
    expect(f.round).toBeGreaterThan(1);
  });
});
