import Phaser from 'phaser';
import { CONFIG, COLORS, SCENES } from '../config';
import type { Controls } from '../input/controls';
import { loadSave, writeSave, type SaveData } from '../core/save';
import { getStorage } from '../core/storage';
import { GIFTS, debugCapsule, idleMood, questReady, standMood, vendingOf, withVending, type Fate, type VendingMood, type VendingState } from '../core/vending';
import {
  SHELL_LINE, bubbleName, closeLine, mutter, openTalk, panelCode, pickOption, pickScene, vendingName,
  type Cast, type TalkNode, type TalkOption, type VendingScene,
} from '../data/vending';
import { drawVendingFace, vendingLive } from '../gfx/vendingFace';
import type { Npc } from '../entities/Npc';
import { audio } from '../audio/audio';
import { floatText } from '../fx/effects';
import { ChoicePanel } from './ChoicePanel';
import { txt } from './text';

const TONE_TAG = { kind: 'GENTIL', snark: 'PIQUANT', threat: 'MENACE' } as const;
const FACE_KEY = 'vending-face', FACE_W = 96, FACE_H = 48;
/** Screen y of the top of the machine, and of the till on Lo's counter (their bubbles go above). */
const MACHINE_TOP = 36, TILL_TOP = 50;
/** How close you come for a little scene to start, and the pause between two of them. */
const SCENE_RANGE = 110, SCENE_GAP = 22000;

type Spot = { x: number; y: number };

/**
 * Capsule in the corridor: the conversation (a ChoicePanel per node, with its face as a portrait),
 * the speech bubbles over the machine (or over Lo's till once its chip lives there), what it mutters
 * when you walk by, its little scenes with the residents, and its faces on the 3D screens (through
 * `vendingLive`). A modal of the InteriorScene while the panel is up.
 */
export class VendingTalk {
  private panel?: ChoicePanel;
  private bubble?: Phaser.GameObjects.Container;
  private bubbleUntil = 0;
  private bubbleMood: VendingMood = 'neutral';
  private nextMutter = 0;
  private nextScene = 0;
  private scenesSeen: string[] = [];
  private sceneTimers: Phaser.Time.TimerEvent[] = [];
  private playing = false;
  private cast: Partial<Record<Exclude<Cast, 'capsule'>, Npc>> = {};
  private mood: VendingMood = 'neutral';
  private talkUntil = 0;
  private faceAt = 0;
  private pendingBye = false;
  private seen = false;
  private face: Phaser.Textures.CanvasTexture;

  constructor(private scene: Phaser.Scene, private controls: Controls | (() => Controls), private spots: { machine: Spot; till: Spot },
    private getSave: () => SaveData, private setSave: (s: SaveData) => void,
    private player: () => { x: number; y: number }, private onSeen: () => void) {
    this.face = (scene.textures.exists(FACE_KEY) ? scene.textures.get(FACE_KEY) : scene.textures.createCanvas(FACE_KEY, FACE_W, FACE_H)) as Phaser.Textures.CanvasTexture;
    this.nextMutter = scene.time.now + 4000;
    this.nextScene = scene.time.now + 2500;
    const v = this.v;
    vendingLive.mood = idleMood(v, getSave().runs);
    vendingLive.stand = standMood(v);
    vendingLive.talkUntil = 0;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { vendingLive.mood = 'neutral'; vendingLive.stand = null; vendingLive.talkUntil = 0; });
  }

  get isOpen() { return !!this.panel; }
  close() { this.panel?.close(); }
  /** How its arc ended (the corridor's interactions follow it). */
  get fate(): Fate | undefined { return this.v.fate; }
  /** The prompt at the machine. */
  get machineLabel(): string {
    const v = this.v;
    return v.fate === 'mute' ? 'Taper sur la vitre de Capsule' : v.fate === 'net' ? 'Parler au distributeur NC-38'
      : v.fate === 'lo' ? 'Regarder l\'ancien distributeur' : v.named ? 'Parler à Capsule' : 'Parler au distributeur';
  }

  /** The residents who play the little scenes with it. */
  setCast(cast: Partial<Record<Exclude<Cast, 'capsule'>, Npc>>) { this.cast = cast; }

  private get v(): VendingState { return vendingOf(this.getSave()); }
  private get keys() { return typeof this.controls === 'function' ? this.controls() : this.controls; }
  /** Where it lives now: its machine, or the till of Lo's stand. */
  private anchor(): Spot & { top: number } {
    return this.v.fate === 'lo' ? { ...this.spots.till, top: TILL_TOP } : { ...this.spots.machine, top: MACHINE_TOP };
  }
  /** Its face at rest, wherever it lives. */
  private restMood(v: VendingState): VendingMood {
    return v.fate === 'lo' ? standMood(v)! : !v.fate && questReady(v) ? 'happy' : idleMood(v, this.getSave().runs);
  }

  /** [E] at the machine (`till`: at Lo's till, where its chip may live). */
  open(where: 'machine' | 'till' = 'machine') {
    if (this.panel) return;
    this.stopScene();
    this.bubble?.destroy(); this.bubble = undefined;
    if (this.v.fate === 'lo' && where === 'machine') { this.say(SHELL_LINE, 'off', undefined, { ...this.spots.machine, top: MACHINE_TOP }, 'Distributeur'); return; }
    const r = openTalk(this.getSave(), Math.random);
    this.setSave(r.save);
    this.show(r.node, false);
  }

  /** Keys while the panel is up (the scene's modal tick). */
  panelTick() { this.panel?.tick(); }

  private show(node: TalkNode, quiet: boolean) {
    this.pendingBye = false;
    this.mood = node.mood;
    this.talk(node.line);
    audio.sfx('talk', { pitch: this.v.fate === 'mute' ? 2 : 1.3 });
    const v = this.v;
    const p: ChoicePanel = new ChoicePanel(this.scene, this.keys, vendingName(v), node.line,
      node.options.map(o => ({ label: o.label, desc: o.desc ?? '', cost: o.cost ?? (o.tone ? TONE_TAG[o.tone] : undefined), enabled: o.enabled, pick: () => this.pick(o) })),
      () => {
        if (this.panel !== p) return;
        this.panel = undefined;
        // Picking an answer closes the panel first: wait a tick to know whether another one opened.
        this.pendingBye = true;
        this.scene.time.delayedCall(0, () => { if (this.pendingBye && !this.panel) { this.pendingBye = false; const cur = this.v; this.say(closeLine(cur), this.restMood(cur)); } });
      }, COLORS.magenta, { code: panelCode(v), portrait: FACE_KEY, quiet });
    this.panel = p;
    this.drawFace(this.scene.time.now, true);
  }

  private pick(o: TalkOption) {
    const before = this.getSave();
    const r = pickOption(before, o, Math.random);
    this.setSave(r.save);
    this.rewards(before, r.save);
    if (r.node) this.show(r.node, true);
    else {
      this.pendingBye = false;
      const a = vendingOf(before), b = vendingOf(r.save);
      // Its last words before an ending carry its old name (the machine that replaces it has its own).
      this.say(r.bye ?? '...', this.restMood(b), undefined, undefined, a.fate !== b.fate ? bubbleName(a) : undefined);
    }
  }

  /** Credits and drinks changing hands float over the player and over it. */
  private rewards(a: SaveData, b: SaveData) {
    const p = this.player(), dc = b.credits - a.credits, at = this.anchor();
    if (dc) { floatText(this.scene, p.x, p.y - 40, `${dc > 0 ? '+' : ''}${dc}¢`, dc > 0 ? '#f5e663' : '#ff2a6d', 9); audio.sfx('buy'); }
    const ga = vendingOf(a).gifts, gb = vendingOf(b).gifts;
    if (gb.length > ga.length || (gb.length && gb[gb.length - 1] !== ga[ga.length - 1])) {
      const n = gb.length - ga.length;
      floatText(this.scene, at.x, at.top, n > 1 ? `+ ${n} NEON COLA` : `+ ${GIFTS[gb[gb.length - 1]].name.toUpperCase()}`, '#39ff88', 7);
      audio.sfx('relic');
    }
  }

  /** The mouth moves for a while, on the 3D screen and on the portrait. */
  private talk(line: string) {
    const ms = Math.min(4000, 600 + line.length * 30);
    this.talkUntil = this.scene.time.now + ms;
    vendingLive.talkUntil = performance.now() + ms;
  }

  /** A speech bubble over it, like the residents'. */
  private say(line: string, mood: VendingMood, ms = 2800 + line.length * 40, at = this.anchor(), name = bubbleName(this.v)) {
    this.bubble?.destroy();
    audio.sfx('talk', { pitch: this.v.fate === 'mute' ? 2 : 1.3 });
    const s = this.scene;
    const t = txt(s, 0, 0, line, 6, '#e8e8ff').setOrigin(0.5).setWordWrapWidth(150).setAlign('center');
    const bg = s.add.rectangle(0, 0, t.width + 8, t.height + 6, 0x05030f, 0.92).setStrokeStyle(1, 0xff2a6d);
    const label = txt(s, -bg.width / 2 + 2, -bg.height / 2 - 7, name, 5, '#f5e663');
    const x = Phaser.Math.Clamp(at.x, bg.width / 2 + 2, CONFIG.WIDTH - bg.width / 2 - 2);
    this.bubble = s.add.container(x, at.top - 4 - bg.height / 2, [bg, t, label]).setDepth(60);
    this.bubbleUntil = s.time.now + ms;
    this.bubbleMood = mood;
    this.talk(line);
  }

  private drawFace(now: number, force = false) {
    if (!force && now - this.faceAt < 80) return;
    this.faceAt = now;
    drawVendingFace(this.face.context, FACE_W, FACE_H, now / 1000, this.mood, now < this.talkUntil);
    this.face.refresh();
  }

  /** A little scene with the residents: its lines and theirs in turn, each bubble gone when the next comes. */
  private play(sc: VendingScene, now: number) {
    this.playing = true;
    this.scenesSeen.push(sc.id);
    let t = 0;
    for (const step of sc.steps) {
      const ms = 1700 + step.line.length * 45;
      this.sceneTimers.push(this.scene.time.delayedCall(t, () => {
        if (this.panel) return;
        if (step.who === 'capsule') this.say(step.line, step.mood ?? 'neutral', ms);
        else this.cast[step.who]?.say(step.line, ms);
      }));
      t += ms + 150;
    }
    this.sceneTimers.push(this.scene.time.delayedCall(t, () => { this.playing = false; }));
    this.nextMutter = Math.max(this.nextMutter, now + t + 5000);
  }

  private stopScene() {
    for (const e of this.sceneTimers) e.remove(false);
    this.sceneTimers = [];
    this.playing = false;
  }

  /** Every frame (modal or not). */
  tick(now: number) {
    const v = this.v;
    if (this.bubble && now > this.bubbleUntil) { this.bubble.destroy(); this.bubble = undefined; }
    const live = this.panel ? this.mood : this.bubble ? this.bubbleMood : this.restMood(v);
    // Grafted into Lo's till: its old machine stays dark.
    if (v.fate === 'lo') { vendingLive.mood = 'off'; vendingLive.stand = live; } else { vendingLive.mood = live; vendingLive.stand = null; }
    if (this.panel) { this.drawFace(now); return; }
    const p = this.player(), at = this.anchor();
    const d = Phaser.Math.Distance.Between(p.x, p.y, at.x, at.y);
    if (d < 80 && !this.seen) { this.seen = true; this.onSeen(); }
    if (this.playing) return;
    // Come near and the corridor plays one of its little scenes, now and then.
    if (d < SCENE_RANGE && now >= this.nextScene) {
      this.nextScene = now + SCENE_GAP + Math.random() * 12000;
      const sc = pickScene(v, this.scenesSeen, Math.random);
      if (sc && sc.steps.every(s => s.who === 'capsule' || this.cast[s.who])) { this.play(sc, now); return; }
    }
    // It mutters when you walk by; it calls you over when there is news.
    if (!this.bubble && d < 70 && now >= this.nextMutter) {
      this.nextMutter = now + 9000 + Math.random() * 7000;
      const m = mutter(this.getSave(), Math.random);
      this.say(m.line, m.mood);
    }
  }
}

/**
 * `?debug` console helpers to see the end of its arc without playing it all: `capsule.dilemma()`
 * (the recall notice is up), `capsule.fate('mute' | 'net' | 'lo')` (an ending chosen), `capsule.run()`
 * (as if a run was played: the next chapter unlocks), `capsule.state()`, `capsule.reset()`. Each one
 * writes the save and reloads the corridor if you are in it.
 */
export function capsuleDebug(game: Phaser.Game) {
  const apply = (f: (s: SaveData) => SaveData) => {
    const st = getStorage();
    const s = f(loadSave(st));
    writeSave(st, s);
    const sc = game.scene.getScene(SCENES.Building);
    if (sc?.scene.isActive()) sc.scene.restart();
    return s.story.vending;
  };
  return {
    dilemma: () => apply(s => debugCapsule(s, 'dilemma')),
    fate: (f: Fate) => apply(s => debugCapsule(s, f)),
    run: () => apply(s => ({ ...s, runs: s.runs + 1 })),
    state: () => loadSave(getStorage()).story.vending,
    reset: () => apply(s => { const { vending: _v, ...story } = s.story; return { ...s, story }; }),
    /** any field by hand, e.g. capsule.set({ trust: 5 }) */
    set: (patch: Partial<VendingState>) => apply(s => withVending(s, { ...vendingOf(s), ...patch })),
  };
}
