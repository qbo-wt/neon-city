import type { AiKind } from '../tactics/types';

export type EnemyId = 'runner' | 'gunner' | 'brute' | 'drone' | 'bomber' | 'hacker' | 'warden' | 'boss';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  credits: number;
  hp: number;
  pa: number;
  pm: number;
  init: number;
  tackle: number;
  dodge: number;
  /** damage reduction, 0.1 = -10 % */
  res: number;
  ai: AiKind;
  spells: string[];
  boss?: boolean;
  /** bosses: PA / PM / damage bonus below 50 % and below 25 % HP */
  phases?: { pa: number; pm: number; dmg: number }[];
}

/** The street's fighters, in turn-based terms. Spells live in data/spells. */
export const ENEMIES: Record<EnemyId, EnemyDef> = {
  runner: { id: 'runner', name: 'Punk à lame', credits: 1, hp: 28, pa: 6, pm: 4, init: 90, tackle: 1, dodge: 0, res: 0, ai: 'melee', spells: ['e-knife'] },
  gunner: { id: 'gunner', name: 'Tireur des Rats', credits: 1, hp: 24, pa: 6, pm: 3, init: 70, tackle: 0, dodge: 1, res: 0, ai: 'ranged', spells: ['e-shot'] },
  brute: { id: 'brute', name: 'Colosse chromé', credits: 3, hp: 56, pa: 7, pm: 3, init: 50, tackle: 2, dodge: 0, res: 0.1, ai: 'melee', spells: ['e-hammer', 'e-rush'] },
  drone: { id: 'drone', name: 'Drone de surveillance', credits: 1, hp: 18, pa: 4, pm: 5, init: 120, tackle: 0, dodge: 2, res: 0, ai: 'ranged', spells: ['e-burst'] },
  bomber: { id: 'bomber', name: 'Kamikaze chimique', credits: 1, hp: 22, pa: 4, pm: 5, init: 110, tackle: 0, dodge: 1, res: 0, ai: 'bomber', spells: ['e-prime', 'e-claw'] },
  hacker: { id: 'hacker', name: 'Netrunner pirate', credits: 2, hp: 26, pa: 6, pm: 3, init: 80, tackle: 0, dodge: 1, res: 0, ai: 'coward', spells: ['e-hack', 'e-jam', 'e-patch'] },
  warden: { id: 'warden', name: 'Lieutenant des Rats', credits: 15, hp: 110, pa: 7, pm: 3, init: 95, tackle: 2, dodge: 1, res: 0.1, ai: 'boss', boss: true,
    spells: ['b-butt', 'b-barrage', 'b-call', 'b-charge'], phases: [{ pa: 0, pm: 1, dmg: 0.1 }, { pa: 1, pm: 0, dmg: 0.15 }] },
  boss: { id: 'boss', name: 'Exécuteur Psy-Sec', credits: 20, hp: 200, pa: 8, pm: 3, init: 100, tackle: 2, dodge: 2, res: 0.15, ai: 'boss', boss: true,
    spells: ['x-blade', 'x-ray', 'x-wave', 'x-blink', 'x-drones'], phases: [{ pa: 1, pm: 0, dmg: 0.1 }, { pa: 1, pm: 1, dmg: 0.15 }] },
};
