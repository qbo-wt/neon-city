import { describe, it, expect } from 'vitest';
import { handleScores, POSTS_PER_MINUTE, type Store } from '../../api/_scoreboard';

/** Redis in memory: hashes and counters, nothing else is needed. */
function fakeStore() {
  const hashes = new Map<string, Map<string, unknown>>();
  const counters = new Map<string, number>();
  const ttl = new Map<string, number>();
  const store: Store = {
    async hget(k, f) { return hashes.get(k)?.get(f) ?? null; },
    async hset(k, v) {
      const h = hashes.get(k) ?? new Map<string, unknown>();
      hashes.set(k, h);
      for (const [f, x] of Object.entries(v)) h.set(f, JSON.parse(JSON.stringify(x)));
    },
    async hgetall(k) { const h = hashes.get(k); return h ? Object.fromEntries(h) : null; },
    async incr(k) { const n = (counters.get(k) ?? 0) + 1; counters.set(k, n); return n; },
    async expire(k, s) { ttl.set(k, s); },
  };
  return { store, hashes, ttl };
}

const NOW = new Date('2026-11-18T12:00:00Z');
const run = (over: Record<string, unknown> = {}) =>
  ({ player: 'Neo', mode: 'normal', victory: false, sector: 4, heat: 0, timeMs: 90000, credits: 120, weapon: 'blade', ...over });
const post = (body: unknown, ip = '1.2.3.4', raw?: string) =>
  new Request('http://x/api/scores', { method: 'POST', headers: { 'x-forwarded-for': ip }, body: raw ?? JSON.stringify(body) });
const get = (q: string) => new Request(`http://x/api/scores?${q}`);
const body = async (r: Response) => await r.json() as Record<string, any>;

describe('/api/scores', () => {
  it('503 when no storage is configured', async () => {
    const r = await handleScores(get('mode=normal'), null, NOW);
    expect(r.status).toBe(503);
    expect(await body(r)).toEqual({ error: 'storage-not-configured' });
    expect((await handleScores(post(run()), null, NOW)).status).toBe(503);
  });

  it('keeps only the best run of a player, and says so', async () => {
    const { store } = fakeStore();
    expect(await body(await handleScores(post(run({ sector: 4 })), store, NOW))).toMatchObject({ kept: true, first: true, rank: 1, total: 1 });
    expect(await body(await handleScores(post(run({ sector: 3 })), store, NOW))).toMatchObject({ kept: false, record: false, rank: 1 });
    expect(await body(await handleScores(post(run({ sector: 6 })), store, NOW))).toMatchObject({ kept: true, first: false });
    const board = await body(await handleScores(get('mode=normal'), store, NOW));
    expect(board.entries).toHaveLength(1);
    expect(board.entries[0].sector).toBe(6);
  });

  it('an equal run does not replace the stored one', async () => {
    const { store } = fakeStore();
    await handleScores(post(run({ credits: 10 })), store, NOW);
    expect((await body(await handleScores(post(run({ credits: 999 })), store, NOW))).kept).toBe(false);
    expect((await body(await handleScores(get('mode=normal'), store, NOW))).entries[0].credits).toBe(10);
  });

  it('ranks players against each other; the same name in another case is the same player', async () => {
    const { store } = fakeStore();
    await handleScores(post(run({ player: 'Amy', sector: 9 })), store, NOW);
    expect(await body(await handleScores(post(run({ player: 'neo', sector: 2 })), store, NOW))).toMatchObject({ rank: 2, total: 2 });
    await handleScores(post(run({ player: 'NEO', sector: 10, victory: true })), store, NOW);
    const board = await body(await handleScores(get('mode=normal'), store, NOW));
    expect(board.entries.map((e: { player: string }) => e.player)).toEqual(['NEO', 'Amy']);
  });

  it('boards are separate per mode and per day', async () => {
    const { store, ttl } = fakeStore();
    await handleScores(post(run({ mode: 'cyberhard', heat: 3 })), store, NOW);
    await handleScores(post(run({ mode: 'daily', day: '2026-11-18' })), store, NOW);
    await handleScores(post(run({ mode: 'daily', day: '2026-11-17', player: 'Old' })), store, NOW);
    expect((await body(await handleScores(get('mode=normal'), store, NOW))).total).toBe(0);
    expect((await body(await handleScores(get('mode=cyberhard'), store, NOW))).entries[0].heat).toBe(3);
    const today = await body(await handleScores(get('mode=daily&day=2026-11-18'), store, NOW));
    expect(today.entries.map((e: { player: string }) => e.player)).toEqual(['Neo']);
    expect((await body(await handleScores(get('mode=daily'), store, NOW))).day).toBe('2026-11-18');
    expect(ttl.get('neon:scores:daily:2026-11-18')).toBeGreaterThan(0);
  });

  it('GET returns the 50 best, best first', async () => {
    const { store, hashes } = fakeStore();
    const h = new Map<string, unknown>();
    hashes.set('neon:scores:normal', h);
    for (let i = 0; i < 60; i++) h.set(`p${i}`, { player: `P${i}`, victory: false, sector: 1 + (i % 9), heat: 0, timeMs: 1000 + i, credits: 0, weapon: 'blade' });
    const board = await body(await handleScores(get('mode=normal'), store, NOW));
    expect(board.total).toBe(60);
    expect(board.entries).toHaveLength(50);
    expect(board.entries[0].sector).toBe(9);
    const sectors = board.entries.map((x: { sector: number }) => x.sector);
    expect([...sectors].sort((a, b) => b - a)).toEqual(sectors);
  });

  it('rejects bad payloads with 400 and stores nothing', async () => {
    const { store, hashes } = fakeStore();
    const bad = [run({ player: '<img>' }), run({ sector: 99 }), run({ mode: 'x' }), run({ timeMs: -1 }), run({ mode: 'daily' }), run({ mode: 'daily', day: '2020-01-01' })];
    for (const b of bad) expect((await handleScores(post(b), store, NOW)).status).toBe(400);
    expect((await handleScores(post(null, '1.1.1.1', '{nope'), store, NOW)).status).toBe(400);
    expect((await handleScores(post(null, '1.1.1.1', 'x'.repeat(5000)), store, NOW)).status).toBe(400);
    expect(hashes.size).toBe(0);
  });

  it('rejects bad queries', async () => {
    const { store } = fakeStore();
    expect((await handleScores(get('mode=nope'), store, NOW)).status).toBe(400);
    expect((await handleScores(get(''), store, NOW)).status).toBe(400);
    expect((await handleScores(get('mode=daily&day=garbage'), store, NOW)).status).toBe(400);
    expect((await handleScores(get('mode=normal&day=2026-11-18'), store, NOW)).status).toBe(400);
    expect((await handleScores(new Request('http://x/api/scores', { method: 'DELETE' }), store, NOW)).status).toBe(405);
  });

  it('a hostile name never reaches the storage', async () => {
    const { store, hashes } = fakeStore();
    for (const player of ['__proto__', 'a:b', 'x*', '$(rm)']) expect((await handleScores(post(run({ player })), store, NOW)).status).toBe(400);
    expect(hashes.size).toBe(0);
  });

  it('rate-limits one IP, not the others, and resets each minute', async () => {
    const { store } = fakeStore();
    for (let i = 0; i < POSTS_PER_MINUTE; i++) expect((await handleScores(post(run()), store, NOW)).status).toBe(200);
    expect((await handleScores(post(run()), store, NOW)).status).toBe(429);
    expect((await handleScores(post(run(), '9.9.9.9'), store, NOW)).status).toBe(200);
    expect((await handleScores(post(run()), store, new Date(NOW.getTime() + 61_000))).status).toBe(200);
  });

  it('answers 502 when the storage fails', async () => {
    const broken: Store = { ...fakeStore().store, hgetall: async () => { throw new Error('down'); } };
    expect((await handleScores(get('mode=normal'), broken, NOW)).status).toBe(502);
  });
});
