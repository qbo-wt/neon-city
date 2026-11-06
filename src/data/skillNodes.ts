import type { SkillNode, Stats } from '../core/types';

export const BRANCH_NAMES = ['OSSATURE', 'MUSCLE', 'MOBILITÉ', 'RÉFLEXES', 'SÉRÉNITÉ', 'RÉSEAU'];

type Def = [id: string, name: string, description: string, cost: number, modify: (s: Stats) => Stats];

/** Each branch is a chain: a node requires the one above it. Costs climb steeply on purpose. */
function branch(tree: SkillNode['tree'], b: number, defs: Def[]): SkillNode[] {
  return defs.map(([id, name, description, cost, modify], i) => ({
    id, name, description, cost, modify, tree, branch: b, requires: i ? defs[i - 1][0] : undefined,
  }));
}

export const SKILL_NODES: SkillNode[] = [
  // ----- CORPS -----
  ...branch('body', 0, [
    ['body-hp-1', 'Carcasse renforcée', '+20 vie max', 40, s => ({ ...s, maxHp: s.maxHp + 20 })],
    ['body-armor-1', 'Derme tressé', '-10 % de dégâts subis', 120, s => ({ ...s, damageTakenMult: s.damageTakenMult * 0.9 })],
    ['body-hp-2', 'Ossature carbone', '+40 vie max', 280, s => ({ ...s, maxHp: s.maxHp + 40 })],
    ['body-regen-1', 'Nano-sutures', 'Soigne 10 % de la vie à chaque secteur nettoyé', 550, s => ({ ...s, regenOnClear: s.regenOnClear + 0.1 })],
  ]),
  ...branch('body', 1, [
    ['body-dmg-1', 'Poings lestés', '+3 dégâts', 40, s => ({ ...s, damage: s.damage + 3 })],
    ['body-dmg-2', 'Fibres myomères', '+10 % de dégâts', 120, s => ({ ...s, damage: s.damage * 1.1 })],
    ['body-finisher-1', 'Coup de grâce', 'Le 3e coup du combo fait x2 au lieu de x1,5', 280, s => ({ ...s, finisherMult: 2 })],
    ['body-dmg-3', 'Servos de frappe', '+6 dégâts', 550, s => ({ ...s, damage: s.damage + 6 })],
  ]),
  ...branch('body', 2, [
    ['body-speed-1', 'Tendons fibrés', '+8 % de vitesse', 40, s => ({ ...s, speed: s.speed * 1.08 })],
    ['body-dashcd-1', 'Recharge rapide', 'Dash rechargé 25 % plus vite', 120, s => ({ ...s, dashCooldownMult: s.dashCooldownMult * 0.75 })],
    ['body-dash-1', 'Jambes gyroscopiques', '+1 charge de dash', 280, s => ({ ...s, dashCharges: s.dashCharges + 1 })],
    ['body-speed-2', 'Foulée de sprinteur', '+12 % de vitesse', 550, s => ({ ...s, speed: s.speed * 1.12 })],
  ]),
  ...branch('body', 3, [
    ['body-crit-1', 'Œil vif', '+5 % de critique', 40, s => ({ ...s, critChance: s.critChance + 0.05 })],
    ['body-parry-1', 'Synapses rapides', 'Fenêtre de parade +50 ms', 120, s => ({ ...s, parryBonusMs: s.parryBonusMs + 50 })],
    ['body-counter-1', 'Contre-programme', 'Les contres font x3 au lieu de x2', 280, s => ({ ...s, counterMult: 3 })],
    ['body-crit-2', 'Instinct de tueur', '+10 % de critique', 550, s => ({ ...s, critChance: s.critChance + 0.1 })],
  ]),
  // ----- ESPRIT -----
  ...branch('mind', 4, [
    ['mind-resist-1', 'Méditation', '-15 % de psychose gagnée', 50, s => ({ ...s, psyResist: s.psyResist + 0.15 })],
    ['mind-load-1', 'Firmware stable', '-20 % de charge des implants', 150, s => ({ ...s, implantLoadMult: s.implantLoadMult * 0.8 })],
    ['mind-resist-2', 'Ancre d\'humanité', '-20 % de psychose gagnée', 320, s => ({ ...s, psyResist: s.psyResist + 0.2 })],
    ['mind-therapy-1', 'Thérapie neurale', 'Commence chaque run avec 1 neuro-bloqueur', 600, s => ({ ...s, startBlockers: s.startBlockers + 1 })],
  ]),
  ...branch('mind', 5, [
    ['mind-credits-1', 'Réseau de fixers', '+15 % de crédits', 50, s => ({ ...s, creditMult: s.creditMult + 0.15 })],
    ['mind-blocker-1', 'Pharmacien du coin', 'Neuro-bloqueurs : -40 psychose au lieu de -30', 150, s => ({ ...s, blockerAmount: 40 })],
    ['mind-credits-2', 'Courtier', '+20 % de crédits', 320, s => ({ ...s, creditMult: s.creditMult + 0.2 })],
    ['mind-bounty-1', 'Prime de contrat', 'Bonus de victoire x2', 600, s => ({ ...s, bossBonusMult: s.bossBonusMult * 2 })],
  ]),
];
