import Phaser from 'phaser';
import { SCENES } from '../config';
import { generateTextures } from '../gfx/generateTextures';

export class BootScene extends Phaser.Scene {
  constructor() { super(SCENES.Boot); }
  create() {
    generateTextures(this);
    this.scene.start(SCENES.Menu);
  }
}
