import { describe, it, expect, vi } from 'vitest';
import { fetchBoard, rankLine, submitScore, type Fetcher } from '../../src/core/leaderboard';
import { PLAYER_KEY, loadProfile } from '../../src/core/player';

const run = { player: 'Neo', mode: 'normal' as const, victory: false, sector: 4, heat: 0, timeMs: 90000, credits: 120, weapon: 'blade' };
const reply = (status: number, body: unknown): Fetcher => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const down: Fetcher = async () => { throw new TypeError('Failed to fetch'); };

describe('leaderboard client stays quiet when it cannot reach the server', () => {
  it('network error: submit gives null, board is offline, nothing throws', async () => {
    expect(await submitScore(run, down)).toBeNull();
    expect(await fetchBoard('normal', undefined, down)).toEqual({ status: 'offline' });
  });
  it('dev server (vite answers index.html with 200): not JSON, so offline', async () => {
    const html = reply(200, '<!doctype html><html></html>');
    expect(await submitScore(run, html)).toBeNull();
    expect(await fetchBoard('cyberhard', undefined, html)).toEqual({ status: 'offline' });
  });
  it('404, 400, 429, 502 are offline / null; 503 is "unconfigured"', async () => {
    for (const s of [404, 400, 429, 502]) {
      expect(await submitScore(run, reply(s, { error: 'x' }))).toBeNull();
      expect(await fetchBoard('normal', undefined, reply(s, { error: 'x' }))).toEqual({ status: 'offline' });
    }
    expect(await fetchBoard('normal', undefined, reply(503, { error: 'storage-not-configured' }))).toEqual({ status: 'unconfigured' });
    expect(await submitScore(run, reply(503, { error: 'storage-not-configured' }))).toBeNull();
  });
  it('a hanging server is cut off by the timeout instead of blocking', async () => {
    const hang: Fetcher = (_u, init) => new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
    vi.useFakeTimers();
    try {
      const p = submitScore(run, hang);
      await vi.advanceTimersByTimeAsync(5900);
      let done = false;
      void p.then(() => { done = true; });
      await Promise.resolve();
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(await p).toBeNull();
    } finally { vi.useRealTimers(); }
  });
});

describe('leaderboard client, server answers', () => {
  it('sends the run as JSON and reads the rank', async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    const f: Fetcher = async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ kept: true, record: true, first: false, rank: 2, total: 5 })); };
    expect(await submitScore(run, f)).toEqual({ record: true, first: false, rank: 2, total: 5 });
    expect(seen?.url).toBe('/api/scores');
    expect(seen?.init?.method).toBe('POST');
    expect(JSON.parse(seen!.init!.body as string)).toMatchObject({ player: 'Neo', mode: 'normal', sector: 4 });
  });
  it('a nonsense rank is ignored', async () => {
    expect(await submitScore(run, reply(200, { rank: 0, total: 3 }))).toBeNull();
    expect(await submitScore(run, reply(200, { rank: 'a' }))).toBeNull();
  });
  it('asks for the right board and day', async () => {
    let url = '';
    const f: Fetcher = async u => { url = u; return new Response(JSON.stringify({ entries: [], total: 0 })); };
    expect(await fetchBoard('daily', '2026-11-18', f)).toEqual({ status: 'ok', entries: [], total: 0 });
    expect(url).toBe('/api/scores?mode=daily&day=2026-11-18');
    await fetchBoard('normal', '2026-11-18', f);
    expect(url).toBe('/api/scores?mode=normal');
  });
});

describe('end screen line', () => {
  it('words the rank', () => {
    expect(rankLine({ record: true, first: false, rank: 3, total: 7 }, 'cyberhard')).toBe('3ᵉ sur 7 en CYBERHARD — nouveau record perso');
    expect(rankLine({ record: false, first: false, rank: 1, total: 2 }, 'normal')).toBe('1ᵉʳ sur 2 en NORMALE (ton record tient)');
    expect(rankLine({ record: true, first: true, rank: 1, total: 1 }, 'daily')).toContain('Seul au classement à la run du jour');
  });
});

describe('player profile', () => {
  const store = (v?: string) => ({ getItem: (k: string) => (k === PLAYER_KEY ? v ?? null : null) });
  it('defaults to no name, ranked', () => expect(loadProfile(store())).toEqual({ name: '', optOut: false }));
  it('reads a saved profile and refuses an invalid name', () => {
    expect(loadProfile(store(JSON.stringify({ name: 'Neo', optOut: true })))).toEqual({ name: 'Neo', optOut: true });
    expect(loadProfile(store(JSON.stringify({ name: '<x>' }))).name).toBe('');
    expect(loadProfile(store('{broken')).name).toBe('');
  });
});
