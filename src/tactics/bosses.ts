import { randInt } from '../core/rng';
import { DIRS, cellAt, dist, inside, walkable } from './board';
import { addBuff, buffSum, hurt, player, reachFor, unitAt, type Fight, type FightHooks } from './fight';
import { HAZARD_BASE, hazardAt } from './hazards';
import { BARREL_BLAST, addHazard } from './terrain';
import { makeBreakable, makeSummon } from './units';
import type { FightEvent, Pt, Telegraph, TelegraphKind, Unit } from './types';

/**
 * Boss rules, plugged into a fight as one FightHooks listener (`BOSS_HOOKS`, a no-op without a boss).
 *
 * Every boss has three phases (the `phase` counter of fight.ts: under 50 % then 25 % HP, checked at
 * the start of its turn). On top of the stat bonuses, each phase changes what it does:
 *
 * Lieutenant des Rats (`warden`)
 * - Mortier: at the end of its turn it marks a cross of 5 cells on you; the shells land at the start
 *   of its next turn, on exactly those cells (creatures only, its own Rats included). Every 2 turns,
 *   every turn in the last phase.
 * - La meute (phase 2): Rats come in from the edges of the board and roll explosive barrels in.
 * - Garde rapprochée: while one of the Rats it called stands, spell damage on it is cut
 *   (`guardMult`); explosions and push shocks go through.
 *
 * Exécuteur Psy-Sec (`boss`)
 * - Surcharge: at the end of its turn it marks a whole line of the board through you (phase 1), a
 *   row and a column (phases 2-3); it goes off at the start of its next turn: damage and psychosis,
 *   and from phase 2 the cells stay electrified (shock hazards) for a couple of rounds.
 * - Bouclier psionique (phase 2): a big shield fed by two relays (neutral objects) put on the
 *   board; it refills every turn while one stands. Break both: the shield drops and it loses PA.
 * - Purge totale (phase 3): a cross every turn, and your psychosis rises at each of its turns.
 *
 * Big attacks are always announced one turn ahead (a `Telegraph` in `f.telegraphs`, drawn on the
 * ground) and only on a pattern the player can walk out of with the PM of their next turn.
 * Like every hook, these keep no state of their own: what a boss remembers is in its `mem`.
 */

export type BossKind = 'warden' | 'boss';
export const isBossKind = (u: Unit): u is Unit & { kind: BossKind } => u.kind === 'warden' || u.kind === 'boss';

/** Balance knobs. `every`: turns between two announced attacks, per phase (1 = every turn). */
export const BOSS_TUNING = {
  warden: {
    mortar: { min: 11, max: 15, every: [2, 2, 1] },
    /** spell damage factor on the Lieutenant while one of his Rats stands */
    guardMult: 0.65,
    /** who answers the call of phase 2, and how many barrels they roll in */
    pack: ['runner', 'gunner'] as const,
    barrels: 2,
  },
  boss: {
    /** `shock`: rounds the cells stay electrified after the strike, per phase */
    surge: { min: 12, max: 16, psy: 5, every: [2, 2, 1], shock: [0, 2, 2] },
    /** shield of phase 2 and its refill per turn while a relay stands, in fractions of max HP */
    shieldPct: 0.25, regenPct: 0.05,
    relays: 2, relayHpPct: 0.1,
    /** PA it loses on its next turn when its last relay falls */
    breakPa: 2,
    /** psychosis added to the player at each of its turns in phase 3 */
    purgePsy: 4,
  },
};

/** Name and one-line rule of each phase, for the banner and the info panel. */
export const BOSS_PHASES: Record<BossKind, { title: string; sub: string; color: number }[]> = {
  warden: [
    { title: 'LE LIEUTENANT', sub: 'Son mortier pilonne la croix où tu te tiens : bouge avant son tour', color: 0xff2a6d },
    { title: 'LA MEUTE', sub: 'Renforts et barils ! Il encaisse moins tant que ses Rats sont debout', color: 0xff8c2a },
    { title: 'DERNIER CARRÉ', sub: 'Un tir de mortier à chaque tour', color: 0xff3b3b },
  ],
  boss: [
    { title: 'PROTOCOLE D\'ÉLIMINATION', sub: 'Il électrifie la ligne où tu te tiens : quitte-la avant son tour', color: 0x00f0ff },
    { title: 'BOUCLIER PSIONIQUE', sub: 'Détruis les deux relais pour briser son bouclier — surcharge en croix', color: 0xb84dff },
    { title: 'PURGE TOTALE', sub: 'Surcharge à chaque tour, ta psychose monte à chacun de ses tours', color: 0xff2a6d },
  ],
};

export const TELEGRAPH_NAMES: Record<TelegraphKind, string> = { mortar: 'MORTIER EN APPROCHE', surge: 'SURCHARGE' };
export const TELEGRAPH_COLORS: Record<TelegraphKind, number> = { mortar: 0xff8c2a, surge: 0x00f0ff };

// ---------- queries ----------

const key = (p: Pt) => `${p.x},${p.y}`;
const clampRes = (v: number) => Math.min(0.8, Math.max(-0.5, v));

/** The announced attack on a cell, if any (`except`: ignore the ones this unit fires). */
export function telegraphAt(f: Fight, p: Pt, except?: number): Telegraph | undefined {
  return f.telegraphs?.find(t => t.by !== except && t.cells.some(c => c.x === p.x && c.y === p.y));
}

/** Rats the Lieutenant called (or any unit a boss summoned) still standing. */
export const guards = (f: Fight, boss: Unit) => f.units.filter(o => !o.dead && o.team === boss.team && o.summoner === boss.uid);
export const guarded = (f: Fight, boss: Unit) => boss.kind === 'warden' && guards(f, boss).length > 0;

/** The boss's damage factor on a telegraphed attack (its bonuses, not the target's cover). */
const bossMult = (b: Unit) => Math.max(0, 1 + b.st.dmgPct + buffSum(b, 'dmg') / 100);

/** Damage range a telegraph would do to t (for the tooltips). */
export function telegraphRange(f: Fight, t: Telegraph, on: Unit): [number, number] {
  const b = f.units.find(u => u.uid === t.by), m = (b ? bossMult(b) : 1) * (1 - clampRes(on.st.res + buffSum(on, 'res') / 100));
  return [Math.max(1, Math.round(t.min * m)), Math.max(1, Math.round(t.max * m))];
}

/** A free floor cell: no creature or object, no hazard, no announced attack. */
const freeCell = (f: Fight, p: Pt) => walkable(f.board, p) && !unitAt(f, p) && !hazardAt(f, p) && !telegraphAt(f, p);
/** Free, and its four neighbours are free floor too: an object put there can never wall a part of the board off. */
const openCell = (f: Fight, p: Pt) => freeCell(f, p) && DIRS.every(d => { const q = { x: p.x + d.x, y: p.y + d.y }; return walkable(f.board, q) && !unitAt(f, q); });
const floorCells = (f: Fight) => {
  const out: Pt[] = [];
  for (let y = 0; y < f.board.h; y++) for (let x = 0; x < f.board.w; x++) if (walkable(f.board, { x, y })) out.push({ x, y });
  return out;
};
/** Floor cells on the rim of the board (a side touches the void or the outside). */
const rimCells = (f: Fight) => floorCells(f).filter(p => DIRS.some(d => { const q = { x: p.x + d.x, y: p.y + d.y }; return !inside(f.board, q) || cellAt(f.board, q) === 'void'; }));

/**
 * Can the player get out of `cells` on their next turn? Walking only, with the PM they will have
 * (buffs that run out before then left aside) and the tackle of where everyone stands now.
 */
export function escapable(f: Fight, p: Unit, cells: Pt[]): boolean {
  const zone = new Set(cells.map(key));
  const pm = Math.max(0, p.maxPm + p.buffs.filter(b => b.stat === 'pm' && b.turns > 1).reduce((s, b) => s + b.v, 0));
  for (const k of reachFor(f, { ...p, pm }).keys()) if (!zone.has(k)) return true;
  return false;
}

// ---------- telegraphs ----------

function lay(f: Fight, boss: Unit, t: Telegraph, ev: FightEvent[]) {
  (f.telegraphs ??= []).push(t);
  ev.push({ t: 'telegraph', uid: boss.uid, kind: t.kind, cells: t.cells.map(c => ({ ...c })), text: TELEGRAPH_NAMES[t.kind], on: true });
}

/** Cells of a plus of radius 1 around c, on walkable floor, without the boss's own cell. */
function plus(f: Fight, c: Pt, boss: Unit): Pt[] {
  return [c, ...DIRS.map(d => ({ x: c.x + d.x, y: c.y + d.y }))].filter(p => walkable(f.board, p) && !(p.x === boss.x && p.y === boss.y));
}

/** Lieutenant: the mortar on the player, or on a cell next to them if they could not walk out of that one. */
function announceMortar(f: Fight, boss: Unit, p: Unit, ev: FightEvent[]): boolean {
  const m = BOSS_TUNING.warden.mortar;
  for (const c of [{ x: p.x, y: p.y }, ...DIRS.map(d => ({ x: p.x + d.x, y: p.y + d.y }))]) {
    const cells = plus(f, c, boss);
    if (!cells.some(q => q.x === p.x && q.y === p.y) || !escapable(f, p, cells)) continue;
    lay(f, boss, { kind: 'mortar', by: boss.uid, cells, min: m.min, max: m.max }, ev);
    return true;
  }
  return false;
}

/** Announces this boss's big attack; false when there is no fair pattern this turn (it tries again next turn). */
function announce(f: Fight, boss: Unit, ev: FightEvent[]): boolean {
  const p = player(f);
  if (!p || p.dead) return false;
  if (boss.kind === 'warden') return announceMortar(f, boss, p, ev);
  if (boss.kind === 'boss') return announceSurge(f, boss, p, ev);
  return false;
}

/** The floor cells of a row (y) or a column (x) of the board, without the boss's own cell. */
function line(f: Fight, boss: Unit, axis: 'row' | 'col', at: Pt): Pt[] {
  const out: Pt[] = [];
  const n = axis === 'row' ? f.board.w : f.board.h;
  for (let i = 0; i < n; i++) {
    const p = axis === 'row' ? { x: i, y: at.y } : { x: at.x, y: i };
    if (walkable(f.board, p) && !(p.x === boss.x && p.y === boss.y)) out.push(p);
  }
  return out;
}

/**
 * Exécuteur: phase 1, one line through the player (row and column in turn); then the row and the
 * column. A smaller pattern when the player could not walk out of the bigger one.
 */
function announceSurge(f: Fight, boss: Unit, p: Unit, ev: FightEvent[]): boolean {
  const s = BOSS_TUNING.boss.surge, ph = Math.min(2, boss.phase ?? 0);
  const row = line(f, boss, 'row', p), col = line(f, boss, 'col', p);
  const cross = [...row, ...col.filter(c => c.y !== p.y)];
  const n = boss.mem.surges ?? 0;
  const tries = ph === 0 ? (n % 2 ? [col, row] : [row, col]) : [cross, row, col];
  for (const cells of tries) {
    if (!cells.length || !escapable(f, p, cells)) continue;
    boss.mem.surges = n + 1;
    lay(f, boss, { kind: 'surge', by: boss.uid, cells, min: s.min, max: s.max, psy: s.psy, shock: s.shock[ph] }, ev);
    return true;
  }
  return false;
}

const every = (boss: Unit) => (boss.kind === 'warden' ? BOSS_TUNING.warden.mortar.every : BOSS_TUNING.boss.surge.every)[Math.min(2, boss.phase ?? 0)];

/** The boss's announced attacks go off: each creature on the cells takes the roll (never the boss, never objects). */
function fire(f: Fight, boss: Unit, ev: FightEvent[]) {
  const mine = f.telegraphs?.filter(t => t.by === boss.uid) ?? [];
  if (!mine.length) return;
  f.telegraphs = f.telegraphs!.filter(t => t.by !== boss.uid);
  for (const t of mine) {
    ev.push({ t: 'telegraph', uid: boss.uid, kind: t.kind, cells: t.cells, text: TELEGRAPH_NAMES[t.kind], on: false });
    ev.push({ t: 'strike', uid: boss.uid, kind: t.kind, cells: t.cells });
    for (const c of t.cells) {
      if (f.over) return;
      const v = unitAt(f, c);
      if (!v || v === boss || v.team === 2) continue;
      const res = clampRes(v.st.res + buffSum(v, 'res') / 100);
      hurt(f, v, Math.max(1, Math.round(randInt(f.rng, t.min, t.max) * bossMult(boss) * (1 - res))), ev, boss);
      if (t.psy && v.kind === 'player' && !v.dead) ev.push({ t: 'psy', uid: v.uid, v: t.psy });
    }
    // The lines stay live a while: electrified floor (shock) where nobody stands and no other hazard lies.
    if (t.shock && !f.over) {
      const v = Math.round(HAZARD_BASE.shock * bossMult(boss));
      for (const c of t.cells) {
        const h = hazardAt(f, c);
        if (!unitAt(f, c) && (!h || h.kind === 'shock')) addHazard(f, 'shock', c, { v, rounds: t.shock }, ev);
      }
    }
  }
}

/** Takes back what a boss announced (it died before firing). */
function callOff(f: Fight, boss: Unit, ev: FightEvent[]) {
  const mine = f.telegraphs?.filter(t => t.by === boss.uid) ?? [];
  if (!mine.length) return;
  f.telegraphs = f.telegraphs!.filter(t => t.by !== boss.uid);
  for (const t of mine) ev.push({ t: 'telegraph', uid: boss.uid, kind: t.kind, cells: t.cells, text: TELEGRAPH_NAMES[t.kind], on: false });
}

// ---------- arrivals (reinforcements, objects) ----------

/** Puts a creature on the board for the boss's side: it acts from the next round on. */
function bringIn(f: Fight, boss: Unit, kind: string, at: Pt, ev: FightEvent[]): Unit {
  const u = (f.spawn ?? makeSummon)(kind, 1, at, boss);
  u.uid = f.nextUid++;
  u.summoner = boss.uid;
  f.units.push(u);
  // Placed just before the boss in the order: no free turn the round it arrives.
  const at0 = Math.max(0, f.order.indexOf(boss.uid));
  f.order.splice(at0, 0, u.uid);
  if (at0 <= f.turnIdx) f.turnIdx++;
  ev.push({ t: 'summon', uid: u.uid, by: boss.uid });
  return u;
}

/** A neutral object (barrel, relay) brought in by the boss. */
function dropObject(f: Fight, boss: Unit, o: Unit, ev: FightEvent[]) {
  o.uid = f.nextUid++;
  f.units.push(o);
  ev.push({ t: 'summon', uid: o.uid, by: boss.uid });
}

/** Cells for n arrivals: each picked by `rank` (lower first), at least `gap` apart. */
function pickCells(cands: Pt[], n: number, rank: (p: Pt) => number, gap: number): Pt[] {
  const out: Pt[] = [];
  for (const p of [...cands].sort((a, b) => rank(a) - rank(b))) {
    if (out.length >= n) break;
    if (out.every(o => dist(o, p) >= gap)) out.push(p);
  }
  return out;
}

/** Lieutenant, phase 2: Rats from the far edges, barrels rolled in a few cells from the player. */
function callThePack(f: Fight, boss: Unit, ev: FightEvent[]) {
  const p = player(f), T = BOSS_TUNING.warden;
  if (!p) return;
  const far = (list: Pt[]) => list.filter(c => freeCell(f, c) && dist(c, p) >= 4);
  let spots = far(rimCells(f));
  if (spots.length < T.pack.length) spots = far(floorCells(f));
  const cells = pickCells(spots, T.pack.length, c => -dist(c, p), 3);
  cells.forEach((c, i) => bringIn(f, boss, T.pack[i], c, ev));
  const near = floorCells(f).filter(c => openCell(f, c) && dist(c, p) >= 2 && dist(c, p) <= 4 && Math.max(Math.abs(c.x - p.x), Math.abs(c.y - p.y)) > 1);
  for (const c of pickCells(near, T.barrels, c => dist(c, p), 3)) {
    const b = makeBreakable('barrel', c);
    b.mem.blast = Math.round(BARREL_BLAST * (1 + boss.st.dmgPct));
    dropObject(f, boss, b, ev);
  }
  if (cells.length) ev.push({ t: 'callout', uid: boss.uid, text: 'GARDE RAPPROCHÉE', color: 0xff8c2a });
}

/** Relays of the Exécuteur's shield still standing. */
export const relays = (f: Fight, boss: Unit) => f.units.filter(o => !o.dead && o.kind === 'pylon' && o.mem.owner === boss.uid);

/**
 * Exécuteur, phase 2: relays away from it, within a few steps of the player, and the shield they
 * feed. No room for a relay: no shield either (nothing could take it down).
 */
function raiseShield(f: Fight, boss: Unit, ev: FightEvent[]) {
  const p = player(f), T = BOSS_TUNING.boss;
  if (!p) return;
  const spots = floorCells(f).filter(c => openCell(f, c) && dist(c, boss) >= 4 && dist(c, p) >= 2 && dist(c, p) <= 6);
  // The first relay as far from the boss as it gets, the next ones as far from the others.
  const cells: Pt[] = [];
  for (let i = 0; i < T.relays; i++) {
    const pickFrom = spots.filter(c => cells.every(o => dist(o, c) >= 4));
    const best = pickFrom.sort((a, b) => (cells.length ? Math.min(...cells.map(o => dist(o, b))) - Math.min(...cells.map(o => dist(o, a))) : dist(b, boss) - dist(a, boss)))[0];
    if (best) cells.push(best);
  }
  if (!cells.length) return;
  const hp = Math.max(12, Math.round(boss.maxHp * T.relayHpPct));
  for (const c of cells) {
    const r = makeBreakable('vending', c);
    r.kind = 'pylon'; r.name = 'Relais psionique'; r.maxHp = r.hp = hp; r.mem.owner = boss.uid;
    dropObject(f, boss, r, ev);
  }
  const cap = Math.round(boss.maxHp * T.shieldPct);
  boss.mem.shieldCap = cap;
  const add = Math.max(0, cap - boss.shield);
  boss.shield += add; boss.shieldTurns = 999;
  if (add) ev.push({ t: 'shield', uid: boss.uid, v: add });
  ev.push({ t: 'callout', uid: boss.uid, text: 'BOUCLIER PSIONIQUE', color: 0xb84dff, big: true });
}

/** The last relay fell: the shield goes down at once and the backlash costs the Exécuteur PA. */
function breakShield(f: Fight, boss: Unit, ev: FightEvent[]) {
  boss.mem.shieldCap = 0;
  boss.shield = 0; boss.shieldTurns = 0;
  ev.push({ t: 'callout', uid: boss.uid, text: 'BOUCLIER BRISÉ !', color: 0xf5e663, big: true });
  addBuff(f, boss, 'pa', -BOSS_TUNING.boss.breakPa, 1, ev);
}

function enterPhase(f: Fight, boss: Unit, phase: number, ev: FightEvent[]) {
  if (boss.kind === 'warden' && phase === 1) callThePack(f, boss, ev);
  if (boss.kind === 'boss' && phase === 1) raiseShield(f, boss, ev);
}

/** Exécuteur, every turn: the relays refill the shield; in phase 3, the psionic pressure on the player. */
function executorTurn(f: Fight, boss: Unit, ev: FightEvent[]) {
  const T = BOSS_TUNING.boss, cap = boss.mem.shieldCap ?? 0;
  if (cap > 0 && relays(f, boss).length) {
    const add = Math.min(cap - boss.shield, Math.round(boss.maxHp * T.regenPct));
    if (add > 0) { boss.shield += add; boss.shieldTurns = 999; ev.push({ t: 'shield', uid: boss.uid, v: add }); }
  }
  const p = player(f);
  if ((boss.phase ?? 0) >= 2 && p && !p.dead) ev.push({ t: 'psy', uid: p.uid, v: T.purgePsy });
}

// ---------- the listener ----------

export const BOSS_HOOKS: FightHooks = {
  turnStart(f, u, ev) {
    if (!isBossKind(u)) return;
    fire(f, u, ev);
    if (u.dead || f.over) return;
    while ((u.mem.phaseDone ?? 0) < (u.phase ?? 0)) {
      u.mem.phaseDone = (u.mem.phaseDone ?? 0) + 1;
      enterPhase(f, u, u.mem.phaseDone, ev);
    }
    if (u.kind === 'boss') executorTurn(f, u, ev);
  },
  turnEnd(f, u, ev) {
    if (!isBossKind(u) || f.over) return;
    if ((u.mem.tgCd ?? 0) > 0) { u.mem.tgCd--; return; }
    if (announce(f, u, ev)) u.mem.tgCd = every(u) - 1;
  },
  damageMult(f, _src, t) {
    return guarded(f, t) ? BOSS_TUNING.warden.guardMult : 1;
  },
  killed(f, t, _by, ev) {
    if (isBossKind(t)) { callOff(f, t, ev); return; }
    if (t.kind === 'pylon') {
      const owner = f.units.find(o => o.uid === t.mem.owner);
      if (owner && !owner.dead && (owner.mem.shieldCap ?? 0) > 0 && !relays(f, owner).length) breakShield(f, owner, ev);
      return;
    }
    // The last of the Lieutenant's Rats falls: his guard drops.
    const boss = t.summoner !== undefined ? f.units.find(o => o.uid === t.summoner) : undefined;
    if (boss && !boss.dead && boss.kind === 'warden' && !guarded(f, boss)) ev.push({ t: 'callout', uid: boss.uid, text: 'GARDE ROMPUE !', color: 0xf5e663, big: true });
  },
};

// ---------- what the interface says ----------

/** Lines about a boss (or a unit tied to one) for the info panel. */
export function bossNotes(f: Fight, u: Unit): string[] {
  const out: string[] = [];
  if (isBossKind(u)) {
    const ph = BOSS_PHASES[u.kind][Math.min(2, u.phase ?? 0)];
    out.push(`phase ${(u.phase ?? 0) + 1}/3 : ${ph.title}`);
    if (guarded(f, u)) out.push(`garde rapprochée : -${Math.round((1 - BOSS_TUNING.warden.guardMult) * 100)} % de dégâts de tes sorts tant que ses Rats sont debout (explosions et poussées passent)`);
    const n = relays(f, u).length;
    if (n && (u.mem.shieldCap ?? 0) > 0) out.push(`bouclier psionique : +${Math.round(u.maxHp * BOSS_TUNING.boss.regenPct)} par tour tant qu'un relais tient (${n} debout) ; tous détruits, il tombe et l'Exécuteur perd ${BOSS_TUNING.boss.breakPa} PA`);
    if (u.kind === 'boss' && (u.phase ?? 0) >= 2) out.push(`purge : +${BOSS_TUNING.boss.purgePsy} psychose à chacun de ses tours`);
    const t = f.telegraphs?.find(x => x.by === u.uid);
    if (t) out.push(`prépare : ${TELEGRAPH_NAMES[t.kind]} (au début de son tour)`);
  }
  if (u.kind === 'pylon' && u.team === 2) out.push('relais psionique : alimente le bouclier de l\'Exécuteur. Détruis tous les relais pour le briser');
  return out;
}

/** The info panel of a cell under an announced attack. */
export function telegraphInfo(f: Fight, p: Pt): { name: string; text: string; color: number } | undefined {
  const t = telegraphAt(f, p), b = t && f.units.find(u => u.uid === t.by), pl = player(f);
  if (!t || !b || !pl) return undefined;
  const [lo, hi] = telegraphRange(f, t, pl);
  const extra = (t.psy ? ` +${t.psy} psychose.` : '') + (t.shock ? ` Les cases restent électrifiées ${t.shock} round${t.shock > 1 ? 's' : ''}.` : '');
  return {
    name: `DANGER — ${TELEGRAPH_NAMES[t.kind]}`, color: TELEGRAPH_COLORS[t.kind],
    text: `Frappe au début du prochain tour de ${b.name} : ${lo}-${hi} dégâts à qui se trouve sur ces cases.${extra} Sors de la zone !`,
  };
}
