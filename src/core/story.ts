import { ARCS, BOSS_LINES, REACTIONS, type LastRunView, type StoryNpc } from '../data/story';
import type { SaveData } from './save';
import type { Rng } from './rng';

export interface Spoken { line: string; save: SaveData; gift?: number; kind: 'reaction' | 'beat' | 'ambient' }

/** Drops this NPC's old once-per-run flags and adds the new one. */
function flag(flags: string[], prefix: string, runs: number): string[] {
  return [...flags.filter(f => !f.startsWith(prefix)), `${prefix}${runs}`];
}

/**
 * What an NPC says when you talk to them, in order of priority:
 * 1. once per run, a reaction to how your last run went;
 * 2. once per run, the next beat of their story (beat k needs k runs played; the last gives a gift);
 * 3. otherwise one of their usual lines.
 * Pure: returns the updated save, the caller persists it.
 */
export function nextLine(npc: StoryNpc, save: SaveData, ambient: readonly string[], rng: Rng, killerName?: (id: string) => string | undefined): Spoken {
  const st = save.story, runs = save.runs;
  const last = st.lastRun;
  if (last && !st.flags.includes(`react-${npc}-${runs}`)) {
    const view: LastRunView = { ...last, killerName: last.killer && last.killer !== 'psychosis' ? killerName?.(last.killer) : undefined };
    const line = REACTIONS[npc].map(f => f(view)).find(Boolean);
    if (line) return { line, kind: 'reaction', save: { ...save, story: { ...st, flags: flag(st.flags, `react-${npc}-`, runs) } } };
  }
  const arc = ARCS[npc];
  const told = st.talks[npc] ?? 0;
  if (arc && told < arc.beats.length && runs >= told + 1 && !st.flags.includes(`beat-${npc}-${runs}`)) {
    const last = told === arc.beats.length - 1;
    const next: SaveData = {
      ...save,
      credits: save.credits + (last ? arc.gift : 0),
      story: { ...st, talks: { ...st.talks, [npc]: told + 1 }, flags: flag(st.flags, `beat-${npc}-`, runs) },
    };
    return { line: arc.beats[told], kind: 'beat', save: next, gift: last ? arc.gift : undefined };
  }
  return { line: ambient[Math.floor(rng() * ambient.length)] ?? '...', kind: 'ambient', save };
}

/** The boss's entry line, from your history with it. */
export function bossIntro(id: 'warden' | 'boss', save: SaveData): string {
  const l = BOSS_LINES[id];
  if (save.story.lastRun?.killer === id) return l.killedYou;
  if ((save.codex[id] ?? 0) > 0) return l.beaten;
  if ((save.deaths[id] ?? 0) > 0) return l.again;
  return l.first;
}
