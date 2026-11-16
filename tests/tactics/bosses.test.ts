import { describe, it, expect } from 'vitest';
import { walkable } from '../../src/tactics/board';
import { beginFight, byUid, cloneFight, createFight, current, endTurn, kill, moveTo, previewCast, unitAt, type Fight } from '../../src/tactics/fight';
import { playTurn } from '../../src/tactics/ai';
import { BOSS_HOOKS, BOSS_TUNING, guarded, relays } from '../../src/tactics/bosses';
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

describe('Exécuteur Psy-Sec', () => {
  const exec = (f: Fight) => f.units.find(u => u.kind === 'boss')!;

  it('phase 1: a whole line through the player, hitting only that line, at its next turn', () => {
    const f = bossFight(9, 9, [hero({ x: 2, y: 6 }), makeEnemy('boss', { x: 6, y: 1 }, sc),
      makeEnemy('drone', { x: 5, y: 6 }, sc), makeEnemy('runner', { x: 5, y: 7 }, sc)]);
    const p = player(f), b = exec(f), onLine = unitAt(f, { x: 5, y: 6 })!, below = unitAt(f, { x: 5, y: 7 })!;
    toTurn(f, b.uid);
    toTurn(f, p.uid);
    expect(f.telegraphs).toHaveLength(1);
    const t = f.telegraphs![0];
    expect(t.kind).toBe('surge');
    sameCells(t.cells, Array.from({ length: 9 }, (_, x) => ({ x, y: 6 })));
    moveTo(f, p, { x: 2, y: 5 });
    const hp = { p: p.hp, below: below.hp };
    const ev = toTurn(f, b.uid);
    const hit = [...new Set(ev.filter(e => e.t === 'damage').map(e => (e as { uid: number }).uid))];
    expect(hit).toEqual([onLine.uid]);
    expect([p.hp, below.hp]).toEqual([hp.p, hp.below]);
    expect(ev.some(e => e.t === 'psy')).toBe(false);
    // Phase 1 leaves no live floor behind.
    expect(f.hazards ?? []).toHaveLength(0);
  });

  it('caught in the surge: damage and psychosis for the player', () => {
    const f = bossFight(9, 9, [hero({ x: 2, y: 6 }), makeEnemy('boss', { x: 6, y: 1 }, sc)]);
    const p = player(f), b = exec(f);
    toTurn(f, b.uid);
    toTurn(f, p.uid);
    const before = p.hp;
    const ev = toTurn(f, b.uid);
    expect(p.hp).toBeLessThan(before);
    expect(ev.find(e => e.t === 'psy' && e.uid === p.uid)).toMatchObject({ v: BOSS_TUNING.boss.surge.psy });
  });

  it('phase 2: shield fed by two relays, a cross that leaves the floor live, and the shield breaks with the last relay', () => {
    const f = bossFight(13, 13, [hero({ x: 6, y: 11 }), makeEnemy('boss', { x: 6, y: 1 }, sc)]);
    const p = player(f), b = exec(f), T = BOSS_TUNING.boss;
    b.hp = Math.floor(b.maxHp * 0.45);
    const ev = toTurn(f, b.uid);
    expect(b.phase).toBe(1);
    expect(b.shield).toBe(Math.round(b.maxHp * T.shieldPct));
    const rs = relays(f, b);
    expect(rs).toHaveLength(T.relays);
    for (const r of rs) {
      expect(r.team).toBe(2);
      expect(Math.abs(r.x - b.x) + Math.abs(r.y - b.y)).toBeGreaterThanOrEqual(4);
      expect(f.units.filter(o => !o.dead && o.x === r.x && o.y === r.y)).toHaveLength(1);
    }
    expect(ev.filter(e => e.t === 'summon')).toHaveLength(T.relays);

    toTurn(f, p.uid);
    const t = f.telegraphs![0];
    const cross = [...Array.from({ length: 13 }, (_, x) => ({ x, y: 11 })), ...Array.from({ length: 13 }, (_, y) => ({ x: 6, y })).filter(c => c.y !== 11 && c.y !== b.y)];
    // Relays stand on the cross? They are objects: the line runs under them all the same.
    sameCells(t.cells, cross);
    moveTo(f, p, { x: 5, y: 10 });
    const hp = p.hp;
    toTurn(f, b.uid);
    expect(p.hp).toBe(hp);
    expect(hazardAt(f, { x: 0, y: 11 })?.kind).toBe('shock');
    expect(hazardAt(f, { x: 6, y: 8 })?.kind).toBe('shock');
    // Not under anything standing on the line (the relays here).
    for (const r of rs) expect(hazardAt(f, r)).toBeUndefined();
    expect(hazardAt(f, { x: 5, y: 10 })).toBeUndefined();
    expect(hazardAt(f, { x: 0, y: 0 })).toBeUndefined();

    // One relay down: the shield still refills at its turn.
    kill(f, rs[0], [], p);
    expect(b.shield).toBeGreaterThan(0);
    b.shield = 5;
    toTurn(f, p.uid);
    toTurn(f, b.uid);
    expect(b.shield).toBe(5 + Math.round(b.maxHp * T.regenPct));
    // The last one, on the player's turn: the shield drops at once, and it pays in PA at its next turn.
    toTurn(f, p.uid);
    const out: FightEvent[] = [];
    kill(f, rs[1], out, p);
    expect(b.shield).toBe(0);
    expect(out.some(e => e.t === 'callout' && e.text.includes('BRISÉ'))).toBe(true);
    toTurn(f, b.uid);
    expect(b.shield).toBe(0);
    expect(b.pa).toBe(b.maxPa - T.breakPa);
  });

  it('phase 3: a surge every turn and psychosis at each of its turns', () => {
    const f = bossFight(13, 13, [hero({ x: 6, y: 11 }), makeEnemy('boss', { x: 6, y: 1 }, sc)]);
    const p = player(f), b = exec(f);
    b.hp = Math.floor(b.maxHp * 0.2);
    for (let i = 0; i < 2; i++) {
      const ev = toTurn(f, b.uid);
      expect(ev.some(e => e.t === 'psy' && e.uid === p.uid && e.v === BOSS_TUNING.boss.purgePsy)).toBe(true);
      const end = toTurn(f, p.uid);
      expect(end.some(e => e.t === 'telegraph' && e.on)).toBe(true);
      // Step out of the cross every time.
      const safe = [{ x: p.x + 1, y: p.y - 1 }, { x: p.x - 1, y: p.y - 1 }, { x: p.x + 1, y: p.y + 1 }, { x: p.x - 1, y: p.y + 1 }].find(c => walkable(f.board, c) && !unitAt(f, c))!;
      moveTo(f, p, safe);
    }
  });

  it('the AI plays the Exécuteur on a copy without touching the real fight, and a whole AI fight ends cleanly', () => {
    const f = bossFight(13, 13, [hero({ x: 6, y: 11 }), makeEnemy('boss', { x: 6, y: 2 }, sc)]);
    const b = exec(f);
    b.hp = Math.floor(b.maxHp * 0.45);
    toTurn(f, b.uid);
    const snap = () => JSON.stringify({ u: f.units.map(u => [u.uid, u.x, u.y, u.hp, u.shield, u.dead]), t: f.telegraphs, h: f.hazards });
    const before = snap();
    const g = cloneFight(f);
    expect(() => playTurn(g, byUid(g, b.uid)!)).not.toThrow();
    for (const r of relays(g, byUid(g, b.uid)!)) kill(g, r, []);
    expect(snap()).toBe(before);

    const h = bossFight(13, 13, [hero({ x: 6, y: 11 }), makeEnemy('boss', { x: 6, y: 1 }, { ...sc, hpMult: 1.54, dmgMult: 1.27 })]);
    player(h).ai = 'melee';
    for (let i = 0; i < 500 && !h.over && h.round < 40; i++) {
      playTurn(h, current(h)!);
      if (!h.over) endTurn(h);
    }
    expect(h.round).toBeGreaterThan(1);
  });
});
