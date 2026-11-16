import { describe, it, expect, beforeEach } from 'vitest';
import {
  TUTORIAL_KEY, _forgetTutorial, applyEvent, basicTutorialPending, completeStep, currentStep, freshTutorial, liveStep, loadTutorial,
  resetTutorial, skipTutorial, tutorialDone, tutorialEvent, tutorialState, writeTutorial, type TutorialState, type TutorialStep,
} from '../../src/core/tutorial';
import { SAVE_KEY, defaultSave } from '../../src/core/save';
import { TUTORIAL_STEPS, type TutorialCtx } from '../../src/data/tutorial';
import { getStorage } from '../../src/core/storage';

function fake(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

type Ctx = { turn?: string };
const STEPS: TutorialStep<Ctx>[] = [
  { id: 'a', track: 'basic', place: 'room', text: 'walk', until: ['moved'], ack: true },
  { id: 'b', track: 'basic', place: 'room', text: 'use', after: ['a'], until: ['used'] },
  { id: 'c', track: 'basic', place: 'room', text: 'only on your turn', after: ['b'], until: ['ended'], when: c => c.turn === 'me' },
  { id: 'd', track: 'basic', place: 'room', text: 'shown only', after: ['b'], until: ['ended'], onlyShown: true },
  { id: 'x', track: 'basic', place: 'other', text: 'elsewhere', until: ['used'] },
  { id: 'tip', track: 'tip', place: 'room', text: 'a trap', trigger: 'see:trap', until: ['ended'], ack: true },
];
const none = new Set<string>();
const show = (s: TutorialState, ctx: Ctx = {}, pending: ReadonlySet<string> = none) => currentStep(s, STEPS, 'room', ctx, pending)?.id;
const on = (s: TutorialState, e: string, shown?: string) => applyEvent(s, STEPS, e, shown).state;

describe('tutorial progression', () => {
  it('a new player starts at the first step, and doing what it says moves to the next', () => {
    let s = freshTutorial(0);
    expect(show(s)).toBe('a');
    s = on(s, 'moved', 'a');
    expect(show(s)).toBe('b');
    s = on(s, 'used', 'b');
    // c waits for its condition; d (later in the list) shows meanwhile.
    expect(show(s)).toBe('d');
    expect(show(s, { turn: 'me' })).toBe('c');
  });

  it('a step done once never shows again, even when its event comes back', () => {
    let s = on(freshTutorial(0), 'moved', 'a');
    s = on(s, 'moved');
    expect(s.done.filter(id => id === 'a')).toHaveLength(1);
    expect(currentStep(s, STEPS, 'room', {}, none)?.id).not.toBe('a');
  });

  it('dismissing (ack) completes a step without its action', () => {
    expect(show(completeStep(freshTutorial(0), 'a'))).toBe('b');
  });

  it('a player who already does the next thing skips its bubble; an onlyShown step does not', () => {
    // "used" arrives while "a" is on screen: b is done in advance.
    let s = on(freshTutorial(0), 'used', 'a');
    expect(s.done).toContain('b');
    expect(s.done).toContain('x');
    s = on(s, 'moved', 'a');
    // "ended" while d is not on screen: c is done (basic), d is not (onlyShown).
    s = on(s, 'ended');
    expect(s.done).toContain('c');
    expect(s.done).not.toContain('d');
    expect(show(s)).toBe('d');
    expect(on(s, 'ended', 'd').done).toContain('d');
  });

  it('a tip waits for its trigger, comes after the basic steps, and its events only count once shown', () => {
    let s: TutorialState = { ...freshTutorial(0), done: ['a', 'b', 'c', 'd'] };
    expect(show(s)).toBeUndefined();
    const r = applyEvent(s, STEPS, 'see:trap');
    expect(r.triggered).toEqual(['tip']);
    expect(show(s, {}, new Set(r.triggered))).toBe('tip');
    // Not on screen: its "ended" does not complete it.
    expect(on(s, 'ended').done).not.toContain('tip');
    s = on(s, 'ended', 'tip');
    expect(show(s, {}, new Set(r.triggered))).toBeUndefined();
    // Done: the trigger no longer queues it.
    expect(applyEvent(s, STEPS, 'see:trap').triggered).toEqual([]);
  });

  it('a basic step on screen hides the tips until it is done', () => {
    expect(show(freshTutorial(0), {}, new Set(['tip']))).toBe('a');
  });

  it('a skipped tutorial shows nothing, tips included', () => {
    const s = { ...freshTutorial(0), off: true };
    expect(show(s, { turn: 'me' }, new Set(['tip']))).toBeUndefined();
    expect(applyEvent(s, STEPS, 'see:trap').triggered).toEqual([]);
  });

  it('a player with runs behind them gets no basic step, but the tips of new things', () => {
    const s = freshTutorial(3);
    expect(s.veteran).toBe(true);
    expect(show(s, { turn: 'me' })).toBeUndefined();
    const r = applyEvent(s, STEPS, 'see:trap');
    expect(show(s, {}, new Set(r.triggered))).toBe('tip');
  });

  it('the scene can veto a step (a tip whose target is not on the board)', () => {
    const s: TutorialState = { ...freshTutorial(0), done: ['a', 'b', 'c', 'd'] };
    expect(currentStep(s, STEPS, 'room', {}, new Set(['tip']), st => st.id !== 'tip')).toBeUndefined();
  });
});

describe('tutorial storage', () => {
  it('round-trips', () => {
    const st = fake();
    const s: TutorialState = { version: 1, done: ['a', 'b'], off: false, veteran: false };
    writeTutorial(st, s);
    expect(loadTutorial(st, 5)).toEqual(s);
  });

  it('with nothing stored, the save decides: veteran from the first run on', () => {
    expect(loadTutorial(fake(), 0).veteran).toBe(false);
    expect(loadTutorial(fake(), 1).veteran).toBe(true);
  });

  it('a stored state wins over the run count (a replayed tutorial stays on)', () => {
    const st = fake();
    writeTutorial(st, freshTutorial(0));
    expect(loadTutorial(st, 12).veteran).toBe(false);
  });

  it('a corrupt copy starts over without throwing', () => {
    expect(loadTutorial(fake({ [TUTORIAL_KEY]: '{oops' }), 2)).toEqual(freshTutorial(2));
    expect(loadTutorial(fake({ [TUTORIAL_KEY]: '{"version":1,"done":[3,"a","a"],"off":"yes"}' }), 0)).toEqual({ version: 1, done: ['a'], off: false, veteran: false });
  });
});

describe('the live tutorial', () => {
  const st = getStorage();
  const seed = (runs: number) => {
    st.setItem(TUTORIAL_KEY, '');
    st.setItem(SAVE_KEY, JSON.stringify({ ...defaultSave(), runs }));
    _forgetTutorial();
  };
  const ctx: TutorialCtx = {};
  beforeEach(() => seed(0));

  it('walks the apartment steps on the real data, then remembers them after a reload', () => {
    expect(liveStep('hideout', ctx)?.id).toBe('h-move');
    tutorialEvent('hub:moved', 'h-move');
    expect(liveStep('hideout', ctx)?.id).toBe('h-use');
    tutorialEvent('hub:interact', 'h-use');
    tutorialDone('h-out');
    expect(liveStep('hideout', ctx)).toBeUndefined();
    expect(basicTutorialPending('hideout')).toBe(false);
    _forgetTutorial();
    expect(tutorialState().done).toEqual(expect.arrayContaining(['h-move', 'h-use', 'h-out']));
    expect(liveStep('hideout', ctx)).toBeUndefined();
  });

  it('an existing player sees no first-fight lesson but a reminder of the first trap', () => {
    seed(4);
    expect(liveStep('run', { turn: 'placement' })).toBeUndefined();
    expect(liveStep('hideout', ctx)).toBeUndefined();
    tutorialEvent('see:trap');
    expect(liveStep('run', { turn: 'player' })?.id).toBe('t-trap');
    tutorialDone('t-trap');
    tutorialEvent('see:trap');
    expect(liveStep('run', { turn: 'player' })).toBeUndefined();
  });

  it('skip turns everything off; replay brings the basics back, even for a veteran', () => {
    seed(4);
    skipTutorial();
    tutorialEvent('got:relic');
    expect(liveStep('run', { turn: 'player' })).toBeUndefined();
    resetTutorial();
    expect(liveStep('hideout', ctx)?.id).toBe('h-move');
    expect(liveStep('run', { turn: 'placement' })?.id).toBe('f-place');
    _forgetTutorial();
    expect(liveStep('hideout', ctx)?.id).toBe('h-move');
  });

  it('the first fight goes placement, ready, PA/PM, move, spell, aim, end turn, enemy turn', () => {
    const seen: string[] = [];
    const at = (c: TutorialCtx) => { const s = liveStep('run', c); if (s && seen.at(-1) !== s.id) seen.push(s.id); return s; };
    at({ turn: 'placement' });
    tutorialEvent('run:placed', 'f-place');
    at({ turn: 'placement' });
    tutorialEvent('run:ready', 'f-ready');
    at({ turn: 'player' });
    tutorialDone('f-papm');
    at({ turn: 'player' });
    tutorialEvent('run:moved', 'f-move');
    at({ turn: 'player' });
    tutorialEvent('run:select', 'f-spell');
    at({ turn: 'player', aiming: true });
    tutorialEvent('run:cast', 'f-aim');
    at({ turn: 'player' });
    tutorialEvent('run:endturn', 'f-end');
    at({ turn: 'enemy' });
    expect(seen).toEqual(['f-place', 'f-ready', 'f-papm', 'f-move', 'f-spell', 'f-aim', 'f-end', 'f-enemy']);
    expect(basicTutorialPending('run')).toBe(true);
  });
});

describe('tutorial data', () => {
  it('ids are unique and every prerequisite exists in the same place', () => {
    const ids = TUTORIAL_STEPS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of TUTORIAL_STEPS) for (const a of s.after ?? []) {
      expect(TUTORIAL_STEPS.find(o => o.id === a)?.place, `${s.id} after ${a}`).toBe(s.place);
    }
  });

  it('every tip has a trigger, and no bubble is a wall of text', () => {
    for (const s of TUTORIAL_STEPS) {
      if (s.track === 'tip') expect(s.trigger, s.id).toBeTruthy();
      expect(s.text.length, s.id).toBeLessThanOrEqual(150);
      // A step nobody can complete would stay forever: it needs an action or a dismiss.
      expect(!!s.ack || !!s.until?.length, s.id).toBe(true);
    }
  });
});
