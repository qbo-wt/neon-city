import Phaser from 'phaser';
import { CONFIG, COLORS } from '../../config';
import { spellRange, type Fight } from '../../tactics/fight';
import type { SpellDef, Unit } from '../../tactics/types';
import { txt, hex, title } from '../../ui/text';
import { spellBits, zoneIcon, zoneLabel } from '../../ui/spellInfo';
import { Button, C, T, bold, chip, cutPoly, drawBar, drawPanel, pinToCamera, scanlines, skewPoly, stripes, tabTitle } from '../../ui/kit';

export const BAR_H = 38;
const SLOT = 24, GAP = 3, SLOTS_X = 104;

export interface UiHandlers {
  selectSpell(i: number): void;
  endTurn(): void;
  hoverSpell(i: number | null): void;
}

/** Why a spell button is greyed out (null = castable now). */
export type SlotState = (s: SpellDef, i: number) => string | null;

const MODE_COLORS: Record<string, number> = { 'TON TOUR': C.cyan, 'TOUR ENNEMI': C.magenta, PLACEMENT: C.yellow };

/**
 * The fight's screen furniture, fixed to the camera: the spell bar with PA / PM / PV, the end turn
 * button, the turn-order timeline, a tooltip and short messages.
 */
export class TacticalUi {
  private root: Phaser.GameObjects.Container;
  private slots: Phaser.GameObjects.Container[] = [];
  private slotRects: Phaser.GameObjects.Zone[] = [];
  private hovered: number | null = null;
  private statsG: Phaser.GameObjects.Graphics;
  private paText: Phaser.GameObjects.Text;
  private pmText: Phaser.GameObjects.Text;
  private hpText: Phaser.GameObjects.Text;
  private paLabel: Phaser.GameObjects.Text;
  private pmLabel: Phaser.GameObjects.Text;
  private modeTab?: Phaser.GameObjects.Container;
  private modeKey = '';
  private endBtn: Button;
  private tip: Phaser.GameObjects.Container;
  private msg: Phaser.GameObjects.Text;
  private timeline: Phaser.GameObjects.Container;
  private info: Phaser.GameObjects.Container;
  private roundText: Phaser.GameObjects.Text;
  private hintText: Phaser.GameObjects.Text;
  private hintG: Phaser.GameObjects.Graphics;
  private last?: { spells: SpellDef[]; state: SlotState; selected: number | null; cd: Record<string, number> };

  constructor(private scene: Phaser.Scene, private h: UiHandlers) {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT, top = H - BAR_H;
    this.root = scene.add.container(0, 0).setDepth(1000);
    const bg = scene.add.graphics();
    // The bar: dark glass, a raised plate on the left for the stats, cyan top rule.
    bg.fillStyle(C.deep, 0.94).fillRect(0, top, W, BAR_H);
    scanlines(bg, 0, top, W, BAR_H, 0, C.white, 0.03);
    const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
    bg.fillStyle(C.night, 1).fillPoints([V(0, top - 3), V(92, top - 3), V(101, top + BAR_H), V(0, top + BAR_H)], true);
    bg.lineStyle(0.5, COLORS.cyan, 0.55).lineBetween(0, top, W, top);
    bg.lineStyle(0.5, COLORS.cyan, 0.9).beginPath();
    bg.moveTo(0, top - 3); bg.lineTo(92, top - 3); bg.lineTo(101, top + BAR_H); bg.strokePath();
    bg.fillStyle(C.cyan, 1).fillRect(0, top - 3.5, 34, 1.25);
    bg.fillStyle(C.magenta, 1).fillRect(W - 90, top - 0.5, 90, 1.25);
    stripes(bg, 355, top + 5, 24, BAR_H - 10, C.white, 0.05, 4, 1.2);
    this.root.add(bg);
    this.statsG = scene.add.graphics();
    this.paText = title(scene, 7, top + 13, '', 17, T.cyan).setFontStyle('600').setOrigin(0, 0.5);
    this.pmText = title(scene, 48, top + 13, '', 17, T.green).setFontStyle('600').setOrigin(0, 0.5);
    this.hpText = bold(scene, 7, top + 26, '', 5, T.text).setOrigin(0, 0.5);
    this.paLabel = bold(scene, 0, top + 9, 'PA', 4.5, T.cyan).setOrigin(0, 0.5);
    this.pmLabel = bold(scene, 0, top + 9, 'PM', 4.5, T.green).setOrigin(0, 0.5);
    this.root.add([this.statsG, this.paText, this.pmText, this.hpText, this.paLabel, this.pmLabel]);
    this.endBtn = new Button(scene, W - 86, top + 6, 80, 26, 'FIN DU TOUR', { accent: C.magenta, solid: true, size: 13, onClick: () => h.endTurn() });
    this.root.add(pinToCamera(this.endBtn));
    this.tip = scene.add.container(0, 0).setVisible(false);
    this.msg = title(scene, W / 2, top - 66, '', 15, T.yellow).setFontStyle('600').setOrigin(0.5).setStroke('#05030f', 5);
    this.timeline = scene.add.container(0, 0);
    this.info = scene.add.container(0, 0);
    this.roundText = title(scene, W - 6, 21, '', 9, T.text).setFontStyle('600').setOrigin(1, 0.5).setStroke('#05030f', 3);
    this.hintG = scene.add.graphics();
    this.hintText = bold(scene, W / 2, top - 8, '', 6, T.text).setOrigin(0.5);
    this.root.add([this.tip, this.msg, this.timeline, this.info, this.roundText, this.hintG, this.hintText]);
    this.root.setScrollFactor(0, 0, true);
    // Hover is worked out from the pointer, not from over/out events on the buttons: the bar is
    // rebuilt on every refresh, and a button destroyed under the cursor never sends its "out".
    const track = (p: Phaser.Input.Pointer) => {
      const hit = this.root.visible ? scene.input.hitTestPointer(p) : [];
      const i = this.slotRects.findIndex(r => hit.includes(r));
      this.setHover(i < 0 ? null : i);
    };
    scene.input.on('pointermove', track);
    scene.input.on('gameout', () => this.setHover(null));
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { scene.input.off('pointermove', track); });
  }

  private setHover(i: number | null) {
    if (i === this.hovered) return;
    this.hovered = i;
    // Redraw the slots with the new hover look before telling the scene (which may rebuild them anyway).
    if (this.last) this.setSpells(this.last.spells, this.last.state, this.last.selected, this.last.cd);
    this.h.hoverSpell(i);
  }

  setVisible(v: boolean) {
    this.root.setVisible(v);
    if (!v) this.setHover(null);
  }

  /** End-turn button text: "FIN DU TOUR", "PRÊT", or hidden. */
  setButton(label: string | null) {
    this.endBtn.setVisible(!!label);
    if (label) {
      if (this.endBtn.label.text !== label) this.endBtn.setText(label);
      this.endBtn.setCardState(label === '...' ? 'off' : 'idle');
    }
  }

  setStats(u: Unit | undefined, extra = '', fighting = true) {
    const g = this.statsG, top = CONFIG.HEIGHT - BAR_H;
    g.clear();
    if (!u || extra !== this.modeKey) { this.modeTab?.destroy(); this.modeTab = undefined; this.modeKey = ''; }
    const has = !!u;
    for (const t of [this.paText, this.pmText, this.hpText, this.paLabel, this.pmLabel]) t.setVisible(has);
    if (!u) return;
    const pa = fighting ? u.pa : u.maxPa, pm = fighting ? u.pm : u.maxPm;
    this.paText.setText(String(pa));
    this.pmText.setText(String(pm));
    // Small labels next to the big numbers, and pips for what is left.
    const pip = (x: number, n: number, max: number, col: number) => {
      for (let i = 0; i < Math.min(max, 8); i++) g.fillStyle(i < n ? col : C.line, i < n ? 1 : 0.8).fillPoints(skewPoly(x + i * 3.4, top + 15, 2.6, 2.6, 0.8), true);
    };
    pip(this.paText.x + this.paText.width + 2, pa, Math.max(u.maxPa, pa), C.cyan);
    pip(this.pmText.x + this.pmText.width + 2, pm, Math.max(u.maxPm, pm), C.green);
    this.paLabel.setX(this.paText.x + this.paText.width + 2);
    this.pmLabel.setX(this.pmText.x + this.pmText.width + 2);
    this.hpText.setText(`PV ${u.hp}/${u.maxHp}${u.shield ? `  +${u.shield}` : ''}`);
    drawBar(g, 7, top + 30, 86, 3.5, u.maxHp ? u.hp / u.maxHp : 0, u.hp / u.maxHp < 0.3 ? C.red : C.magenta, { seg: 10, skew: 1.5 });
    if (u.shield) drawBar(g, 7, top + 34.5, 86 * Math.min(1, u.shield / u.maxHp), 1.5, 1, C.cyan, { skew: 0.8 });
    if (extra && !this.modeTab) {
      // Whose turn it is, as a tab over the end-turn button.
      this.modeTab = tabTitle(this.scene, CONFIG.WIDTH - 84, top - 7, extra, MODE_COLORS[extra] ?? 0x8a86b0, 8);
      this.root.add(pinToCamera(this.modeTab));
    }
    this.modeKey = extra;
  }

  /** Rebuilds the spell buttons. */
  setSpells(spells: SpellDef[], state: SlotState, selected: number | null, cd: Record<string, number>) {
    this.last = { spells, state, selected, cd };
    this.slots.forEach(s => s.destroy());
    this.slots = [];
    this.slotRects = [];
    const top = CONFIG.HEIGHT - BAR_H, sc = this.scene;
    spells.forEach((s, i) => {
      const x = SLOTS_X + i * (SLOT + GAP) + SLOT / 2, y = top + BAR_H / 2;
      const why = state(s, i), on = why === null, sel = selected === i, hot = this.hovered === i;
      const lift = sel ? -2 : hot ? -1 : 0;
      const c = sc.add.container(x, y + lift);
      const g = sc.add.graphics();
      const box = (o: number) => cutPoly(-SLOT / 2 + o, -SLOT / 2 + o, SLOT - 2 * o, SLOT - 2 * o, [4, 0, 4, 0]);
      g.fillStyle(C.deep, 0.7).fillPoints(cutPoly(-SLOT / 2 + 1.5, -SLOT / 2 + 1.5 - lift, SLOT, SLOT, [4, 0, 4, 0]), true);
      g.fillStyle(sel ? 0x2a2410 : C.panel2, 1).fillPoints(box(0), true);
      if (on || sel) g.fillStyle(sel ? C.yellow : s.color, sel ? 0.22 : hot ? 0.2 : 0.08).fillPoints(box(0), true);
      // The spell's colour as a band along the bottom.
      if (on) g.fillStyle(s.color, 0.85).fillRect(-SLOT / 2 + 1, SLOT / 2 - 3, SLOT - 6, 1.25);
      g.lineStyle(sel ? 0.75 : 0.5, sel ? COLORS.yellow : hot ? 0xffffff : on ? s.color : C.line, sel || hot ? 1 : on ? 0.85 : 0.7).strokePoints(box(0), true);
      if (sel) g.lineStyle(0.25, COLORS.yellow, 0.6).strokePoints(box(1.6), true);
      if (!on) stripes(g, -SLOT / 2 + 1, -SLOT / 2 + 1, SLOT - 2, SLOT - 2, C.white, 0.04, 3, 1);
      const r = sc.add.zone(0, 0, SLOT, SLOT).setInteractive({ useHandCursor: true });
      r.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { if (p.button === 0) { e.stopPropagation(); this.h.selectSpell(i); } });
      this.slotRects.push(r);
      c.add([g, r]);
      c.add(title(sc, 0, 0.2, s.icon, 13, on ? (hot || sel ? T.text : hex(s.color)) : T.off).setFontStyle('600').setOrigin(0.5));
      c.add(bold(sc, -SLOT / 2 + 4.5, -SLOT / 2 + 3.8, `${i + 1}`, 4.5, sel ? T.yellow : T.mute).setOrigin(0.5));
      // PA cost in a small cyan badge, bottom right.
      const badge = sc.add.graphics();
      badge.fillStyle(on ? C.cyan : C.line, 1).fillPoints(cutPoly(SLOT / 2 - 8, SLOT / 2 - 8, 8, 8, [2.5, 0, 0, 0]), true);
      c.add(badge);
      c.add(bold(sc, SLOT / 2 - 3.8, SLOT / 2 - 3.9, `${s.pa}`, 5, T.dark).setOrigin(0.5));
      const left = cd[s.id] ?? 0;
      if (left > 0) {
        const o = sc.add.graphics();
        o.fillStyle(C.deep, 0.75).fillPoints(box(0.5), true);
        c.add(o);
        c.add(title(sc, 0, 0.5, `${left}`, 16, T.magenta).setFontStyle('600').setOrigin(0.5));
      }
      this.root.add(pinToCamera(c));
      this.slots.push(c);
    });
  }

  /** Spell card above the bar. */
  /** `avoidX`: screen x to keep clear (the hero), the card goes to the other side. */
  showTip(s: SpellDef | null, u?: Unit, extra?: string, avoidX = 0) {
    this.tip.removeAll(true);
    if (!s || !u) { this.tip.setVisible(false); return; }
    const W = CONFIG.WIDTH, sc = this.scene, ICON = 54, TW = 160;
    const items: Phaser.GameObjects.GameObject[] = [];
    // Cost, range and rules as chips; the cost first, filled.
    const bits = spellBits(s, spellRange(u, s)).split(' · ');
    const chips: Phaser.GameObjects.Container[] = [];
    let cx = 0, cy = 0;
    bits.forEach((b, i) => {
      const ch = chip(sc, 0, 0, b.toUpperCase(), i === 0 ? C.cyan : C.line, { filled: i === 0, size: 4.5, text: i === 0 ? undefined : T.dim });
      if (cx + ch.width > TW && cx > 0) { cx = 0; cy += 9.5; }
      ch.setPosition(cx, cy);
      cx += ch.width + 2.5;
      chips.push(ch);
    });
    const chipsH = cy + 9.5;
    const zone = txt(sc, 0, 0, `Zone : ${zoneLabel(s)}`, 5, T.mute);
    const desc = txt(sc, 0, 0, s.desc, 6, T.text).setWordWrapWidth(TW).setLineSpacing(1.5);
    const dmg = s.effects.find(e => e.k === 'dmg' || e.k === 'dash');
    let dmgLine: Phaser.GameObjects.Text | undefined, dmgLabel: Phaser.GameObjects.Text | undefined, extraT: Phaser.GameObjects.Text | undefined;
    if (dmg && (dmg.k === 'dmg' || dmg.k === 'dash')) {
      dmgLabel = bold(sc, 0, 0, 'DÉGÂTS', 4.5, T.mute);
      dmgLine = title(sc, 0, 0, `${dmg.min + u.st.flat}-${dmg.max + u.st.flat}`, 15, T.yellow).setFontStyle('600');
    }
    if (extra) extraT = bold(sc, 0, 0, extra, 5, T.magenta);
    const bodyH = chipsH + 3 + zone.height + 2 + desc.height + (dmgLine ? 17 : 0) + (extraT && !dmgLine ? extraT.height + 2 : 0);
    const w = TW + 14 + ICON, h = Math.max(bodyH + 16, 58);
    // Above the bar, on the side away from the hero.
    const x = avoidX < W / 2 ? W - w - 4 : 4, y = CONFIG.HEIGHT - BAR_H - h - 8;
    const g = drawPanel(sc.add.graphics(), x, y, w, h, { accent: s.color, cut: 6, dots: 'br' });
    items.push(g);
    items.push(tabTitle(sc, x + 8, y, s.name.toUpperCase(), s.color, 10));
    let yy = y + 9;
    chips.forEach(ch => { ch.setPosition(ch.x + x + 7, ch.y + yy + 3); items.push(ch); });
    yy += chipsH + 3;
    zone.setPosition(x + 7, yy); items.push(zone); yy += zone.height + 2;
    desc.setPosition(x + 7, yy); items.push(desc); yy += desc.height;
    if (dmgLine && dmgLabel) {
      dmgLabel.setPosition(x + 7, yy + 6).setOrigin(0, 0.5);
      dmgLine.setPosition(x + 7 + dmgLabel.width + 3, yy + 7.5).setOrigin(0, 0.5);
      items.push(dmgLabel, dmgLine);
      if (extraT) { extraT.setPosition(dmgLine.x + dmgLine.width + 6, yy + 6).setOrigin(0, 0.5); items.push(extraT); }
    } else if (extraT) { extraT.setPosition(x + 7, yy + 2); items.push(extraT); }
    // A picture of the zone, framed on the right of the card.
    const fx = x + w - ICON - 4, fy = y + 8, fh = h - 14;
    const frame = sc.add.graphics();
    frame.fillStyle(C.deep, 0.9).fillPoints(cutPoly(fx, fy, ICON, fh, [0, 4, 0, 4]), true);
    frame.lineStyle(0.25, s.color, 0.6).strokePoints(cutPoly(fx, fy, ICON, fh, [0, 4, 0, 4]), true);
    scanlines(frame, fx, fy, ICON, fh, [0, 4, 0, 4], s.color, 0.06);
    items.push(frame);
    items.push(bold(sc, fx + ICON / 2, fy + 5, 'ZONE', 4.5, hex(s.color)).setOrigin(0.5));
    items.push(zoneIcon(sc, fx + ICON / 2, fy + fh / 2 + 3, s, s.color));
    this.tip.add(items);
    pinToCamera(this.tip);
    this.tip.setVisible(true);
  }

  /** One line above the bar while aiming a spell. */
  hint(m: string, color = '#e8e8ff') {
    if (this.hintText.text !== m) {
      this.hintText.setText(m);
      const g = this.hintG, w = this.hintText.width + 16, y = CONFIG.HEIGHT - BAR_H - 8;
      g.clear();
      if (m) {
        g.fillStyle(C.deep, 0.85).fillPoints(skewPoly(CONFIG.WIDTH / 2 - w / 2, y - 5, w, 10, 3), true);
        g.fillStyle(C.white, 0.6).fillPoints(skewPoly(CONFIG.WIDTH / 2 - w / 2, y - 5, 2.5, 10, 3), true);
      }
    }
    this.hintText.setColor(color);
  }

  private msgTween?: Phaser.Tweens.TweenChain;
  say(m: string, color = '#f5e663') {
    this.msgTween?.stop();
    this.msg.setText(m).setColor(color).setAlpha(1).setScale(1.12);
    this.msgTween = this.scene.tweens.chain({
      targets: this.msg,
      tweens: [{ scale: 1, duration: 140, ease: 'Back.easeOut' }, { alpha: 0, delay: 1160, duration: 400 }],
    });
  }

  /** Hovered unit (or the active one) in the top-left corner. */
  setInfo(u: Unit | undefined, f?: Fight) {
    this.info.removeAll(true);
    if (!u || u.dead) return;
    const sc = this.scene;
    const res = Math.round((u.st.res + u.buffs.reduce((s, b) => s + (b.stat === 'res' ? b.v : 0), 0) / 100) * 100);
    const accent = u.team === 0 ? C.cyan : u.team === 2 ? C.yellow : C.magenta;
    const name = title(sc, 0, 0, `${u.name.toUpperCase()}${u.elite ? ' ★' : ''}`, 10, hex(accent)).setFontStyle('600');
    const lines: string[] = [];
    if (u.team !== 2) lines.push(`PA ${u.team === 0 || !f ? u.pa : u.maxPa}  PM ${u.team === 0 || !f ? u.pm : u.maxPm}  tacle ${u.st.tackle}  fuite ${u.st.dodge}${res ? `  rés ${res} %` : ''}`);
    const marks = u.buffs.filter(b => b.v).map(b => `${b.v > 0 ? '+' : ''}${b.v}${b.stat === 'res' || b.stat === 'dmg' ? ' %' : ''} ${({ pa: 'PA', pm: 'PM', dmg: 'dég', res: 'rés', range: 'PO', pushDmg: 'pou' })[b.stat]}`);
    if (u.bleed.length) marks.push('saigne');
    if (u.primed) marks.push('AMORCÉ : explose à son tour !');
    if (u.elite === 'cloak') marks.push('camouflé (cible à 2 cases max)');
    const stats = txt(sc, 0, 0, lines.join('\n'), 5, T.dim);
    const markT = marks.length ? bold(sc, 0, 0, marks.join(' · '), 5, T.yellow).setWordWrapWidth(170) : undefined;
    const hpT = bold(sc, 0, 0, `${u.hp}/${u.maxHp}${u.shield ? `  +${u.shield}` : ''}`, 5, T.text);
    const w = Math.max(110, name.width + 14, stats.width + 12, (markT?.width ?? 0) + 12);
    const h = 26 + (lines.length ? stats.height + 1 : 0) + (markT ? markT.height + 2 : 0);
    const x = 5, y = 19;
    const g = drawPanel(sc.add.graphics(), x, y, w, h, { accent, cut: 5, alpha: 0.88, marks: false });
    name.setPosition(x + 6, y + 2.5);
    drawBar(g, x + 6, y + 15, w - 46, 3.5, u.maxHp ? u.hp / u.maxHp : 0, u.team === 0 ? C.cyan : C.magenta, { seg: 8, skew: 1.5 });
    hpT.setPosition(x + w - 6, y + 16.7).setOrigin(1, 0.5);
    stats.setPosition(x + 6, y + 21);
    this.info.add([g, name, hpT, stats]);
    if (markT) { markT.setPosition(x + 6, y + 22 + (lines.length ? stats.height + 1 : 0)); this.info.add(markT); }
    pinToCamera(this.info);
  }

  /** Turn order across the top right: whose turn it is, then who comes next. */
  setTimeline(f: Fight | undefined) {
    this.timeline.removeAll(true);
    if (!f) { this.roundText.setText(''); return; }
    this.roundText.setText(`ROUND ${f.round}`);
    const order = f.order.map(uid => f.units.find(u => u.uid === uid)!).filter(u => u && !u.dead);
    const cur = f.units.find(u => u.uid === f.order[f.turnIdx]);
    const start = order.indexOf(cur!);
    const list = [...order.slice(start), ...order.slice(0, start)].slice(0, 12);
    const W = CONFIG.WIDTH, sc = this.scene;
    const g = sc.add.graphics();
    this.timeline.add(g);
    list.forEach((u, i) => {
      const now = i === 0, size = now ? 15 : 12;
      const x = W - 6 - (list.length - 1 - i) * 14.5 - size / 2 - (now ? 0 : 0), y = 35;
      const col = u.team === 0 ? C.cyan : u.team === 2 ? C.yellow : C.magenta;
      const pts = cutPoly(x - size / 2, y - size / 2, size, size, [3, 0, 3, 0]);
      g.fillStyle(C.deep, 0.6).fillPoints(cutPoly(x - size / 2 + 1.2, y - size / 2 + 1.2, size, size, [3, 0, 3, 0]), true);
      g.fillStyle(now ? 0x2a2410 : C.panel2, 0.95).fillPoints(pts, true);
      g.fillStyle(col, now ? 0.2 : 0.1).fillPoints(pts, true);
      g.lineStyle(now ? 0.75 : 0.5, now ? COLORS.yellow : col, 1).strokePoints(pts, true);
      drawBar(g, x - size / 2, y + size / 2 + 1.5, size, 1.5, u.hp / u.maxHp, col, { skew: 0.6 });
      if (now) g.fillStyle(C.yellow, 1).fillTriangle(x - 2.5, y - size / 2 - 4, x + 2.5, y - size / 2 - 4, x, y - size / 2 - 1.2);
      this.timeline.add(bold(sc, x, y, u.kind === 'player' ? 'TOI' : u.name.slice(0, 2).toUpperCase(), u.kind === 'player' ? 4 : 5, now ? T.yellow : hex(col)).setOrigin(0.5));
    });
    pinToCamera(this.timeline);
  }

  destroy() { this.root.destroy(); }
}
