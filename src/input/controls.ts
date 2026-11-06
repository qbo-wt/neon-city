import Phaser from 'phaser';

type K = Phaser.Input.Keyboard.Key;

/**
 * ZQSD (AZERTY), WASD (QWERTY) and arrows all move. Mouse: left = attack, right = parry.
 * Clicks are buffered briefly so a click landing during a cooldown is not lost.
 */
export class Controls {
  private k: Record<string, K>;
  private attackAt = -Infinity;
  private parryAt = -Infinity;
  private static BUFFER_MS = 150;
  private static PARRY_STALE_MS = 100;

  constructor(private scene: Phaser.Scene) {
    this.k = scene.input.keyboard!.addKeys('Z,Q,S,D,W,A,UP,DOWN,LEFT,RIGHT,SPACE,E,F,ESC,ONE,TWO,THREE') as Record<string, K>;
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.button === 2) this.parryAt = scene.time.now;
      else if (p.button === 0) this.attackAt = scene.time.now;
    });
    // Discrete actions are event-buffered: a tap shorter than one frame would be missed by JustDown.
    const kb = scene.input.keyboard!;
    const keys = ['SPACE', 'E', 'F', 'ESC', 'ONE', 'TWO', 'THREE'];
    const handlers = keys.map(key => {
      const h = (e: KeyboardEvent) => { if (!e.repeat) this.pressed.set(key, scene.time.now); };
      kb.on(`keydown-${key}`, h);
      return h;
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keys.forEach((key, i) => kb.off(`keydown-${key}`, handlers[i])));
  }

  private pressed = new Map<string, number>();

  private took(key: string): boolean {
    const t = this.pressed.get(key);
    this.pressed.delete(key);
    return t !== undefined && this.scene.time.now - t <= Controls.BUFFER_MS;
  }

  move(): { x: number; y: number } {
    const k = this.k;
    const x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.Q.isDown || k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.Z.isDown || k.W.isDown || k.UP.isDown ? 1 : 0);
    const len = Math.hypot(x, y);
    return len ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  dash() { return this.took('SPACE'); }
  interact() { return this.took('E'); }
  blocker() { return this.took('F'); }
  escape() { return this.took('ESC'); }
  numberPressed(): number {
    if (this.took('ONE')) return 1;
    if (this.took('TWO')) return 2;
    if (this.took('THREE')) return 3;
    return 0;
  }

  /** True if an attack click is buffered or the left button is held. Consumes the buffer. */
  wantsAttack(now: number): boolean {
    const buffered = now - this.attackAt <= Controls.BUFFER_MS;
    if (buffered) this.attackAt = -Infinity;
    return buffered || this.scene.input.activePointer.leftButtonDown();
  }

  /**
   * A right-click starts a parry on the next frame it is allowed. Only stale clicks (older than
   * PARRY_STALE_MS, e.g. made mid-dash) are dropped; the check must not depend on frame rate.
   */
  wantsParry(now: number): boolean {
    const fresh = now - this.parryAt <= Controls.PARRY_STALE_MS;
    this.parryAt = -Infinity;
    return fresh;
  }

  pointerWorld(): { x: number; y: number } {
    const p = this.scene.input.activePointer;
    const v = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    return { x: v.x, y: v.y };
  }
}
