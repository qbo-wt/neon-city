/**
 * Fixer contracts: a challenge on the next combat sector, paid on success.
 * Pure so the rules are tested apart from the scene.
 */
export type ContractKind = 'nohit' | 'speed' | 'parry';
export type ContractReward = 'credits' | 'implant-rare' | 'implant-epic';

export interface Contract { kind: ContractKind; target: number; reward: ContractReward; amount: number }

/** What the scene measured during the contracted sector. */
export interface SectorTally { hitsTaken: number; timeMs: number; parries: number }

export const CONTRACTS: Contract[] = [
  { kind: 'nohit', target: 0, reward: 'implant-rare', amount: 0 },
  { kind: 'speed', target: 45000, reward: 'credits', amount: 30 },
  { kind: 'parry', target: 3, reward: 'implant-epic', amount: 0 },
];

export function contractText(c: Contract): string {
  const goal = c.kind === 'nohit' ? 'Nettoie le prochain secteur sans prendre un seul coup'
    : c.kind === 'speed' ? `Nettoie le prochain secteur en moins de ${Math.round(c.target / 1000)} s`
      : `Réussis ${c.target} parades parfaites dans le prochain secteur`;
  const pay = c.reward === 'credits' ? `${c.amount}¢` : c.reward === 'implant-rare' ? 'un implant rare ou mieux' : 'un implant épique';
  return `${goal}. Prime : ${pay}.`;
}

export function contractMet(c: Contract, t: SectorTally): boolean {
  if (c.kind === 'nohit') return t.hitsTaken <= c.target;
  if (c.kind === 'speed') return t.timeMs <= c.target;
  return t.parries >= c.target;
}

/** Live progress line for the HUD. */
export function contractProgress(c: Contract, t: SectorTally): string {
  if (c.kind === 'nohit') return t.hitsTaken ? 'CONTRAT ÉCHOUÉ' : 'CONTRAT : aucun coup reçu';
  if (c.kind === 'speed') {
    const left = Math.max(0, Math.ceil((c.target - t.timeMs) / 1000));
    return left ? `CONTRAT : ${left} s` : 'CONTRAT ÉCHOUÉ';
  }
  return `CONTRAT : parades ${Math.min(t.parries, c.target)}/${c.target}`;
}
