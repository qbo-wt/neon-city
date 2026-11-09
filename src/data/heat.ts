/**
 * Notoriety (unlocked after a first victory): voluntary handicaps that pay more credits.
 * Each pact has ranks; every rank is worth `points` of notoriety.
 */
export type HeatId = 'armor' | 'rage' | 'reflex' | 'nomercy' | 'smog' | 'squads' | 'bosses';

export interface HeatPact { id: HeatId; name: string; description: string; max: number; points: number }

export const HEAT_PACTS: HeatPact[] = [
  { id: 'armor', name: 'Ennemis blindés', description: '+25 % de vie ennemie par rang', max: 2, points: 1 },
  { id: 'rage', name: 'Ennemis enragés', description: '+20 % de dégâts ennemis par rang', max: 2, points: 1 },
  { id: 'reflex', name: 'Réflexes corpo', description: 'Ennemis : +1 PM et +20 initiative', max: 1, points: 2 },
  { id: 'nomercy', name: 'Pas de pitié', description: 'Tous les soins réduits de 50 %', max: 1, points: 2 },
  { id: 'smog', name: 'Air vicié', description: 'Psychose passive +40 % par rang', max: 2, points: 1 },
  { id: 'squads', name: 'Escouades', description: 'Un secteur sur trois devient un secteur d\'élite', max: 1, points: 2 },
  { id: 'bosses', name: 'Têtes d\'affiche', description: 'Boss +30 % de vie et +1 PA', max: 1, points: 2 },
];

export const HEAT_IDS = HEAT_PACTS.map(p => p.id);
export type HeatRanks = Partial<Record<HeatId, number>>;

export function heatPoints(r: HeatRanks): number {
  return HEAT_PACTS.reduce((sum, p) => sum + Math.min(p.max, Math.max(0, r[p.id] ?? 0)) * p.points, 0);
}

export const MAX_HEAT = HEAT_PACTS.reduce((s, p) => s + p.max * p.points, 0);

/** Credits multiplier at a notoriety level: +10 % per point. */
export const heatCreditMult = (points: number) => 1 + 0.1 * points;

/** One-off bonus for winning at a notoriety above your previous best. */
export const heatRecordBonus = (points: number, best: number) => Math.max(0, points - best) * 40;

/** Enemy scaling and run rules for a notoriety setting. */
export function heatEffects(r: HeatRanks) {
  const n = (id: HeatId) => r[id] ?? 0;
  return {
    hpMult: 1 + 0.25 * n('armor'),
    damageMult: 1 + 0.2 * n('rage'),
    pmBonus: n('reflex') ? 1 : 0,
    initBonus: n('reflex') ? 20 : 0,
    healMult: n('nomercy') ? 0.5 : 1,
    psyRateMult: 1 + 0.4 * n('smog'),
    squads: n('squads') > 0,
    bossHpMult: n('bosses') ? 1.3 : 1,
    bossPaBonus: n('bosses') ? 1 : 0,
  };
}
