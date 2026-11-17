import { describe, it, expect } from 'vitest';
import { defaultSave, loadSave, writeSave, type SaveData } from '../../src/core/save';
import { afterRun, loyaltyDrink, loyaltyReady, payModule, takeGifts, turnIn, vendingOf, withVending, defaultVending } from '../../src/core/vending';
import { openTalk, pickOption, talkNode, type NodeId, type TalkOption } from '../../src/data/vending';

const rng = () => 0;
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
/** Picks the answer of a node by its label (fails loudly when it is not offered). */
function answer(save: SaveData, node: NodeId, label: RegExp): TalkOption {
  const o = talkNode(node, save, rng).options.find(op => label.test(op.label));
  if (!o) throw new Error(`no answer ${label} in ${node}`);
  return o;
}
/** Plays a run that broke `smashed` street machines and maybe beat the Lieutenant. */
const run = (s: SaveData, smashed: number, wardenDown = false): SaveData =>
  ({ ...s, runs: s.runs + 1, story: { ...s.story, vending: afterRun(s.story.vending, { smashed, wardenDown }) } });

describe('Capsule, the talking vending machine', () => {
  it('walks the whole quest over several runs, through the dialogue', () => {
    let s: SaveData = { ...defaultSave(), runs: 2, credits: 100 };
    s = openTalk(s, rng).save;
    expect(vendingOf(s).met).toBe(true);
    // Breaking machines before taking the quest counts for nothing.
    s = run(s, 2);
    expect(vendingOf(s).smashed).toBe(0);
    s = pickOption(s, answer(s, 'offer', /Marché conclu/), rng).save;
    expect(vendingOf(s).stage).toBe(1);

    // Two machines, then two more: three is enough, and the Lieutenant does not count yet.
    s = run(s, 2, true);
    expect(talkNode('hub', s, rng).options[2].to).toBe('smashing');
    s = run(s, 2);
    const hand = talkNode('hub', s, rng).options[2];
    expect(hand.to).toBe('smashDone');
    const credits = s.credits;
    s = pickOption(s, hand, rng).save;
    expect(s.credits).toBe(credits + 30);
    expect(vendingOf(s).gifts).toEqual(['cherry']);
    expect(vendingOf(s).stage).toBe(2);
    expect(vendingOf(s).warden).toBe(false);

    // Beating the Lieutenant now counts; the crowbar comes on top of the drink not drunk yet.
    s = run(s, 5, true);
    s = pickOption(s, talkNode('hub', s, rng).options[2], rng).save;
    expect(vendingOf(s).stage).toBe(3);
    expect(vendingOf(s).gifts).toEqual(['cherry', 'crowbar']);

    // The memory module costs 80¢ and cannot be bought without them.
    const pay = answer(s, 'module', /Garde tout le monde/);
    expect(pay.enabled).toBe(true);
    const poor = { ...s, credits: 79 };
    expect(answer(poor, 'module', /Garde tout le monde/).enabled).toBe(false);
    expect(payModule(poor)).toBe(poor);
    const before = s.credits;
    s = pickOption(s, pay, rng).save;
    expect(s.credits).toBe(before - 80);
    expect(vendingOf(s).stage).toBe(4);
  });

  it('gives one loyalty drink per run once the quest is done, used up by the next run', () => {
    let s = withVending({ ...defaultSave(), runs: 6, credits: 80 }, { ...defaultVending(), stage: 3 });
    s = payModule(s);
    expect(loyaltyReady(s)).toBe(true);
    s = loyaltyDrink(s, rng).save;
    expect(vendingOf(s).gifts).toHaveLength(1);
    expect(loyaltyReady(s)).toBe(false);
    expect(loyaltyDrink(s, rng).save).toBe(s);
    const taken = takeGifts(s);
    expect(taken.gifts).toHaveLength(1);
    expect(vendingOf(taken.save).gifts).toEqual([]);
    s = run(taken.save, 0);
    expect(loyaltyReady(s)).toBe(true);
  });

  it('holds a grudge after threats until you apologise', () => {
    let s = openTalk({ ...defaultSave(), runs: 1 }, rng).save;
    s = pickOption(s, answer(s, 'who', /tas de tôle/), rng).save;
    s = pickOption(s, answer(s, 'psysec', /rebranchais/), rng).save;
    expect(vendingOf(s).trust).toBe(-2);
    expect(talkNode('hub', s, rng).options[2].to).toBe('apology');
    s = pickOption(s, answer(s, 'apology', /Pardon/), rng).save;
    expect(vendingOf(s).trust).toBeGreaterThan(-2);
    expect(talkNode('hub', s, rng).options[2].to).toBe('offer');
  });

  it('is saved with the game and survives a corrupt entry', () => {
    const st = mem();
    const s = withVending(defaultSave(), { ...defaultVending(), met: true, stage: 2, trust: 4, gifts: ['zero'] });
    writeSave(st, s);
    expect(loadSave(st).story.vending).toEqual(vendingOf(s));
    st.setItem('neon-city-save', JSON.stringify({ ...s, story: { ...s.story, vending: { stage: 9, trust: 'x', gifts: ['beer', 'cherry'], smashed: -1 } } }));
    const v = loadSave(st).story.vending!;
    expect(v.stage).toBe(0);
    expect(v.trust).toBe(0);
    expect(v.gifts).toEqual(['cherry']);
    expect(v.smashed).toBe(0);
    expect(turnIn(withVending(defaultSave(), v)).credits).toBe(0);
  });

  it('every answer of every node leads somewhere that fits the panel', () => {
    const saves: SaveData[] = [0, 1, 2, 3, 4].flatMap(stage => [-3, 0, 5].map(trust =>
      withVending({ ...defaultSave(), runs: 3, credits: 200 }, { ...defaultVending(), met: true, stage: stage as 0, trust, smashed: 3, warden: true })));
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
        expect(n.line.length, id).toBeLessThanOrEqual(330);
        for (const o of n.options) {
          const r = pickOption(s, o, rng);
          expect(!!r.node || !!r.bye, `${id} → ${o.label}`).toBe(true);
          if (r.node) expect(r.node.line.length, `${id} → ${o.label}`).toBeLessThanOrEqual(330);
          if (o.to) todo.push(o.to);
        }
      }
    }
  });
});
