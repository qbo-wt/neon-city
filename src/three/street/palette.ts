import * as THREE from 'three';

/**
 * Night versions of the Kenney / KayKit palette textures. Each kit colours its models with one
 * small `colormap.png` of flat swatches; here every swatch is pushed towards the game's palette:
 * whites and greys become cool lavender and indigo, saturated colours snap part of the way to the
 * nearest neon hue. The models keep their colour layout, only the colours change, so a whole kit
 * reads as one neon-night set. Done once per palette image, at load time (no files to regenerate).
 */

/** Neon hues of the art direction (degrees) plus a night blue, as snapping targets. */
const TARGET_HUES = [184, 225, 262, 285, 330, 350, 25, 50, 150];

function nearestHue(h: number) {
  let best = TARGET_HUES[0], bd = 999;
  for (const t of TARGET_HUES) {
    const d = Math.abs(((h - t + 540) % 360) - 180);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

const mixHue = (a: number, b: number, k: number) => {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * k + 360) % 360;
};

function rgbToHsl(r: number, g: number, b: number) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return { h: 0, s: 0, l };
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s, hp = h / 60, x = c * (1 - Math.abs((hp % 2) - 1)), m = l - c / 2;
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

/** One colour of a palette, at night. Inputs and outputs are sRGB 0..1. */
export function nightColour(r: number, g: number, b: number): [number, number, number] {
  const { h, s, l } = rgbToHsl(r, g, b);
  if (s < 0.16 || l > 0.93) {
    // Neutrals: concrete, plaster, metal, glass frames -> lavender to deep indigo.
    const nl = 0.13 + l * 0.62;
    return hslToRgb(252, 0.16 + (1 - l) * 0.14, nl) as [number, number, number];
  }
  const nh = mixHue(h, nearestHue(h), 0.65);
  const ns = Math.min(1, s * 1.08 + 0.08);
  const nl = Math.min(0.72, 0.08 + l * 0.82);
  return hslToRgb(nh, ns, nl) as [number, number, number];
}

/** Light-blue window glass of the city kits: those swatches glow at night. */
function isGlass(r: number, g: number, b: number) {
  const { h, s, l } = rgbToHsl(r, g, b);
  return h > 190 && h < 235 && s > 0.35 && l > 0.55;
}

const cache = new Map<string, { map: THREE.Texture; glass: THREE.Texture | null }>();

function imageOf(t: THREE.Texture): CanvasImageSource & { width: number; height: number } | undefined {
  const img = t.image as (HTMLImageElement | ImageBitmap) | undefined;
  if (!img) return undefined;
  const w = (img as HTMLImageElement).naturalWidth || img.width, h = (img as HTMLImageElement).naturalHeight || img.height;
  if (!w || !h) return undefined;
  return img as CanvasImageSource & { width: number; height: number };
}

/**
 * The night palette for a kit (`key`, e.g. 'commercial'), built from the texture the GLTF loader
 * gave its models. `glass` is an emissive mask of the window swatches (white where glass), or
 * null when the palette has no glass.
 */
export function nightPalette(key: string, src: THREE.Texture) {
  const hit = cache.get(key);
  if (hit) return hit;
  const img = imageOf(src);
  if (!img) return { map: src, glass: null };
  const w = img.width, h = img.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h), d = px.data;
  const gc = document.createElement('canvas');
  gc.width = w; gc.height = h;
  const gctx = gc.getContext('2d')!;
  const gpx = gctx.createImageData(w, h), gd = gpx.data;
  let glassCount = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const glass = isGlass(r, g, b);
    if (glass) { glassCount++; gd[i] = gd[i + 1] = gd[i + 2] = 255; }
    gd[i + 3] = 255;
    const [nr, ng, nb] = glass ? [0.1, 0.09, 0.22] : nightColour(r, g, b);
    d[i] = nr * 255; d[i + 1] = ng * 255; d[i + 2] = nb * 255;
  }
  ctx.putImageData(px, 0, 0);
  gctx.putImageData(gpx, 0, 0);
  const prep = (t: THREE.Texture) => {
    t.flipY = src.flipY;
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.wrapS = src.wrapS; t.wrapT = src.wrapT;
    t.userData.palette = true;
    return t;
  };
  const out = { map: prep(new THREE.CanvasTexture(c)), glass: glassCount > 50 ? prep(new THREE.CanvasTexture(gc)) : null };
  cache.set(key, out);
  return out;
}
