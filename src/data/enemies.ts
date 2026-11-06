export type EnemyId = 'runner' | 'gunner' | 'brute' | 'drone' | 'bomber' | 'hacker' | 'warden' | 'boss';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  behavior: 'melee' | 'ranged' | 'charge' | 'burst' | 'explode' | 'hack' | 'boss';
  /** psychosis added to the player when this enemy's shot lands (quickhacks) */
  psyOnHit?: number;
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
  drone: { id: 'drone', name: 'Drone de surveillance', hp: 14, speed: 75, damage: 6, behavior: 'burst', credits: 1, telegraphMs: 380, radius: 5 },
  bomber: { id: 'bomber', name: 'Kamikaze chimique', hp: 16, speed: 95, damage: 26, behavior: 'explode', credits: 1, telegraphMs: 480, radius: 6 },
  hacker: { id: 'hacker', name: 'Netrunner pirate', hp: 22, speed: 40, damage: 5, behavior: 'hack', credits: 2, telegraphMs: 700, radius: 6, psyOnHit: 8 },
  warden: { id: 'warden', name: 'Lieutenant des Rats', hp: 720, speed: 64, damage: 19, behavior: 'boss', credits: 15, telegraphMs: 480, radius: 13 },
  boss: { id: 'boss', name: 'Exécuteur Psy-Sec', hp: 1250, speed: 68, damage: 23, behavior: 'boss', credits: 20, telegraphMs: 460, radius: 13 },
};
