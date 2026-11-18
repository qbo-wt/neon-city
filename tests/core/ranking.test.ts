import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../src/config';
import {
  MAX_SECTOR, beats, cleanName, compareScores, isDayKey, parseScorePost, rankOf, sortBoard, toEntry, type BoardEntry,
} from '../../src/core/ranking';

const e = (player: string, over: Partial<BoardEntry> = {}): BoardEntry =>
  ({ player, victory: false, sector: 3, heat: 0, timeMs: 60000, credits: 100, weapon: 'blade', ...over });
const post = (over: Record<string, unknown> = {}) =>
  ({ player: 'Neo', mode: 'normal', victory: false, sector: 4, heat: 0, timeMs: 90000, credits: 120, weapon: 'blade', ...over });

describe('ranking order', () => {
  it('the sector count matches the game', () => expect(MAX_SECTOR).toBe(CONFIG.ROOMS_PER_RUN));

  it('a victory beats a deeper death', () => {
    const win = e('a', { victory: true, sector: MAX_SECTOR }), dead = e('b', { sector: MAX_SECTOR, timeMs: 1 });
    expect(sortBoard([dead, win]).map(x => x.player)).toEqual(['a', 'b']);
  });
  it('then deeper sector, then notoriety, then shorter time, then name', () => {
    const list = [
      e('slow', { sector: 5, timeMs: 90000 }), e('deep', { sector: 7, timeMs: 999999 }), e('fast', { sector: 5, timeMs: 50000 }),
      e('hot', { sector: 5, heat: 4, timeMs: 999999 }), e('bob', { sector: 1 }), e('amy', { sector: 1 }),
    ];
    expect(sortBoard(list).map(x => x.player)).toEqual(['deep', 'hot', 'fast', 'slow', 'amy', 'bob']);
  });
  it('does not mutate its input', () => {
    const l = [e('b'), e('a', { sector: 9 })];
    sortBoard(l);
    expect(l[0].player).toBe('b');
  });
  it('beats is strict: equal runs do not replace each other', () => {
    expect(beats(e('x'), e('x'))).toBe(false);
    expect(beats(e('x', { timeMs: 59999 }), e('x'))).toBe(true);
    expect(compareScores(e('a', { victory: true }), e('a'))).toBeLessThan(0);
  });
  it('rankOf finds a player whatever the case', () => {
    expect(rankOf([e('a', { sector: 9 }), e('Neo')], 'neo ')).toEqual({ rank: 2, total: 2 });
    expect(rankOf([e('a')], 'zed')).toEqual({ rank: 0, total: 1 });
  });
});

describe('names', () => {
  it('accepts 2-16 simple characters, accents included', () => {
    for (const n of ['Neo', 'Zoé_42', 'a-b', ' Léa  Rose ']) expect(cleanName(n)).not.toBeNull();
    expect(cleanName(' Léa  Rose ')).toBe('Léa Rose');
  });
  it('rejects the rest', () => {
    for (const n of ['a', '', '   ', 'x'.repeat(17), '<b>', 'a;b', 'ne\u0000o', '__proto__', '漢字', 'a.b', "o'neil", 42, null, undefined]) expect(cleanName(n)).toBeNull();
  });
});

describe('score payload', () => {
  it('accepts a valid run and drops notoriety outside CyberHard', () => {
    expect(parseScorePost(post({ heat: 5 }))).toMatchObject({ ok: true, value: { player: 'Neo', mode: 'normal', heat: 0 } });
    expect(parseScorePost(post({ mode: 'cyberhard', heat: 5 }))).toMatchObject({ ok: true, value: { heat: 5 } });
  });
  it.each([
    ['bad-player', { player: 'x' }], ['bad-player', { player: '<script>' }], ['bad-mode', { mode: 'easy' }],
    ['bad-sector', { sector: 0 }], ['bad-sector', { sector: MAX_SECTOR + 1 }], ['bad-sector', { sector: 2.5 }],
    ['bad-sector', { victory: true, sector: 4 }], ['bad-victory', { victory: 'yes' }], ['bad-heat', { heat: -1 }],
    ['bad-heat', { heat: 99 }], ['bad-time', { timeMs: -5 }], ['bad-time', { timeMs: 1e12 }], ['bad-credits', { credits: '12' }],
    ['bad-weapon', { weapon: '../x' }], ['bad-weapon', { weapon: 3 }], ['bad-day', { day: '2026-11-18' }],
    ['bad-day', { mode: 'daily' }], ['bad-day', { mode: 'daily', day: '2026-13-40' }], ['bad-day', { mode: 'daily', day: '2026-02-31' }],
  ])('rejects with %s', (error, over) => {
    expect(parseScorePost(post(over))).toEqual({ ok: false, error });
  });
  it('rejects non-objects', () => {
    for (const b of [null, 3, 'x', [], undefined]) expect(parseScorePost(b)).toEqual({ ok: false, error: 'bad-body' });
  });
  it('a daily run needs a real day', () => {
    expect(parseScorePost(post({ mode: 'daily', day: '2026-11-18' }))).toMatchObject({ ok: true, value: { day: '2026-11-18' } });
    expect(isDayKey('2026-11-18')).toBe(true);
    expect(isDayKey('18/11/2026')).toBe(false);
  });
  it('toEntry drops malformed stored values', () => {
    expect(toEntry({ ...e('Neo') })).not.toBeNull();
    expect(toEntry({ ...e('Neo'), sector: 99 })).toBeNull();
    expect(toEntry('nope')).toBeNull();
  });
});
