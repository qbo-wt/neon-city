import { describe, it, expect } from 'vitest';
import { NORMAL_TUNING, modeCreditMult, modeScaling, modeStats, unlockAfterRun, type Unlocks } from '../../src/core/mode';
import { defaultSave, loadSave, SAVE_KEY, writeSave } from '../../src/core/save';
import { relicPool } from '../../src/core/relics';
import { offerImplants } from '../../src/core/implantOffer';
import { createRng } from '../../src/core/rng';
import { canBuy } from '../../src/core/skillTree';
import { baseStats, computeStats } from '../../src/core/stats';
import { RELICS } from '../../src/data/relics';
import { IMPLANT_BY_ID, PSY_IMPLANTS } from '../../src/data/implants';
import { SKILL_NODES } from '../../src/data/skillNodes';
import { STREET_EVENT_IDS, eventOptions, type EventCtx } from '../../src/systems/streetEvents';
import { newRun } from '../../src/systems/runState';
import { recordModeLabel, type RunRecord } from '../../src/core/history';
import type { Implant } from '../../src/core/types';

function fake(init?: unknown) {
  const m = new Map<string, string>();
  if (init !== undefined) m.set(SAVE_KEY, JSON.stringify(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}
const record = (victory: boolean): RunRecord => ({ date: 1700000000000, victory, sector: victory ? 10 : 4, kills: 20, damageDealt: 500, hpHealed: 10, credits: 80, timeMs: 300000 });
const oldSave = (extra: Record<string, unknown>) => ({ version: 1, credits: 340, ownedNodes: ['body-hp-1'], runs: 6, bestRoom: 7, history: [record(false)], ...extra });

describe('run tiers: unlocks', () => {
  const none: Unlocks = { cyberhard: false, wanted: false };
  it('a normal victory opens CyberHard, not the wanted posters', () => {
    expect(unlockAfterRun(none, { mode: 'normal', victory: true })).toEqual({ unlocks: { cyberhard: true, wanted: false }, fresh: ['cyberhard'] });
  });
  it('a CyberHard victory opens the wanted posters', () => {
    expect(unlockAfterRun({ cyberhard: true, wanted: false }, { mode: 'cyberhard', victory: true })).toEqual({ unlocks: { cyberhard: true, wanted: true }, fresh: ['wanted'] });
  });
  it('a defeat opens nothing, a daily victory only CyberHard, and nothing is announced twice', () => {
    expect(unlockAfterRun(none, { mode: 'cyberhard', victory: false }).fresh).toEqual([]);
    expect(unlockAfterRun(none, { mode: 'cyberhard', victory: true, daily: true }).unlocks).toEqual({ cyberhard: true, wanted: false });
    expect(unlockAfterRun({ cyberhard: true, wanted: true }, { mode: 'cyberhard', victory: true }).fresh).toEqual([]);
  });
  it('a new save starts with both locked and keeps them through a round trip', () => {
    expect(defaultSave().unlocks).toEqual(none);
    const s = fake();
    writeSave(s, { ...defaultSave(), unlocks: { cyberhard: true, wanted: false } });
    expect(loadSave(s).unlocks).toEqual({ cyberhard: true, wanted: false });
  });
});

describe('run tiers: saves from before them', () => {
  it('a player who already won has CyberHard and the wanted posters', () => {
    const s = loadSave(fake(oldSave({ history: [record(false), record(true)], heat: { armor: 1 } })));
    expect(s.unlocks).toEqual({ cyberhard: true, wanted: true });
    expect(s.heat).toEqual({ armor: 1 });
  });
  it('a victory gone from the capped history still counts (final boss in the bestiary, notoriety record)', () => {
    expect(loadSave(fake(oldSave({ codex: { boss: 1 } }))).unlocks).toEqual({ cyberhard: true, wanted: true });
    expect(loadSave(fake(oldSave({ bestHeat: 3 }))).unlocks).toEqual({ cyberhard: true, wanted: true });
  });
  it('a player who never won has CyberHard locked but keeps everything else', () => {
    const s = loadSave(fake(oldSave({ codex: { runner: 12, warden: 1 } })));
    expect(s.unlocks).toEqual({ cyberhard: false, wanted: false });
    expect(s.credits).toBe(340);
    expect(s.ownedNodes).toEqual(['body-hp-1']);
    expect(s.runs).toBe(6);
    expect(s.codex).toEqual({ runner: 12, warden: 1 });
  });
  it('stored unlocks are trusted over the history; the posters imply CyberHard', () => {
    expect(loadSave(fake(oldSave({ history: [record(true)], unlocks: { cyberhard: true, wanted: false } }))).unlocks).toEqual({ cyberhard: true, wanted: false });
    expect(loadSave(fake(oldSave({ unlocks: { cyberhard: false, wanted: true } }))).unlocks).toEqual({ cyberhard: true, wanted: true });
  });
  it('old history records show as CyberHard, new ones by their mode', () => {
    expect(recordModeLabel(record(true))).toBe('CYBERHARD');
    expect(recordModeLabel({ ...record(true), mode: 'normal' })).toBe('NORMALE');
    expect(recordModeLabel({ ...record(true), mode: 'cyberhard', daily: '2026-11-18' })).toBe('DU JOUR');
  });
});

describe('normal run: no psychosis', () => {
  it('a new normal run has no neuro-blockers and ignores notoriety; CyberHard keeps both', () => {
    const nodes = ['mind-resist-1', 'mind-load-1', 'mind-resist-2', 'mind-therapy-1'];
    const normal = newRun(7, nodes, 'blade', { heat: { armor: 2, squads: 1 } });
    expect(normal.mode).toBe('normal');
    expect(normal.blockers).toBe(0);
    expect(normal.heat).toEqual({});
    expect(normal.heatPoints).toBe(0);
    const hard = newRun(7, nodes, 'blade', { mode: 'cyberhard', heat: { armor: 2 } });
    expect(hard.blockers).toBe(1);
    expect(hard.heatPoints).toBe(2);
  });
  it('psychosis-bound stats do nothing and heals are stronger; CyberHard stats are untouched', () => {
    const s = { ...baseStats(), castPsy: 2, psyDamage: 0.003, edgePa: 1, edgePm: 1, startBlockers: 1 };
    const calm = modeStats(s, 'normal');
    expect(calm).toMatchObject({ castPsy: 0, psyDamage: 0, edgePa: 0, edgePm: 0, startBlockers: 0 });
    expect(calm.healMult).toBeCloseTo(NORMAL_TUNING.heal);
    expect(modeStats(s, 'cyberhard')).toBe(s);
    // Pharmacien du coin: more heals in a normal run.
    const pharma = computeStats([], ['mind-credits-1', 'mind-blocker-1']);
    expect(modeStats(pharma, 'normal').healMult).toBeCloseTo(NORMAL_TUNING.heal * 1.1);
  });
  it('enemies and bosses are softer, credits as tuned; CyberHard pays a bonus outside the daily run', () => {
    expect(modeScaling('normal', false)).toEqual({ hp: NORMAL_TUNING.enemyHp, dmg: NORMAL_TUNING.enemyDamage });
    const boss = modeScaling('normal', true);
    expect(boss.hp).toBeLessThan(NORMAL_TUNING.enemyHp);
    expect(boss.dmg).toBeLessThan(NORMAL_TUNING.enemyDamage);
    expect(modeScaling('cyberhard', true)).toEqual({ hp: 1, dmg: 1 });
    expect(modeCreditMult('cyberhard')).toBeGreaterThan(modeCreditMult('normal'));
    expect(modeCreditMult('cyberhard', true)).toBe(1);
  });
  it('the neural synergy gives damage instead of psychosis resistance', () => {
    const neural = ['neural-coproc', 'shortcircuit'].map(id => ({ ...IMPLANT_BY_ID.get(id)!, level: 1 }) as Implant);
    const hard = computeStats(neural, []), calm = computeStats(neural, [], [], false);
    expect(hard.psyResist).toBeCloseTo(0.2);
    expect(calm.psyResist).toBe(0);
    expect(calm.damagePct).toBeCloseTo(hard.damagePct + 0.08);
  });
});

describe('normal run: offers without psychosis content', () => {
  const psyRelics = ['purger', 'oni-mask', 'burning-mind'];
  it('never offers the psychosis relics, which CyberHard still offers', () => {
    const calm = relicPool(RELICS, [], [], false).map(r => r.id);
    for (const id of psyRelics) expect(calm).not.toContain(id);
    const hard = relicPool(RELICS, [], []).map(r => r.id);
    for (const id of psyRelics) expect(hard).toContain(id);
    expect(calm).toEqual(hard.filter(id => !psyRelics.includes(id)));
  });
  it('never offers the psychosis implants, black market included', () => {
    let seen = 0;
    for (let seed = 1; seed < 400; seed++) {
      const hard = offerImplants(createRng(seed), [], seed % 10, { allowBlack: true, family: 'neural' }).map(o => o.implant.id);
      seen += hard.filter(id => PSY_IMPLANTS.includes(id)).length;
      const calm = offerImplants(createRng(seed), [], seed % 10, { allowBlack: true, family: 'neural', psychosis: false }).map(o => o.implant.id);
      expect(calm).toHaveLength(3);
      for (const id of calm) expect(PSY_IMPLANTS).not.toContain(id);
    }
    // The same draws with psychosis do show them: the filter is what keeps them out.
    expect(seen).toBeGreaterThan(0);
  });
  it('street encounters never touch psychosis or neuro-blockers', () => {
    let psy = 0, blockers = 0;
    const ctx = (psychosis: boolean): EventCtx => ({
      rng: () => 0.3, psychosis, price: n => n, credits: () => 999, spend: () => {}, gain: () => {}, hp: () => 100, hurt: () => {},
      healFraction: () => {}, addPsy: () => { psy++; }, addBlocker: () => { blockers++; }, implants: () => {}, relicLeft: () => undefined,
      giveRelic: () => {}, upgradeRandom: () => 'Puce', canUpgrade: () => true, sign: () => {}, say: () => {},
    });
    for (const id of STREET_EVENT_IDS) for (const o of eventOptions(id, ctx(false))) {
      expect(`${o.label} ${o.desc}`).not.toMatch(/psychose|neuro-bloqueur/i);
      o.pick();
    }
    expect([psy, blockers]).toEqual([0, 0]);
    for (const id of STREET_EVENT_IDS) for (const o of eventOptions(id, ctx(true))) o.pick();
    expect(psy).toBeGreaterThan(0);
    expect(blockers).toBeGreaterThan(0);
  });
  it('Nyx sells the psychosis branch only once CyberHard is unlocked', () => {
    const node = SKILL_NODES.find(n => n.id === 'mind-resist-1')!;
    expect(node.cyberhard).toBe(true);
    expect(canBuy(node.id, [], 9999, false)).toBe(false);
    expect(canBuy(node.id, [], 9999, true)).toBe(true);
    // The network branch stays open: it pays off in both runs.
    expect(canBuy('mind-credits-1', [], 9999, false)).toBe(true);
  });
});
