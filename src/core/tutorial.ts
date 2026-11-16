import { loadSave } from './save';
import { getStorage } from './storage';
import { TUTORIAL_STEPS, type TutorialCtx } from '../data/tutorial';

/**
 * The guided tutorial's rules, apart from any drawing (src/ui/Tutorial.ts draws the bubbles).
 *
 * Steps are listed in src/data/tutorial.ts. A "basic" step teaches the controls of a place (the
 * apartment, the corridor, the first fight) and is shown in list order; a "tip" is a one-off reminder
 * that waits for its trigger (first trap, first relic, first boss…) and is shown once nothing basic is.
 * Each step is shown until the player does what it says (one of its `until` events) or dismisses it.
 *
 * Progress lives under its own storage key, apart from the save: scenes hold a copy of the save and
 * write it back whole, so a step marked done mid-scene would be erased by that stale copy.
 */
export interface TutorialStep<Ctx = unknown> {
  id: string;
  track: 'basic' | 'tip';
  /** the place it belongs to: 'hideout', 'building', 'clinic', 'den', 'run' */
  place: string;
  text: string;
  /** what the bubble points at (an anchor name the scene resolves to a screen rect) */
  point?: string;
  /** events that complete it */
  until?: string[];
  /** the bubble can also be dismissed by a click (or Entrée in the hub) */
  ack?: boolean;
  /** steps that must be done first */
  after?: string[];
  /** extra condition on the scene's live state (whose turn it is…) */
  when?: (ctx: Ctx) => boolean;
  /** tips: the event that queues it */
  trigger?: string;
  /** its `until` events only count while it is on screen (always true for tips) */
  onlyShown?: boolean;
}

export interface TutorialState {
  version: 1;
  /** steps already done or dismissed */
  done: string[];
  /** "Passer le tutoriel": no bubble at all any more */
  off: boolean;
  /** a player who had played runs before the tutorial existed: no basic steps, tips only */
  veteran: boolean;
}

export const TUTORIAL_KEY = 'neon-city-tutorial';

/** First state of a player: basic steps unless they have played runs already. */
export function freshTutorial(runs: number): TutorialState {
  return { version: 1, done: [], off: false, veteran: runs > 0 };
}

/** Never throws: a missing or damaged copy starts over (from the save's run count). */
export function loadTutorial(storage: Pick<Storage, 'getItem'>, runs: number): TutorialState {
  try {
    const raw = storage.getItem(TUTORIAL_KEY);
    if (!raw) return freshTutorial(runs);
    const d = JSON.parse(raw) as Record<string, unknown> | null;
    if (!d || typeof d !== 'object' || Array.isArray(d) || d.version !== 1) return freshTutorial(runs);
    return {
      version: 1,
      done: Array.isArray(d.done) ? [...new Set(d.done.filter((x): x is string => typeof x === 'string'))].slice(0, 200) : [],
      off: d.off === true,
      veteran: typeof d.veteran === 'boolean' ? d.veteran : runs > 0,
    };
  } catch {
    return freshTutorial(runs);
  }
}

export function writeTutorial(storage: Pick<Storage, 'setItem'>, s: TutorialState): void {
  try {
    storage.setItem(TUTORIAL_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked or full: progress holds for this session only.
  }
}

/** Whether a step may still be shown at all (not done, tutorial on, basic steps allowed). */
export function stillOpen<Ctx>(s: TutorialState, step: TutorialStep<Ctx>): boolean {
  if (s.off || s.done.includes(step.id)) return false;
  return step.track === 'tip' || !s.veteran;
}

/**
 * The step to show now in `place`: the first open basic step whose prerequisites are done and whose
 * condition holds; else the first queued tip that can show. `canShow` lets the scene veto a step
 * (e.g. a tip whose target is not on the board).
 */
export function currentStep<Ctx>(s: TutorialState, steps: readonly TutorialStep<Ctx>[], place: string, ctx: Ctx,
  pending: ReadonlySet<string>, canShow: (step: TutorialStep<Ctx>) => boolean = () => true): TutorialStep<Ctx> | undefined {
  const ok = (st: TutorialStep<Ctx>) => st.place === place && stillOpen(s, st)
    && (st.after ?? []).every(id => s.done.includes(id)) && (!st.when || st.when(ctx)) && canShow(st);
  return steps.find(st => st.track === 'basic' && ok(st)) ?? steps.find(st => st.track === 'tip' && pending.has(st.id) && ok(st));
}

export function completeStep(s: TutorialState, id: string): TutorialState {
  return s.done.includes(id) ? s : { ...s, done: [...s.done, id] };
}

/**
 * Something happened in the game. Completes the open basic steps waiting for it (wherever they
 * are: a player who already knows skips them), and the shown step if it waits for it; returns the
 * tips it triggers.
 */
export function applyEvent<Ctx>(s: TutorialState, steps: readonly TutorialStep<Ctx>[], event: string, shownId?: string):
  { state: TutorialState; triggered: string[] } {
  let state = s;
  const triggered: string[] = [];
  for (const st of steps) {
    if (!stillOpen(state, st)) continue;
    if (st.track === 'tip' && st.trigger === event) triggered.push(st.id);
    const waits = st.until?.includes(event);
    if (waits && (st.id === shownId || (st.track === 'basic' && !st.onlyShown))) state = completeStep(state, st.id);
  }
  return { state, triggered };
}

// ---------- live progress, shared by every scene ----------


let current: TutorialState | undefined;
/** tips triggered and not shown yet (this session only: a missed one triggers again next time) */
const pending = new Set<string>();

export function tutorialState(): Readonly<TutorialState> {
  if (!current) {
    const storage = getStorage();
    current = loadTutorial(storage, loadSave(storage).runs);
  }
  return current;
}

function commit(next: TutorialState) {
  if (next === current) return;
  current = next;
  writeTutorial(getStorage(), next);
}

/** The step to show in `place` right now. */
export function liveStep(place: string, ctx: TutorialCtx, canShow?: (step: TutorialStep<TutorialCtx>) => boolean) {
  return currentStep(tutorialState(), TUTORIAL_STEPS, place, ctx, pending, canShow);
}

/** Reports a game event (see the `until` and `trigger` names in src/data/tutorial.ts). */
export function tutorialEvent(event: string, shownId?: string) {
  const s = tutorialState();
  if (s.off) return;
  const r = applyEvent(s, TUTORIAL_STEPS, event, shownId);
  r.triggered.forEach(id => pending.add(id));
  commit(r.state);
}

/** The player dismissed (or finished) a step. */
export function tutorialDone(id: string) {
  pending.delete(id);
  commit(completeStep(tutorialState(), id));
}

/** "Passer le tutoriel": no more bubbles, basic or tips. */
export function skipTutorial() {
  pending.clear();
  commit({ ...tutorialState(), off: true });
}

/** "Rejouer le tutoriel" (options): everything shows again, from the first step, even for veterans. */
export function resetTutorial() {
  pending.clear();
  commit({ ...freshTutorial(0) });
}

/** The basic steps of `place` are still to come (the hub skips its auto-opening guide then). */
export function basicTutorialPending(place: string): boolean {
  const s = tutorialState();
  return TUTORIAL_STEPS.some(st => st.track === 'basic' && st.place === place && stillOpen(s, st));
}

/** Test hook: forget the live copy (the next read loads from storage). */
export function _forgetTutorial() { current = undefined; pending.clear(); }
