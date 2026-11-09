import type { SkillNode, Stats } from '../core/types';

export const BRANCH_NAMES = ['OSSATURE', 'MUSCLE', 'MOBILITÉ', 'INSTINCT', 'SÉRÉNITÉ', 'RÉSEAU'];

type Def = [id: string, name: string, description: string, cost: number, modify: (s: Stats) => Stats];

/** Each branch is a chain: a node requires the one above it. Costs climb steeply on purpose. */
function branch(tree: SkillNode['tree'], b: number, defs: Def[]): SkillNode[] {
  return defs.map(([id, name, description, cost, modify], i) => ({
    id, name, description, cost, modify, tree, branch: b, requires: i ? defs[i - 1][0] : undefined,
  }));
}

export const SKILL_NODES: SkillNode[] = [
  // ----- CORPS ----- (ids kept from the action version so saves keep their nodes)
  ...branch('body', 0, [
    ['body-hp-1', 'Carcasse renforcée', '+20 vie max', 40, s => ({ ...s, maxHp: s.maxHp + 20 })],
    ['body-armor-1', 'Derme tressé', '+6 % de résistance', 120, s => ({ ...s, res: s.res + 0.06 })],
    ['body-hp-2', 'Ossature carbone', '+40 vie max', 280, s => ({ ...s, maxHp: s.maxHp + 40 })],
    ['body-regen-1', 'Nano-sutures', 'Soigne 10 % de la vie à chaque secteur nettoyé', 550, s => ({ ...s, regenOnClear: s.regenOnClear + 0.1 })],
  ]),
  ...branch('body', 1, [
    ['body-dmg-1', 'Poings lestés', '+1 dégât sur chaque coup', 40, s => ({ ...s, damage: s.damage + 1 })],
    ['body-dmg-2', 'Fibres myomères', '+8 % de dégâts', 120, s => ({ ...s, damagePct: s.damagePct + 0.08 })],
    ['body-finisher-1', 'Épaules de bélier', '+8 dommages de poussée', 280, s => ({ ...s, pushDamage: s.pushDamage + 8 })],
    ['body-dmg-3', 'Servos de frappe', '+3 dégâts sur chaque coup', 550, s => ({ ...s, damage: s.damage + 3 })],
  ]),
  ...branch('body', 2, [
    ['body-speed-1', 'Tendons fibrés', '+10 initiative', 40, s => ({ ...s, initiative: s.initiative + 10 })],
    ['body-dashcd-1', 'Appuis légers', '+2 fuite (le tacle te retient moins)', 120, s => ({ ...s, dodge: s.dodge + 2 })],
    ['body-dash-1', 'Jambes gyroscopiques', '+1 PM', 280, s => ({ ...s, pm: s.pm + 1 })],
    ['body-speed-2', 'Foulée de sprinteur', '+20 initiative, +1 fuite', 550, s => ({ ...s, initiative: s.initiative + 20, dodge: s.dodge + 1 })],
  ]),
  ...branch('body', 3, [
    ['body-crit-1', 'Œil vif', '+5 % de critique', 40, s => ({ ...s, critChance: s.critChance + 0.05 })],
    ['body-parry-1', 'Corps-mur', '+1 tacle (les ennemis peinent à te quitter)', 120, s => ({ ...s, tackle: s.tackle + 1 })],
    ['body-counter-1', 'Contre-programme', 'Critiques +x0,25', 280, s => ({ ...s, critMult: s.critMult + 0.25 })],
    ['body-crit-2', 'Instinct de tueur', '+1 PA', 550, s => ({ ...s, pa: s.pa + 1 })],
  ]),
  // ----- ESPRIT -----
  ...branch('mind', 4, [
    ['mind-resist-1', 'Méditation', '-15 % de psychose gagnée', 50, s => ({ ...s, psyResist: s.psyResist + 0.15 })],
    ['mind-load-1', 'Firmware stable', '-20 % de charge des implants', 150, s => ({ ...s, implantLoadMult: s.implantLoadMult * 0.8 })],
    ['mind-resist-2', "Ancre d'humanité", '-20 % de psychose gagnée', 320, s => ({ ...s, psyResist: s.psyResist + 0.2 })],
    ['mind-therapy-1', 'Thérapie neurale', 'Commence chaque run avec 1 neuro-bloqueur', 600, s => ({ ...s, startBlockers: s.startBlockers + 1 })],
  ]),
  ...branch('mind', 5, [
    ['mind-credits-1', 'Réseau de fixers', '+15 % de crédits', 50, s => ({ ...s, creditMult: s.creditMult + 0.15 })],
    ['mind-blocker-1', 'Pharmacien du coin', 'Neuro-bloqueurs : -40 psychose au lieu de -30', 150, s => ({ ...s, blockerAmount: 40 })],
    ['mind-credits-2', 'Courtier', '+20 % de crédits', 320, s => ({ ...s, creditMult: s.creditMult + 0.2 })],
    ['mind-bounty-1', 'Prime de contrat', 'Bonus de victoire x2', 600, s => ({ ...s, bossBonusMult: s.bossBonusMult * 2 })],
  ]),
];
