import type { Relic } from '../core/types';

/** Rare finds hidden in breakable objects. Kept for the rest of the run, no psychosis load. */
export const RELICS: Relic[] = [
  { id: 'katana', name: 'Katana « Lune Rouge »', description: '+8 dégâts, +40 % de portée, +10 % de critique', texture: 'relic-katana',
    modify: s => ({ ...s, damage: s.damage + 8, rangeMult: s.rangeMult * 1.4, critChance: s.critChance + 0.1 }) },
  { id: 'pistols', name: 'Pistolets jumeaux dorés', description: 'Chaque coup tire aussi une balle dorée vers le curseur', texture: 'relic-pistols',
    modify: s => ({ ...s, gunDamage: Math.max(s.gunDamage, 0.7) }) },
];
