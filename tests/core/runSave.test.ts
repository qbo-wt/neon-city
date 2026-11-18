import { describe, it, expect } from 'vitest';
import { RUN_SAVE_KEY, clearRunSave, loadRunSave, saveRun } from '../../src/core/runSave';
import { newRun } from '../../src/systems/runState';
import { IMPLANTS } from '../../src/data/implants';
import { RELICS } from '../../src/data/relics';

function fake(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), raw: m };
}

function midRun() {
  const run = newRun(1234, ['n1'], 'blade', { mode: 'cyberhard', daily: '2026-11-18' });
  run.roomIndex = 3; run.hp = 17; run.creditsEarned = 42; run.psy = 12; run.blockers = 2; run.kills = 9;
  run.implants = [{ ...IMPLANTS[0], level: 2 }, { ...IMPLANTS[1], level: 1 }];
  run.relics = [RELICS[0], RELICS[1]];
  run.killsByType = { runner: 4 };
  return run;
}

describe('runSave', () => {
  it('round-trips the run, implants and relics included (rehydrated from their ids)', () => {
    const s = fake(), run = midRun();
    saveRun(s, run);
    const back = loadRunSave(s)!;
    expect(back).toBeDefined();
    expect(back.roomIndex).toBe(3);
    expect(back.hp).toBe(17);
    expect(back.creditsEarned).toBe(42);
    expect(back.daily).toBe('2026-11-18');
    expect(back.mode).toBe('cyberhard');
    expect(back.rooms).toEqual(run.rooms);
    expect(back.killsByType).toEqual({ runner: 4 });
    expect(back.implants.map(i => [i.id, i.level])).toEqual([[IMPLANTS[0].id, 2], [IMPLANTS[1].id, 1]]);
    expect(back.relics.map(r => r.id)).toEqual([RELICS[0].id, RELICS[1].id]);
    // functions came back from the data tables
    expect(typeof back.implants[0].modify).toBe('function');
    expect(typeof back.relics[0].modify).toBe('function');
  });

  it('is empty when nothing was saved', () => {
    expect(loadRunSave(fake())).toBeUndefined();
  });

  it('discards a save from another version', () => {
    const s = fake();
    saveRun(s, midRun());
    const env = JSON.parse(s.raw.get(RUN_SAVE_KEY)!);
    env.version = 999;
    s.raw.set(RUN_SAVE_KEY, JSON.stringify(env));
    expect(loadRunSave(s)).toBeUndefined();
  });

  it('discards garbage, a bad room index and unknown ids', () => {
    const s = fake({ [RUN_SAVE_KEY]: '{not json' });
    expect(loadRunSave(s)).toBeUndefined();
    saveRun(s, midRun());
    const env = JSON.parse(s.raw.get(RUN_SAVE_KEY)!);
    const bad = (mut: (e: any) => void) => { const e = structuredClone(env); mut(e); s.raw.set(RUN_SAVE_KEY, JSON.stringify(e)); return loadRunSave(s); };
    expect(bad(e => { e.run.roomIndex = 99; })).toBeUndefined();
    expect(bad(e => { e.run.relics = ['no-such-relic']; })).toBeUndefined();
    expect(bad(e => { e.run.mode = 'easy'; })).toBeUndefined();
  });

  it('is deleted when the run ends (victory, death or abandon)', () => {
    const s = fake();
    saveRun(s, midRun());
    expect(loadRunSave(s)).toBeDefined();
    clearRunSave(s);
    expect(loadRunSave(s)).toBeUndefined();
  });

  it('keeps only the latest sector entry: a later save replaces the earlier one', () => {
    const s = fake(), run = midRun();
    saveRun(s, run);
    run.roomIndex = 4; run.creditsEarned = 60;
    saveRun(s, run);
    const back = loadRunSave(s)!;
    expect([back.roomIndex, back.creditsEarned]).toEqual([4, 60]);
  });
});
