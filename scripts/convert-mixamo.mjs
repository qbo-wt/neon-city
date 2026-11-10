// Converts public/assets/mixamo/characters/*.fbx into compact public/assets/mixamo/glb/*.glb.
// Needs the dev server (npm run dev, port 5173 or PORT) and Microsoft Edge. Usage: node scripts/convert-mixamo.mjs [names…]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const port = process.env.PORT ?? 5173;
const dir = path.resolve('public/assets/mixamo');
const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(dir, 'characters')).filter(f => f.endsWith('.fbx')).map(f => f.slice(0, -4));
fs.mkdirSync(path.join(dir, 'glb'), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage();
page.on('pageerror', e => console.error('page:', e.message));
await page.goto(`http://localhost:${port}/tools/mixamo-convert.html`);
await page.waitForFunction(() => typeof window.convertMixamo === 'function', null, { timeout: 30000 });
for (const n of names) {
  const b64 = await page.evaluate(name => window.convertMixamo(name), n);
  const out = path.join(dir, 'glb', `${n}.glb`);
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  const before = fs.statSync(path.join(dir, 'characters', `${n}.fbx`)).size, after = fs.statSync(out).size;
  console.log(`${n}: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
}
await browser.close();
