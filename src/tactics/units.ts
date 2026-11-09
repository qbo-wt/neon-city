import type { EliteMod } from '../core/runMap';
import type { Stats } from '../core/types';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { spell } from '../data/spells';
import { BREAKABLE_KINDS, type BreakableKind } from './arena';
import type { AiKind, Pt, SpellDef, Unit, UnitStats } from './types';

const baseSt = (): UnitStats => ({
  dmgPct: 0, flat: 0, crit: 0.05, critMult: 1.5, res: 0, pushDmg: 0, tackle: 1, dodge: 0, range: 0,
  lifesteal: 0, thorns: 0, killHeal: 0, critHeal: 0, lowHpDamage: 0, extraMult: 1, dazedDamage: 0, killPa: 0, castPsy: 0,
});

function unit(o: Partial<Unit> & Pick<Unit, 'team' | 'kind' | 'name' | 'maxHp'> & Pt): Unit {
  return {
    uid: 0, hp: o.maxHp, shield: 0, shieldTurns: 0, pa: 0, pm: 0, maxPa: 0, maxPm: 0, init: 0, st: baseSt(),
    spells: [], cd: {}, casts: {}, buffs: [], bleed: [], ai: 'none', dead: false, face: { x: 1, y: 0 }, ...o,
  };
}

/** The player's unit for one fight, from the run's stats and spell bar. */
export function makePlayer(stats: Stats, spells: SpellDef[], hp: number, at: Pt): Unit {
  return unit({
    team: 0, kind: 'player', name: 'Toi', x: at.x, y: at.y, maxHp: stats.maxHp, hp: Math.min(hp, stats.maxHp),
    maxPa: stats.pa, maxPm: stats.pm, pa: stats.pa, pm: stats.pm, init: stats.initiative, spells,
    st: {
      ...baseSt(), dmgPct: stats.damagePct, flat: stats.damage, crit: stats.critChance, critMult: stats.critMult, res: stats.res,
      pushDmg: stats.pushDamage, tackle: stats.tackle, dodge: stats.dodge, range: stats.range, lifesteal: stats.lifesteal,
      thorns: stats.thorns, killHeal: stats.killHeal, critHeal: stats.critHeal, lowHpDamage: stats.lowHpDamage,
      dazedDamage: stats.dazedDamage, killPa: stats.killPa, castPsy: stats.castPsy,
    },
  });
}

export interface EnemyScaling { hpMult: number; dmgMult: number; pmBonus: number; paBonus: number; initBonus: number; elite?: EliteMod }

export function makeEnemy(id: EnemyId, at: Pt, sc: EnemyScaling): Unit {
  const d = ENEMIES[id], elite = d.boss ? undefined : sc.elite;
  const hp = Math.round(d.hp * sc.hpMult * (elite ? 1.3 : 1));
  const u = unit({
    team: 1, kind: id, name: d.name, x: at.x, y: at.y, maxHp: hp,
    maxPa: d.pa + sc.paBonus, maxPm: d.pm + sc.pmBonus + (elite === 'frenzy' ? 1 : 0), init: d.init + sc.initBonus,
    spells: d.spells.map(spell), ai: d.ai, boss: d.boss, elite, phases: d.phases,
    st: { ...baseSt(), dmgPct: sc.dmgMult - 1 + (elite === 'frenzy' ? 0.25 : 0), res: d.res, tackle: d.tackle, dodge: d.dodge },
  });
  if (elite === 'shield') { u.shield = Math.round(hp * 0.4); u.shieldTurns = 999; }
  // Summoners wait a couple of turns before calling for help.
  for (const s of u.spells) if (s.effects.some(e => e.k === 'summon')) u.cd[s.id] = 2;
  return u;
}

/** Summons: the player's turret, and enemies called in by bosses. */
export function makeSummon(kind: string, team: 0 | 1, at: Pt, by: Unit): Unit {
  if (kind === 'turret') {
    return unit({
      team, kind: 'turret', name: 'Tourelle', x: at.x, y: at.y, maxHp: 28, maxPa: 3, maxPm: 0, init: by.init - 1,
      spells: [spell('e-turret')], ai: 'turret' as AiKind, st: { ...baseSt(), tackle: 0, dmgPct: by.st.dmgPct },
    });
  }
  const id = kind as EnemyId, d = ENEMIES[id];
  return unit({
    team, kind: id, name: d.name, x: at.x, y: at.y, maxHp: Math.round(d.hp * 0.8), maxPa: d.pa, maxPm: d.pm, init: d.init,
    spells: d.spells.map(spell), ai: d.ai, st: { ...baseSt(), dmgPct: by.st.dmgPct * 0.5, tackle: d.tackle, dodge: d.dodge, res: d.res },
  });
}

export function makeBreakable(kind: BreakableKind, at: Pt): Unit {
  return unit({ team: 2, kind, name: kind === 'vending' ? 'Distributeur' : kind === 'barrel' ? 'Baril' : kind === 'trash' ? 'Poubelle' : 'Caisse', x: at.x, y: at.y, maxHp: BREAKABLE_KINDS[kind], st: { ...baseSt(), tackle: 0 } });
}
