import { assetUrl, setAssetVersions } from './assetUrl';
import { BACKGROUND_AVATARS, MENU_AVATARS, preloadCharacters, warmAvatar } from './characters';

/** public/assets/manifest.json, written by scripts/asset-manifest.mjs. */
interface Manifest { total: number; files: { path: string; size: number; v?: string }[] }

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
  [/^assets\/anims\//, 'ANIMATIONS'],
  [/^assets\/kenney\/(cars|roads)\//, 'RUES ET VÉHICULES'],
  [/^assets\/kenney\//, 'DÉCORS DE LA VILLE'],
  [/^assets\/kaykit\//, 'MOBILIER'],
];
/** An avatar file that is not for the menu: it downloads in the background after the menu shows. */
const avatarOf = (p: string) => /^assets\/vrm\/(.+)\.vrm$/.exec(p)?.[1];
const isLater = (p: string) => { const a = avatarOf(p); return !!a && !MENU_AVATARS.includes(a); };
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

/** The avatars of the manifest that the menu does not show (empty when there is no manifest). */
let later: string[] = [];

/**
 * Fetches what the menu needs (the street and furniture kits, the menu's avatars, the animation clips),
 * which warms the HTTP cache so the first scenes build without pop-in. The other avatars come later
 * (see preloadRest). Never rejects: a missing file is skipped.
 */
export async function preloadAll(onProgress: (s: PreloadStatus) => void): Promise<void> {
  let manifest: Manifest | undefined;
  try {
    const r = await fetch('assets/manifest.json', { cache: 'no-cache' });
    if (r.ok) manifest = await r.json() as Manifest;
    if (manifest) setAssetVersions(manifest.files);
  } catch { /* no manifest: only the avatars are preloaded */ }
  const all = manifest?.files ?? [];
  later = all.filter(f => isLater(f.path)).map(f => avatarOf(f.path)!);
  const files = all.filter(f => !isLater(f.path));
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
        const onBytes = (n: number) => { got += n; bytes += n; report(DOWNLOAD_SHARE * bytes / total); };
        const a = avatarOf(f.path);
        // Avatars are fetched once, by the character loader (same cache entry), not warmed then fetched again.
        await (a ? warmAvatar(a, onBytes) : drain(assetUrl(f.path), onBytes)).catch(() => undefined);
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

/**
 * Background download of the other avatars, apartment and first-sector cast first, two at a time so the
 * menu and the hideout stay smooth. A character asked for before its turn is fetched at once (same
 * cache entry), and shows its stand-in until then, as for any avatar.
 */
let restStarted = false;
export function preloadRest(): void {
  if (restStarted) return;
  restStarted = true;
  const order = BACKGROUND_AVATARS.filter(a => later.includes(a)).concat(later.filter(a => !BACKGROUND_AVATARS.includes(a)));
  let next = 0;
  const worker = async () => { while (next < order.length) await warmAvatar(order[next++]).catch(() => undefined); };
  // A beat after the menu appears, so its own scene (street kits, first frames) is not competing for the network.
  setTimeout(() => { for (let i = 0; i < 2; i++) void worker(); }, 1500);
}
