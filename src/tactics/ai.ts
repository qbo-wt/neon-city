import { dist, lineOfSight, walkDistances } from './board';
import { byUid, cast, castError, cloneFight, moveTo, occupied, opponents, reachFor, type Fight } from './fight';
import type { Pt, SpellDef, Unit } from './types';

export type AiAction = { t: 'cast'; spell: SpellDef; cell: Pt } | { t: 'move'; to: Pt };

/** Value of the state for u's side: damage done, kills, maluses; damage to its own side counts against. */
function score(before: Fight, after: Fight, u: Unit): number {
  let v = 0;
  for (const b of before.units) {
    const a = byUid(after, b.uid);
    if (!a || b.dead) continue;
    const lost = b.hp + b.shield - (a.hp + a.shield);
    const enemy = b.team !== u.team && b.team !== 2;
    const ally = b.team === u.team;
    const weight = b.kind === 'player' ? 1.2 : 1;
    if (enemy) {
      v += lost * weight;
      if (a.dead) v += 30;
      v += (a.buffs.length - b.buffs.length) * 4;
    } else if (ally) {
      v -= lost * (b.uid === u.uid ? 1.5 : 1.2);
      if (a.dead && b.uid !== u.uid) v -= 25;
      v += Math.max(0, a.buffs.length - b.buffs.length) * 3 + Math.max(0, a.shield - b.shield) * 0.6;
    } else if (b.team === 2) v += lost * 0.05;
  }
  // A summon on the board is worth a hit.
  v += (after.units.length - before.units.length) * 14;
  const au = byUid(after, u.uid)!;
  if (au.primed && !byUid(before, u.uid)!.primed) {
    // Arming only pays when a target is next to the bomb (radius 2 blast).
    const near = opponents(after, au).filter(o => dist(o, au) <= 2).length;
    v += near ? 18 * near : -10;
  }
  return v;
}

/** Every valid (spell, cell) for u right now, with its value. */
function castOptions(f: Fight, u: Unit): { spell: SpellDef; cell: Pt; v: number }[] {
  const out: { spell: SpellDef; cell: Pt; v: number }[] = [];
  for (const s of u.spells) {
    if (s.id === 'detonate') continue;
    if (u.pa < s.pa || (u.cd[s.id] ?? 0) > 0 || (s.perTurn && (u.casts[s.id] ?? 0) >= s.perTurn)) continue;
    const max = s.range[1] + (s.rangeMod ? u.st.range : 0) + 1;
    for (let y = u.y - max; y <= u.y + max; y++) for (let x = u.x - max; x <= u.x + max; x++) {
      const cell = { x, y };
      if (castError(f, u, s, cell)) continue;
      const g = cloneFight(f), gu = byUid(g, u.uid)!;
      cast(g, gu, { ...s, crit: -1 }, cell);
      const v = score(f, g, u) - s.pa * 0.4;
      if (v > 0.5) out.push({ spell: s, cell, v });
    }
  }
  return out.sort((a, b) => b.v - a.v);
}

/** Where u likes to stand, by profile: melee hugs, ranged keeps 3-6 cells with sight, cowards stay far. */
function placeScore(f: Fight, u: Unit, at: Pt, walk: Int16Array | undefined): number {
  const foes = opponents(f, u);
  if (!foes.length) return 0;
  const target = foes.find(o => o.kind === 'player') ?? foes[0];
  const wd = walk ? walk[at.y * f.board.w + at.x] : -1;
  const d = dist(at, target), steps = wd >= 0 ? wd : d + 6;
  const adjacent = foes.filter(o => dist(o, at) === 1).length;
  const sight = lineOfSight(f.board, at, target, p => occupied(f, p) && !(p.x === u.x && p.y === u.y));
  switch (u.ai) {
    case 'melee': case 'boss': case 'bomber':
      return -steps * 3 + (adjacent ? 4 : 0);
    case 'ranged':
      return -Math.abs(d - 5) * 2 - adjacent * 8 + (sight ? 5 : 0) - Math.max(0, steps - 8);
    case 'coward':
      return -Math.abs(d - 7) * 1.5 - adjacent * 10 + (sight ? 3 : 0);
    default:
      return 0;
  }
}

/**
 * The next thing u does this turn, or null to end it. Greedy: compare the best cast from here
 * with the best cast after walking to each reachable cell, and walk only when it pays.
 */
export function nextAction(f: Fight, u: Unit): AiAction | null {
  if (u.dead || f.over || u.ai === 'none') return null;
  const foes = opponents(f, u);
  const target = foes.find(o => o.kind === 'player') ?? foes[0];
  // Walking distance to the target from every cell, ignoring who stands in between (approach plan).
  const walk = target ? walkDistances(f.board, target, p => occupied(f, p) && !(p.x === u.x && p.y === u.y)) : undefined;
  // One step of look-ahead on the best few casts: two cheap hits can beat one big hit that pushes
  // the target out of reach.
  let here: { spell: SpellDef; cell: Pt; v: number } | undefined;
  for (const o of castOptions(f, u).slice(0, 3)) {
    const g = cloneFight(f), gu = byUid(g, u.uid)!;
    cast(g, gu, { ...o.spell, crit: -1 }, o.cell);
    const total = o.v + (gu.pa > 0 && !g.over ? (castOptions(g, gu)[0]?.v ?? 0) * 0.9 : 0);
    if (!here || total > here.v) here = { ...o, v: total };
  }
  const stayPlace = placeScore(f, u, u, walk);

  let bestMove: { to: Pt; v: number } | undefined;
  if (u.pm > 0) {
    const map = reachFor(f, u);
    for (const k of map.keys()) {
      const [x, y] = k.split(',').map(Number);
      if (x === u.x && y === u.y) continue;
      const g = cloneFight(f), gu = byUid(g, u.uid)!;
      moveTo(g, gu, { x, y });
      const opt = gu.pa > 0 ? castOptions(g, gu)[0] : undefined;
      const v = (opt?.v ?? 0) * 1.0 + placeScore(g, gu, gu, walk) * (opt ? 0.3 : 1);
      if (!bestMove || v > bestMove.v) bestMove = { to: { x, y }, v };
    }
  }
  const castHere = here ? here.v + stayPlace * 0.3 : -Infinity;
  if (here && (!bestMove || castHere >= bestMove.v - 1)) return { t: 'cast', spell: here.spell, cell: here.cell };
  if (bestMove && bestMove.v > (here ? castHere : stayPlace) + 0.5) return { t: 'move', to: bestMove.to };
  return null;
}

/** Plays a whole AI turn on f (tests and balance simulations); returns how many actions it took. */
export function playTurn(f: Fight, u: Unit, max = 10): number {
  let n = 0;
  for (; n < max; n++) {
    const a = nextAction(f, u);
    if (!a) break;
    if (a.t === 'cast') cast(f, u, a.spell, a.cell);
    else if (!moveTo(f, u, a.to).length) break;
  }
  return n;
}

