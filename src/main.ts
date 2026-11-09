import Phaser from 'phaser';
import { CONFIG, COLORS } from './config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { HideoutScene } from './scenes/HideoutScene';
import { RunScene } from './scenes/RunScene';
import { HudScene } from './scenes/HudScene';
import { DeathScene } from './scenes/DeathScene';
import { BuildingScene } from './scenes/BuildingScene';
import { RipperdocScene } from './scenes/RipperdocScene';
import { NetrunnerScene } from './scenes/NetrunnerScene';
import { nextAction } from './tactics/ai';
import { cast, moveTo } from './tactics/fight';

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
  scene: [BootScene, MenuScene, HideoutScene, BuildingScene, RipperdocScene, NetrunnerScene, RunScene, HudScene, DeathScene],
});

// Test hook: `?debug` exposes the game instance (and the fight AI, to let tests play the hero) for automated smoke tests.
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __NEON__: game, __NEON_AI__: { nextAction, cast, moveTo } });
