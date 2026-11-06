import { describe, it, expect } from 'vitest';
import { addRecord, bestFirst, recentFirst, HISTORY_CAP, type RunRecord } from '../../src/core/history';

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
