import Phaser from 'phaser';
import { CONFIG } from '../config';
import type { Controls } from '../input/controls';

/**
 * The player walking around the apartment and the building (real time, keyboard). Fights happen on
 * the tactical board of the RunScene, which draws its own units.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  inputEnabled = true;
  private walkDir = { x: 0, y: 1 };

  constructor(scene: Phaser.Scene, x: number, y: number, private controls: Controls) {
    super(scene, x, y, 'body');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    // Invisible 24×24 body (the 3D character follows it), feet on row 15.
    this.setOrigin(0.5, 15 / 24).setVisible(false);
    (this.body as Phaser.Physics.Arcade.Body).setCircle(5, 7, 13);
    this.setDepth(10);
  }

  tick(_now: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const move = this.inputEnabled ? this.controls.move() : { x: 0, y: 0 };
    body.setVelocity(move.x * CONFIG.PLAYER_SPEED, move.y * CONFIG.PLAYER_SPEED);
    if (move.x || move.y) this.walkDir = move;
  }

  /** Last walking direction (the 3D character keeps facing it when it stops). */
  get lookDir() { return this.walkDir; }
}
