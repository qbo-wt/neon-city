import type { Pt } from './types';

/**
 * Things painted on the floor of an arena. They do not block: they act on whoever steps on them.
 * shock: live cable, damage on entering and at the start of a turn on it.
 * acid: chemical puddle, corrosion (damage over 2 turns) on entering and at the start of a turn on it.
 * steam: vent that erupts one round in `period`; while it erupts, like shock but harder.
 * medkit: one-use healing station for the first creature that steps on it.
 * relay: one-use network plug, +2 PA for the runner who steps on it.
 */
export type HazardKind = 'shock' | 'acid' | 'steam' | 'medkit' | 'relay';

export interface Hazard {
  kind: HazardKind;
  x: number;
  y: number;
  /** damage (shock, steam), corrosion per turn (acid), HP healed (medkit), PA given (relay) */
  v: number;
  /** steam: erupts on the rounds where (round + phase) % period === 0 */
  period?: number;
  phase?: number;
  /** removed at the start of the first turn of this round (hazards laid during a fight) */
  until?: number;
}

/** What hazards need to know about a fight: kept apart from fight.ts so both can import it. */
export interface HazardState { hazards?: Hazard[]; round: number }

export const HAZARD_NAMES: Record<HazardKind, string> = {
  shock: 'Sol électrifié', acid: 'Flaque chimique', steam: 'Bouche de vapeur', medkit: 'Borne de soin', relay: 'Terminal piratable',
};
export const HAZARD_COLORS: Record<HazardKind, number> = {
  shock: 0x00f0ff, acid: 0xb84dff, steam: 0xff8c2a, medkit: 0x39ff88, relay: 0xf5e663,
};
/** Base values before the sector depth scaling. */
export const HAZARD_BASE: Record<HazardKind, number> = { shock: 7, acid: 4, steam: 12, medkit: 18, relay: 2 };
export const STEAM_PERIOD = 3;

export const hazardAt = (f: HazardState, p: Pt) => f.hazards?.find(h => h.x === p.x && h.y === p.y);

/** Does a steam vent erupt during `round`? */
export const steamActive = (h: Hazard, round: number) => (round + (h.phase ?? 0)) % (h.period ?? STEAM_PERIOD) === 0;

/** Rounds before a vent erupts (0: it erupts this round). */
export function steamIn(h: Hazard, round: number) {
  for (let i = 0; i < (h.period ?? STEAM_PERIOD); i++) if (steamActive(h, round + i)) return i;
  return 0;
}

/** Does stepping on this hazard during `round` hurt? */
export const hurtsAt = (h: Hazard | undefined, round: number) =>
  !!h && (h.kind === 'shock' || h.kind === 'acid' || (h.kind === 'steam' && steamActive(h, round)));

/** Cells worth walking around, as a path tie-break (same PM, fewer traps). */
export const hazardPenalty = (f: HazardState, p: Pt) => (hurtsAt(hazardAt(f, p), f.round) ? 1 : 0);

/** One line about a hazard, for the tooltip. */
export function hazardText(h: Hazard, round: number): string {
  switch (h.kind) {
    case 'shock': return `${h.v} dégâts en entrant et au début d'un tour dessus.`;
    case 'acid': return `Corrosion : ${h.v} dégâts par tour pendant 2 tours, en entrant ou en commençant un tour dedans.`;
    case 'steam': {
      const n = steamIn(h, round);
      return `${n === 0 ? 'ÉRUPTION CE ROUND' : n === 1 ? 'Éruption au prochain round' : `Éruption dans ${n} rounds`} : ${h.v} dégâts en entrant ou au début d'un tour dessus pendant l'éruption.`;
    }
    case 'medkit': return `Usage unique : +${h.v} PV à la première créature qui marche dessus (ennemis compris).`;
    case 'relay': return `Usage unique : +${h.v} PA pour toi en marchant dessus (les ennemis l'ignorent).`;
  }
}
