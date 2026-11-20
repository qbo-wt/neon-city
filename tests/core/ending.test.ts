import { describe, it, expect } from 'vitest';
import { ENDING_TIERS, TIER_LOOK, endingAfterRun, endingTier, lookUnlocked } from '../../src/core/ending';
import { ENDINGS } from '../../src/data/ending';
import { defaultSave, loadSave, writeSave, SAVE_KEY } from '../../src/core/save';
import { defaultSettings, loadSettings, SETTINGS_KEY } from '../../src/core/settings';

const win = (mode: 'normal' | 'cyberhard', heat = 0, daily = false) => ({ mode, heat, victory: true, daily });

describe('ending tiers', () => {
  it('maps a winning run to its tier', () => {
    expect(endingTier({ mode: 'normal', heat: 0 })).toBe('normal');
    expect(endingTier({ mode: 'cyberhard', heat: 0 })).toBe('cyberhard');
    expect(endingTier({ mode: 'cyberhard', heat: 3 })).toBe('wanted');
    expect(endingTier({ mode: 'cyberhard', heat: 3, daily: true })).toBe('cyberhard');
  });
  it('every tier has its own text and its own look', () => {
    expect(new Set(ENDING_TIERS.map(t => ENDINGS[t].chapter)).size).toBe(3);
    expect(new Set(ENDING_TIERS.map(t => TIER_LOOK[t])).size).toBe(3);
    for (const t of ENDING_TIERS) expect(ENDINGS[t].beats).toHaveLength(4);
  });
});

describe('ending unlocks', () => {
  it('the first win of a tier unlocks it, a later win does not announce again', () => {
    const first = endingAfterRun([], win('normal'));
    expect(first).toEqual({ done: ['normal'], fresh: 'normal' });
    const again = endingAfterRun(first.done, win('normal'));
    expect(again.fresh).toBeUndefined();
    expect(again.done).toEqual(['normal']);
  });
  it('each tier unlocks on its own first win', () => {
    let done = endingAfterRun([], win('normal')).done;
    const ch = endingAfterRun(done, win('cyberhard'));
    expect(ch.fresh).toBe('cyberhard');
    const wanted = endingAfterRun(ch.done, win('cyberhard', 4));
    expect(wanted.fresh).toBe('wanted');
    expect(wanted.done).toEqual(['normal', 'cyberhard', 'wanted']);
    done = wanted.done;
    expect(endingAfterRun(done, win('cyberhard', 6)).fresh).toBeUndefined();
  });
  it('a defeat or a daily win unlocks nothing', () => {
    expect(endingAfterRun([], { mode: 'normal', heat: 0, victory: false })).toEqual({ done: [] });
    expect(endingAfterRun([], win('cyberhard', 0, true))).toEqual({ done: [] });
  });
  it('a look is available only once its tier is beaten', () => {
    expect(lookUnlocked([], 'none')).toBe(true);
    expect(lookUnlocked([], 'cyan')).toBe(false);
    expect(lookUnlocked(['normal'], 'cyan')).toBe(true);
    expect(lookUnlocked(['normal'], 'gold')).toBe(false);
    expect(lookUnlocked(['wanted'], 'gold')).toBe(true);
  });
});

describe('ending persistence', () => {
  const store = (init: Record<string, string> = {}) => {
    const m = new Map(Object.entries(init));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it('the save keeps the tiers beaten, drops junk, and old saves start empty', () => {
    const s = store();
    writeSave(s, { ...defaultSave(), endings: ['normal', 'wanted'] });
    expect(loadSave(s).endings).toEqual(['normal', 'wanted']);
    const raw = JSON.parse(s.getItem(SAVE_KEY)!);
    expect(loadSave(store({ [SAVE_KEY]: JSON.stringify({ ...raw, endings: ['normal', 'normal', 'ghost', 4] }) })).endings).toEqual(['normal']);
    delete raw.endings;
    expect(loadSave(store({ [SAVE_KEY]: JSON.stringify(raw) })).endings).toEqual([]);
  });
  it('the chosen look lives in the settings, invalid values fall back', () => {
    expect(loadSettings(store({ [SETTINGS_KEY]: JSON.stringify({ ...defaultSettings(), look: 'magenta' }) })).look).toBe('magenta');
    expect(loadSettings(store({ [SETTINGS_KEY]: JSON.stringify({ ...defaultSettings(), look: 'pink' }) })).look).toBe('none');
  });
});
