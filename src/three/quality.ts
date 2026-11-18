/**
 * The 'auto' graphics quality: judged once per session on the frame times of the first place
 * (after its loading hitches). Below ~38 fps most of the time, the low quality is worth it.
 */
export const AUTO_SKIP = 240;
export const AUTO_SAMPLES = 180;
const SLOW_MS = 1000 / 38;

/** 'low' if the median frame of `ms` is slower than 38 fps. */
export function autoQuality(ms: readonly number[]): 'high' | 'low' {
  if (!ms.length) return 'high';
  const s = [...ms].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] > SLOW_MS ? 'low' : 'high';
}
