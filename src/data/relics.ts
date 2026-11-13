import type { Relic } from '../core/types';
import { DIRS } from '../tactics/board';
import { heal, hurt, kill, opposed, unitAt, type Fight } from '../tactics/fight';
import type { FightEvent, Unit } from '../tactics/types';

/** Relic hooks act for the player only. */
const mine = (u: Unit | undefined): u is Unit => !!u && u.kind === 'player';
/** Opposing units on the 4 cells around u. */
const foesAround = (f: Fight, u: Unit) => DIRS.filter(d => { const o = unitAt(f, { x: u.x + d.x, y: u.y + d.y }); return !!o && opposed(u, o); }).length;
const shield = (u: Unit, v: number, turns: number, ev: FightEvent[]) => {
  u.shield += v; u.shieldTurns = Math.max(u.shieldTurns, turns); ev.push({ t: 'shield', uid: u.uid, v });
};

/**
 * Run-long finds, no psychosis load. Bosses and elite squads offer a choice, Mama Kit sells one, and
 * breakables and chests sometimes hide one. Many change how you play rather than just your numbers:
 * kills, turn starts and ends, blows taken, heals, where you stand, psychosis, credits, implants, spells.
 */
export const RELICS: Relic[] = [
  // ----- LEGENDARY -----
  { id: 'katana', name: 'Katana « Lune Rouge »', rarity: 'legendary', description: '+3 dégâts sur chaque coup, +1 portée, +10 % de critique', texture: 'relic-katana',
    modify: s => ({ ...s, damage: s.damage + 3, range: s.range + 1, critChance: s.critChance + 0.1 }) },
  { id: 'last-breath', name: 'Dernier souffle', rarity: 'legendary', description: 'Une fois par combat, un coup mortel te laisse à 1 PV avec 15 de bouclier',
    modify: s => s,
    hooks: { saveFromDeath: (_f, t, _by, ev) => {
      if (!mine(t) || t.mem.lastBreath) return false;
      t.mem.lastBreath = 1; t.hp = 1; shield(t, 15, 1, ev);
      return true;
    } } },
  { id: 'convergence', name: 'Nœud de convergence', rarity: 'legendary', description: 'Chaque famille d\'implants que tu portes compte 1 implant de plus pour les synergies',
    modify: s => s, synergyBonus: 1 },

  // ----- RARE -----
  { id: 'pistols', name: 'Pistolets jumeaux dorés', rarity: 'rare', description: 'Sort Tir doré : deux tirs à 2 PA par tour', texture: 'relic-pistols',
    modify: s => s, spell: 'goldshot' },
  { id: 'cleaver', name: 'Couperet', rarity: 'rare', description: 'Un ennemi que tu laisses sous 15 % de sa vie est achevé (sauf les boss)',
    modify: s => s,
    hooks: { damaged: (f, t, _a, by, ev) => { if (mine(by) && opposed(by, t) && !t.dead && !t.boss && t.hp <= t.maxHp * 0.15) kill(f, t, ev, by); } } },
  { id: 'grudge', name: 'Rancune', rarity: 'rare', description: 'Chaque coup encaissé : +5 % de dégâts jusqu\'à la fin du combat (+30 % max)',
    modify: s => s,
    hooks: {
      damaged: (_f, t, _a, by, ev) => {
        if (!mine(t) || !by || !opposed(by, t) || (t.mem.grudge ?? 0) >= 6) return;
        t.mem.grudge = (t.mem.grudge ?? 0) + 1;
        ev.push({ t: 'stat', uid: t.uid, stat: 'dmg', v: 5 });
      },
      damageMult: (_f, src) => (mine(src) ? 1 + 0.05 * (src.mem.grudge ?? 0) : 1),
    } },
  { id: 'viper-fang', name: 'Croc de vipère', rarity: 'rare', description: '+5 % de critique ; tes critiques font saigner (4 PV, 2 tours)',
    modify: s => ({ ...s, critChance: s.critChance + 0.05 }),
    hooks: { struck: (_f, src, t, _d, crit) => { if (mine(src) && crit && opposed(src, t) && !t.dead) t.bleed.push({ v: 4, turns: 2 }); } } },
  { id: 'metronome', name: 'Métronome', rarity: 'rare', description: 'Un round sur trois (3, 6, 9…), ton tour commence avec +2 PA',
    modify: s => s,
    hooks: { turnStart: (f, u, ev) => { if (mine(u) && f.round % 3 === 0) { u.pa += 2; ev.push({ t: 'stat', uid: u.uid, stat: 'pa', v: 2 }); } } } },
  { id: 'purger', name: 'Purgeur neural', rarity: 'rare', description: 'Chaque élimination retire 3 de psychose au lieu d\'en ajouter',
    modify: s => ({ ...s, psyPerKill: -3 }) },
  { id: 'interest', name: 'Intérêts composés', rarity: 'rare', description: 'En quittant un secteur : +10 % de tes crédits de la run (20¢ max)',
    modify: s => ({ ...s, interest: s.interest + 0.1 }) },
  { id: 'living-chrome', name: 'Chrome vivant', rarity: 'rare', description: 'Par implant porté : +5 vie max et +2 % de résistance',
    modify: (s, implants) => ({ ...s, maxHp: s.maxHp + 5 * implants.length, res: s.res + 0.02 * implants.length }) },
  { id: 'piston-gloves', name: 'Gants à piston', rarity: 'rare', description: 'Tes poussées vont 1 case plus loin, +4 dégâts de poussée',
    modify: s => ({ ...s, pushDamage: s.pushDamage + 4 }),
    editSpell: sp => { sp.effects = sp.effects.map(e => (e.k === 'push' ? { ...e, n: e.n + 1 } : e)); },
    fits: spells => spells.some(sp => sp.effects.some(e => e.k === 'push')) },

  // ----- COMMON -----
  { id: 'hunt-coil', name: 'Bobine de traque', rarity: 'common', description: 'Chaque élimination : +1 PM à ton prochain tour (cumulable)',
    modify: s => s,
    hooks: { killed: (_f, t, by, ev) => { if (mine(by) && opposed(by, t)) { by.buffs.push({ stat: 'pm', v: 1, turns: 1 }); ev.push({ t: 'stat', uid: by.uid, stat: 'pm', v: 1 }); } } } },
  { id: 'loner-cloak', name: 'Cape « Solitaire »', rarity: 'common', description: '+25 % de dégâts quand aucun ennemi ne t\'est adjacent',
    modify: s => s,
    hooks: { damageMult: (f, src) => (mine(src) && foesAround(f, src) === 0 ? 1.25 : 1) } },
  { id: 'spiked-jacket', name: 'Blouson à clous', rarity: 'common', description: '+10 % de dégâts par ennemi à ton contact, +1 tacle',
    modify: s => ({ ...s, tackle: s.tackle + 1 }),
    hooks: { damageMult: (f, src) => (mine(src) ? 1 + 0.1 * foesAround(f, src) : 1) } },
  { id: 'backup-cell', name: 'Batterie de secours', rarity: 'common', description: 'Fin de tour : chaque PA non dépensé donne 3 de bouclier',
    modify: s => s,
    hooks: { turnEnd: (_f, u, ev) => { if (mine(u) && u.pa > 0) shield(u, 3 * u.pa, 1, ev); } } },
  { id: 'nano-weave', name: 'Nanotissu', rarity: 'common', description: 'En combat, les soins au-delà de ta vie max deviennent du bouclier (15 max)',
    modify: s => s,
    hooks: { healed: (_f, t, _g, over, ev) => { if (mine(t) && over > 0) shield(t, Math.min(15, Math.round(over)), 2, ev); } } },
  { id: 'scar-gel', name: 'Gel cicatrisant', rarity: 'common', description: 'Début de tour : +6 PV si personne ne t\'a blessé depuis ton dernier tour',
    modify: s => s,
    hooks: {
      damaged: (_f, t) => { if (mine(t)) t.mem.hurt = 1; },
      turnStart: (f, u, ev) => { if (!mine(u)) return; if (!u.mem.hurt) heal(f, u, 6, ev); u.mem.hurt = 0; },
    } },
  { id: 'platinum-card', name: 'Carte platine volée', rarity: 'common', description: 'Les rencontres de rue te coûtent 30 % moins cher',
    modify: s => ({ ...s, priceMult: s.priceMult * 0.7 }) },
  { id: 'scavenger', name: 'Pied-de-biche', rarity: 'common', description: 'Les objets cassables lâchent toujours quelque chose, et deux fois plus de crédits',
    modify: s => ({ ...s, lootBonus: s.lootBonus + 1 }) },

  // ----- CURSED: a big edge, a real price -----
  { id: 'hungry-blade', name: 'Lame affamée', rarity: 'cursed', description: '+30 % de dégâts, mais -6 PV à chaque fin de tour sans élimination',
    modify: s => ({ ...s, damagePct: s.damagePct + 0.3 }),
    hooks: {
      killed: (_f, t, by) => { if (mine(by) && opposed(by, t)) by.mem.fed = 1; },
      turnEnd: (f, u, ev) => { if (!mine(u)) return; if (!u.mem.fed) hurt(f, u, 6, ev, undefined, { bleed: true }); u.mem.fed = 0; },
    } },
  { id: 'oni-mask', name: 'Masque Oni', rarity: 'cursed', description: 'Dès 50 % de psychose : +1 PA et +1 PM par tour. Mais ta psychose monte 30 % plus vite',
    modify: s => ({ ...s, edgePa: s.edgePa + 1, edgePm: s.edgePm + 1, psyRateMult: s.psyRateMult * 1.3 }) },
  { id: 'burning-mind', name: 'Cerveau en feu', rarity: 'cursed', description: 'La psychose ne te coûte plus de PV. Mais -30 % de vie max, neuro-bloqueurs grillés',
    modify: s => ({ ...s, psyDrainMult: 0, maxHp: Math.round(s.maxHp * 0.7), blockerAmount: 0 }) },
  { id: 'blood-contract', name: 'Contrat de sang', rarity: 'cursed', description: '+60 % de crédits, mais les ennemis font +20 % de dégâts',
    modify: s => ({ ...s, creditMult: s.creditMult + 0.6, foeDamage: s.foeDamage + 0.2 }) },
];

export const RELIC_BY_ID = new Map(RELICS.map(r => [r.id, r]));
