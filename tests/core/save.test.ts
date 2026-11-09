import { describe, it, expect } from 'vitest';
import { defaultSave, loadSave, writeSave, SAVE_KEY, type SaveData } from '../../src/core/save';

function fake(init?: string) {
  const m = new Map<string, string>();
  if (init !== undefined) m.set(SAVE_KEY, init);
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}
const record = { date: 1700000000000, victory: true, sector: 8, kills: 40, damageDealt: 1200, hpHealed: 30, credits: 150, timeMs: 420000 };
const valid: SaveData = { ...defaultSave(), credits: 120, ownedNodes: ['body-hp-1'], runs: 3, bestRoom: 5, history: [record] };

describe('save', () => {
  it('round-trips', () => {
    const s = fake();
    writeSave(s, valid);
    expect(loadSave(s)).toEqual(valid);
  });
  it.each([
    ['missing', undefined],
    ['invalid json', '{nope'],
    ['wrong version', JSON.stringify({ ...valid, version: 2 })],
    ['negative credits', JSON.stringify({ ...valid, credits: -5 })],
    ['string credits', JSON.stringify({ ...valid, credits: '10' })],
    ['ownedNodes not array', JSON.stringify({ ...valid, ownedNodes: 'x' })],
    ['null', 'null'],
  ])('falls back to default on %s', (_n, raw) => {
    expect(loadSave(fake(raw as string | undefined))).toEqual(defaultSave());
  });
  it('filters unknown node ids', () => {
    expect(loadSave(fake(JSON.stringify({ ...valid, ownedNodes: ['body-hp-1', 'ghost'] }))).ownedNodes).toEqual(['body-hp-1']);
  });
  it('keeps progress from saves made before run history existed', () => {
    const { history: _h, ...old } = valid;
    const s = loadSave(fake(JSON.stringify(old)));
    expect(s.credits).toBe(120);
    expect(s.history).toEqual([]);
  });
  it('drops malformed history entries but keeps the valid ones', () => {
    const s = loadSave(fake(JSON.stringify({ ...valid, history: [record, { date: 'x' }, null, { ...record, kills: -1 }] })));
    expect(s.history).toEqual([record]);
  });
  it('older saves without weapons, codex, notoriety or story load with defaults', () => {
    const old = { version: 1, credits: 50, ownedNodes: [], runs: 2, bestRoom: 3, history: [] };
    expect(loadSave(fake(JSON.stringify(old)))).toEqual({ ...defaultSave(), credits: 50, runs: 2, bestRoom: 3 });
  });
  it('keeps valid new fields and cleans bad ones', () => {
    const s = loadSave(fake(JSON.stringify({
      ...valid, weapons: ['mantis', 'laser'], weapon: 'mantis', codex: { runner: 12, gunner: -1 }, heat: { armor: 5, nope: 1 }, bestHeat: 3,
      daily: [{ date: '2026-11-09', sector: 7, victory: false, timeMs: 1000, kills: 30 }, { date: 'x' }],
      story: { talks: { lo: 3 }, flags: ['gift-lo'], lastRun: { victory: false, sector: 4, killer: 'warden', weapon: 'blade', heat: 0 } },
    })));
    expect(s.weapons).toEqual(['blade', 'mantis']);
    expect(s.weapon).toBe('mantis');
    expect(s.codex).toEqual({ runner: 12 });
    expect(s.heat).toEqual({ armor: 2 });
    expect(s.daily).toHaveLength(1);
    expect(s.story.lastRun?.killer).toBe('warden');
    expect(s.story.talks).toEqual({ lo: 3 });
  });
  it('an equipped weapon that is not unlocked falls back to the blade', () => {
    expect(loadSave(fake(JSON.stringify({ ...valid, weapons: ['blade'], weapon: 'pistol' }))).weapon).toBe('blade');
  });
  it('falls back when storage throws', () => {
    expect(loadSave({ getItem: () => { throw new Error('blocked'); } })).toEqual(defaultSave());
  });
  it('writeSave swallows storage errors', () => {
    expect(() => writeSave({ setItem: () => { throw new Error('full'); } }, valid)).not.toThrow();
  });
});
