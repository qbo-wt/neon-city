/**
 * Fixer contracts: a challenge on the next combat sector, paid on success.
 * Pure so the rules are tested apart from the scene.
 */
export type ContractKind = 'nohit' | 'speed' | 'multikill';
export type ContractReward = 'credits' | 'implant-rare' | 'implant-epic';

export interface Contract { kind: ContractKind; target: number; reward: ContractReward; amount: number }

/** What the scene measured during the contracted sector. */
export interface SectorTally { hitsTaken: number; rounds: number; bestTurnKills: number }

export const CONTRACTS: Contract[] = [
  { kind: 'nohit', target: 0, reward: 'implant-rare', amount: 0 },
  { kind: 'speed', target: 3, reward: 'credits', amount: 30 },
  { kind: 'multikill', target: 2, reward: 'implant-epic', amount: 0 },
];

export function contractText(c: Contract): string {
  const goal = c.kind === 'nohit' ? 'Gagne le prochain combat sans perdre un seul PV'
    : c.kind === 'speed' ? `Gagne le prochain combat en ${c.target} rounds ou moins`
      : `Élimine ${c.target} ennemis dans un même tour au prochain combat`;
  const pay = c.reward === 'credits' ? `${c.amount}¢` : c.reward === 'implant-rare' ? 'un implant rare ou mieux' : 'un implant épique';
  return `${goal}. Prime : ${pay}.`;
}

export function contractMet(c: Contract, t: SectorTally): boolean {
  if (c.kind === 'nohit') return t.hitsTaken <= c.target;
  if (c.kind === 'speed') return t.rounds <= c.target;
  return t.bestTurnKills >= c.target;
}

/** Live progress line for the HUD. */
export function contractProgress(c: Contract, t: SectorTally): string {
  if (c.kind === 'nohit') return t.hitsTaken ? 'CONTRAT ÉCHOUÉ' : 'CONTRAT : aucun PV perdu';
  if (c.kind === 'speed') return t.rounds > c.target ? 'CONTRAT ÉCHOUÉ' : `CONTRAT : round ${t.rounds}/${c.target}`;
  return t.bestTurnKills >= c.target ? 'CONTRAT REMPLI' : `CONTRAT : ${t.bestTurnKills}/${c.target} éliminations en un tour`;
}
