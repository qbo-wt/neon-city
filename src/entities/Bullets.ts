import Phaser from 'phaser';

export type BulletOwner = 'enemy' | 'player';

export class Bullets {
  readonly group: Phaser.Physics.Arcade.Group;

  constructor(private scene: Phaser.Scene) {
    this.group = scene.physics.add.group();
  }

  fire(x: number, y: number, angle: number, speed: number, damage: number, owner: BulletOwner = 'enemy') {
    const b = this.group.create(x, y, owner === 'enemy' ? 'bullet' : 'bullet-player') as Phaser.Physics.Arcade.Image;
    b.setDepth(15).setData({ damage, owner });
    (b.body as Phaser.Physics.Arcade.Body).setCircle(2).setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.scene.time.delayedCall(4000, () => b.active && b.destroy());
    return b;
  }

  /** A parried bullet flies back faster, now hurting enemies. */
  reflect(b: Phaser.Physics.Arcade.Image) {
    const body = b.body as Phaser.Physics.Arcade.Body;
    const angle = Math.atan2(-body.velocity.y, -body.velocity.x);
    const speed = body.velocity.length() * 1.4;
    const dmg = (b.getData('damage') as number) * 2;
    b.destroy();
    this.fire(b.x, b.y, angle, speed, dmg, 'player');
  }
}
