import { randInt, type Rng } from '../core/rng';
import { DIRS, cellAt, cellsBetween, dist, inLine, inside, keyOf, lineOfSight, pathTo, reachable, same, stepToward, walkable, type Reach } from './board';
import type { Board, BuffStat, Effect, FightEvent, Pt, SpellDef, Unit } from './types';

/** Damage per push cell that could not be travelled (before the caster's push bonus). */
export const PUSH_BASE = 5;
/** PA one neuro-blocker costs in a fight. */
export const BLOCKER_PA = 2;

export type Spawner = (kind: string, team: 0 | 1, at: Pt, by: Unit) => Unit;

/**
 * Listeners on what happens in a fight (relics today; arena objects and boss rules can plug in the same
 * way). Every method is optional and gets the fight and the event list to push to. Hooks keep no state
 * of their own: the AI and the previews run them on cloned fights. Per-unit state goes in `unit.mem`,
 * which clones copy. Effects on the run itself (psychosis, credits) go out as events.
 */
export interface FightHooks {
  /** u's turn begins: PA / PM refilled, cooldowns and buffs ticked, before bleeding and primed bombs */
  turnStart?(f: Fight, u: Unit, ev: FightEvent[]): void;
  /** u is about to end its turn (unspent PA / PM still there) */
  turnEnd?(f: Fight, u: Unit, ev: FightEvent[]): void;
  /** u walked (`walk`) or was moved by a push, pull, charge, dash or jump; `path` ends on its new cell */
  moved?(f: Fight, u: Unit, path: Pt[], kind: 'walk' | 'push' | 'pull' | 'charge' | 'dash' | 'jump', ev: FightEvent[]): void;
  /** extra factor on the damage src deals to t with spells (1 = none); factors multiply */
  damageMult?(f: Fight, src: Unit, t: Unit): number;
  /** a spell blow from src landed on t (after the damage, lifesteal and crit heal) */
  struck?(f: Fight, src: Unit, t: Unit, dealt: number, crit: boolean, ev: FightEvent[]): void;
  /** t lost `amount` (HP + shield); `by` is undefined for bleeding and self-inflicted damage */
  damaged?(f: Fight, t: Unit, amount: number, by: Unit | undefined, ev: FightEvent[]): void;
  /** t dropped to 0 HP: return true to keep it alive (the hook puts its HP back above 0) */
  saveFromDeath?(f: Fight, t: Unit, by: Unit | undefined, ev: FightEvent[]): boolean;
  /** t died; `by` is the unit credited with the kill */
  killed?(f: Fight, t: Unit, by: Unit | undefined, ev: FightEvent[]): void;
  /** t was healed by `gained` HP; `overflow` is what did not fit under its max HP */
  healed?(f: Fight, t: Unit, gained: number, overflow: number, ev: FightEvent[]): void;
}

type Notify = Exclude<keyof FightHooks, 'damageMult' | 'saveFromDeath'>;

/** Calls one hook on every listener of the fight. */
function emit<K extends Notify>(f: Fight, name: K, ...args: Parameters<NonNullable<FightHooks[K]>>) {
  if (!f.hooks) return;
  for (const h of f.hooks) (h[name] as ((...a: unknown[]) => void) | undefined)?.(...args);
}

export interface Fight {
  board: Board;
  units: Unit[];
  /** turn order (uids), fixed by initiative; summons are inserted after their summoner */
  order: number[];
  turnIdx: number;
  round: number;
  rng: Rng;
  nextUid: number;
  spawn?: Spawner;
  over?: 'win' | 'lose';
  /** listeners on fight events (see FightHooks) */
  hooks?: FightHooks[];
}

// ---------- queries ----------

export const unitAt = (f: Fight, p: Pt) => f.units.find(u => !u.dead && u.x === p.x && u.y === p.y);
export const occupied = (f: Fight, p: Pt) => !!unitAt(f, p);
export const byUid = (f: Fight, uid: number) => f.units.find(u => u.uid === uid);
export const current = (f: Fight): Unit | undefined => byUid(f, f.order[f.turnIdx]);
export const alive = (f: Fight) => f.units.filter(u => !u.dead);
/** Units that fight against u (neutral objects are nobody's opponents). */
export const opposed = (a: Unit, b: Unit) => a.team !== 2 && b.team !== 2 && a.team !== b.team;
export const opponents = (f: Fight, u: Unit) => alive(f).filter(o => opposed(u, o));
export const player = (f: Fight) => f.units.find(u => u.kind === 'player');

export const buffSum = (u: Unit, stat: BuffStat) => u.buffs.reduce((s, b) => s + (b.stat === stat ? b.v : 0), 0);

export function spellRange(u: Unit, s: SpellDef): [number, number] {
  const bonus = s.rangeMod ? u.st.range + buffSum(u, 'range') : 0;
  return [s.range[0], Math.max(s.range[0], s.range[1] + bonus)];
}

/** Extra PM it costs u to leave p: the tackle of opposing units around it, minus u's dodge. */
export function exitTax(f: Fight, u: Unit, p: Pt): number {
  let tackle = 0;
  for (const d of DIRS) {
    const o = unitAt(f, { x: p.x + d.x, y: p.y + d.y });
    if (o && opposed(u, o)) tackle += o.st.tackle;
  }
  return Math.max(0, tackle - u.st.dodge);
}

export function reachFor(f: Fight, u: Unit): Map<string, Reach> {
  return reachable(f.board, u, u.pm, p => occupied(f, p), p => exitTax(f, u, p));
}

// ---------- zones and targeting ----------

export function zoneCells(f: Fight, from: Pt, s: SpellDef, target: Pt): Pt[] {
  const z = s.zone, out: Pt[] = [];
  const add = (p: Pt) => { if (inside(f.board, p) && cellAt(f.board, p) !== 'void') out.push(p); };
  if (z.shape === 'cell') add(target);
  else if (z.shape === 'cross' || z.shape === 'circle') {
    for (let dy = -z.r; dy <= z.r; dy++) for (let dx = -z.r; dx <= z.r; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > z.r) continue;
      if (z.shape === 'cross' && dx && dy) continue;
      add({ x: target.x + dx, y: target.y + dy });
    }
  } else {
    let d = stepToward(from, target);
    if (!d.x && !d.y) d = { x: 1, y: 0 };
    if (z.shape === 'line') for (let i = 0; i < z.len; i++) add({ x: target.x + d.x * i, y: target.y + d.y * i });
    else {
      const px = d.y ? 1 : 0, py = d.x ? 1 : 0;
      for (let i = -z.r; i <= z.r; i++) add({ x: target.x + px * i, y: target.y + py * i });
    }
  }
  return out;
}

/** Why u cannot cast s on cell (null when it can). Range and line of sight are checked from u's cell. */
export function castError(f: Fight, u: Unit, s: SpellDef, cell: Pt): string | null {
  if (u.dead) return 'mort';
  if (u.pa < s.pa) return 'PA insuffisants';
  if ((u.cd[s.id] ?? 0) > 0) return `relance : ${u.cd[s.id]} tour${u.cd[s.id] > 1 ? 's' : ''}`;
  if (s.perTurn && (u.casts[s.id] ?? 0) >= s.perTurn) return 'plus de lancer ce tour';
  return targetError(f, u, s, cell);
}

/** Range, line, sight and target checks only (what the range overlay shows). */
export function targetError(f: Fight, u: Unit, s: SpellDef, cell: Pt): string | null {
  if (!inside(f.board, cell) || cellAt(f.board, cell) === 'void') return 'hors du terrain';
  if (s.target === 'self') return same(u, cell) ? null : 'sur soi uniquement';
  const [min, max] = spellRange(u, s), d = dist(u, cell);
  if (d < min || d > max) return 'hors de portée';
  if (s.line && !inLine(u, cell)) return 'en ligne uniquement';
  if (s.los && !lineOfSight(f.board, u, cell, p => occupied(f, p))) return 'pas de ligne de vue';
  const t = unitAt(f, cell);
  if (s.target === 'enemy' && (!t || t.team === u.team)) return 'cible un ennemi';
  if (s.target === 'unit' && !t) return 'cible une créature';
  if (s.target === 'empty' && (t || !walkable(f.board, cell))) return 'case libre uniquement';
  if (s.target === 'any' && cellAt(f.board, cell) === 'block' && !t) return 'case bloquée';
  if (t && t.elite === 'cloak' && opposed(u, t) && d > 2) return 'camouflé : approche-toi';
  if (t && s.perTarget && (u.casts[`${s.id}@${t.uid}`] ?? 0) >= s.perTarget) return 'déjà ciblé ce tour';
  for (const e of s.effects) {
    if (e.k === 'charge' && (!inLine(u, cell) || !clearBetween(f, u, cell))) return 'chemin bloqué';
    if (e.k === 'dash' && (!inLine(u, cell) || !clearBetween(f, u, cell))) return 'chemin bloqué';
  }
  return null;
}

const clearBetween = (f: Fight, a: Pt, b: Pt) => cellsBetween(a, b).every(p => walkable(f.board, p) && !occupied(f, p));

/** Cells the range overlay lights up: in range, with sight; `ok` tells whether a cast there is valid. */
export function rangeCells(f: Fight, u: Unit, s: SpellDef): { p: Pt; ok: boolean; sight: boolean }[] {
  const [, max] = spellRange(u, s), out: { p: Pt; ok: boolean; sight: boolean }[] = [];
  const min = s.target === 'self' ? 0 : spellRange(u, s)[0];
  for (let y = u.y - max; y <= u.y + max; y++) for (let x = u.x - max; x <= u.x + max; x++) {
    const p = { x, y }, d = dist(u, p);
    if (d < min || d > max || !inside(f.board, p) || cellAt(f.board, p) === 'void') continue;
    if (s.target === 'self' && d) continue;
    if (s.line && !inLine(u, p)) continue;
    const sight = !s.los || lineOfSight(f.board, u, p, q => occupied(f, q));
    out.push({ p, sight, ok: sight && targetError(f, u, s, p) === null });
  }
  return out;
}

// ---------- damage ----------

const clampRes = (v: number) => Math.min(0.8, Math.max(-0.5, v));
const isDazed = (f: Fight, u: Unit) => u.dazedRound !== undefined && f.round - u.dazedRound <= 1;

/** Damage multiplier of `src` hitting `t` (before the roll and the crit). */
export function damageMult(f: Fight, src: Unit, t: Unit): number {
  const low = src.hp < src.maxHp * 0.4 ? src.st.lowHpDamage : 0;
  const dazed = isDazed(f, t) ? src.st.dazedDamage : 0;
  let atk = (1 + src.st.dmgPct + buffSum(src, 'dmg') / 100 + low + dazed) * src.st.extraMult;
  for (const h of f.hooks ?? []) if (h.damageMult) atk *= h.damageMult(f, src, t);
  return Math.max(0, atk) * (1 - clampRes(t.st.res + buffSum(t, 'res') / 100));
}

/** Damage range of one dmg effect (no crit), as the UI and the AI preview it. */
export function damageRange(f: Fight, src: Unit, t: Unit, min: number, max: number): [number, number] {
  const m = damageMult(f, src, t);
  return [Math.max(1, Math.round((min + src.st.flat) * m)), Math.max(1, Math.round((max + src.st.flat) * m))];
}

/** Takes `amount` from t (shield first); a killing blow goes through the `saveFromDeath` hooks. Returns what t lost. */
export function hurt(f: Fight, t: Unit, amount: number, ev: FightEvent[], by: Unit | undefined, o: { crit?: boolean; push?: boolean; bleed?: boolean } = {}) {
  if (t.dead || amount <= 0) return 0;
  const absorbed = Math.min(t.shield, amount);
  t.shield -= absorbed;
  const real = Math.min(t.hp, amount - absorbed);
  t.hp -= real;
  ev.push({ t: 'damage', uid: t.uid, amount, crit: !!o.crit, absorbed, push: o.push, bleed: o.bleed });
  if (t.hp <= 0 && !(f.hooks ?? []).some(h => h.saveFromDeath?.(f, t, by, ev))) kill(f, t, ev, by);
  if (real + absorbed > 0) emit(f, 'damaged', f, t, real + absorbed, by, ev);
  return real + absorbed;
}

export function heal(f: Fight, t: Unit, amount: number, ev: FightEvent[]) {
  if (t.dead) return;
  const raw = Math.round(amount), g = Math.max(0, Math.min(t.maxHp - t.hp, raw));
  if (g > 0) { t.hp += g; ev.push({ t: 'heal', uid: t.uid, amount: g }); }
  if (raw > 0) emit(f, 'healed', f, t, g, raw - g, ev);
}

export function kill(f: Fight, t: Unit, ev: FightEvent[], by?: Unit) {
  if (t.dead) return;
  t.dead = true;
  t.hp = 0;
  ev.push({ t: 'death', uid: t.uid, by: by?.uid });
  if (by && !by.dead && by !== t && opposed(by, t)) {
    if (by.st.killHeal > 0) heal(f, by, by.st.killHeal, ev);
    if (by.st.killPa > 0 && !by.killPaUsed && current(f) === by) { by.killPaUsed = true; by.pa += by.st.killPa; ev.push({ t: 'stat', uid: by.uid, stat: 'pa', v: by.st.killPa }); }
  }
  // Explosive elites go off when they fall.
  if (t.elite === 'explosive') blast(f, t, 1, 10, 14, ev);
  emit(f, 'killed', f, t, by, ev);
  // Summons fall with their summoner.
  for (const s of f.units) if (!s.dead && s.summoner === t.uid) kill(f, s, ev);
  checkOver(f);
}

/** An explosion around src: a roll in [min, max] to every other unit within r, resistance applies. */
export function blast(f: Fight, src: Unit, r: number, min: number, max: number, ev: FightEvent[]) {
  const cells = zoneCells(f, src, { zone: { shape: 'circle', r } } as SpellDef, src);
  ev.push({ t: 'explode', uid: src.uid, cells });
  for (const p of cells) {
    const t = unitAt(f, p);
    if (t && t !== src) hurt(f, t, Math.round(randInt(f.rng, min, max) * (1 - clampRes(t.st.res + buffSum(t, 'res') / 100))), ev, src);
  }
}

function checkOver(f: Fight) {
  if (f.over) return;
  const p = player(f);
  if (!p || p.dead) f.over = 'lose';
  else if (!f.units.some(u => !u.dead && u.team === 1)) f.over = 'win';
}

// ---------- movement ----------

/** Walks u along a path it can afford (checked step by step against the reachable map). */
export function moveTo(f: Fight, u: Unit, to: Pt): FightEvent[] {
  const map = reachFor(f, u), path = pathTo(map, to);
  if (!path || !path.length) return [];
  u.pm -= map.get(keyOf(to))!.cost;
  const last = path[path.length - 1], prev = path.length > 1 ? path[path.length - 2] : { x: u.x, y: u.y };
  u.face = { x: last.x - prev.x, y: last.y - prev.y };
  u.x = to.x; u.y = to.y;
  const ev: FightEvent[] = [{ t: 'move', uid: u.uid, path }];
  emit(f, 'moved', f, u, path, 'walk', ev);
  return ev;
}

/** Slides t up to n cells along d. Returns the cells travelled and what stopped it. */
function slide(f: Fight, t: Unit, d: Pt, n: number, stopNextTo?: Pt) {
  const path: Pt[] = [];
  let left = n, hit: Unit | undefined, wall = false;
  while (left > 0) {
    const nx = { x: t.x + d.x, y: t.y + d.y };
    if (stopNextTo && same(nx, stopNextTo)) break;
    if (!walkable(f.board, nx)) { wall = true; break; }
    const o = unitAt(f, nx);
    if (o) { hit = o; break; }
    // No cutting a diagonal corner between two blocks.
    if (d.x && d.y && !walkable(f.board, { x: t.x + d.x, y: t.y }) && !walkable(f.board, { x: t.x, y: t.y + d.y })) { wall = true; break; }
    t.x = nx.x; t.y = nx.y;
    path.push(nx);
    left--;
  }
  return { path, left, hit, wall };
}

// ---------- casting ----------

/** Casts s on cell. Assumes castError(...) === null; returns the events to animate. */
export function cast(f: Fight, u: Unit, s: SpellDef, cell: Pt): FightEvent[] {
  const ev: FightEvent[] = [];
  u.pa -= s.pa;
  u.casts[s.id] = (u.casts[s.id] ?? 0) + 1;
  const tgt = unitAt(f, cell);
  if (tgt) u.casts[`${s.id}@${tgt.uid}`] = (u.casts[`${s.id}@${tgt.uid}`] ?? 0) + 1;
  if (s.cooldown) u.cd[s.id] = s.cooldown;
  if (!same(u, cell)) { const d = stepToward(u, cell); u.face = d; }
  const crit = s.effects.some(e => e.k === 'dmg' || e.k === 'dash') && f.rng() < u.st.crit + (s.crit ?? 0);
  ev.push({ t: 'cast', uid: u.uid, spell: s.id, cell, crit });
  const origin: Pt = { x: u.x, y: u.y };
  let zone = zoneCells(f, origin, s, cell);
  const inZone = () => zone.map(p => unitAt(f, p)).filter((t): t is Unit => !!t && t !== u);
  const hitsUnit = (t: Unit) => opposed(u, t) || (t.team === 2) || (!!s.friendly && t !== u);

  for (const e of s.effects) {
    if (f.over) break;
    applyEffect(f, u, s, e, cell, origin, crit, ev, inZone, hitsUnit);
    if (e.k === 'jump' || e.k === 'charge' || e.k === 'dash') zone = zoneCells(f, u, s, cell);
  }
  return ev;
}

function applyEffect(f: Fight, u: Unit, s: SpellDef, e: Effect, cell: Pt, origin: Pt, crit: boolean, ev: FightEvent[],
  inZone: () => Unit[], hitsUnit: (t: Unit) => boolean) {
  switch (e.k) {
    case 'dmg': {
      for (const t of inZone()) if (hitsUnit(t)) strike(f, u, t, e.min, e.max, crit, ev, dist(origin, t) <= 1);
      break;
    }
    case 'heal': {
      const targets = s.target === 'self' ? [u] : inZone().filter(t => t.team === u.team);
      for (const t of targets) heal(f, t, randInt(f.rng, e.min, e.max), ev);
      break;
    }
    case 'push':
    case 'pull': {
      const from = e.k === 'push' && e.fromCell ? cell : u;
      const list = inZone().filter(t => opposed(u, t) || (!!s.friendly && t.team !== 2))
        .sort((a, b) => (e.k === 'push' ? dist(b, from) - dist(a, from) : dist(a, from) - dist(b, from)));
      for (const t of list) {
        if (t.dead) continue;
        let d = stepToward(from, t);
        if (e.k === 'pull') d = { x: -d.x, y: -d.y };
        if (!d.x && !d.y) continue;
        const r = slide(f, t, d, e.n, e.k === 'pull' ? { x: u.x, y: u.y } : undefined);
        if (r.path.length) { ev.push({ t: 'shove', uid: t.uid, path: r.path, kind: e.k }); emit(f, 'moved', f, t, r.path, e.k, ev); }
        if (e.k === 'push' && r.left > 0 && (r.wall || r.hit)) {
          const dmg = r.left * (PUSH_BASE + u.st.pushDmg + buffSum(u, 'pushDmg'));
          hurt(f, t, dmg, ev, u, { push: true });
          if (r.hit && r.hit.team !== 2) hurt(f, r.hit, Math.round(dmg / 2), ev, u, { push: true });
        }
      }
      break;
    }
    case 'charge': {
      const t = unitAt(f, cell);
      if (!t) break;
      const d = stepToward(u, t), r = slide(f, u, d, dist(u, t) - 1);
      if (r.path.length) { ev.push({ t: 'shove', uid: u.uid, path: r.path, kind: 'charge' }); emit(f, 'moved', f, u, r.path, 'charge', ev); }
      break;
    }
    case 'dash': {
      const d = stepToward(u, cell), r = slide(f, u, d, dist(u, cell));
      if (r.path.length) { ev.push({ t: 'shove', uid: u.uid, path: r.path, kind: 'dash' }); emit(f, 'moved', f, u, r.path, 'dash', ev); }
      const hit = new Set<Unit>();
      for (const p of [origin, ...r.path]) for (const dd of DIRS) {
        const o = unitAt(f, { x: p.x + dd.x, y: p.y + dd.y });
        if (o && o !== u && (opposed(u, o) || o.team === 2)) hit.add(o);
      }
      for (const o of hit) strike(f, u, o, e.min, e.max, crit, ev, true);
      break;
    }
    case 'jump': {
      if (occupied(f, cell) || !walkable(f.board, cell)) break;
      const from = { x: u.x, y: u.y };
      u.x = cell.x; u.y = cell.y;
      ev.push({ t: 'shove', uid: u.uid, path: [from, cell], kind: 'jump' });
      emit(f, 'moved', f, u, [{ ...cell }], 'jump', ev);
      break;
    }
    case 'buff': {
      const targets = e.self ? [u] : inZone().filter(t => (e.v < 0 ? opposed(u, t) : t.team === u.team));
      for (const t of targets) addBuff(f, t, e.stat, e.v, e.turns, ev);
      break;
    }
    case 'shield': {
      const targets = e.self ? [u] : inZone().filter(t => t.team === u.team);
      for (const t of targets) { t.shield += e.v; t.shieldTurns = Math.max(t.shieldTurns, e.turns); ev.push({ t: 'shield', uid: t.uid, v: e.v }); }
      break;
    }
    case 'bleed': {
      for (const t of inZone()) if (opposed(u, t) && !t.dead) t.bleed.push({ v: e.v, turns: e.turns });
      break;
    }
    case 'summon': {
      if (!f.spawn || occupied(f, cell) || !walkable(f.board, cell) || u.team === 2) break;
      const s2 = f.spawn(e.unit, u.team, cell, u);
      s2.uid = f.nextUid++;
      s2.summoner = u.uid;
      f.units.push(s2);
      const at = f.order.indexOf(u.uid);
      f.order.splice(at + 1, 0, s2.uid);
      if (at < f.turnIdx) f.turnIdx++;
      ev.push({ t: 'summon', uid: s2.uid, by: u.uid });
      break;
    }
    case 'psy': {
      for (const t of inZone()) if (t.kind === 'player') ev.push({ t: 'psy', uid: t.uid, v: e.v });
      break;
    }
    case 'prime': {
      u.primed = true;
      ev.push({ t: 'prime', uid: u.uid });
      break;
    }
    case 'selfDestruct': {
      kill(f, u, ev);
      break;
    }
  }
}

function strike(f: Fight, u: Unit, t: Unit, min: number, max: number, crit: boolean, ev: FightEvent[], melee: boolean) {
  if (t.dead) return;
  const roll = randInt(f.rng, min, max) + u.st.flat;
  const amount = Math.max(1, Math.round(roll * damageMult(f, u, t) * (crit ? u.st.critMult : 1)));
  const done = hurt(f, t, amount, ev, u, { crit });
  if (u.st.lifesteal > 0 && done > 0) heal(f, u, done * u.st.lifesteal, ev);
  if (crit && u.st.critHeal > 0) heal(f, u, u.st.critHeal, ev);
  if (done > 0) emit(f, 'struck', f, u, t, done, crit, ev);
  // Thorns: whoever hits a spiked unit in melee takes some back.
  if (melee && !t.dead && t.st.thorns > 0 && !u.dead) hurt(f, u, t.st.thorns, ev, t);
}

export function addBuff(f: Fight, t: Unit, stat: BuffStat, v: number, turns: number, ev: FightEvent[]) {
  if (t.dead) return;
  if ((stat === 'pa' || stat === 'pm') && v < 0) t.dazedRound = f.round;
  // PA / PM gained or lost during the unit's own turn change its pool right away.
  if ((stat === 'pa' || stat === 'pm') && current(f) === t) {
    if (stat === 'pa') t.pa = Math.max(0, t.pa + v); else t.pm = Math.max(0, t.pm + v);
  } else t.buffs.push({ stat, v, turns });
  ev.push({ t: 'stat', uid: t.uid, stat, v });
}

// ---------- turns ----------

/** Begins the turn of the current unit: refill, cooldowns, bleeding, buffs, primed bombs. */
export function startTurn(f: Fight): FightEvent[] {
  const u = current(f), ev: FightEvent[] = [];
  if (!u || u.dead) return ev;
  ev.push({ t: 'turn', uid: u.uid });
  if (u.phases) {
    const ph = u.hp < u.maxHp * 0.25 ? 2 : u.hp < u.maxHp * 0.5 ? 1 : 0;
    while ((u.phase ?? 0) < Math.min(ph, u.phases.length)) {
      const b = u.phases[u.phase ?? 0];
      u.phase = (u.phase ?? 0) + 1;
      u.maxPa += b.pa; u.maxPm += b.pm; u.st = { ...u.st, dmgPct: u.st.dmgPct + b.dmg };
      ev.push({ t: 'phase', uid: u.uid, phase: u.phase });
    }
  }
  u.pa = Math.max(0, u.maxPa + buffSum(u, 'pa'));
  u.pm = Math.max(0, u.maxPm + buffSum(u, 'pm'));
  u.casts = {};
  u.killPaUsed = false;
  for (const k of Object.keys(u.cd)) if (u.cd[k] > 0) u.cd[k]--;
  u.buffs = u.buffs.map(b => ({ ...b, turns: b.turns - 1 })).filter(b => b.turns > 0);
  if (u.shieldTurns > 0 && --u.shieldTurns === 0) u.shield = 0;
  emit(f, 'turnStart', f, u, ev);
  for (const b of u.bleed) { hurt(f, u, b.v, ev, undefined, { bleed: true }); b.turns--; }
  u.bleed = u.bleed.filter(b => b.turns > 0);
  if (!u.dead && u.primed) {
    u.primed = false;
    blast(f, u, 2, 16, 22, ev);
    kill(f, u, ev);
  }
  return ev;
}

/** Ends the current turn and starts the next living unit's. New rounds count up. */
export function endTurn(f: Fight): FightEvent[] {
  const ev: FightEvent[] = [];
  const ending = current(f);
  if (ending && !ending.dead && !f.over) emit(f, 'turnEnd', f, ending, ev);
  for (let guard = 0; guard < f.order.length * 2 && !f.over; guard++) {
    f.turnIdx++;
    if (f.turnIdx >= f.order.length) { f.turnIdx = 0; f.round++; }
    const u = current(f);
    if (!u || u.dead) continue;
    ev.push(...startTurn(f));
    if (!u.dead) break;
  }
  return ev;
}

/** Sorts the order by initiative (the player first on ties) and starts the first turn. */
export function beginFight(f: Fight): FightEvent[] {
  const turnTakers = f.units.filter(u => !u.dead && u.team !== 2);
  turnTakers.sort((a, b) => b.init - a.init || (a.kind === 'player' ? -1 : b.kind === 'player' ? 1 : a.uid - b.uid));
  f.order = turnTakers.map(u => u.uid);
  f.turnIdx = 0;
  f.round = 1;
  return startTurn(f);
}

/** Adds units mid-fight (reinforcements): they act after everyone already in the order. */
export function addUnits(f: Fight, units: Unit[]) {
  for (const u of units) { u.uid = f.nextUid++; f.units.push(u); if (u.team !== 2) f.order.push(u.uid); }
}

export function createFight(board: Board, units: Unit[], rng: Rng, spawn?: Spawner): Fight {
  const f: Fight = { board, units: [], order: [], turnIdx: 0, round: 0, rng, nextUid: 1, spawn };
  addUnits(f, units);
  f.order = [];
  return f;
}

// ---------- previews (UI and AI) ----------

/** A copy deep enough to simulate actions on without touching the real fight. */
export function cloneFight(f: Fight, rng: Rng = () => 0.5): Fight {
  return {
    ...f, rng, order: [...f.order],
    units: f.units.map(u => ({ ...u, cd: { ...u.cd }, casts: { ...u.casts }, buffs: u.buffs.map(b => ({ ...b })), bleed: u.bleed.map(b => ({ ...b })), face: { ...u.face }, mem: { ...u.mem } })),
  };
}

/** What a cast would do: HP lost per unit (with average rolls, no crit). */
export function previewCast(f: Fight, u: Unit, s: SpellDef, cell: Pt): { uid: number; lost: number; dies: boolean }[] {
  const g = cloneFight(f, () => 0.5), cu = byUid(g, u.uid)!;
  const before = new Map(g.units.map(x => [x.uid, x.hp + x.shield]));
  cast(g, cu, { ...s, crit: -1 }, cell);
  return g.units.filter(x => before.get(x.uid)! !== x.hp + x.shield || x.dead !== byUid(f, x.uid)?.dead)
    .map(x => ({ uid: x.uid, lost: before.get(x.uid)! - (x.hp + x.shield), dies: x.dead }));
}
