/**
 * Sector challenges: before a fight the player may take one of two, and is paid if it holds until
 * the last enemy falls. The rules that check them live in core/challenges.ts; this is the wording
 * and the difficulty (which sets the pay).
 */
export type ChallengeId =
  | 'intact' | 'rapide' | 'variete' | 'lame' | 'pied_ferme' | 'colosse' | 'signal'
  | 'fauchage' | 'economie' | 'main_nue' | 'distance' | 'egratignures' | 'sol' | 'sang_froid';

export interface ChallengeDef {
  id: ChallengeId;
  name: string;
  /** 1 easy, 2 medium, 3 hard */
  difficulty: 1 | 2 | 3;
  /** only offered when psychosis exists (CyberHard) */
  psyOnly?: boolean;
  /** one short line; `n` is the number the rule was set to for this sector */
  text: (n: number) => string;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'intact', name: 'Intouchable', difficulty: 3, text: () => 'Gagne sans perdre un seul PV.' },
  { id: 'rapide', name: 'Coup de vent', difficulty: 2, text: n => `Gagne en ${n} rounds ou moins.` },
  { id: 'variete', name: 'Jamais deux fois', difficulty: 2, text: () => 'Jamais le même sort deux lancers de suite.' },
  { id: 'lame', name: 'Au tranchant', difficulty: 1, text: () => 'Achève un ennemi avec un sort de mêlée.' },
  { id: 'pied_ferme', name: 'Pied ferme', difficulty: 3, text: () => 'Ne bouge pas de ta case de départ.' },
  { id: 'colosse', name: "Le colosse d'abord", difficulty: 2, text: () => 'Le premier à tomber : le colosse chromé.' },
  { id: 'signal', name: 'Coupe le signal', difficulty: 2, text: () => 'Le premier à tomber : le netrunner.' },
  { id: 'fauchage', name: 'Fauchage', difficulty: 2, text: () => 'Abats 2 ennemis dans un même tour.' },
  { id: 'economie', name: 'Chargeur compté', difficulty: 2, text: n => `Lance ${n} sorts au plus pendant le combat.` },
  { id: 'main_nue', name: 'Rien à distance', difficulty: 2, text: () => 'Aucun sort à distance : mêlée seulement.' },
  { id: 'distance', name: 'Pas de contact', difficulty: 2, text: () => 'Aucun sort de mêlée : tire de loin.' },
  { id: 'egratignures', name: 'Égratignures', difficulty: 1, text: n => `Perds ${n} PV au plus pendant le combat.` },
  { id: 'sol', name: 'Œil sur le sol', difficulty: 2, text: () => 'Ne marche sur aucun piège.' },
  { id: 'sang_froid', name: 'Sang-froid', difficulty: 2, psyOnly: true, text: n => `Ne gagne pas plus de ${n} de psychose.` },
];

export const CHALLENGE_BY_ID = new Map(CHALLENGES.map(c => [c.id, c] as const));
