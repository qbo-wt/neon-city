import { describe, it, expect } from 'vitest';
import { LEGACY_MUTE_KEY, SETTINGS_KEY, defaultSettings, loadSettings, writeSettings, type Settings } from '../../src/core/settings';

function fake(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('settings', () => {
  it('defaults: full volumes, sound on, normal speed, full screen effects', () => {
    expect(loadSettings(fake())).toEqual({ version: 1, music: 10, sfx: 10, muted: false, speed: 'normal', reduceFx: false, quality: 'auto' });
  });

  it('round-trips', () => {
    const s = fake();
    const v: Settings = { version: 1, music: 3, sfx: 7, muted: true, speed: 'faster', reduceFx: true, quality: 'low' };
    writeSettings(s, v);
    expect(loadSettings(s)).toEqual(v);
  });

  it('keeps the mute of players from before the options menu', () => {
    expect(loadSettings(fake({ [LEGACY_MUTE_KEY]: '1' })).muted).toBe(true);
    expect(loadSettings(fake({ [LEGACY_MUTE_KEY]: '0' })).muted).toBe(false);
  });

  it('a saved choice wins over the legacy mute', () => {
    const s = fake({ [LEGACY_MUTE_KEY]: '1', [SETTINGS_KEY]: JSON.stringify({ ...defaultSettings(), muted: false }) });
    expect(loadSettings(s).muted).toBe(false);
  });

  it('fills missing fields and replaces invalid ones with defaults, keeping the valid ones', () => {
    const s = fake({ [SETTINGS_KEY]: JSON.stringify({ music: 4, sfx: 'loud', speed: 'warp', reduceFx: 1, quality: 'ultra' }) });
    expect(loadSettings(s)).toEqual({ ...defaultSettings(), music: 4 });
  });

  it('clamps and rounds volumes to the 10 % steps', () => {
    const s = fake({ [SETTINGS_KEY]: JSON.stringify({ music: 14, sfx: -2.6 }) });
    expect(loadSettings(s)).toMatchObject({ music: 10, sfx: 0 });
    expect(loadSettings(fake({ [SETTINGS_KEY]: JSON.stringify({ music: 6.4 }) })).music).toBe(6);
  });

  it.each([['invalid json', '{nope'], ['null', 'null'], ['array', '[1,2]']])('falls back to defaults on %s', (_n, raw) => {
    expect(loadSettings(fake({ [SETTINGS_KEY]: raw }))).toEqual(defaultSettings());
  });

  it('never throws when storage does', () => {
    const broken = { getItem: () => { throw new Error('blocked'); } };
    expect(loadSettings(broken)).toEqual(defaultSettings());
    expect(() => writeSettings({ setItem: () => { throw new Error('full'); } }, defaultSettings())).not.toThrow();
  });
});
