import type { Relic } from '../core/types';

/** Rare finds hidden in breakable objects. Kept for the rest of the run, no psychosis load. */
export const RELICS: Relic[] = [
  { id: 'katana', name: 'Katana « Lune Rouge »', description: '+3 dégâts sur chaque coup, +1 portée, +10 % de critique', texture: 'relic-katana',
    modify: s => ({ ...s, damage: s.damage + 3, range: s.range + 1, critChance: s.critChance + 0.1 }) },
  { id: 'pistols', name: 'Pistolets jumeaux dorés', description: 'Sort Tir doré : deux tirs à 2 PA par tour', texture: 'relic-pistols',
    modify: s => s, spell: 'goldshot' },
];
