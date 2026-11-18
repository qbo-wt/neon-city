import { getStorage } from './storage';
import { cleanName } from './ranking';

/**
 * Who you are on the friends' leaderboard. Own storage key, apart from the progress save (scenes hold
 * a copy of the save and write it back whole, which would erase a name set mid-scene).
 */
export const PLAYER_KEY = 'neon-city-player';

export interface PlayerProfile {
  /** '' until the player has picked one */
  name: string;
  /** true: runs are not sent to the leaderboard */
  optOut: boolean;
}

export function loadProfile(storage: Pick<Storage, 'getItem'>): PlayerProfile {
  const p: PlayerProfile = { name: '', optOut: false };
  try {
    const d = JSON.parse(storage.getItem(PLAYER_KEY) ?? 'null') as Record<string, unknown> | null;
    if (d && typeof d === 'object') {
      p.name = cleanName(d.name) ?? '';
      p.optOut = d.optOut === true;
    }
  } catch { /* corrupt or blocked storage: no name yet */ }
  return p;
}

let current: PlayerProfile | undefined;
const profile = () => (current ??= loadProfile(getStorage()));

export const playerName = () => profile().name;
export const isOptedOut = () => profile().optOut;
/** True when a finished run should be sent: a name is set and the player did not opt out. */
export const canRank = () => !!profile().name && !profile().optOut;

function save(p: PlayerProfile) {
  current = p;
  try { getStorage().setItem(PLAYER_KEY, JSON.stringify(p)); } catch { /* the choice holds for this session */ }
}

/** Stores a name; returns the cleaned one, or null if it is not acceptable. */
export function setPlayerName(name: string): string | null {
  const n = cleanName(name);
  if (n) save({ ...profile(), name: n });
  return n;
}
export const setOptOut = (optOut: boolean) => save({ ...profile(), optOut });

/** True while a text box has the keyboard: global one-key shortcuts (M for mute...) must stand down. */
export const typing = { active: false };
