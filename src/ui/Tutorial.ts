import Phaser from 'phaser';
import { CONFIG } from '../config';
import { audio } from '../audio/audio';
import { liveStep, skipTutorial, tutorialDone, tutorialEvent, type TutorialStep } from '../core/tutorial';
import type { TutorialCtx } from '../data/tutorial';
import { Button, C, T, drawPanel, keycap, pinToCamera, tabTitle } from './kit';
import { txt } from './text';

/** A screen rectangle in logical units (480x270); w = h = 0 for a point. */
export interface Rect { x: number; y: number; w: number; h: number }

export interface TutorialHost {
  /** the place's name in src/data/tutorial.ts */
  place: string;
  ctx?: () => TutorialCtx;
  /** where an anchor is on screen right now (undefined: not there) */
  anchor: (name: string) => Rect | undefined;
  /** something covers the scene (a panel, the help, a loading cover): the bubble waits */
  blocked: () => boolean;
  /** Entrée dismisses a bubble (the hub: in a fight it ends the turn) */
  enterAcks?: boolean;
  /** the band the bubble stays in (default: under the top strip, down to the bottom) */
  top?: number;
  bottom?: number;
  /** where a bubble with nothing to point at sits */
  restY?: number;
}

const BW = 200;

/**
 * The tutorial bubble of one scene: the current step's text, a pulsing frame and an arrow on what it
 * talks about, OK (a click, or Entrée in the hub) when it can be dismissed, and "Passer le tutoriel"
 * (P) always. It never takes the scene's keys or clicks: the game goes on underneath.
 */
export class TutorialOverlay {
  private root: Phaser.GameObjects.Container;
  private ptr: Phaser.GameObjects.Graphics;
  private step?: TutorialStep<TutorialCtx>;
  private bubbleH = 0;
  /** the bubble was on screen at the last frame (keys only act on what the player could see) */
  private visible = false;
  private t = 0;

  constructor(private scene: Phaser.Scene, private host: TutorialHost) {
    this.root = scene.add.container(0, 0).setDepth(1500).setVisible(false);
    this.ptr = scene.add.graphics().setDepth(1499).setScrollFactor(0);
    const kb = scene.input.keyboard!;
    const onSkip = (e: KeyboardEvent) => { if (!e.repeat && this.visible) this.skip(); };
    const onEnter = (e: KeyboardEvent) => { if (!e.repeat && this.visible && this.host.enterAcks && this.step?.ack) this.ack(); };
    const onUpdate = (_t: number, dt: number) => this.update(dt);
    kb.on('keydown-P', onSkip);
    kb.on('keydown-ENTER', onEnter);
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      kb.off('keydown-P', onSkip);
      kb.off('keydown-ENTER', onEnter);
      scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    });
    this.event(`enter:${host.place}`);
  }

  /** A game event (see src/data/tutorial.ts): may complete the shown step, or queue a tip. */
  event(name: string) {
    tutorialEvent(name, this.visible ? this.step?.id : undefined);
  }

  private ack() {
    if (!this.step) return;
    audio.sfx('ui');
    tutorialDone(this.step.id);
  }

  private skip() {
    audio.sfx('ui');
    skipTutorial();
  }

  private update(dt: number) {
    this.t += dt / 1000;
    const h = this.host;
    const next = h.blocked() ? undefined : liveStep(h.place, h.ctx?.() ?? {}, st => st.track !== 'tip' || !st.point || !!h.anchor(st.point));
    if (next !== this.step) {
      this.step = next;
      this.build();
    }
    this.visible = !!next;
    this.root.setVisible(this.visible);
    this.ptr.clear();
    if (next) this.place(next.point ? h.anchor(next.point) : undefined);
  }

  /** The bubble of the current step. */
  private build() {
    this.root.removeAll(true);
    const st = this.step, s = this.scene;
    if (!st) return;
    const tip = st.track === 'tip', accent = tip ? C.yellow : C.cyan;
    const body = txt(s, 8, 12, st.text, 6, T.text).setWordWrapWidth(BW - 16).setLineSpacing(1.5);
    const h = 12 + body.height + 20;
    this.bubbleH = h;
    const g = drawPanel(s.add.graphics(), 0, 0, BW, h, { accent, cut: 5, alpha: 0.96, dots: 'br' });
    // The whole bubble takes its clicks (nothing behind it moves); a click dismisses it when it can be.
    const zone = s.add.zone(BW / 2, h / 2, BW, h).setInteractive({ useHandCursor: !!st.ack });
    zone.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      if (p.button === 0 && st.ack) this.ack();
    });
    const items: Phaser.GameObjects.GameObject[] = [g, zone, tabTitle(s, 8, 0, tip ? 'RAPPEL' : 'TUTO', accent, 8), body];
    const fy = h - 14;
    if (st.ack) {
      items.push(new Button(s, 8, fy, 34, 10, 'OK', { accent, solid: true, font: 'ui', size: 5.5, onClick: () => this.ack() }));
      if (this.host.enterAcks) items.push(keycap(s, 46, fy + 5, 'ENTRÉE', accent, 4.5));
    } else {
      items.push(txt(s, 8, fy + 5, 'Fais-le pour continuer.', 5, T.mute).setOrigin(0, 0.5));
    }
    items.push(new Button(s, BW - 8 - 84, fy, 84, 10, tip ? 'COUPER LES RAPPELS' : 'PASSER LE TUTO', {
      accent: C.magenta, font: 'ui', size: 4.5, key: 'P', onClick: () => this.skip(),
    }));
    this.root.add(items);
    pinToCamera(this.root);
    this.root.setAlpha(0);
    this.scene.tweens.add({ targets: this.root, alpha: 1, duration: 160 });
    audio.sfx('ui', { vol: 0.4, pitch: 1.4 });
  }

  /** Puts the bubble next to its target (above it in the lower half of the screen) and points at it. */
  private place(r: Rect | undefined) {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT, hb = this.bubbleH, host = this.host;
    const top = host.top ?? 16, bottom = host.bottom ?? H - 4;
    const clampY = (y: number) => Phaser.Math.Clamp(y, top + 2, bottom - hb - 2);
    if (!r) {
      this.root.setPosition((W - BW) / 2, clampY(host.restY ?? top + 6));
      return;
    }
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, point = r.w < 1 && r.h < 1;
    const reach = point ? 12 : 4;
    const above = cy > (top + bottom) / 2;
    const y = clampY(above ? r.y - reach - hb - 10 : r.y + r.h + reach + 10);
    const x = Phaser.Math.Clamp(cx - BW / 2, 6, W - BW - 6);
    this.root.setPosition(x, y);

    const accent = this.step?.track === 'tip' ? C.yellow : C.cyan;
    const pulse = (Math.sin(this.t * 6) + 1) / 2, g = this.ptr;
    if (point) {
      // A ring on the cell or the character's feet.
      g.lineStyle(0.75, accent, 0.9).strokeEllipse(cx, cy, 16 + pulse * 6, 8 + pulse * 3);
      g.lineStyle(0.5, C.white, 0.5).strokeEllipse(cx, cy, 10, 5);
    } else {
      // Corner brackets around the element.
      const m = 2 + pulse * 1.5, x0 = r.x - m, y0 = r.y - m, x1 = r.x + r.w + m, y1 = r.y + r.h + m, k = Math.min(6, r.w / 3, r.h / 2 + 2);
      g.lineStyle(0.75, accent, 1);
      for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
        g.beginPath(); g.moveTo(px, py + sy * k); g.lineTo(px, py); g.lineTo(px + sx * k, py); g.strokePath();
      }
    }
    // A line from the bubble to the target, with an arrow head bobbing at its end.
    const bx = Phaser.Math.Clamp(cx, x + 10, x + BW - 10), by = above ? y + hb : y;
    const ty = above ? r.y - reach + 2 - pulse * 2 : r.y + r.h + reach - 2 + pulse * 2;
    if (Math.abs(ty - by) > 3) {
      g.lineStyle(0.5, accent, 0.7).lineBetween(bx, by, cx, ty);
      const a = Math.atan2(ty - by, cx - bx), s = 3.5;
      g.fillStyle(accent, 1).fillTriangle(
        cx, ty,
        cx - Math.cos(a - 0.5) * s, ty - Math.sin(a - 0.5) * s,
        cx - Math.cos(a + 0.5) * s, ty - Math.sin(a + 0.5) * s,
      );
    }
  }
}

/** A world point under a camera, as a point Rect on screen. */
export function worldPoint(cam: Phaser.Cameras.Scene2D.Camera, x: number, y: number): Rect {
  return { x: x - cam.scrollX, y: y - cam.scrollY, w: 0, h: 0 };
}
