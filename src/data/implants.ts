import type { Family, Implant, Rarity, Stats } from '../core/types';

export const MAX_LEVEL = 3;

type Def = [id: string, name: string, family: Family | undefined, rarity: Rarity, load: number,
  describe: (l: number) => string, modify: (s: Stats, l: number) => Stats];

const pct = (v: number) => `${Math.round(v * 100)} %`;

/**
 * Four families (synergies at 2 and 3 implants), three rarities plus the black market: strong effects
 * with a real drawback, never upgradable. Every regular implant can be upgraded twice by finding it again.
 */
const DEFS: Def[] = [
  // ----- CHROME: armour and raw melee -----
  ['arm-blades', 'Lames Faucheuses', 'chrome', 'rare', 12, l => `+${3 + 3 * l} dégâts`, (s, l) => ({ ...s, damage: s.damage + 3 + 3 * l })],
  ['dermal-armor', 'Dermo-blindage', 'chrome', 'common', 10, l => `+${25 * l} vie max`, (s, l) => ({ ...s, maxHp: s.maxHp + 25 * l })],
  ['subdermal-plate', 'Plaque Sous-cutanée', 'chrome', 'common', 4, l => `-${6 * l} % de dégâts subis`, (s, l) => ({ ...s, damageTakenMult: s.damageTakenMult * (1 - 0.06 * l) })],
  ['gorilla-servos', 'Servos Titan', 'chrome', 'rare', 11, l => `Coup final du combo : +${pct(0.4 * l)} de dégâts`, (s, l) => ({ ...s, finisherMult: s.finisherMult + 0.4 * l })],
  ['titan-shell', 'Coque Titan', 'chrome', 'epic', 16, l => `-15 % de dégâts subis, renvoie ${6 * l} dégâts à qui te frappe au corps à corps`,
    (s, l) => ({ ...s, damageTakenMult: s.damageTakenMult * 0.85, thorns: s.thorns + 6 * l })],
  // ----- NEURAL: the mind, parries and psychosis itself -----
  ['neural-coproc', 'Coprocesseur Neural', 'neural', 'rare', 11, l => `+${12 * l} % de dégâts`, (s, l) => ({ ...s, damage: s.damage * (1 + 0.12 * l) })],
  ['psy-dampener', 'Amortisseur Psy', 'neural', 'common', 3, l => `-${10 * l} % de psychose gagnée`, (s, l) => ({ ...s, psyResist: s.psyResist + 0.1 * l })],
  ['synaptic-buffer', 'Tampon Synaptique', 'neural', 'rare', 8, l => `Parade +${35 * l} ms, chaque parade -${3 * l} psychose`,
    (s, l) => ({ ...s, parryBonusMs: s.parryBonusMs + 35 * l, parryPsy: s.parryPsy - 3 * l })],
  ['overclock-chip', 'Puce Overclock', 'neural', 'epic', 15, l => `+${pct(0.3 * l)} de dégâts à 100 % de psychose (progressif)`, (s, l) => ({ ...s, psyDamage: s.psyDamage + 0.003 * l })],
  ['boosted-reflexes', 'Réflexes Synapse', 'neural', 'common', 8, l => `+${10 * l} % de vitesse`, (s, l) => ({ ...s, speed: s.speed * (1 + 0.1 * l) })],
  // ----- BLOOD: adrenaline, lifesteal, living on the edge -----
  ['adrenal-pump', 'Pompe Adrénale', 'blood', 'rare', 14, l => `+${12 * l} % de vitesse, +${3 * l} dégâts`, (s, l) => ({ ...s, speed: s.speed * (1 + 0.12 * l), damage: s.damage + 3 * l })],
  ['leech-glands', 'Glandes Sangsues', 'blood', 'common', 6, l => `+${2 * l} PV par élimination`, (s, l) => ({ ...s, killHeal: s.killHeal + 2 * l })],
  ['hemo-recycler', 'Recycleur Hémo', 'blood', 'common', 7, l => `Soigne ${6 * l} % de la vie à chaque secteur`, (s, l) => ({ ...s, regenOnClear: s.regenOnClear + 0.06 * l })],
  ['berserk-gland', 'Glande Berserk', 'blood', 'epic', 14, l => `+${30 * l} % de dégâts sous 40 % de vie`, (s, l) => ({ ...s, lowHpDamage: s.lowHpDamage + 0.3 * l })],
  // ----- OPTIC: crits, ranged and movement -----
  ['aim-optics', 'Optique Hawk-9', 'optic', 'common', 7, l => `+${8 * l} % de critique`, (s, l) => ({ ...s, critChance: s.critChance + 0.08 * l })],
  ['reinforced-legs', 'Jambes Ressort', 'optic', 'rare', 10, l => (l === 1 ? '+1 charge de dash' : l === 2 ? '+1 dash, recharge 20 % plus rapide' : '+2 dashs, recharge 20 % plus rapide'),
    (s, l) => ({ ...s, dashCharges: s.dashCharges + (l >= 3 ? 2 : 1), dashCooldownMult: s.dashCooldownMult * (l >= 2 ? 0.8 : 1) })],
  ['tracer-eye', 'Œil Traceur', 'optic', 'rare', 9, l => `Critiques : x${(2 + 0.5 * l).toFixed(1)} au lieu de x2`, (s, l) => ({ ...s, critMult: s.critMult + 0.5 * l })],
  ['smart-link', 'Lien Balistique', 'optic', 'epic', 15, l => `Chaque coup tire aussi une balle (${pct(0.3 * l)} des dégâts)`, (s, l) => ({ ...s, gunDamage: s.gunDamage + 0.3 * l })],
  ['dash-edge', 'Tranchant Cinétique', 'optic', 'rare', 9, l => `Le dash inflige ${12 * l} dégâts aux ennemis traversés`, (s, l) => ({ ...s, dashDamage: s.dashDamage + 12 * l })],
  // ----- BLACK MARKET: a big edge, a real price -----
  ['berserker-os', 'OS Berserker', undefined, 'black', 6, () => '+50 % de dégâts, mais tu ne peux plus parer', s => ({ ...s, damage: s.damage * 1.5, parryLocked: 1 })],
  ['glass-bones', 'Os de Verre', undefined, 'black', 5, () => '+40 % de dégâts, mais -35 % de vie max', s => ({ ...s, damage: s.damage * 1.4, maxHp: Math.round(s.maxHp * 0.65) })],
  ['neuro-leak', 'Fuite Neurale', undefined, 'black', 4, () => '+25 % de vitesse et +1 dash, mais +50 % de psychose gagnée',
    s => ({ ...s, speed: s.speed * 1.25, dashCharges: s.dashCharges + 1, psyResist: s.psyResist - 0.5 })],
  ['blood-pact', 'Pacte de Sang', undefined, 'black', 5, () => '+6 PV par élimination, mais les autres soins sont réduits de 75 %',
    s => ({ ...s, killHeal: s.killHeal + 6, healMult: s.healMult * 0.25 })],
  ['overdrive', 'Surcadençage', undefined, 'black', 6, () => '+35 % de vitesse de frappe, mais chaque coup porté donne +0,4 psychose',
    s => ({ ...s, attackSpeed: s.attackSpeed * 1.35, hitPsy: s.hitPsy + 0.4 })],
];

export const IMPLANTS: Implant[] = DEFS.map(([id, name, family, rarity, load, describe, modify]) => ({
  id, name, family, rarity, load, describe, description: describe(1), modify: (s, l = 1) => modify(s, l),
}));

export const IMPLANT_BY_ID = new Map(IMPLANTS.map(i => [i.id, i]));

/** Upgradable unless black market, up to MAX_LEVEL. */
export const canUpgrade = (i: Implant) => i.rarity !== 'black' && (i.level ?? 1) < MAX_LEVEL;

export const FAMILY_NAMES: Record<Family, string> = { chrome: 'CHROME', neural: 'NEURAL', blood: 'SANG', optic: 'OPTIQUE' };
export const FAMILY_COLORS: Record<Family, string> = { chrome: '#e8e8ff', neural: '#39ff88', blood: '#ff3b3b', optic: '#f5e663' };
export const RARITY_NAMES: Record<Rarity, string> = { common: 'COMMUN', rare: 'RARE', epic: 'ÉPIQUE', black: 'MARCHÉ NOIR' };
export const RARITY_COLORS: Record<Rarity, number> = { common: 0x8a86b0, rare: 0x00f0ff, epic: 0xff2a6d, black: 0x39ff88 };
