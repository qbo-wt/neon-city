import Phaser from 'phaser';
import { createRng, pick, type Rng } from '../core/rng';
import { PALETTE } from './sprites';
import {
  BASE_ANIMS, BUILDS, baseFrames, buildSheet, line, pose, put, rect,
  type AnimDef, type ArmStyle, type Build, type DrawCtx, type Facing, type FrameSet, type Hand, type Leg, type Look, type Pal, type TorsoStyle,
} from './rig';

/**
 * NPCs on the character rig: random builds, hair, outfits and accessories, each with every activity
 * animated (smoking, phone calls, talking with gestures, sitting / typing, eating ramen, playing
 * arcade, cooking, leaning with arms crossed, dancing) plus walking in three views.
 * Sheet key = NPC look key, frames `${facing}-${frame}`, anims `${key}-${activity}-${facing}`.
 */

// ---- Heads: hair styles as [rows 0-3, rows 4-7] per view --------------------------------
const FACE: Record<Facing, string[]> = {
  d: ['KEKKEK', 'KKKKKK', '.QKKQ.', '..KK..'],
  u: ['HHHHHH', 'QHHHHQ', '.KKKK.', '..KK..'],
  s: ['HHKKEK', 'HQKKKK', '.QKKK.', '..KK..'],
};
type HairDef = Record<Facing, [string[], string[]?]>;
const HAIR: Record<string, HairDef> = {
  short: { d: [['......', '.HHHH.', 'HHHHHH', 'HFKKFH']], u: [['......', '.HHHH.', 'HHHHHH', 'HHFHHH']], s: [['......', '.HHHH.', 'HHHHHK', 'HHFKKK']] },
  mohawk: {
    d: [['..HH..', '.QHHQ.', 'QKHHKQ', 'KKKKKK']], u: [['..HH..', '.QHHQ.', 'QKHHKQ', 'KQHHQK'], ['KKHHKK', 'QKKKKQ', '.KKKK.', '..KK..']],
    s: [['HHHH..', 'FHHKK.', 'QKKKKK', 'KKKKKK'], ['QKKKEK', 'QKKKKK', '.QKKK.', '..KK..']],
  },
  long: {
    d: [['......', '.HHHH.', 'HHHHHH', 'HFKKFH'], ['HEKKEH', 'HKKKKH', 'HQKKQH', 'H.KK.H']],
    u: [['......', '.HHHH.', 'HHHHHH', 'HHFHHH'], ['HHHHHH', 'HHFHHH', 'HHHHHH', 'HHHHHH']],
    s: [['......', '.HHHH.', 'HHHHHK', 'HHHKKK'], ['HHHKEK', 'HHKKKK', 'HHQKK.', 'HH.KK.']],
  },
  bun: {
    d: [['..HH..', '.HFFH.', 'HHHHHH', 'HKKKKH']], u: [['..HH..', '.HFFH.', 'HHHHHH', 'HHHHHH']],
    s: [['HH....', 'HFHHH.', 'HHHHHK', 'HHKKKK'], ['HHKKEK', 'HQKKKK', '.QKKK.', '..KK..']],
  },
  cap: {
    d: [['......', '.AAAA.', 'AAAAAA', 'AFFFFA']], u: [['......', '.AAAA.', 'AAAAAA', 'AAAAAA']],
    s: [['......', '.AAAA.', 'AAAAAAA', 'HHKKKK']],
  },
  hood: {
    d: [['......', '.TTTT.', 'TTTTTT', 'TUKKUT'], ['TEKKET', 'TKKKKT', '.UKKU.', '..UU..']],
    u: [['......', '.TTTT.', 'TTTTTT', 'TTUUTT'], ['TTTTTT', 'TTTTTT', '.TTTT.', '..UU..']],
    s: [['......', '.TTTT.', 'TTTTTK', 'TTTUKK'], ['TTUKEK', 'TTKKKK', '.TUKK.', '..UU..']],
  },
  bald: {
    d: [['......', '.KKKK.', 'KKKKKK', 'QKKKKQ']], u: [['......', '.KKKK.', 'KKKKKK', 'QKKKKQ'], ['KKKKKK', 'QKKKKQ', '.QKKQ.', '..KK..']],
    s: [['......', '.KKKK.', 'QKKKKK', 'QKKKKK'], ['QKKKEK', 'QKKKKK', '.QKKK.', '..KK..']],
  },
  afro: {
    d: [['.HHHH.', 'HHHHHH', 'HHFFHH', 'HKKKKH'], ['HEKKEH', 'HKKKKH', '.QKKQ.', '..KK..']],
    u: [['.HHHH.', 'HHHHHH', 'HHHHHH', 'HHHHHH'], ['HHHHHH', 'HHHHHH', '.HHHH.', '..KK..']],
    s: [['.HHHH.', 'HHHHHH', 'HHHHFK', 'HHHKKK'], ['HHHKEK', 'HHKKKK', '.QKKK.', '..KK..']],
  },
  ponytail: {
    d: [['......', '.HHHH.', 'HHHHHH', 'HFKKFH']], u: [['......', '.HHHH.', 'HHHHHH', 'HHFFHH'], ['HHHHHH', 'QHHHHQ', '.KHHK.', '..HH..']],
    s: [['......', '.HHHH.', 'HHHHHK', 'HHFKKK'], ['HHKKEK', 'HQKKKK', 'HQKKK.', 'H.KK..']],
  },
  spiky: { d: [['H.HH.H', 'HHHHHH', 'HHHHHH', 'HFKKFH']], u: [['H.HH.H', 'HHHHHH', 'HHHHHH', 'HHFHHH']], s: [['HH.H..', 'HHHHHH', 'HHHHHK', 'HHFKKK']] },
};
type Overlay = Partial<Record<Facing, Record<number, string>>>;
const EXTRAS: Record<string, Overlay> = {
  visor: { d: { 4: 'VVVVVV' }, s: { 4: '..VVVVV' }, u: { 4: 'V....V' } },
  glasses: { d: { 4: '.VkkV.' }, s: { 4: '...kVk' } },
  beard: { d: { 5: 'HKKKKH', 6: '.HHHH.' }, s: { 5: '..HHHH', 6: '..HHH.' } },
  earrings: { d: { 5: 'y....y' } },
  cybereye: { d: { 4: 'KEKKRK' }, s: { 4: '....R.' } },
  respirator: { d: { 5: 'KZZZZK', 6: '.ZXXZ.' }, s: { 5: '...ZZZ', 6: '...XZ.' } },
};

function head(hair: string, extras: string[]): Record<Facing, string[]> {
  const out = {} as Record<Facing, string[]>;
  for (const f of ['d', 'u', 's'] as Facing[]) {
    const [top, low] = HAIR[hair][f];
    const rows = [...top, ...(low ?? FACE[f])];
    for (const e of extras) for (const [i, row] of Object.entries(EXTRAS[e][f] ?? {})) {
      const r = Number(i);
      rows[r] = [...row].map((ch, x) => (ch !== '.' ? ch : rows[r][x] ?? '.')).join('') + rows[r].slice(row.length);
    }
    out[f] = rows;
  }
  return out;
}

// ---- Held items, per pose ---------------------------------------------------------------
function npcItem(c: DrawCtx) {
  const g = c.g, it = c.p.item, h = c.hands[c.itemHand], o = c.hands[1 - c.itemHand], side = c.f === 's';
  if (!it) return;
  if (c.layer === 'behind') {
    // Umbrella canopy goes over everything else, but its handle is behind the arm.
    if (it === 'umbrella') line(g, 'v', h.x + (side ? 1 : 0), h.y, h.x + (side ? 1 : 0), c.headTop + c.p.bob);
    return;
  }
  if (it === 'cig' || it === 'cigUp') { put(g, 'w', h.x + (side ? 2 : 0), h.y + (it === 'cig' ? 1 : 0)); put(g, 'r', h.x + (side ? 3 : 0), h.y + (it === 'cig' ? 2 : -1)); }
  else if (it === 'phone') { rect(g, 'k', h.x, h.y - 1, 2, 3); put(g, 'c', h.x + (c.f === 'u' ? 1 : 0), h.y); }
  else if (it === 'bowl') {
    const bx = side ? o.x + 1 : Math.round((o.x + h.x) / 2) - 1;
    rect(g, 'w', bx, o.y, 4, 2); rect(g, 'y', bx + 1, o.y, 2, 1); put(g, 'v', bx, o.y + 1);
    line(g, 'Y', h.x + 1, h.y, h.x + 2, h.y - 3);
  } else if (it === 'ladle') { line(g, 'v', h.x, h.y, h.x - 1, h.y - 4); put(g, 'w', h.x - 2, h.y - 4); rect(g, 'g', h.x - 1, h.y + 1, 2, 1); }
  else if (it === 'bag') { rect(g, 'A', h.x - (side ? 0 : 1), h.y + 1, 3, 3); rect(g, 'w', h.x, h.y + 1, 1, 1); }
  else if (it === 'umbrella') {
    const cx = side ? h.x + 1 : h.x, y = Math.max(1, c.headTop + c.p.bob - 1);
    rect(g, 'A', cx - 5, y, 11, 1); rect(g, 'A', cx - 3, y - 1, 7, 1); rect(g, 'R', cx - 6, y + 1, 1, 1); rect(g, 'R', cx + 6, y + 1, 1, 1);
    put(g, 'w', cx - 2, y - 1); put(g, 'v', cx, y - 2);
  }
}

// ---- Activity poses ---------------------------------------------------------------------
const H = (dx: number, dy: number): Hand => ({ dx, dy });
/** Hands in front-view terms (index 1 = right hand); mirrored seen from the back. */
const hands = (f: Facing, right: Hand, left: Hand): [Hand, Hand] => (f === 'u' ? [H(-right.dx, right.dy), H(-left.dx, left.dy)] : [left, right]);

function activityFrames(b: Build, carry?: string): FrameSet {
  const L = b.armLen, half = b.torsoW / 2, mouth = 6 - b.headH, ear = 4 - b.headH;
  const hang = H(0, L), still: Leg = { dx: 0, lift: 0 };
  const P = (o: Parameters<typeof pose>[2]) => (f: Facing) => pose(b, f, o);
  const set: FrameSet = { ...baseFrames(b, carry, carry === 'umbrella') };
  const at = (f: Facing, front: Hand, sideHand: Hand, other: Hand = hang, sideOther: Hand = hang) =>
    f === 's' ? [sideOther, sideHand] as [Hand, Hand] : hands(f, front, other);

  set.smoke0 = f => pose(b, f, { item: 'cig', hands: at(f, H(0, L), H(1, L)) });
  set.smoke1 = f => pose(b, f, { item: 'cigUp', handUp: f !== 'u', hands: at(f, H(1 - half, mouth), H(3, mouth - 1)) });
  set.phone0 = f => pose(b, f, { item: 'phone', handUp: f !== 'u', hands: at(f, H(3 - half, ear), H(0, ear - 1)) });
  set.phone1 = f => pose(b, f, { item: 'phone', handUp: f !== 'u', bob: 1, hands: at(f, H(3 - half, ear + 1), H(0, ear), H(-1, 2), H(3, 1)) });
  set.talk0 = P({});
  set.talk1 = f => pose(b, f, { hands: at(f, H(-1, 1), H(3, 1)) });
  set.talk2 = f => pose(b, f, { bob: 1, hands: at(f, H(2, 2), H(3, 2), H(-2, 2), H(-2, 2)) });
  set.talk3 = f => pose(b, f, { hands: at(f, hang, H(1, L), H(1, 1), H(3, 0)) });
  const sitLegs = (f: Facing) => f === 's'
    ? [{ dx: 0, lift: 0, knee: 3 }, { dx: 0, lift: 0, knee: 3 }] as [Leg, Leg]
    : [{ dx: 0, lift: b.legLen - 2 }, { dx: 0, lift: b.legLen - 2 }] as [Leg, Leg];
  // Seated: hands on the lap from the front, typing on a desk from the back.
  set.sit0 = f => pose(b, f, { bob: 2, legs: sitLegs(f), hands: f === 'u' ? [H(1, 2), H(-1, 2)] : at(f, H(-1, L - 1), H(2, L - 1), H(1, L - 1), H(2, L - 1)) });
  set.sit1 = f => pose(b, f, { bob: f === 'u' ? 2 : 3, legs: sitLegs(f), hands: f === 'u' ? [H(1, 1), H(-1, 3)] : at(f, H(-1, L - 1), H(2, L - 1), H(1, L - 1), H(2, L - 1)) });
  set.eat0 = f => pose(b, f, { item: 'bowl', hands: at(f, H(-2, 2), H(2, 1), H(2, 2), H(2, 2)) });
  set.eat1 = f => pose(b, f, { item: 'bowl', handUp: f !== 'u', hands: at(f, H(1 - half, mouth), H(3, mouth - 1), H(2, 2), H(2, 2)) });
  set.eat2 = f => pose(b, f, { item: 'bowl', bob: 1, hands: at(f, H(-2, 1), H(2, 0), H(2, 2), H(2, 2)) });
  set.play0 = f => pose(b, f, { hands: f === 's' ? [H(3, 1), H(3, 1)] : [H(2, 2), H(-2, 2)] });
  set.play1 = f => pose(b, f, { hands: f === 's' ? [H(3, 0), H(4, 2)] : [H(2, 1), H(-2, 3)], head: H(0, 0) });
  set.play2 = f => pose(b, f, { bob: 1, hands: f === 's' ? [H(4, 2), H(3, 0)] : [H(2, 3), H(-2, 1)] });
  const stir = [H(-2, 2), H(-3, 3), H(-2, 4), H(-1, 3)];
  stir.forEach((s, i) => { set[`cook${i}`] = f => pose(b, f, { item: 'ladle', bob: i === 2 ? 1 : 0, hands: at(f, s, H(3 + (i % 2), 2 + (i % 3)), H(1, L - 1), H(2, L - 1)) }); });
  // Arms crossed, one foot over the other.
  const crossed = (f: Facing): [Hand, Hand] => f === 's' ? [H(2, 2), H(2, 2)] : f === 'u' ? [H(-(half + 1), 2), H(half + 1, 2)] : [H(half + b.armW - 1, 2), H(-(half + 1), 2)];
  set.lean0 = f => pose(b, f, { hands: crossed(f), lean: f === 's' ? -1 : 0, legs: f === 's' ? [{ dx: 2, lift: 0 }, { dx: -1, lift: 0 }] : [still, { dx: -1, lift: 0 }] });
  set.lean1 = f => pose(b, f, { hands: crossed(f), bob: 1, lean: f === 's' ? -1 : 0, legs: f === 's' ? [{ dx: 2, lift: 0 }, { dx: -1, lift: 0 }] : [still, { dx: -1, lift: 0 }] });
  const up = -(b.headH - 2);
  const dance: [Hand, Hand, number, [number, number]][] = [
    [H(-1, up), hang, 0, [0, 1]], [H(-1, up), H(1, up), 1, [0, 0]], [hang, H(1, up), 0, [1, 0]],
    [H(-3, 0), H(3, 0), 0, [2, 0]], [H(-1, L - 1), H(1, L - 1), 1, [0, 0]], [H(2, up - 1), H(-2, up - 1), 0, [0, 2]],
  ];
  dance.forEach(([l, r, bob, [ll, lr]], i) => {
    set[`dance${i}`] = f => pose(b, f, {
      bob, lean: f === 's' ? (i % 2 ? 1 : -1) : 0,
      legs: f === 's' ? [{ dx: i % 2 ? 2 : -2, lift: ll }, { dx: i % 2 ? -1 : 1, lift: lr }] : [{ dx: 0, lift: ll }, { dx: 0, lift: lr }],
      hands: f === 's' ? [H(-l.dx, l.dy), H(r.dx, r.dy)] : f === 'u' ? [H(-r.dx, r.dy), H(-l.dx, l.dy)] : [l, r],
    });
  });
  return set;
}

const seq = (name: string, idx: number[], rate: number): AnimDef => ({ frames: idx.map(i => `${name}${i}`), rate });
const NPC_ANIMS: Record<string, AnimDef> = {
  ...BASE_ANIMS,
  walk: { ...BASE_ANIMS.walk, rate: 9 },
  smoke: seq('smoke', [0, 0, 0, 0, 0, 1, 1, 1, 0], 2.5),
  phone: seq('phone', [0, 0, 1, 0, 1, 1], 3),
  talk: seq('talk', [0, 1, 1, 0, 2, 2, 0, 3, 3], 3),
  sit: seq('sit', [0, 0, 1, 1], 3),
  eat: seq('eat', [0, 0, 1, 1, 0, 2], 3),
  play: seq('play', [0, 1, 0, 2, 1, 2], 7),
  cook: seq('cook', [0, 1, 2, 3], 5),
  lean: seq('lean', [0, 0, 1, 1], 2),
  dance: seq('dance', [0, 1, 2, 3, 4, 5], 6),
};

// ---- Looks ------------------------------------------------------------------------------
export interface NpcLook {
  build: keyof typeof BUILDS; hair: string; extras: string[]; torso: TorsoStyle; arms: [ArmStyle, ArmStyle];
  tail?: number; skirt?: number; carry?: string; pal: Pal; emblem?: string[];
}

const TOPS: [string, string, string][] = [
  ['m', 'M', 'm'], ['c', 'C', 'w'], ['p', 'P', 'm'], ['y', 'Y', 'w'], ['e', 'G', 'e'], ['g', 'G', 'v'], ['r', 'M', 'm'],
  ['w', 'v', 'w'], ['G', 'k', 'g'], ['C', 'n', 'c'], ['P', 'G', 'p'], ['M', 'P', 'm'], ['S', 'd', 's'], ['n', 'G', 'C'],
];
const PANTS: [string, string][] = [['G', 'k'], ['g', 'G'], ['P', 'G'], ['C', 'n'], ['M', 'P'], ['S', 'd'], ['n', 'G']];
const SKINS: [string, string][] = [['h', 's'], ['s', 'S'], ['S', 'd']];
const HAIRS: [string, string][] = [['k', 'G'], ['y', 'Y'], ['r', 'M'], ['m', 'M'], ['c', 'C'], ['w', 'v'], ['G', 'k'], ['Y', 'S'], ['S', 'd'], ['p', 'P'], ['e', 'G']];

export function randomLook(rng: Rng): NpcLook {
  const [T, U, L] = pick(rng, TOPS), [N, O] = pick(rng, PANTS), [K, Q] = pick(rng, SKINS), [Hh, F] = pick(rng, HAIRS);
  const torso = pick(rng, ['jacket', 'jacket', 'hoodie', 'tank', 'coat', 'vest'] as TorsoStyle[]);
  const extras = ['visor', 'glasses', 'beard', 'earrings', 'cybereye', 'respirator'].filter(() => rng() < 0.16).slice(0, 2);
  if (extras.includes('visor') && extras.includes('glasses')) extras.splice(extras.indexOf('glasses'), 1);
  const chrome = rng() < 0.2;
  const sleeve: ArmStyle = torso === 'tank' ? 'skin' : 'cloth';
  return {
    build: pick(rng, ['normal', 'normal', 'slim', 'wide', 'short'] as NpcLook['build'][]),
    hair: pick(rng, Object.keys(HAIR)), extras, torso,
    arms: [sleeve, chrome ? 'chrome' : sleeve],
    tail: torso === 'coat' ? 3 : undefined,
    skirt: torso !== 'coat' && rng() < 0.18 ? 2 : undefined,
    carry: rng() < 0.15 ? 'umbrella' : rng() < 0.15 ? 'bag' : undefined,
    emblem: rng() < 0.4 ? [pick(rng, ['A.A', '.A.', 'AAA']), pick(rng, ['.A.', 'A.A'])] : undefined,
    pal: {
      H: Hh, F, K, Q, E: rng() < 0.15 ? 'c' : 'k', V: pick(rng, ['c', 'r', 'e', 'y', 'm']), A: pick(rng, ['y', 'c', 'm', 'w', 'e', 'r']),
      T, U, L, I: pick(rng, ['k', 'w', 'G', 'y', 'm']), N, O, B: pick(rng, ['w', 'r', 'y', 'c', 'm', 'v', 'S', 'g']),
      X: 'v', Z: 'g', R: 'r',
    },
  };
}

function toLook(n: NpcLook): Look {
  return {
    build: BUILDS[n.build], pal: n.pal, head: head(n.hair, n.extras), torso: n.torso, arms: n.arms,
    tail: n.tail, skirt: n.skirt, emblem: n.emblem, item: npcItem,
    decorate: c => {
      // Tattoo on a bare arm, pocket square / badge on jackets.
      if (n.torso === 'tank' && c.f === 'd') put(c.g, 'p', c.shoulders[0].x, c.shoulders[0].y + 2);
      if (n.torso === 'jacket' && c.f === 'd') put(c.g, 'A', c.torso.x + 1, c.torso.y + 2);
    },
  };
}

export function generateNpc(scene: Phaser.Scene, key: string, look: NpcLook) {
  buildSheet(scene, key, toLook(look), activityFrames(BUILDS[look.build], look.carry), NPC_ANIMS);
}

export const RESIDENTS = 24;

const pal = (o: Partial<Pal>): Pal => ({ H: 'k', F: 'G', K: 's', Q: 'S', E: 'k', V: 'c', A: 'y', T: 'g', U: 'G', L: 'v', I: 'k', N: 'G', O: 'k', B: 'k', X: 'v', Z: 'g', R: 'r', ...o });

/** Building residents plus the shopkeepers, all drawn once at boot. */
export function generateNpcArt(scene: Phaser.Scene) {
  const rng = createRng(2049);
  for (let i = 0; i < RESIDENTS; i++) generateNpc(scene, `res-${i}`, randomLook(rng));
  // Doc Kessler: bald, grey beard, red monocle implant, chrome arm, long white coat with a red cross.
  const doc: NpcLook = {
    build: 'normal', hair: 'bald', extras: ['beard', 'cybereye'], torso: 'labcoat', arms: ['cloth', 'chrome'], tail: 4,
    emblem: ['.r.', 'rrr', '.r.'],
    pal: pal({ H: 'v', F: 'g', K: 'h', Q: 's', T: 'w', U: 'v', L: 'w', A: 'r', I: 'C', N: 'g', O: 'G', B: 'k', R: 'r' }),
  };
  buildSheet(scene, 'npc-doc', { ...toLook(doc), decorate: c => { if (c.f === 'd') { put(c.g, 'r', c.torso.x + 1, c.torso.y + 2); put(c.g, 'c', c.torso.x + c.torso.w - 2, c.torso.y + 1); } } }, activityFrames(BUILDS.normal), NPC_ANIMS);
  // Nyx: hooded netrunner, green visor, neural cable down her back.
  const nyx: NpcLook = {
    build: 'slim', hair: 'hood', extras: ['visor'], torso: 'hoodie', arms: ['cloth', 'cloth'],
    pal: pal({ T: 'G', U: 'k', L: 'g', K: 'S', Q: 'd', V: 'e', A: 'e', I: 'e', N: 'k', O: 'G', B: 'e' }),
  };
  buildSheet(scene, 'npc-nyx', { ...toLook(nyx), decorate: c => {
    if (c.f === 'u') line(c.g, 'e', c.cx, c.torso.y, c.cx, c.torso.y + c.torso.h - 2);
    else if (c.f === 'd') { put(c.g, 'e', c.torso.x + 1, c.torso.y + 3); put(c.g, 'e', c.torso.x + c.torso.w - 2, c.torso.y + 2); }
  } }, activityFrames(BUILDS.slim), NPC_ANIMS);
  // Mamie Lo: small, white bun, red dress, white apron, ladle in hand.
  const lo: NpcLook = {
    build: 'short', hair: 'bun', extras: ['glasses'], torso: 'apron', arms: ['cloth', 'cloth'], skirt: 2,
    pal: pal({ H: 'w', F: 'v', K: 'h', Q: 's', T: 'r', U: 'M', L: 'm', A: 'y', V: 'w', N: 'G', O: 'k', B: 'k' }),
  };
  generateNpc(scene, 'npc-lo', lo);
  // Small props still carried as separate images.
  if (!scene.textures.exists('bowl')) {
    const t = scene.textures.createCanvas('bowl', 8, 5)!;
    const c = t.getContext();
    c.fillStyle = PALETTE.k; c.fillRect(0, 1, 8, 4); c.fillStyle = PALETTE.w; c.fillRect(1, 1, 6, 3); c.fillStyle = PALETTE.y; c.fillRect(2, 1, 4, 1);
    t.refresh();
  }
}
