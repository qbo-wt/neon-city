import Phaser from 'phaser';
import { CONFIG, SCENES } from '../config';
import { Rain } from '../fx/effects';
import { txt } from '../ui/text';
import { setupCamera } from '../ui/camera';
import { audio } from '../audio/audio';

export class DeathScene extends Phaser.Scene {
  private rain!: Rain;
  constructor() { super(SCENES.Death); }

  create(data: { victory: boolean; creditsEarned: number; roomReached: number }) {
    const W = CONFIG.WIDTH;
    setupCamera(this).fadeIn(300, 11, 8, 32);
    audio.setMusic(data.victory ? 'hub' : 'off');
    if (data.victory) audio.sfx('relic');
    this.rain = new Rain(this, W, CONFIG.HEIGHT, 80);
    txt(this, W / 2, 70, data.victory ? 'DISTRICT NETTOYÉ' : 'SIGNAL VITAL PERDU', 22, data.victory ? '#f5e663' : '#ff2a6d').setOrigin(0.5).setStroke('#05030f', 4);
    txt(this, W / 2, 104, data.victory ? 'Le contrat est rempli.' : 'Ton corps a lâché, ton chrome reste sur le trottoir.', 8, '#8a86b0').setOrigin(0.5);
    txt(this, W / 2, 140, `Secteur atteint : ${data.roomReached} / ${CONFIG.ROOMS_PER_RUN}`, 9).setOrigin(0.5);
    txt(this, W / 2, 156, `Crédits rapatriés : ${data.creditsEarned}¢`, 9, '#f5e663').setOrigin(0.5);
    const back = txt(this, W / 2, 210, '[ Clique pour revenir à la planque ]', 9, '#00f0ff').setOrigin(0.5);
    this.tweens.add({ targets: back, alpha: 0.2, yoyo: true, repeat: -1, duration: 600 });
    this.time.delayedCall(500, () => this.input.once('pointerdown', () => this.scene.start(SCENES.Hideout)));
  }

  update(_t: number, dt: number) { this.rain.update(dt); }
}
