import { preloadCharacters } from './characters';

/** public/assets/manifest.json, written by scripts/asset-manifest.mjs. */
interface Manifest { total: number; files: { path: string; size: number }[] }

export interface PreloadStatus {
  /** 0..1 */
  progress: number;
  /** what is loading now, e.g. "AVATARS ANIME" */
  label: string;
  bytes: number;
  total: number;
}

const GROUPS: [RegExp, string][] = [
  [/^assets\/vrm\//, 'AVATARS ANIME'],
  [/^assets\/mixamo\//, 'ANIMATIONS'],
  [/^assets\/kenney\/(cars|roads)\//, 'RUES ET VÉHICULES'],
  [/^assets\/kenney\//, 'DÉCORS DE LA VILLE'],
  [/^assets\/kaykit\//, 'MOBILIER'],
];
const groupOf = (p: string) => GROUPS.find(([re]) => re.test(p))?.[1] ?? 'DONNÉES';

/** Share of the bar for the downloads; the rest is parsing the avatars' animation clips. */
const DOWNLOAD_SHARE = 0.9;
const PARALLEL = 6;

async function drain(url: string, onBytes: (n: number) => void) {
  const r = await fetch(url);
  if (!r.ok || !r.body) { await r.arrayBuffer().catch(() => undefined); return; }
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onBytes(value.byteLength);
  }
}

/**
 * Fetches every heavy 3D file once (it warms the HTTP cache, so the streets and rooms build without
 * pop-in), then loads the anime avatars and their clips. Never rejects: a missing file is skipped.
 */
export async function preloadAll(onProgress: (s: PreloadStatus) => void): Promise<void> {
  let manifest: Manifest | undefined;
  try {
    const r = await fetch('assets/manifest.json', { cache: 'no-cache' });
    if (r.ok) manifest = await r.json() as Manifest;
  } catch { /* no manifest: only the avatars are preloaded */ }
  const files = manifest?.files ?? [];
  const total = files.reduce((s, f) => s + f.size, 0);
  let bytes = 0, label = files[0] ? groupOf(files[0].path) : 'AVATARS ANIME';
  const report = (progress: number) => onProgress({ progress: Math.min(1, progress), label, bytes, total });
  report(0);

  if (files.length) {
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const f = files[next++];
        label = groupOf(f.path);
        let got = 0;
        await drain(f.path, n => { got += n; bytes += n; report(DOWNLOAD_SHARE * bytes / total); }).catch(() => undefined);
        // Size on disk and bytes received can differ (compression): settle on the manifest's size.
        bytes += f.size - got;
        report(DOWNLOAD_SHARE * bytes / total);
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
  }
  const base = files.length ? DOWNLOAD_SHARE : 0;
  label = 'CALIBRAGE DES AVATARS';
  report(base);
  await preloadCharacters((done, n) => report(base + (1 - base) * done / n)).catch(() => undefined);
  label = 'PRÊT';
  report(1);
}
