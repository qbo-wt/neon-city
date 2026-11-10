import { World3D } from './World3D';

/**
 * The 3D canvas lives under the (transparent) Phaser canvas, at exactly the same place and size, so
 * Phaser draws the interface over the 3D world. One World3D for the whole game.
 */
let world: World3D | undefined;
let canvas: HTMLCanvasElement | undefined;
let envLoaded: Promise<void> | undefined;

function fit(phaser: HTMLCanvasElement) {
  if (!canvas || !world) return;
  const host = canvas.parentElement!.getBoundingClientRect(), r = phaser.getBoundingClientRect();
  Object.assign(canvas.style, { left: `${r.left - host.left}px`, top: `${r.top - host.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  world.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
}

/** The shared 3D world (created on first use, next to the Phaser canvas). */
export function stage(phaser: HTMLCanvasElement): World3D {
  if (!world) {
    canvas = document.createElement('canvas');
    canvas.id = 'world3d';
    Object.assign(canvas.style, { position: 'absolute', zIndex: '0', imageRendering: 'auto', display: 'none' });
    const host = phaser.parentElement!;
    host.style.position = 'relative';
    phaser.style.position = 'relative';
    phaser.style.zIndex = '1';
    host.insertBefore(canvas, phaser);
    const r = phaser.getBoundingClientRect();
    world = new World3D(canvas, Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
    window.addEventListener('resize', () => setTimeout(() => fit(phaser), 50));
    fit(phaser);
  }
  return world;
}

/** Loads the night sky once. */
export function environment(w: World3D) {
  envLoaded ??= w.loadEnvironment();
  return envLoaded;
}

/** How visible a Phaser camera is through its fade (1 = not faded). */
export function fadeVisibility(f: { isRunning: boolean; isComplete: boolean; direction: boolean; progress: number }) {
  if (f.isRunning) return f.direction ? 1 - f.progress : f.progress;
  return f.isComplete && f.direction ? 0 : 1;
}

/** Follows the Phaser camera fades (0 = hidden, 1 = shown). */
export function stageOpacity(v: number) { if (canvas) canvas.style.opacity = String(v); }

export function showStage(on: boolean, phaser?: HTMLCanvasElement) {
  if (!canvas) return;
  canvas.style.display = on ? 'block' : 'none';
  if (on && phaser) fit(phaser);
}
