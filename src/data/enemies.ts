export type EnemyId = 'runner' | 'gunner' | 'brute' | 'boss';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  behavior: 'melee' | 'ranged' | 'charge' | 'boss';
  credits: number;
  /** wind-up before an attack, the window the player reads to parry or dash */
  telegraphMs: number;
  /** hitbox radius in px */
  radius: number;
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  runner: { id: 'runner', name: 'Punk à lame', hp: 24, speed: 70, damage: 8, behavior: 'melee', credits: 3, telegraphMs: 320, radius: 6 },
  gunner: { id: 'gunner', name: 'Tireur des Rats', hp: 18, speed: 45, damage: 7, behavior: 'ranged', credits: 4, telegraphMs: 450, radius: 6 },
  brute: { id: 'brute', name: 'Colosse chromé', hp: 60, speed: 40, damage: 16, behavior: 'charge', credits: 8, telegraphMs: 600, radius: 9 },
  boss: { id: 'boss', name: 'Exécuteur Psy-Sec', hp: 420, speed: 55, damage: 14, behavior: 'boss', credits: 40, telegraphMs: 550, radius: 13 },
};
