import { randInt } from '../core/rng';
import { cellAt, inside } from './board';
import { addBuff, buffSum, byUid, heal, hurt, kill, opposed, unitAt, type Fight, type FightHooks } from './fight';
import { HAZARD_BASE, STEAM_PERIOD, hazardAt, hurtsAt, type Hazard, type HazardKind } from './hazards';
import type { FightEvent, Pt, Unit } from './types';

/**
 * Arena rules, plugged into a fight as one FightHooks listener (`TERRAIN_HOOKS`):
 * - hazards on the floor (see hazards.ts) go off when a creature enters them (walk, push, pull,
 *   charge, dash, jump) and at the start of a turn spent on them;
 * - explosive barrels (breakables of kind 'barrel') blow up when destroyed or when a pushed creature
 *   slams into them: damage to the 3 x 3 cells around, other barrels caught in it go off too;
 * - cover: a block cell or a neutral object right next to the target, on the attacker's side, cuts
 *   ranged spell damage (`COVER_MULT`).
 * Like every hook, these keep no state of their own: hazards live in `f.hazards`, the barrel's
 * blast and its last attacker in the barrel's `mem`.
 */

/** Damage factor on a ranged spell hitting a unit in cover. */
export const COVER_MULT = 0.75;
/** Explosive barrel: HP, blast roll around `mem.blast` (± 3). */
export const BARREL_HP = 12;
export const BARREL_BLAST = 16;
/** Turns of corrosion an acid puddle gives. */
export const ACID_TURNS = 2;

export const isBarrel = (u: Unit | undefined): boolean => !!u && u.team === 2 && u.kind === 'barrel';

// ---------- laying hazards (generation, boss rules) ----------

export interface HazardOpts {
  /** strength (damage, heal, PA); defaults to the kind's base value */
  v?: number;
  /** only for 'steam': cycle length in rounds (default 3) and offset */
  period?: number;
  phase?: number;
  /** removed after this many rounds (counted from the current one); omitted: stays */
  rounds?: number;
}

/**
 * Lays a hazard on a floor cell during a fight (replaces what was there). Returns it, or null when
 * the cell is not floor. A creature already standing there is not hit now: it is at the start of
 * its next turn, if it stays. With `ev`, a 'hazard' event lets the renderer draw it.
 */
export function addHazard(f: Fight, kind: HazardKind, at: Pt, o: HazardOpts = {}, ev?: FightEvent[]): Hazard | null {
  if (!inside(f.board, at) || cellAt(f.board, at) !== 'floor') return null;
  removeHazard(f, at);
  const h: Hazard = { kind, x: at.x, y: at.y, v: o.v ?? HAZARD_BASE[kind] };
  if (kind === 'steam') { h.period = o.period ?? STEAM_PERIOD; h.phase = o.phase ?? 0; }
  if (o.rounds !== undefined) h.until = f.round + Math.max(1, o.rounds);
  (f.hazards ??= []).push(h);
  ev?.push({ t: 'hazard', kind, at: { x: at.x, y: at.y }, on: true });
  return h;
}

/** Takes the hazard off a cell; true when there was one. */
export function removeHazard(f: Fight, at: Pt, ev?: FightEvent[]): boolean {
  const i = f.hazards?.findIndex(h => h.x === at.x && h.y === at.y) ?? -1;
  if (i < 0) return false;
  const [h] = f.hazards!.splice(i, 1);
  ev?.push({ t: 'hazard', kind: h.kind, at: { x: h.x, y: h.y }, on: false });
  return true;
}

// ---------- what a hazard does ----------

/** u is on h (it just entered it, or starts its turn there). */
function trigger(f: Fight, u: Unit, h: Hazard, ev: FightEvent[]) {
  if (u.dead || u.team === 2) return;
  const at = { x: h.x, y: h.y };
  switch (h.kind) {
    case 'shock':
      ev.push({ t: 'trap', uid: u.uid, kind: h.kind, at });
      hurt(f, u, h.v, ev, undefined);
      break;
    case 'steam':
      if (!hurtsAt(h, f.round)) return;
      ev.push({ t: 'trap', uid: u.uid, kind: h.kind, at });
      hurt(f, u, h.v, ev, undefined);
      break;
    case 'acid':
      ev.push({ t: 'trap', uid: u.uid, kind: h.kind, at });
      // A fresh dose replaces the old one instead of stacking forever.
      u.bleed = u.bleed.filter(b => b.v !== h.v || b.turns > ACID_TURNS);
      u.bleed.push({ v: h.v, turns: ACID_TURNS });
      break;
    case 'medkit':
      ev.push({ t: 'trap', uid: u.uid, kind: h.kind, at });
      removeHazard(f, at, ev);
      heal(f, u, h.v, ev);
      break;
    case 'relay':
      if (u.team !== 0 || u.kind !== 'player') return;
      ev.push({ t: 'trap', uid: u.uid, kind: h.kind, at });
      removeHazard(f, at, ev);
      addBuff(f, u, 'pa', h.v, 1, ev);
      break;
  }
}

// ---------- explosive barrels ----------

/** The 3 x 3 cells around p that are on the board. */
export function blastCells(f: Fight, p: Pt): Pt[] {
  const out: Pt[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const q = { x: p.x + dx, y: p.y + dy };
    if (inside(f.board, q) && cellAt(f.board, q) !== 'void') out.push(q);
  }
  return out;
}

/**
 * A barrel goes off: every creature (and object) in the 3 x 3 around takes the blast, resistance
 * applies. The unit that broke the barrel gets the credit for what the blast hits on the other side.
 */
function explode(f: Fight, barrel: Unit, ev: FightEvent[]) {
  const cells = blastCells(f, barrel);
  ev.push({ t: 'explode', uid: barrel.uid, cells });
  const credit = barrel.mem.by !== undefined ? byUid(f, barrel.mem.by) : undefined;
  const base = barrel.mem.blast ?? BARREL_BLAST;
  for (const p of cells) {
    const t = unitAt(f, p);
    if (!t || t === barrel) continue;
    const res = Math.min(0.8, Math.max(-0.5, t.st.res + buffSum(t, 'res') / 100));
    const by = credit && !credit.dead && (opposed(credit, t) || t.team === 2) ? credit : barrel;
    hurt(f, t, Math.max(1, Math.round(randInt(f.rng, base - 3, base + 3) * (1 - res))), ev, by);
  }
}

// ---------- cover ----------

const coverOn = (f: Fight, p: Pt) => cellAt(f.board, p) === 'block' || unitAt(f, p)?.team === 2;

/**
 * Is `t` in cover against a shot from `from`? Only at range (2 cells and more), when a cell touching
 * t on the attacker's side (toward it along x, or along y) is a block or a neutral object. Straight
 * behind such a cell there is no line of sight at all; from an angle, the shot passes but grazes it.
 */
export function inCover(f: Fight, from: Pt, t: Pt): boolean {
  const dx = from.x - t.x, dy = from.y - t.y;
  if (Math.abs(dx) + Math.abs(dy) < 2) return false;
  return (!!dx && coverOn(f, { x: t.x + Math.sign(dx), y: t.y })) || (!!dy && coverOn(f, { x: t.x, y: t.y + Math.sign(dy) }));
}

// ---------- the listener ----------

export const TERRAIN_HOOKS: FightHooks = {
  moved(f, u, path, _kind, ev) {
    if (!f.hazards?.length || u.team === 2) return;
    for (const p of path) {
      if (u.dead) return;
      const h = hazardAt(f, p);
      if (h) trigger(f, u, h, ev);
    }
  },
  turnStart(f, u, ev) {
    // Hazards laid for a few rounds expire at the first turn of their last round.
    for (const h of [...(f.hazards ?? [])]) if (h.until !== undefined && f.round >= h.until) removeHazard(f, h, ev);
    const h = hazardAt(f, u);
    if (h) trigger(f, u, h, ev);
  },
  killed(f, t, by, ev) {
    if (!isBarrel(t)) return;
    if (by && by !== t) t.mem.by = by.uid;
    explode(f, t, ev);
  },
  bumped(f, _t, into, by, ev) {
    if (into && isBarrel(into) && !into.dead) kill(f, into, ev, by);
  },
  damageMult(f, src, t) {
    return t.team !== 2 && inCover(f, src, t) ? COVER_MULT : 1;
  },
};
