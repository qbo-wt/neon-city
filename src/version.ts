/** Set at build time by vite.config.ts: 1.<date>.<time of the build> plus the commit, e.g. "1.20261120.1432 · 1faa4ec". */
declare const __APP_VERSION__: string;
export const VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
