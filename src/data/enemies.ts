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
  runner: { id: 'runner', name: 'Punk à lame', hp: 26, speed: 82, damage: 12, behavior: 'melee', credits: 1, telegraphMs: 300, radius: 6 },
  gunner: { id: 'gunner', name: 'Tireur des Rats', hp: 20, speed: 50, damage: 10, behavior: 'ranged', credits: 1, telegraphMs: 420, radius: 6 },
  brute: { id: 'brute', name: 'Colosse chromé', hp: 70, speed: 46, damage: 22, behavior: 'charge', credits: 3, telegraphMs: 560, radius: 9 },
  boss: { id: 'boss', name: 'Exécuteur Psy-Sec', hp: 520, speed: 60, damage: 18, behavior: 'boss', credits: 20, telegraphMs: 520, radius: 13 },
};
