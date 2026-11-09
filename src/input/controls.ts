import Phaser from 'phaser';

type K = Phaser.Input.Keyboard.Key;

/**
 * ZQSD (AZERTY), WASD (QWERTY) and arrows all move (or pan the camera on the tactical board).
 * Discrete key presses are buffered briefly so a tap shorter than a frame is not lost.
 */
export class Controls {
  private k: Record<string, K>;
  private static BUFFER_MS = 150;

  constructor(private scene: Phaser.Scene) {
    this.k = scene.input.keyboard!.addKeys('Z,Q,S,D,W,A,UP,DOWN,LEFT,RIGHT,SPACE,ENTER,E,F,ESC,ONE,TWO,THREE,FOUR,FIVE,SIX,SEVEN,EIGHT,NINE,SHIFT,TAB') as Record<string, K>;
    // Discrete actions are event-buffered: a tap shorter than one frame would be missed by JustDown.
    const kb = scene.input.keyboard!;
    const keys = ['SPACE', 'ENTER', 'E', 'F', 'ESC', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'SHIFT', 'TAB'];
    const handlers = keys.map(key => {
      const h = (e: KeyboardEvent) => { if (!e.repeat) this.pressed.set(key, this.real()); };
      kb.on(`keydown-${key}`, h);
      return h;
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keys.forEach((key, i) => kb.off(`keydown-${key}`, handlers[i])));
  }

  private pressed = new Map<string, number>();
  private real() { return this.scene.game.loop.time; }

  private took(key: string): boolean {
    const t = this.pressed.get(key);
    this.pressed.delete(key);
    return t !== undefined && this.real() - t <= Controls.BUFFER_MS;
  }

  move(): { x: number; y: number } {
    const k = this.k;
    const x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.Q.isDown || k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.Z.isDown || k.W.isDown || k.UP.isDown ? 1 : 0);
    const len = Math.hypot(x, y);
    return len ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  /** Space or Enter: end your turn, confirm the placement. */
  confirm() { return this.took('SPACE') || this.took('ENTER'); }
  interact() { return this.took('E'); }
  tab() { return this.took('TAB'); }
  blocker() { return this.took('F'); }
  escape() { return this.took('ESC'); }
  numberPressed(): number {
    if (this.took('ONE')) return 1;
    if (this.took('TWO')) return 2;
    if (this.took('THREE')) return 3;
    if (this.took('FOUR')) return 4;
    if (this.took('FIVE')) return 5;
    if (this.took('SIX')) return 6;
    if (this.took('SEVEN')) return 7;
    if (this.took('EIGHT')) return 8;
    if (this.took('NINE')) return 9;
    return 0;
  }

  pointerWorld(): { x: number; y: number } {
    const p = this.scene.input.activePointer;
    const v = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    return { x: v.x, y: v.y };
  }
}
