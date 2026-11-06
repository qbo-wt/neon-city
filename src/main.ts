import Phaser from 'phaser';
import { CONFIG, COLORS } from './config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { HideoutScene } from './scenes/HideoutScene';
import { RunScene } from './scenes/RunScene';
import { HudScene } from './scenes/HudScene';
import { DeathScene } from './scenes/DeathScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CONFIG.WIDTH * CONFIG.ZOOM,
  height: CONFIG.HEIGHT * CONFIG.ZOOM,
  backgroundColor: COLORS.night,
  pixelArt: true,
  roundPixels: true,
  disableContextMenu: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [BootScene, MenuScene, HideoutScene, RunScene, HudScene, DeathScene],
});

// Test hook: `?debug` exposes the game instance for automated smoke tests.
if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __NEON__: Phaser.Game }).__NEON__ = game;
