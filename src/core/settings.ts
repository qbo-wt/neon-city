import { getStorage } from './storage';

/**
 * Player options (sound, fight speed, screen effects). Kept under their own storage key, apart from
 * the progress save: scenes hold a copy of the save and write it back whole, so options changed
 * mid-scene would be overwritten by a stale copy if they lived in it.
 */
export type CombatSpeed = 'normal' | 'fast' | 'faster';

export const COMBAT_SPEEDS: readonly CombatSpeed[] = ['normal', 'fast', 'faster'];
/** Time scale of the fight animations (tweens, timers, 3D body animations) per speed. */
export const SPEED_SCALE: Record<CombatSpeed, number> = { normal: 1, fast: 1.5, faster: 2 };
export const SPEED_LABEL: Record<CombatSpeed, string> = { normal: 'NORMALE', fast: 'RAPIDE', faster: 'TRÈS RAPIDE' };

/**
 * 3D picture quality. 'high': everything every frame. 'low': for small GPUs, the wet-street
 * reflection and the shadow map are redrawn every other frame (one each, in turn), no anti-aliasing
 * pass, at most one 3D pixel per screen pixel on high-density screens. 'auto' starts high and drops
 * to low for the session if the first place runs below ~45 fps (see World3D).
 */
export type GraphicsQuality = 'auto' | 'high' | 'low';
export const QUALITIES: readonly GraphicsQuality[] = ['auto', 'high', 'low'];
export const QUALITY_LABEL: Record<GraphicsQuality, string> = { auto: 'AUTO', high: 'HAUTE', low: 'BASSE' };

/** Volume steps: 0..VOLUME_STEPS, each one is 10 %. */
export const VOLUME_STEPS = 10;

export interface Settings {
  version: 1;
  /** music volume, 0..VOLUME_STEPS (10 = the level the tracks were mixed at) */
  music: number;
  /** sound effects volume, 0..VOLUME_STEPS */
  sfx: number;
  /** everything silent (the M key) */
  muted: boolean;
  speed: CombatSpeed;
  /** accessibility: no camera shake, no full-screen flash or negative frame */
  reduceFx: boolean;
  quality: GraphicsQuality;
}

export const SETTINGS_KEY = 'neon-city-settings';
/** Before the options menu, only the mute state was stored, under this key. */
export const LEGACY_MUTE_KEY = 'neon-city-muted';

export function defaultSettings(): Settings {
  return { version: 1, music: VOLUME_STEPS, sfx: VOLUME_STEPS, muted: false, speed: 'normal', reduceFx: false, quality: 'auto' };
}

const step = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(VOLUME_STEPS, Math.round(v))) : fallback;

/** Never throws: each missing or invalid field falls back to its default (an older or damaged copy keeps the rest). */
export function loadSettings(storage: Pick<Storage, 'getItem'>): Settings {
  const s = defaultSettings();
  try {
    const legacy = storage.getItem(LEGACY_MUTE_KEY);
    if (legacy === '1') s.muted = true;
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return s;
    const d = JSON.parse(raw) as Record<string, unknown> | null;
    if (!d || typeof d !== 'object' || Array.isArray(d)) return s;
    s.music = step(d.music, s.music);
    s.sfx = step(d.sfx, s.sfx);
    if (typeof d.muted === 'boolean') s.muted = d.muted;
    if (typeof d.speed === 'string' && (COMBAT_SPEEDS as readonly string[]).includes(d.speed)) s.speed = d.speed as CombatSpeed;
    if (typeof d.reduceFx === 'boolean') s.reduceFx = d.reduceFx;
    if (typeof d.quality === 'string' && (QUALITIES as readonly string[]).includes(d.quality)) s.quality = d.quality as GraphicsQuality;
  } catch {
    // Corrupt JSON or blocked storage: defaults (plus the legacy mute, if it could be read).
  }
  return s;
}

export function writeSettings(storage: Pick<Storage, 'setItem'>, s: Settings): void {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked or full: the options hold for this session only.
  }
}

// ---------- live settings, shared by the whole game ----------

let current: Settings | undefined;
const listeners = new Set<(s: Settings) => void>();

/** The options in effect (loaded from storage on first use). */
export function settings(): Readonly<Settings> {
  return (current ??= loadSettings(getStorage()));
}

/** Changes some options, saves them and tells every listener (audio, open panels). */
export function updateSettings(patch: Partial<Omit<Settings, 'version'>>): Readonly<Settings> {
  const next: Settings = { ...settings(), ...patch, version: 1 };
  next.music = step(next.music, VOLUME_STEPS);
  next.sfx = step(next.sfx, VOLUME_STEPS);
  current = next;
  writeSettings(getStorage(), next);
  listeners.forEach(l => l(next));
  return next;
}

/** Calls `l` on every change; returns the unsubscribe function. */
export function onSettingsChange(l: (s: Settings) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Time scale for the fight animations. */
export const combatTimeScale = () => SPEED_SCALE[settings().speed];
