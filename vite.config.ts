import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
} as any);
