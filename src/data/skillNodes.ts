import type { SkillNode } from '../core/types';

export const SKILL_NODES: SkillNode[] = [
  // Body column
  { id: 'body-hp-1', name: 'Carcasse renforcée', description: '+20 vie max', cost: 30, column: 0,
    modify: s => ({ ...s, maxHp: s.maxHp + 20 }) },
  { id: 'body-dmg-1', name: 'Poings lestés', description: '+3 dégâts', cost: 60, column: 0, requires: 'body-hp-1',
    modify: s => ({ ...s, damage: s.damage + 3 }) },
  { id: 'body-dash-1', name: 'Tendons fibrés', description: '+1 charge de dash', cost: 120, column: 0, requires: 'body-dmg-1',
    modify: s => ({ ...s, dashCharges: s.dashCharges + 1 }) },
  { id: 'body-hp-2', name: 'Ossature carbone', description: '+40 vie max', cost: 200, column: 0, requires: 'body-dash-1',
    modify: s => ({ ...s, maxHp: s.maxHp + 40 }) },
  // Mind column
  { id: 'mind-resist-1', name: 'Méditation', description: '-15 % de psychose gagnée', cost: 40, column: 1,
    modify: s => ({ ...s, psyResist: s.psyResist + 0.15 }) },
  { id: 'mind-credits-1', name: 'Réseau de fixers', description: '+25 % de crédits', cost: 70, column: 1, requires: 'mind-resist-1',
    modify: s => ({ ...s, creditMult: s.creditMult + 0.25 }) },
  { id: 'mind-load-1', name: 'Firmware stable', description: '-20 % de charge des implants', cost: 130, column: 1, requires: 'mind-credits-1',
    modify: s => ({ ...s, implantLoadMult: s.implantLoadMult * 0.8 }) },
  { id: 'mind-resist-2', name: 'Ancre d\'humanité', description: '-20 % de psychose gagnée', cost: 220, column: 1, requires: 'mind-load-1',
    modify: s => ({ ...s, psyResist: s.psyResist + 0.2 }) },
];
