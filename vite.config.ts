import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { writeManifest } from './scripts/asset-manifest.mjs';

// Shown on the menu and the loading screen, so a player can tell which build is running.
// 1.<yyyymmdd>.<hhmm> in Paris time (always grows), then the commit.
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? (() => { try { return execSync('git rev-parse HEAD').toString(); } catch { return 'local'; } })()).trim().slice(0, 7);
const t = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  .formatToParts(new Date()).map(p => [p.type, p.value]));
const APP_VERSION = `1.${t.year}${t.month}${t.day}.${t.hour}${t.minute} · ${commit}`;

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  server: { port: 5173, open: false },
  // Hashed bundles go to build/ (cached forever); public/assets keep stable names and are revalidated (vercel.json).
  build: {
    chunkSizeWarningLimit: 1500, assetsDir: 'build',
    // Vendor chunks keep their hash across deploys while the game code changes: a returning player re-downloads only the game.
    rolldownOptions: { output: { codeSplitting: { groups: [
      { name: 'vendor-phaser', test: /node_modules[\/]phaser[\/]/, priority: 30 },
      { name: 'vendor-three', test: /node_modules[\\/](three|@pixiv)[\\/]/, priority: 20 },
    ] } } },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  plugins: [{
    // public/assets/manifest.json: the files the loading screen pre-fetches (see src/three/preload.ts).
    name: 'asset-manifest',
    // Written before Vite lists the public files, so the dev server serves the fresh one.
    config() { if (!process.env.VITEST) writeManifest(); },
  }],
} as any);
