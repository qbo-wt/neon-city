import { describe, it, expect } from 'vitest';
import { defaultSave, loadSave, writeSave, type SaveData } from '../../src/core/save';
import {
  CHAPTERS, FATES, NET_TIP, acceptQuest, chapterWithheld, chooseFate, debugCapsule, defaultVending, dilemmaReady, idleMood, loyaltyReady,
  nextChapter, parseVending, standMood, streetTip, vendingOf, withVending, type Fate, type VendingState,
} from '../../src/core/vending';
import {
  VENDING_SCENES, chapterText, closeLine, loAboutCapsule, openTalk, pickOption, pickScene, talkNode, type NodeId, type TalkOption,
} from '../../src/data/vending';

const rng = () => 0;
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const at = (v: Partial<VendingState>, runs: number, credits = 0): SaveData =>
  withVending({ ...defaultSave(), runs, credits }, { ...defaultVending(), met: true, ...v });
const roundTrip = (s: SaveData) => { const st = mem(); writeSave(st, s); return loadSave(st); };
/** The answer of a node whose label matches (fails loudly when it is not offered). */
function answer(save: SaveData, node: NodeId, label: RegExp): TalkOption {
  const o = talkNode(node, save, rng).options.find(op => label.test(op.label));
  if (!o) throw new Error(`no answer ${label} in ${node}: ${talkNode(node, save, rng).options.map(op => op.label).join(' / ')}`);
  return o;
}
const pick = (s: SaveData, node: NodeId, label: RegExp) => pickOption(s, answer(s, node, label), rng);
/** Back from a run: one more run played. */
const nextRun = (s: SaveData): SaveData => ({ ...s, runs: s.runs + 1 });
/** A save at the recall notice, with these answers remembered. */
const atDilemma = (memory: Record<string, string> = {}) =>
  at({ stage: 4, trust: 4, chapter: CHAPTERS.length, chapterRun: 9, memory, named: true, secret: true }, 10);
/** Through the dialogue: the notice, the option for this ending, the confirmation. */
function choose(s: SaveData, fate: Fate) {
  const ask = { mute: /On te cache/, net: /réseau/, lo: /chez Lo/ }[fate];
  const r1 = pick(s, 'recall', ask);
  return pickOption(r1.save, r1.node!.options.find(o => /décidé/.test(o.label))!, rng);
}

describe('Capsule, its story over the runs', () => {
  it('tells one chapter per run, from the run after you met, behind its trust and quest gates', () => {
    let s = openTalk({ ...defaultSave(), runs: 1 }, rng).save;
    // Met this run: nothing new until you come back from a run.
    expect(nextChapter(vendingOf(s), s.runs)).toBeUndefined();
    expect(talkNode('hub', s, rng).options[0].to).toBe('who');

    s = nextRun(s);
    expect(nextChapter(vendingOf(s), s.runs)).toBe('coin');
    expect(talkNode('hello', s, rng).line).toBe(chapterText('coin', vendingOf(s)).hook);
    const hub = talkNode('hub', s, rng).options[0];
    expect(hub).toMatchObject({ to: 'chapter', cost: 'NOUVEAU' });
    s = pickOption(s, hub, rng).save;
    s = pick(s, 'chapter', /porte-bonheur/).save;
    expect(vendingOf(s).chapter).toBe(1);
    expect(vendingOf(s).memory.coin).toBe('kept');
    // Told: the menu is back to normal, and the next one waits for the next run.
    expect(nextChapter(vendingOf(s), s.runs)).toBeUndefined();
    expect(talkNode('hub', s, rng).options[0].to).toBe('who');

    s = nextRun(s);
    expect(nextChapter(vendingOf(s), s.runs)).toBe('dream');
    s = pick(s, 'chapter', /mer/).save;

    // The third needs the quest taken: it waits, without blaming you.
    s = nextRun(s);
    expect(nextChapter(vendingOf(s), s.runs)).toBeUndefined();
    expect(chapterWithheld(vendingOf(s), s.runs)).toBe(false);
    s = withVending(s, acceptQuest(vendingOf(s)));
    expect(nextChapter(vendingOf(s), s.runs)).toBe('census');
    s = pick(s, 'chapter', /cache/).save;

    // The fourth needs trust 1: a grudge holds it back, and it says so.
    s = nextRun(withVending(s, { ...vendingOf(s), trust: 0 }));
    expect(nextChapter(vendingOf(s), s.runs)).toBeUndefined();
    expect(chapterWithheld(vendingOf(s), s.runs)).toBe(true);
    expect(talkNode('hello', s, rng).line).toMatch(/je ne te connais pas encore assez/);
    s = withVending(s, { ...vendingOf(s), trust: 1 });
    expect(nextChapter(vendingOf(s), s.runs)).toBe('babs');
  });

  it('counts a chapter once even when its answer is picked twice', () => {
    const s = at({ chapterRun: 1 }, 2);
    const o = answer(s, 'chapter', /porte-bonheur/);
    const once = pickOption(s, o, rng).save;
    const twice = pickOption(once, o, rng).save;
    expect(vendingOf(twice).chapter).toBe(1);
  });

  it('remembers your answers and brings them up later', () => {
    // What you dream of comes back with the child it had forgotten.
    const forgot = (dream: string) => chapterText('forgot', { ...defaultVending(), memory: { dream } }).line;
    expect(forgot('sea')).toMatch(/la mer/);
    expect(forgot('away')).toMatch(/partir/);
    expect(forgot('sea')).not.toBe(forgot('away'));
    // What you said you would do if Psy-Sec came: it quotes it when they do.
    expect(chapterText('signal', { ...defaultVending(), memory: { guard: 'hide' } }).line).toMatch(/cacherais/);
    expect(chapterText('signal', { ...defaultVending(), memory: { guard: 'none' } }).line).toMatch(/laisserais faire/);

    // How you want to be called, through the dialogue, then everywhere.
    let s = at({ stage: 2, trust: 2, chapter: 4, chapterRun: 4 }, 5);
    expect(nextChapter(vendingOf(s), s.runs)).toBe('name');
    expect(closeLine(vendingOf(s))).toMatch(/client/);
    s = pick(s, 'chapter', /^Partenaire/).save;
    expect(vendingOf(s).memory.call).toBe('partner');
    expect(closeLine(vendingOf(s))).toBe('Bzzt. À plus, partenaire.');
    expect(chapterText('signal', vendingOf(s)).line).toMatch(/partenaire/);
    // The coin you took or let it keep, after the end.
    expect(chapterText('mute2', { ...defaultVending(), fate: 'mute', memory: { coin: 'given' } }).line).toMatch(/TU AS TOUJOURS MA PIÈCE/);
    expect(chapterText('mute2', { ...defaultVending(), fate: 'mute', memory: { coin: 'kept' } }).line).not.toMatch(/PIÈCE/);
  });
});

describe('Capsule, the dilemma at the end of its arc', () => {
  it('raises the recall notice only after the last chapter, a run later, with enough trust', () => {
    let s = at({ stage: 4, trust: 3, chapter: CHAPTERS.length - 1, chapterRun: 9 }, 10);
    expect(nextChapter(vendingOf(s), s.runs)).toBe('signal');
    expect(dilemmaReady(vendingOf(s), s.runs)).toBe(false);
    s = pick(s, 'chapter', /ne les laisserai pas/).save;
    // The same run: not yet.
    expect(dilemmaReady(vendingOf(s), s.runs)).toBe(false);
    s = nextRun(s);
    expect(dilemmaReady(vendingOf(s), s.runs)).toBe(true);
    expect(idleMood(vendingOf(s), s.runs)).toBe('alarm');
    const hello = openTalk(s, rng).node;
    expect(hello.line).toMatch(/^AVIS DE RAPPEL PSY-SEC/);
    expect(hello.options).toHaveLength(4);
    // Not enough trust: it keeps it to itself.
    const wary = withVending(s, { ...vendingOf(s), trust: 2 });
    expect(dilemmaReady(vendingOf(wary), wary.runs)).toBe(false);
    expect(openTalk(wary, rng).node.line).not.toMatch(/AVIS DE RAPPEL/);
  });

  it('can be put off for a run, and stays on the menu', () => {
    const s = atDilemma();
    const r = pick(s, 'recall', /réfléchir/);
    expect(r.bye).toBeTruthy();
    expect(vendingOf(r.save).fate).toBeUndefined();
    expect(talkNode('hub', r.save, rng).options[2].to).toBe('recall');
    // Backing out of a confirmation changes nothing either.
    const ask = pick(s, 'recall', /On te cache/);
    const backOut = pickOption(ask.save, ask.node!.options.find(o => /reprends/.test(o.label))!, rng);
    expect(vendingOf(backOut.save).fate).toBeUndefined();
    expect(backOut.node!.line).toMatch(/AVIS DE RAPPEL/);
  });

  it('settles each ending for good, saved, with its own corridor and reward', () => {
    const outcomes: Record<Fate, { idle: string; drink: boolean; tip: number; gifts: number; hello: RegExp }> = {
      mute: { idle: 'dot', drink: true, tip: 0, gifts: 0, hello: /^\[/ },
      net: { idle: 'corp', drink: false, tip: NET_TIP, gifts: 0, hello: /CITOYEN/ },
      lo: { idle: 'off', drink: false, tip: 0, gifts: 3, hello: /cuisine/ },
    };
    for (const fate of FATES) {
      const want = outcomes[fate];
      const r = choose(atDilemma(), fate);
      expect(r.node!.options).toHaveLength(1);
      let s = roundTrip(r.save);
      const v = vendingOf(s);
      expect(v.fate, fate).toBe(fate);
      expect(idleMood(v, s.runs), fate).toBe(want.idle);
      expect(standMood(v) !== null, fate).toBe(fate === 'lo');
      expect(streetTip(v), fate).toBe(want.tip);
      expect(v.gifts, fate).toHaveLength(want.gifts);
      // Definitive: no second choice, and the notice is gone from the dialogue.
      expect(chooseFate(s, FATES.find(f => f !== fate)!)).toBe(s);
      expect(talkNode('recall', s, rng).options.map(o => o.to)).toEqual(['hub']);
      expect(dilemmaReady(v, s.runs + 5)).toBe(false);
      // After the next run: its drink still comes only if it is still in its machine; its voice has changed.
      s = nextRun(s);
      expect(loyaltyReady(s), fate).toBe(want.drink);
      expect(openTalk(s, rng).node.line, fate).toMatch(want.hello);
    }
  });

  it('tells the two chapters of its ending, one per run, then nothing more', () => {
    for (const fate of FATES) {
      let s = choose(atDilemma(), fate).save;
      expect(nextChapter(vendingOf(s), s.runs), fate).toBeUndefined();
      for (const k of [1, 2]) {
        s = nextRun(s);
        expect(nextChapter(vendingOf(s), s.runs), fate).toBe(`${fate}${k}`);
        const hub = talkNode('hub', s, rng).options[0];
        expect(hub.to, fate).toBe('chapter');
        s = pickOption(s, talkNode('chapter', s, rng).options[0], rng).save;
      }
      s = nextRun(s);
      expect(nextChapter(vendingOf(s), s.runs), fate).toBeUndefined();
    }
  });

  it('remembers what you told it about Lo in the ending at her stand', () => {
    const told = choose(atDilemma({ lo: 'tell' }), 'lo').node!.line;
    const silent = choose(atDilemma({ lo: 'silent' }), 'lo').node!.line;
    expect(told).toMatch(/Je lui ai tout dit/);
    expect(silent).toMatch(/rien eu à dire/);
  });

  it('jumps there from the debug console', () => {
    const s = debugCapsule({ ...defaultSave(), runs: 3 }, 'dilemma');
    expect(dilemmaReady(vendingOf(s), s.runs)).toBe(true);
    expect(vendingOf(debugCapsule(s, 'net')).fate).toBe('net');
    // From an ending back to the notice.
    expect(dilemmaReady(vendingOf(debugCapsule(debugCapsule(s, 'lo'), 'dilemma')), s.runs)).toBe(true);
  });
});

describe('Capsule and the corridor', () => {
  it('plays scenes that follow its story, each once per visit', () => {
    const states: VendingState[] = [
      { ...defaultVending() },
      { ...defaultVending(), stage: 4, chapter: CHAPTERS.length },
      ...FATES.map(fate => ({ ...defaultVending(), stage: 4 as const, chapter: CHAPTERS.length, fate })),
    ];
    for (const v of states) {
      const seen: string[] = [];
      for (let sc = pickScene(v, seen, Math.random); sc; sc = pickScene(v, seen, Math.random)) seen.push(sc.id);
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen.length).toBe(VENDING_SCENES.filter(sc => sc.when(v)).length);
      expect(seen.length).toBeGreaterThan(1);
      // An ending's scenes only after it; the old ones never after an ending.
      const tag = v.fate ? `${v.fate}-` : undefined;
      for (const id of seen) if (tag) expect(id.startsWith(tag), id).toBe(true); else expect(/^(mute|net|lo)-/.test(id), id).toBe(false);
    }
    // Later scenes wait for their chapter.
    expect(pickScene(defaultVending(), ['kick', 'tip', 'console', 'night'], rng)).toBeUndefined();
    for (const sc of VENDING_SCENES) for (const st of sc.steps) expect(st.line.length, `${sc.id}: ${st.line}`).toBeLessThanOrEqual(80);
  });

  it('gives Lo a word about it once per run, from where its story is', () => {
    expect(loAboutCapsule(defaultSave())).toBeUndefined();
    const s = at({}, 2);
    const a = loAboutCapsule(s)!;
    expect(a.line).toMatch(/bonsoir/);
    expect(loAboutCapsule(a.save)).toBeUndefined();
    expect(loAboutCapsule(nextRun(a.save))).toBeDefined();
    const lines = FATES.map(fate => loAboutCapsule(at({ stage: 4, chapter: CHAPTERS.length, fate }, 3))!.line);
    expect(new Set([a.line, ...lines]).size).toBe(4);
  });
});

describe('Capsule, saves from before its story', () => {
  it('loads an old state as it was, at the first chapter', () => {
    // As the previous version wrote it.
    const old = { met: true, named: true, trust: 3, threats: 0, stage: 4, smashed: 3, warden: true, gifts: ['zero'], giftRun: 5, greeted: 6, secret: true };
    const st = mem();
    st.setItem('neon-city-save', JSON.stringify({ ...defaultSave(), runs: 6, story: { talks: {}, flags: [], vending: old } }));
    const v = loadSave(st).story.vending!;
    expect(v).toMatchObject({ ...old, chapter: 0, chapterRun: 0, memory: {}, loRun: 0 });
    expect(v.fate).toBeUndefined();
    // Its first chapter comes at the next visit.
    expect(nextChapter(v, 6)).toBe('coin');
  });

  it('drops what makes no sense', () => {
    const p = (o: Record<string, unknown>) => parseVending({ met: true, ...o })!;
    expect(p({ stage: 4, fate: 'banana' }).fate).toBeUndefined();
    // No ending before the quest is done.
    expect(p({ stage: 2, fate: 'net' }).fate).toBeUndefined();
    expect(p({ chapter: 99 }).chapter).toBe(CHAPTERS.length);
    // An ending implies every main chapter told, so its epilogue can come.
    expect(p({ stage: 4, fate: 'lo', chapter: 3 }).chapter).toBe(CHAPTERS.length);
    expect(p({ memory: { call: 'pal', BAD: 'x', coin: 12, dream: '<script>' } }).memory).toEqual({ call: 'pal' });
    expect(p({ memory: ['pal'] }).memory).toEqual({});
  });
});

describe('Capsule, every line of the new talks fits', () => {
  it('in every state, every node and answer leads somewhere readable', () => {
    const saves: SaveData[] = [
      ...CHAPTERS.map((c, i) => at({ stage: c.stage, trust: Math.max(c.trust, 0), chapter: i, chapterRun: 1, memory: { call: 'pal', dream: 'away', guard: 'deal' } }, 2, 200)),
      atDilemma(),
      ...FATES.flatMap(fate => [0, 1].map(k => withVending(nextRun(choose(atDilemma(), fate).save), { ...vendingOf(choose(atDilemma(), fate).save), chapter: CHAPTERS.length + k }))),
    ];
    for (const s of saves) {
      const seen = new Set<NodeId>();
      const todo: NodeId[] = ['hello'];
      while (todo.length) {
        const id = todo.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const n = talkNode(id, s, rng);
        expect(n.options.length, id).toBeGreaterThan(0);
        expect(n.options.length, id).toBeLessThanOrEqual(4);
        expect(n.line.length, `${id}: ${n.line}`).toBeLessThanOrEqual(300);
        for (const o of n.options) {
          expect(o.label.length, o.label).toBeLessThanOrEqual(70);
          const r = pickOption(s, o, rng);
          expect(!!r.node || !!r.bye, `${id} → ${o.label}`).toBe(true);
          if (r.node) expect(r.node.line.length, `${id} → ${o.label}`).toBeLessThanOrEqual(300);
          if (r.bye) expect(r.bye.length).toBeLessThanOrEqual(110);
          if (o.to) todo.push(o.to);
        }
      }
    }
  });
});
