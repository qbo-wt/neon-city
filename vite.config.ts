import { defineConfig } from 'vite';
import { writeManifest } from './scripts/asset-manifest.mjs';

export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  plugins: [{
    // public/assets/manifest.json: the files the loading screen pre-fetches (see src/three/preload.ts).
    name: 'asset-manifest',
    // Written before Vite lists the public files, so the dev server serves the fresh one.
    config() { if (!process.env.VITEST) writeManifest(); },
  }],
} as any);
