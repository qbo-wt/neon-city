import Phaser from 'phaser';
import { createRng, pick, type Rng } from '../core/rng';
import { PALETTE } from './sprites';

/**
 * NPC bodies are assembled from parts: one base body, a hair style, extras (visor, chrome arm…)
 * and a colour set. Slot letters: H hair, K skin, E eyes, J jacket, j jacket shade, A accent,
 * L legs, B shoes, V visor, g/w chrome.
 */
const BODY = [
  '................',
  '......kkkk......',
  '.....kKKKKk.....',
  '.....kKEKEk.....',
  '.....kKKKKk.....',
  '......kKKk......',
  '....kkJJJJkk....',
  '...kJJJAAJJJk...',
  '..kJkJJJJJJkJk..',
  '..kJkJjJJjJkJk..',
  '..kKkJJJJJJkKk..',
  '...kkJJJJJJkk...',
  '....kLLLLLLk....',
];
const LEGS: Record<'a' | 'b' | 'c', string[]> = {
  a: ['....kLLkkLLk....', '....kLk..kLk....', '....kLk..kLk....', '....kBk..kBk....', '...kBBk..kBBk...', '...kkkk..kkkk...'],
  b: ['....kLLkkLLk....', '...kLk....kLk...', '...kLk....kLk...', '..kBk.....kLk...', '..kBBk...kBBk...', '..kkkk...kkkk...'],
  c: ['....kLLkkLLk....', '...kLk....kLk...', '...kLk....kLk...', '...kLk.....kBk..', '...kBBk...kBBk..', '...kkkk...kkkk..'],
};

type Overlay = Record<number, string>;
export const HAIR: Record<string, Overlay> = {
  short: { 1: '.....kkHHkk.....', 2: '.....kHHHHk.....' },
  mohawk: { 0: '.......HH.......', 1: '......kHHk......', 2: '.....kKHHKk.....' },
  long: { 1: '.....kHHHHk.....', 2: '....kHHHHHHk....', 3: '....kHKEKEHk....', 4: '....kHKKKKHk....', 5: '....kH.kk.Hk....', 6: '....kHJJJJHk....' },
  bun: { 0: '......kHHk......', 1: '.....kHHHHk.....', 2: '.....kHHHHk.....' },
  cap: { 1: '.....kAAAAk.....', 2: '....kAAAAAAAk...' },
  hood: { 1: '.....kJJJJk.....', 2: '....kJKKKKJk....', 3: '....kJKEKEJk....', 4: '....kJKKKKJk....', 5: '....kJjKKjJk....' },
  bald: { 1: '.....kKKKKk.....' },
  afro: { 0: '.....kHHHHk.....', 1: '....kHHHHHHk....', 2: '....kHKKKKHk....' },
};
export const EXTRAS: Record<string, Overlay> = {
  visor: { 3: '.....kVVVVk.....' },
  chromeArm: { 8: '..kgk...........', 9: '..kgk...........', 10: '..kwk...........' },
  scarf: { 6: '....kkAAAAkk....', 7: '...kJAAAAAAJk...' },
  beard: { 5: '......kHHk......' },
  tattoo: { 9: '..kJkJjAJjJkJk..' },
};

const JACKETS: [string, string][] = [['m', 'M'], ['c', 'C'], ['p', 'P'], ['y', 'Y'], ['e', 'G'], ['g', 'G'], ['r', 'M'], ['w', 'g'], ['G', 'k']];

export interface NpcLook {
  hair: keyof typeof HAIR;
  extras: (keyof typeof EXTRAS)[];
  colors: Record<string, string>;
}

export function randomLook(rng: Rng): NpcLook {
  const [J, j] = pick(rng, JACKETS);
  const extras = Object.keys(EXTRAS).filter(() => rng() < 0.22) as NpcLook['extras'];
  return {
    hair: pick(rng, Object.keys(HAIR)) as NpcLook['hair'],
    extras,
    colors: {
      J, j, A: pick(rng, ['y', 'c', 'm', 'w', 'e', 'r']), H: pick(rng, ['k', 'y', 'r', 'm', 'c', 'w', 'G', 'Y', 'S']),
      K: pick(rng, ['s', 'S', 'h']), E: 'k', L: pick(rng, ['G', 'P', 'k', 'g', 'C', 'M']), B: pick(rng, ['k', 'w', 'r', 'y']), V: pick(rng, ['c', 'r', 'e', 'y']),
    },
  };
}

function compose(look: NpcLook, legs: 'a' | 'b' | 'c', back: boolean): string[] {
  const rows = [...BODY, ...LEGS[legs]];
  const apply = (o: Overlay) => Object.entries(o).forEach(([i, row]) => {
    const r = Number(i);
    rows[r] = [...rows[r]].map((ch, x) => (row[x] && row[x] !== '.' ? row[x] : ch)).join('');
  });
  apply(HAIR[look.hair]);
  look.extras.forEach(e => { if (!(back && e === 'visor')) apply(EXTRAS[e]); });
  if (back) {
    // Seen from behind: the face is hair (or hood).
    const fill = look.hair === 'hood' ? 'J' : look.hair === 'bald' ? 'K' : look.hair === 'cap' ? 'A' : 'H';
    for (let r = 1; r <= 5; r++) rows[r] = rows[r].replace(/[KEV]/g, fill);
  }
  return rows.map(r => [...r].map(ch => look.colors[ch] ?? ch).join(''));
}

function draw(scene: Phaser.Scene, key: string, grid: string[]) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, 16, grid.length)!;
  const ctx = t.getContext();
  grid.forEach((row, y) => [...row].forEach((ch, x) => {
    const c = PALETTE[ch];
    if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
  }));
  t.refresh();
}

/** Creates `${key}-a/b/c`, `${key}-back-a/b/c` and the walk animations `${key}-walk` / `${key}-walk-back`. */
export function generateNpc(scene: Phaser.Scene, key: string, look: NpcLook) {
  for (const back of [false, true]) for (const l of ['a', 'b', 'c'] as const) draw(scene, `${key}${back ? '-back' : ''}-${l}`, compose(look, l, back));
  for (const back of ['', '-back']) {
    const anim = `${key}-walk${back}`;
    if (scene.anims.exists(anim)) continue;
    scene.anims.create({ key: anim, frames: ['a', 'b', 'a', 'c'].map(l => ({ key: `${key}${back}-${l}` })), frameRate: 7, repeat: -1 });
  }
}

export const RESIDENTS = 24;

/** Building residents plus the two shopkeepers, all drawn once at boot. */
export function generateNpcArt(scene: Phaser.Scene) {
  const rng = createRng(2049);
  for (let i = 0; i < RESIDENTS; i++) generateNpc(scene, `res-${i}`, randomLook(rng));
  generateNpc(scene, 'npc-doc', { hair: 'bald', extras: ['visor', 'chromeArm'], colors: { J: 'w', j: 'g', A: 'r', H: 'G', K: 'h', E: 'k', L: 'g', B: 'k', V: 'r' } });
  generateNpc(scene, 'npc-nyx', { hair: 'hood', extras: ['visor', 'tattoo'], colors: { J: 'G', j: 'k', A: 'e', H: 'k', K: 'S', E: 'k', L: 'k', B: 'e', V: 'e' } });
  // Small props carried by residents.
  if (!scene.textures.exists('bowl')) {
    const t = scene.textures.createCanvas('bowl', 8, 5)!;
    const c = t.getContext();
    c.fillStyle = PALETTE.k; c.fillRect(0, 1, 8, 4); c.fillStyle = PALETTE.w; c.fillRect(1, 1, 6, 3); c.fillStyle = PALETTE.y; c.fillRect(2, 1, 4, 1);
    t.refresh();
  }
  generateNpc(scene, 'npc-lo', { hair: 'bun', extras: ['scarf'], colors: { J: 'r', j: 'M', A: 'w', H: 'w', K: 'h', E: 'k', L: 'G', B: 'k', V: 'c' } });
}
