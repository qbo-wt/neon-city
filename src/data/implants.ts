import type { Family, Implant, Rarity, Stats } from '../core/types';

export const MAX_LEVEL = 3;

type Def = [id: string, name: string, family: Family | undefined, rarity: Rarity, load: number,
  describe: (l: number) => string, modify: (s: Stats, l: number) => Stats, spell?: string];

const pct = (v: number) => `${Math.round(v * 100)} %`;
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

/**
 * Four families (synergies at 2 and 3 implants), three rarities plus the black market: strong effects
 * with a real drawback, never upgradable. Every regular implant can be upgraded twice by finding it again.
 * Some implants add a spell to your bar.
 */
const DEFS: Def[] = [
  // ----- CHROME: armour, pushes, holding the line -----
  ['dermal-armor', 'Dermo-blindage', 'chrome', 'common', 10, l => `+${20 * l} vie max`, (s, l) => ({ ...s, maxHp: s.maxHp + 20 * l })],
  ['subdermal-plate', 'Plaque Sous-cutanée', 'chrome', 'common', 5, l => `+${5 * l} % de résistance`, (s, l) => ({ ...s, res: s.res + 0.05 * l })],
  ['gorilla-servos', 'Servos Titan', 'chrome', 'rare', 10, l => `+${6 * l} dommages de poussée, +${l} tacle`, (s, l) => ({ ...s, pushDamage: s.pushDamage + 6 * l, tackle: s.tackle + l })],
  ['arm-blades', 'Lames Faucheuses', 'chrome', 'rare', 12, l => `+${plural(2 * l, 'dégât')} sur chaque coup`, (s, l) => ({ ...s, damage: s.damage + 2 * l })],
  ['kinetic-shield', 'Bouclier Cinétique', 'chrome', 'rare', 9, l => `Sort Bouclier cinétique, +${3 * l} % de résistance`, (s, l) => ({ ...s, res: s.res + 0.03 * l }), 'kshield'],
  ['titan-shell', 'Coque Titan', 'chrome', 'epic', 16, l => `+8 % de résistance, renvoie ${4 + 3 * l} dégâts à qui te frappe au contact`,
    (s, l) => ({ ...s, res: s.res + 0.08, thorns: s.thorns + 4 + 3 * l })],
  // ----- NEURAL: action points, hacks, psychosis itself -----
  ['neural-coproc', 'Coprocesseur Neural', 'neural', 'rare', 11, l => `+${10 * l} % de dégâts`, (s, l) => ({ ...s, damagePct: s.damagePct + 0.1 * l })],
  ['psy-dampener', 'Amortisseur Psy', 'neural', 'common', 3, l => `-${10 * l} % de psychose gagnée`, (s, l) => ({ ...s, psyResist: s.psyResist + 0.1 * l })],
  ['shortcircuit', 'Module Court-circuit', 'neural', 'common', 8, l => `Sort Court-circuit (hack, -1 PA), +${plural(l, 'dégât')}`, (s, l) => ({ ...s, damage: s.damage + l }), 'shortcircuit'],
  ['turret-link', 'Liaison Tourelle', 'neural', 'rare', 10, l => `Sort Tourelle (invocation), +${10 * l} initiative`, (s, l) => ({ ...s, initiative: s.initiative + 10 * l }), 'turret'],
  ['predator-chip', 'Puce Prédatrice', 'neural', 'epic', 14, l => `+1 PA à la première élimination de chaque tour, +${5 * l} % de dégâts`,
    (s, l) => ({ ...s, killPa: Math.max(s.killPa, 1), damagePct: s.damagePct + 0.05 * l })],
  ['overclock-chip', 'Puce Overclock', 'neural', 'epic', 15, l => `+${pct(0.3 * l)} de dégâts à 100 % de psychose (progressif)`, (s, l) => ({ ...s, psyDamage: s.psyDamage + 0.003 * l })],
  // ----- BLOOD: adrenaline, lifesteal, living on the edge -----
  ['adrenal-pump', 'Pompe Adrénale', 'blood', 'rare', 13, l => (l < 3 ? `+1 PM, +${plural(l, 'dégât')}` : '+1 PM, +3 dégâts, +1 fuite'),
    (s, l) => ({ ...s, pm: s.pm + 1, damage: s.damage + l, dodge: s.dodge + (l >= 3 ? 1 : 0) })],
  ['leech-glands', 'Glandes Sangsues', 'blood', 'common', 6, l => `+${4 * l} PV par élimination`, (s, l) => ({ ...s, killHeal: s.killHeal + 4 * l })],
  ['hemo-recycler', 'Recycleur Hémo', 'blood', 'common', 7, l => `Soigne ${8 * l} % de la vie à chaque secteur`, (s, l) => ({ ...s, regenOnClear: s.regenOnClear + 0.08 * l })],
  ['nano-blood', 'Sang Nanite', 'blood', 'rare', 10, l => `Vol de vie : ${6 * l} % des dégâts infligés`, (s, l) => ({ ...s, lifesteal: s.lifesteal + 0.06 * l })],
  ['stim-gland', 'Glande à Stimulant', 'blood', 'common', 8, l => `Sort Stimulant (soin), +${10 * l} % de soins reçus`, (s, l) => ({ ...s, healMult: s.healMult + 0.1 * l }), 'stim'],
  ['berserk-gland', 'Glande Berserk', 'blood', 'epic', 14, l => `+${25 * l} % de dégâts sous 40 % de vie`, (s, l) => ({ ...s, lowHpDamage: s.lowHpDamage + 0.25 * l })],
  // ----- OPTIC: crits, range, mobility -----
  ['aim-optics', 'Optique Hawk-9', 'optic', 'common', 7, l => `+${7 * l} % de critique`, (s, l) => ({ ...s, critChance: s.critChance + 0.07 * l })],
  ['tracer-eye', 'Œil Traceur', 'optic', 'rare', 9, l => `Critiques : x${(1.5 + 0.25 * l).toFixed(2).replace('.', ',')} au lieu de x1,5`, (s, l) => ({ ...s, critMult: s.critMult + 0.25 * l })],
  ['long-lens', 'Lentille Longue Portée', 'optic', 'rare', 9, l => `+${l} portée sur les sorts à portée modifiable`, (s, l) => ({ ...s, range: s.range + l })],
  ['reinforced-legs', 'Jambes Ressort', 'optic', 'rare', 10, l => (l === 1 ? '+1 PM' : l === 2 ? '+1 PM, +2 fuite' : '+2 PM, +2 fuite'),
    (s, l) => ({ ...s, pm: s.pm + (l >= 3 ? 2 : 1), dodge: s.dodge + (l >= 2 ? 2 : 0) })],
  ['smart-link', 'Lien Balistique', 'optic', 'rare', 9, l => `Sort Tir réflexe, +${3 * l} % de critique`, (s, l) => ({ ...s, critChance: s.critChance + 0.03 * l }), 'reflex'],
  ['wrist-launcher', 'Lance-grenade de Poignet', 'optic', 'epic', 13, l => `Sort Grenade (zone), +${plural(l, 'dégât')}`, (s, l) => ({ ...s, damage: s.damage + l }), 'grenade'],
  // ----- BLACK MARKET: a big edge, a real price -----
  ['berserker-os', 'OS Berserker', undefined, 'black', 6, () => '+40 % de dégâts, mais -1 PM', s => ({ ...s, damagePct: s.damagePct + 0.4, pm: s.pm - 1 })],
  ['glass-bones', 'Os de Verre', undefined, 'black', 5, () => '+35 % de dégâts, mais -35 % de vie max', s => ({ ...s, damagePct: s.damagePct + 0.35, maxHp: Math.round(s.maxHp * 0.65) })],
  ['neuro-leak', 'Fuite Neurale', undefined, 'black', 4, () => '+1 PA et +1 PM, mais +50 % de psychose gagnée',
    s => ({ ...s, pa: s.pa + 1, pm: s.pm + 1, psyResist: s.psyResist - 0.5 })],
  ['blood-pact', 'Pacte de Sang', undefined, 'black', 5, () => '+10 PV par élimination, mais les autres soins sont réduits de 75 %',
    s => ({ ...s, killHeal: s.killHeal + 10, healMult: s.healMult * 0.25 })],
  ['overdrive', 'Surcadençage', undefined, 'black', 6, () => '+2 PA, mais chaque sort lancé donne +2 psychose',
    s => ({ ...s, pa: s.pa + 2, castPsy: s.castPsy + 2 })],
];

export const IMPLANTS: Implant[] = DEFS.map(([id, name, family, rarity, load, describe, modify, spell]) => ({
  id, name, family, rarity, load, describe, description: describe(1), modify: (s, l = 1) => modify(s, l), spell,
}));

export const IMPLANT_BY_ID = new Map(IMPLANTS.map(i => [i.id, i]));

/** Upgradable unless black market, up to MAX_LEVEL. */
export const canUpgrade = (i: Implant) => i.rarity !== 'black' && (i.level ?? 1) < MAX_LEVEL;

export const FAMILY_NAMES: Record<Family, string> = { chrome: 'CHROME', neural: 'NEURAL', blood: 'SANG', optic: 'OPTIQUE' };
export const FAMILY_COLORS: Record<Family, string> = { chrome: '#e8e8ff', neural: '#39ff88', blood: '#ff3b3b', optic: '#f5e663' };
export const RARITY_NAMES: Record<Rarity, string> = { common: 'COMMUN', rare: 'RARE', epic: 'ÉPIQUE', black: 'MARCHÉ NOIR' };
export const RARITY_COLORS: Record<Rarity, number> = { common: 0x8a86b0, rare: 0x00f0ff, epic: 0xff2a6d, black: 0x39ff88 };
