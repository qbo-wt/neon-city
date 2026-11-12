import Phaser from 'phaser';
import { CONFIG } from './config';
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
import '@fontsource/chakra-petch/latin-500.css';
import '@fontsource/chakra-petch/latin-700.css';
import '@fontsource/teko/latin-500.css';
import '@fontsource/teko/latin-600.css';

// The interface fonts are bundled; Phaser draws text to canvases, so they must be loaded first.
await Promise.all(['500 16px "Chakra Petch"', '700 16px "Chakra Petch"', '500 16px Teko', '600 16px Teko'].map(f => document.fonts.load(f))).catch(() => undefined);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CONFIG.WIDTH * CONFIG.ZOOM,
  height: CONFIG.HEIGHT * CONFIG.ZOOM,
  // Transparent: the 3D streets are drawn on a canvas underneath.
  transparent: true,
  pixelArt: true,
  roundPixels: true,
  disableContextMenu: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [BootScene, MenuScene, HideoutScene, BuildingScene, RipperdocScene, NetrunnerScene, RunScene, HudScene, DeathScene],
});

// Test hook: `?debug` exposes the game instance (and the fight AI, to let tests play the hero) for automated smoke tests.
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __NEON__: game, __NEON_AI__: { nextAction, cast, moveTo } });
