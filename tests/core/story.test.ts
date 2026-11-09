import { describe, it, expect } from 'vitest';
import { bossIntro, nextLine } from '../../src/core/story';
import { defaultSave, type SaveData } from '../../src/core/save';
import { ARCS, BOSS_LINES } from '../../src/data/story';

const rng = () => 0;
const amb = ['Ambiance.'];
const played = (o: Partial<SaveData> = {}): SaveData => ({ ...defaultSave(), runs: 1, ...o });

describe('NPC lines', () => {
  it('react once per run to how the last run ended, naming the killer', () => {
    const s = played({ story: { talks: {}, flags: [], lastRun: { victory: false, sector: 4, killer: 'warden', weapon: 'blade', heat: 0 } } });
    const a = nextLine('lo', s, amb, rng, () => 'Lieutenant des Rats');
    expect(a.kind).toBe('reaction');
    expect(a.line).toContain('Lieutenant');
    const b = nextLine('lo', a.save, amb, rng);
    expect(b.kind).not.toBe('reaction');
    const g = nextLine('resident', played({ story: { talks: {}, flags: [], lastRun: { victory: false, sector: 6, killer: 'gunner', weapon: 'blade', heat: 0 } } }), amb, rng, () => 'Tireur des Rats');
    expect(g.line).toContain('Tireur des Rats');
    expect(g.line).toContain('6');
  });
  it('tell one story beat per run, and the last beat pays a gift once', () => {
    const arc = ARCS.lo!;
    let s = played({ runs: 0 });
    // No run played yet: no beat.
    expect(nextLine('lo', s, amb, rng).kind).toBe('ambient');
    for (let run = 1; run <= arc.beats.length; run++) {
      s = { ...s, runs: run };
      const r = nextLine('lo', s, amb, rng);
      expect(r.kind).toBe('beat');
      expect(r.line).toBe(arc.beats[run - 1]);
      expect(nextLine('lo', r.save, amb, rng).kind).toBe('ambient'); // only one beat per run
      if (run === arc.beats.length) { expect(r.gift).toBe(arc.gift); expect(r.save.credits).toBe(s.credits + arc.gift); }
      s = r.save;
    }
    expect(nextLine('lo', { ...s, runs: 99 }, amb, rng).kind).toBe('ambient');
  });
  it('flags stay small: one per NPC and kind', () => {
    let s = played();
    for (let run = 1; run < 30; run++) s = nextLine('nyx', { ...s, runs: run }, amb, rng).save;
    expect(s.story.flags.filter(f => f.startsWith('beat-nyx-')).length).toBeLessThanOrEqual(1);
  });
});

describe('boss lines', () => {
  it('depend on your history with the boss', () => {
    expect(bossIntro('warden', defaultSave())).toBe(BOSS_LINES.warden.first);
    expect(bossIntro('warden', { ...defaultSave(), deaths: { warden: 1 } })).toBe(BOSS_LINES.warden.again);
    expect(bossIntro('warden', { ...defaultSave(), codex: { warden: 2 } })).toBe(BOSS_LINES.warden.beaten);
    const s = defaultSave();
    s.story.lastRun = { victory: false, sector: 5, killer: 'boss', weapon: 'blade', heat: 0 };
    expect(bossIntro('boss', s)).toBe(BOSS_LINES.boss.killedYou);
  });
});
