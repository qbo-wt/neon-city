import type { Implant } from '../core/types';

export const IMPLANTS: Implant[] = [
  { id: 'arm-blades', name: 'Lames Faucheuses', description: '+6 dégâts', load: 14,
    modify: s => ({ ...s, damage: s.damage + 6 }) },
  { id: 'reinforced-legs', name: 'Jambes Ressort', description: '+1 charge de dash', load: 10,
    modify: s => ({ ...s, dashCharges: s.dashCharges + 1 }) },
  { id: 'aim-optics', name: 'Optique Hawk-9', description: '+15 % de critique', load: 8,
    modify: s => ({ ...s, critChance: s.critChance + 0.15 }) },
  { id: 'dermal-armor', name: 'Dermo-blindage', description: '+30 vie max', load: 12,
    modify: s => ({ ...s, maxHp: s.maxHp + 30 }) },
  { id: 'boosted-reflexes', name: 'Réflexes Synapse', description: '+20 % vitesse', load: 9,
    modify: s => ({ ...s, speed: s.speed * 1.2 }) },
  { id: 'neural-coproc', name: 'Coprocesseur Neural', description: '+20 % dégâts', load: 11,
    modify: s => ({ ...s, damage: s.damage * 1.2 }) },
  { id: 'adrenal-pump', name: 'Pompe Adrénale', description: '+15 % vitesse, +4 dégâts', load: 18,
    modify: s => ({ ...s, speed: s.speed * 1.15, damage: s.damage + 4 }) },
  { id: 'subdermal-plate', name: 'Plaque Sous-cutanée', description: '+15 vie max', load: 4,
    modify: s => ({ ...s, maxHp: s.maxHp + 15 }) },
];
