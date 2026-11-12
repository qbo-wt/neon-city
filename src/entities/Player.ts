import Phaser from 'phaser';
import { CONFIG } from '../config';
import type { Controls } from '../input/controls';
import { PLAYER_ORIGIN_Y, playerKey, type Facing } from '../gfx/playerArt';

/**
 * The player walking around the apartment and the building (real time, keyboard). Fights happen on
 * the tactical board of the RunScene, which draws its own units.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  inputEnabled = true;
  private walkDir = { x: 0, y: 1 };
  private shadow?: Phaser.GameObjects.Image;
  private facing: Facing = 'd';

  constructor(scene: Phaser.Scene, x: number, y: number, private controls: Controls) {
    super(scene, x, y, playerKey('d', 'idle0'));
    scene.add.existing(this);
    scene.physics.add.existing(this);
    // 24×24 frames with the feet on row 21.
    this.setOrigin(0.5, PLAYER_ORIGIN_Y);
    (this.body as Phaser.Physics.Arcade.Body).setCircle(5, 7, 13);
    this.setDepth(10);
  }

  tick(_now: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const move = this.inputEnabled ? this.controls.move() : { x: 0, y: 0 };
    body.setVelocity(move.x * CONFIG.PLAYER_SPEED, move.y * CONFIG.PLAYER_SPEED);
    if (move.x || move.y) this.walkDir = move;
    this.shadow ??= this.scene.add.image(this.x, this.y, 'shadow').setDepth(4);
    this.shadow.setPosition(this.x, this.y + 7).setVisible(this.visible);
    this.animate(this.walkDir, !!(move.x || move.y));
  }

  private animate(dir: { x: number; y: number }, moving: boolean) {
    const facing: Facing = dir.y < -0.6 ? 'u' : Math.abs(dir.x) > 0.55 ? 's' : 'd';
    this.setFlipX(dir.x < 0);
    this.facing = facing;
    const key = `pl-${moving ? 'walk' : 'idle'}-${facing}`;
    if (this.anims.currentAnim?.key === key && this.anims.isPlaying) return;
    // Turning while walking keeps the step in progress instead of restarting the cycle.
    const keepStep = moving && this.anims.currentAnim?.key.startsWith('pl-walk') ? this.anims.currentFrame?.index ?? 0 : 0;
    this.anims.play({ key, startFrame: Math.max(0, keepStep - 1) });
  }

  get face() { return this.facing; }
  /** Last walking direction (the 3D character keeps facing it when it stops). */
  get lookDir() { return this.walkDir; }
}
