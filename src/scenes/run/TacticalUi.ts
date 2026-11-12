import Phaser from 'phaser';
import { CONFIG, COLORS } from '../../config';
import { spellRange, type Fight } from '../../tactics/fight';
import type { SpellDef, Unit } from '../../tactics/types';
import { txt, hex } from '../../ui/text';
import { spellBits, zoneIcon, zoneLabel } from '../../ui/spellInfo';

export const BAR_H = 38;
const SLOT = 24, GAP = 3, SLOTS_X = 104;

export interface UiHandlers {
  selectSpell(i: number): void;
  endTurn(): void;
  hoverSpell(i: number | null): void;
}

/** Why a spell button is greyed out (null = castable now). */
export type SlotState = (s: SpellDef, i: number) => string | null;

/**
 * The fight's screen furniture, fixed to the camera: the spell bar with PA / PM / PV, the end turn
 * button, the turn-order timeline, a tooltip and short messages.
 */
export class TacticalUi {
  private root: Phaser.GameObjects.Container;
  private slots: Phaser.GameObjects.Container[] = [];
  private slotRects: Phaser.GameObjects.Rectangle[] = [];
  private hovered: number | null = null;
  private stats: Phaser.GameObjects.Text;
  private endBtn: Phaser.GameObjects.Container;
  private endLabel: Phaser.GameObjects.Text;
  private tip: Phaser.GameObjects.Container;
  private msg: Phaser.GameObjects.Text;
  private timeline: Phaser.GameObjects.Container;
  private info: Phaser.GameObjects.Text;
  private roundText: Phaser.GameObjects.Text;
  private hintText: Phaser.GameObjects.Text;

  constructor(private scene: Phaser.Scene, private h: UiHandlers) {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT, top = H - BAR_H;
    this.root = scene.add.container(0, 0).setDepth(1000);
    const bg = scene.add.graphics();
    bg.fillStyle(0x05030f, 0.94).fillRect(0, top, W, BAR_H);
    bg.lineStyle(1, COLORS.cyan, 0.5).lineBetween(0, top, W, top);
    this.root.add(bg);
    this.stats = txt(scene, 8, top + 5, '', 7, '#e8e8ff').setLineSpacing(2);
    this.root.add(this.stats);
    this.endBtn = scene.add.container(W - 46, top + BAR_H / 2);
    const r = scene.add.rectangle(0, 0, 80, 26, 0x2a0c18).setStrokeStyle(1, COLORS.magenta).setInteractive({ useHandCursor: true });
    r.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { if (p.button === 0) { e.stopPropagation(); h.endTurn(); } });
    this.endLabel = txt(scene, 0, 0, 'FIN DU TOUR', 7, '#ff2a6d').setOrigin(0.5).setAlign('center');
    this.endBtn.add([r, this.endLabel]);
    this.root.add(this.endBtn);
    this.tip = scene.add.container(0, 0).setVisible(false);
    this.msg = txt(scene, W / 2, top - 66, '', 8, '#f5e663').setOrigin(0.5).setStroke('#05030f', 3);
    this.timeline = scene.add.container(0, 0);
    this.info = txt(scene, 6, 18, '', 6, '#e8e8ff').setStroke('#05030f', 3).setLineSpacing(1);
    this.roundText = txt(scene, W - 6, 18, '', 6, '#8a86b0').setOrigin(1, 0).setStroke('#05030f', 3);
    this.hintText = txt(scene, W / 2, top - 8, '', 6, '#e8e8ff').setOrigin(0.5).setStroke('#05030f', 3);
    this.root.add([this.tip, this.msg, this.timeline, this.info, this.roundText, this.hintText]);
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
    this.h.hoverSpell(i);
  }

  setVisible(v: boolean) {
    this.root.setVisible(v);
    if (!v) this.setHover(null);
  }

  /** End-turn button text: "FIN DU TOUR", "PRÊT", or hidden. */
  setButton(label: string | null) {
    this.endBtn.setVisible(!!label);
    if (label) this.endLabel.setText(label);
  }

  setStats(u: Unit | undefined, extra = '', fighting = true) {
    if (!u) { this.stats.setText(''); return; }
    this.stats.setText(`PA ${fighting ? u.pa : u.maxPa}   PM ${fighting ? u.pm : u.maxPm}\nPV ${u.hp}/${u.maxHp}${u.shield ? ` +${u.shield}` : ''}${extra ? '\n' + extra : ''}`);
    const pa = this.stats;
    pa.setColor('#e8e8ff');
  }

  /** Rebuilds the spell buttons. */
  setSpells(spells: SpellDef[], state: SlotState, selected: number | null, cd: Record<string, number>) {
    this.slots.forEach(s => s.destroy());
    this.slots = [];
    this.slotRects = [];
    const top = CONFIG.HEIGHT - BAR_H;
    spells.forEach((s, i) => {
      const x = SLOTS_X + i * (SLOT + GAP) + SLOT / 2, y = top + BAR_H / 2;
      const why = state(s, i), on = why === null, sel = selected === i;
      const c = this.scene.add.container(x, y);
      const r = this.scene.add.rectangle(0, 0, SLOT, SLOT, sel ? 0x2a2410 : 0x140f2b).setStrokeStyle(1, sel ? COLORS.yellow : on ? s.color : 0x3a3550)
        .setInteractive({ useHandCursor: true });
      r.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { if (p.button === 0) { e.stopPropagation(); this.h.selectSpell(i); } });
      this.slotRects.push(r);
      c.add(r);
      c.add(txt(this.scene, 0, -1, s.icon, 8, on ? hex(s.color) : '#5a5578').setOrigin(0.5));
      c.add(txt(this.scene, -SLOT / 2 + 2, -SLOT / 2 + 1, `${i + 1}`, 5, '#8a86b0'));
      c.add(txt(this.scene, SLOT / 2 - 1, SLOT / 2 - 1, `${s.pa}`, 6, '#00f0ff').setOrigin(1, 1));
      const left = cd[s.id] ?? 0;
      if (left > 0) {
        c.add(this.scene.add.rectangle(0, 0, SLOT - 2, SLOT - 2, 0x05030f, 0.7));
        c.add(txt(this.scene, 0, 0, `${left}`, 9, '#ff2a6d').setOrigin(0.5));
      }
      this.root.add(c);
      this.slots.push(c);
    });
  }

  /** Spell card above the bar. */
  /** `avoidX`: screen x to keep clear (the hero), the card goes to the other side. */
  showTip(s: SpellDef | null, u?: Unit, extra?: string, avoidX = 0) {
    this.tip.removeAll(true);
    if (!s || !u) { this.tip.setVisible(false); return; }
    const W = CONFIG.WIDTH;
    const dmg = s.effects.find(e => e.k === 'dmg' || e.k === 'dash');
    const lines = [s.name.toUpperCase(), spellBits(s, spellRange(u, s)), `Zone : ${zoneLabel(s)}`, s.desc];
    if (dmg && (dmg.k === 'dmg' || dmg.k === 'dash')) lines.push(`Dégâts : ${dmg.min + u.st.flat}-${dmg.max + u.st.flat}${extra ? '   ' + extra : ''}`);
    else if (extra) lines.push(extra);
    const t = txt(this.scene, 0, 0, lines.join('\n'), 6, '#e8e8ff').setWordWrapWidth(165).setLineSpacing(2);
    const ICON = 56;
    const w = Math.min(236, t.width + 12 + ICON), h = Math.max(t.height + 10, 44);
    // Above the bar, on the side away from the hero.
    const x = avoidX < W / 2 ? W - w - 4 : 4, y = CONFIG.HEIGHT - BAR_H - h - 2;
    const bg = this.scene.add.rectangle(x, y, w, h, 0x05030f, 0.95).setOrigin(0).setStrokeStyle(1, s.color);
    t.setPosition(x + 6, y + 5);
    // A picture of the zone, on the right of the card.
    const icon = zoneIcon(this.scene, x + w - ICON / 2 - 2, y + h / 2, s, s.color);
    this.tip.add([bg, t, icon]);
    this.tip.setVisible(true);
  }

  /** One line above the bar while aiming a spell. */
  hint(m: string, color = '#e8e8ff') { if (this.hintText.text !== m) this.hintText.setText(m); this.hintText.setColor(color); }

  private msgTween?: Phaser.Tweens.Tween;
  say(m: string, color = '#f5e663') {
    this.msgTween?.stop();
    this.msg.setText(m).setColor(color).setAlpha(1);
    this.msgTween = this.scene.tweens.add({ targets: this.msg, alpha: 0, delay: 1300, duration: 400 });
  }

  /** Hovered unit (or the active one) in the top-left corner. */
  setInfo(u: Unit | undefined, f?: Fight) {
    if (!u || u.dead) { this.info.setText(''); return; }
    const res = Math.round((u.st.res + u.buffs.reduce((s, b) => s + (b.stat === 'res' ? b.v : 0), 0) / 100) * 100);
    const parts = [`${u.name.toUpperCase()}${u.elite ? ' ★' : ''}`, `PV ${u.hp}/${u.maxHp}${u.shield ? `  bouclier ${u.shield}` : ''}`];
    if (u.team !== 2) parts.push(`PA ${u.team === 0 || !f ? u.pa : u.maxPa}  PM ${u.team === 0 || !f ? u.pm : u.maxPm}  tacle ${u.st.tackle}  fuite ${u.st.dodge}${res ? `  rés ${res} %` : ''}`);
    const marks = u.buffs.filter(b => b.v).map(b => `${b.v > 0 ? '+' : ''}${b.v}${b.stat === 'res' || b.stat === 'dmg' ? ' %' : ''} ${({ pa: 'PA', pm: 'PM', dmg: 'dég', res: 'rés', range: 'PO', pushDmg: 'pou' })[b.stat]}`);
    if (u.bleed.length) marks.push('saigne');
    if (u.primed) marks.push('AMORCÉ : explose à son tour !');
    if (u.elite === 'cloak') marks.push('camouflé (cible à 2 cases max)');
    if (marks.length) parts.push(marks.join(' · '));
    this.info.setText(parts.join('\n'));
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
    const W = CONFIG.WIDTH;
    list.forEach((u, i) => {
      const x = W - 10 - (list.length - 1 - i) * 15, y = 34;
      const col = u.team === 0 ? COLORS.cyan : COLORS.magenta;
      this.timeline.add(this.scene.add.rectangle(x, y, 13, 13, i === 0 ? 0x2a2410 : 0x140f2b).setStrokeStyle(1, i === 0 ? COLORS.yellow : col));
      this.timeline.add(txt(this.scene, x, y, u.kind === 'player' ? 'TOI' : u.name.slice(0, 2).toUpperCase(), u.kind === 'player' ? 4 : 5, hex(col)).setOrigin(0.5));
      this.timeline.add(this.scene.add.rectangle(x - 6, y + 8, 12 * (u.hp / u.maxHp), 1, col).setOrigin(0, 0.5));
    });
  }

  destroy() { this.root.destroy(); }
}
