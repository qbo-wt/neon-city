import Phaser from 'phaser';
import { CONFIG, COLORS } from '../config';
import type { Controls } from '../input/controls';
import type { SaveData } from '../core/save';
import { GIFTS, idleMood, questReady, vendingOf, type VendingMood } from '../core/vending';
import { VENDING_AMBIENT, VENDING_CALL, VENDING_NAME, openTalk, pickOption, vendingName, type TalkNode, type TalkOption } from '../data/vending';
import { drawVendingFace, vendingLive } from '../gfx/vendingFace';
import { audio } from '../audio/audio';
import { floatText } from '../fx/effects';
import { ChoicePanel } from './ChoicePanel';
import { txt } from './text';

const TONE_TAG = { kind: 'GENTIL', snark: 'PIQUANT', threat: 'MENACE' } as const;
const FACE_KEY = 'vending-face', FACE_W = 96, FACE_H = 48;
/** Screen y of the machine's top (its bubble goes above). */
const TOP_Y = 36;

/**
 * Capsule in the corridor: the conversation (a ChoicePanel per node, with its face as a portrait),
 * the speech bubble over the machine, what it mutters when you walk by, and its face on the 3D
 * screen (through `vendingLive`). A modal of the InteriorScene while the panel is up.
 */
export class VendingTalk {
  private panel?: ChoicePanel;
  private bubble?: Phaser.GameObjects.Container;
  private bubbleUntil = 0;
  private bubbleMood: VendingMood = 'neutral';
  private nextMutter = 0;
  private mood: VendingMood = 'neutral';
  private talkUntil = 0;
  private faceAt = 0;
  private pendingBye = false;
  private seen = false;
  private face: Phaser.Textures.CanvasTexture;

  constructor(private scene: Phaser.Scene, private controls: Controls | (() => Controls), private at: { x: number; y: number },
    private getSave: () => SaveData, private setSave: (s: SaveData) => void,
    private player: () => { x: number; y: number }, private onSeen: () => void) {
    this.face = (scene.textures.exists(FACE_KEY) ? scene.textures.get(FACE_KEY) : scene.textures.createCanvas(FACE_KEY, FACE_W, FACE_H)) as Phaser.Textures.CanvasTexture;
    this.nextMutter = scene.time.now + 4000;
    vendingLive.mood = idleMood(vendingOf(getSave()));
    vendingLive.talkUntil = 0;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { vendingLive.mood = 'neutral'; vendingLive.talkUntil = 0; });
  }

  get isOpen() { return !!this.panel; }
  close() { this.panel?.close(); }

  private get keys() { return typeof this.controls === 'function' ? this.controls() : this.controls; }

  /** [E] near the machine. */
  open() {
    if (this.panel) return;
    this.bubble?.destroy(); this.bubble = undefined;
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
    audio.sfx('talk', { pitch: 1.3 });
    const v = vendingOf(this.getSave());
    const p: ChoicePanel = new ChoicePanel(this.scene, this.keys, vendingName(v), node.line,
      node.options.map(o => ({ label: o.label, desc: o.desc ?? '', cost: o.cost ?? (o.tone ? TONE_TAG[o.tone] : undefined), enabled: o.enabled, pick: () => this.pick(o) })),
      () => {
        if (this.panel !== p) return;
        this.panel = undefined;
        // Picking an answer closes the panel first: wait a tick to know whether another one opened.
        this.pendingBye = true;
        this.scene.time.delayedCall(0, () => { if (this.pendingBye && !this.panel) { this.pendingBye = false; this.say('Bzzt. À plus, client.', idleMood(vendingOf(this.getSave()))); } });
      }, COLORS.magenta, { code: 'NEON COLA // NC-37', portrait: FACE_KEY, quiet });
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
      this.say(r.bye ?? '...', idleMood(vendingOf(r.save)));
    }
  }

  /** Credits and drinks changing hands float over the player and the machine. */
  private rewards(a: SaveData, b: SaveData) {
    const p = this.player(), dc = b.credits - a.credits;
    if (dc) { floatText(this.scene, p.x, p.y - 40, `${dc > 0 ? '+' : ''}${dc}¢`, dc > 0 ? '#f5e663' : '#ff2a6d', 9); audio.sfx('buy'); }
    const ga = vendingOf(a).gifts, gb = vendingOf(b).gifts;
    if (gb.length > ga.length || (gb.length && gb[gb.length - 1] !== ga[ga.length - 1])) {
      floatText(this.scene, this.at.x, TOP_Y, `+ ${GIFTS[gb[gb.length - 1]].name.toUpperCase()}`, '#39ff88', 7);
      audio.sfx('relic');
    }
  }

  /** The mouth moves for a while, on the 3D screen and on the portrait. */
  private talk(line: string) {
    const ms = Math.min(4000, 600 + line.length * 30);
    this.talkUntil = this.scene.time.now + ms;
    vendingLive.talkUntil = performance.now() + ms;
  }

  /** A speech bubble over the machine, like the residents'. */
  private say(line: string, mood: VendingMood) {
    this.bubble?.destroy();
    audio.sfx('talk', { pitch: 1.3 });
    const s = this.scene;
    const t = txt(s, 0, 0, line, 6, '#e8e8ff').setOrigin(0.5).setWordWrapWidth(150).setAlign('center');
    const bg = s.add.rectangle(0, 0, t.width + 8, t.height + 6, 0x05030f, 0.92).setStrokeStyle(1, 0xff2a6d);
    const v = vendingOf(this.getSave());
    const name = txt(s, -bg.width / 2 + 2, -bg.height / 2 - 7, v.named ? VENDING_NAME : 'Distributeur', 5, '#f5e663');
    const x = Phaser.Math.Clamp(this.at.x, bg.width / 2 + 2, CONFIG.WIDTH - bg.width / 2 - 2);
    this.bubble = s.add.container(x, TOP_Y - 4 - bg.height / 2, [bg, t, name]).setDepth(60);
    this.bubbleUntil = s.time.now + 2800 + line.length * 40;
    this.bubbleMood = mood;
    this.talk(line);
  }

  private drawFace(now: number, force = false) {
    if (!force && now - this.faceAt < 80) return;
    this.faceAt = now;
    drawVendingFace(this.face.context, FACE_W, FACE_H, now / 1000, this.mood, now < this.talkUntil);
    this.face.refresh();
  }

  /** Every frame (modal or not). */
  tick(now: number) {
    const v = vendingOf(this.getSave());
    if (this.bubble && now > this.bubbleUntil) { this.bubble.destroy(); this.bubble = undefined; }
    vendingLive.mood = this.panel ? this.mood : this.bubble ? this.bubbleMood : questReady(v) ? 'happy' : idleMood(v);
    if (this.panel) { this.drawFace(now); return; }
    const p = this.player();
    const d = Phaser.Math.Distance.Between(p.x, p.y, this.at.x, this.at.y);
    if (d < 80 && !this.seen) { this.seen = true; this.onSeen(); }
    // It mutters when you walk by; it calls you over when a step of its quest is done.
    if (!this.bubble && d < 70 && now >= this.nextMutter) {
      this.nextMutter = now + 9000 + Math.random() * 7000;
      if (questReady(v)) this.say(VENDING_CALL, 'happy');
      else { const m = VENDING_AMBIENT[Math.floor(Math.random() * VENDING_AMBIENT.length)]; this.say(m.line, v.trust <= -2 ? 'angry' : m.mood); }
    }
  }
}
