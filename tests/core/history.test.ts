import { describe, it, expect } from 'vitest';
import { addRecord, bestCombo, bestFirst, recentFirst, HISTORY_CAP, type RunRecord } from '../../src/core/history';

const rec = (over: Partial<RunRecord>): RunRecord => ({
  date: 0, victory: false, sector: 1, kills: 0, damageDealt: 0, hpHealed: 0, credits: 0, timeMs: 60000, ...over,
});

describe('run history', () => {
  it('recentFirst puts the newest run on top without mutating', () => {
    const h = [rec({ date: 1 }), rec({ date: 3 }), rec({ date: 2 })];
    expect(recentFirst(h).map(r => r.date)).toEqual([3, 2, 1]);
    expect(h.map(r => r.date)).toEqual([1, 3, 2]);
  });
  it('bestFirst ranks victories first, then deeper sector, then faster time', () => {
    const h = [
      rec({ date: 1, sector: 5 }),
      rec({ date: 2, victory: true, sector: 8, timeMs: 500000 }),
      rec({ date: 3, victory: true, sector: 8, timeMs: 300000 }),
      rec({ date: 4, sector: 7, timeMs: 200000 }),
      rec({ date: 5, sector: 7, timeMs: 100000 }),
    ];
    expect(bestFirst(h).map(r => r.date)).toEqual([3, 2, 5, 4, 1]);
  });
  it('addRecord appends and keeps only the newest HISTORY_CAP runs', () => {
    let h: RunRecord[] = [];
    for (let i = 0; i < HISTORY_CAP + 5; i++) h = addRecord(h, rec({ date: i }));
    expect(h).toHaveLength(HISTORY_CAP);
    expect(h[0].date).toBe(5);
    expect(h[h.length - 1].date).toBe(HISTORY_CAP + 4);
  });
});

describe('run record equipment', () => {
  it('an old record without the new fields still loads and the new ones round-trip', async () => {
    const { loadSave, defaultSave, SAVE_KEY } = await import('../../src/core/save');
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } as unknown as Storage;
    const old = rec({ date: 1, sector: 3 });
    const fresh = rec({ date: 2, sector: 5, relics: ['r1'], implants: ['a', 'b'], synergies: 2, challengesWon: 1, challengesTried: 2 });
    store.set(SAVE_KEY, JSON.stringify({ ...defaultSave(), history: [old, fresh] }));
    const h = loadSave(storage).history;
    expect(h).toHaveLength(2);
    expect(h[0].implants).toBeUndefined();
    expect(h[1]).toMatchObject({ relics: ['r1'], implants: ['a', 'b'], synergies: 2 });
  });
  it('bestCombo picks the most synergies, then the deeper sector, and ignores old records', () => {
    const a = rec({ date: 1, sector: 9 });
    const b = rec({ date: 2, sector: 4, implants: ['x'], synergies: 3 });
    const c = rec({ date: 3, sector: 6, implants: ['x'], synergies: 3 });
    const d = rec({ date: 4, sector: 10, implants: ['x'], synergies: 1 });
    expect(bestCombo([a, b, c, d])?.date).toBe(3);
    expect(bestCombo([a])).toBeNull();
  });
});
