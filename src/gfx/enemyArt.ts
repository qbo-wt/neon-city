import Phaser from 'phaser';
import type { EnemyId } from '../data/enemies';
import {
  BASE_ANIMS, BUILDS, baseFrames, blade, buildSheet, line, pose, put, rect, stamp,
  type AnimDef, type Build, type DrawCtx, type Facing, type FrameSet, type Hand, type Look, type Pal, type Pose,
} from './rig';
import { PALETTE } from './sprites';

/**
 * Enemy and boss art on the character rig. Every enemy has: idle, walk, windup (the tell you parry
 * on), strike (the follow-through), hurt (also used for the fall on death) and stun; heavy ones add
 * a charge pose; bosses have a windup and strike pose per move.
 */

/** Where the body sits in the frame: Enemy uses it for its origin, hitbox, shadow and stun stars. */
export interface EnemyRig { key: string; S: number; originRow: number; feetRow: number; headRow: number }

const H = (dx: number, dy: number): Hand => ({ dx, dy });
/** Hands given in front-view terms (index 1 = right hand, holding the item); mirrored when seen from the back. */
function hands(f: Facing, item: Hand, other: Hand): [Hand, Hand] {
  return f === 'u' ? [H(-item.dx, item.dy), H(-other.dx, other.dy)] : [other, item];
}
const hang = (b: Build) => H(0, b.armLen);
const P = (o: Partial<Pal>): Pal => ({
  H: 'k', F: 'G', K: 's', Q: 'S', E: 'k', V: 'c', A: 'y', T: 'g', U: 'G', L: 'v', I: 'k', N: 'g', O: 'G', B: 'w', X: 'v', Z: 'g', R: 'r', ...o,
});

/** Frames every enemy shares; `item` names what the hand does in the standard poses. */
function commonFrames(b: Build, extra: FrameSet, holdItem = 'hold'): FrameSet {
  const side = (f: Facing) => f === 's';
  return {
    ...baseFrames(b, holdItem),
    hurt: f => pose(b, f, {
      item: holdItem, head: side(f) ? H(-1, 0) : H(0, -1), lean: side(f) ? -1 : 0, bob: 0,
      hands: side(f) ? [H(-3, 1), H(-2, 0)] : [H(-1, -2), H(1, -2)],
      legs: [{ dx: 0, lift: 0 }, { dx: side(f) ? 2 : 0, lift: 1 }],
    }),
    stun: f => pose(b, f, {
      item: holdItem, head: H(0, 1), bob: 1,
      hands: side(f) ? [H(1, b.armLen + 1), H(1, b.armLen + 1)] : [H(-1, b.armLen + 1), H(1, b.armLen + 1)],
      legs: side(f) ? [{ dx: -1, lift: 0 }, { dx: 1, lift: 0 }] : [{ dx: 0, lift: 0 }, { dx: 0, lift: 0 }],
    }),
    ...extra,
  };
}

// ---- Runner: punk with a glowing machete ------------------------------------------------
const runnerLook: Look = {
  build: BUILDS.slim, torso: 'vest', arms: ['skin', 'skin'],
  pal: P({ H: 'm', F: 'M', E: 'y', V: 'r', A: 'm', T: 'M', U: 'P', L: 'm', I: 'k', N: 'g', O: 'G', B: 'w' }),
  head: {
    d: ['..HH..', '.QHHQ.', 'QKHHKQ', 'KKKKKK', 'KEKKEK', 'VVVVVV', '.VVVV.', '..KK..'],
    u: ['..HH..', '.QHHQ.', 'QKHHKQ', 'KQHHQK', 'KKFFKK', 'KKVVKK', '.KVVK.', '..KK..'],
    s: ['HHHH..', 'FHKKK.', 'QKKKKK', 'KKKKKK', 'KKKKEK', 'QKVVVV', '.KVVV.', '..KK..'],
  },
  decorate: c => {
    // Tattoos on the bare arms, spikes on the vest.
    if (c.f !== 's') { put(c.g, 'p', c.shoulders[0].x, c.shoulders[0].y + 2); put(c.g, 'p', c.shoulders[1].x + 1, c.shoulders[1].y + 1); }
    put(c.g, 'w', c.torso.x, c.torso.y); put(c.g, 'w', c.torso.x + c.torso.w - 1, c.torso.y);
    if (c.f === 'u') stamp(c.g, ['m.m', '.m.'], c.torso.x + 1, c.torso.y + 1);
  },
  item: c => {
    if (c.layer !== 'front') return;
    const h = c.hands[c.itemHand], g = c.g, it = c.p.item, out = c.f === 'u' ? -1 : 1;
    if (c.f === 's') {
      if (it === 'raise') blade(g, 'w', 'm', h.x - 1, h.y - 1, h.x - 4, h.y - 6);
      else if (it === 'slash') { blade(g, 'w', 'm', h.x + 2, h.y, h.x + 8, h.y - 1); line(g, 'm', h.x + 3, h.y - 3, h.x + 7, h.y - 4); }
      else blade(g, 'w', 'm', h.x + 2, h.y + 1, h.x + 5, h.y + 4);
    } else {
      const x = h.x + (out > 0 ? 1 : 0);
      if (it === 'raise') blade(g, 'w', 'm', x, h.y - 1, x + 2 * out, h.y - 6);
      else if (it === 'slash') {
        if (c.f === 'd') { blade(g, 'w', 'm', h.x - 1, h.y + 1, h.x - 6, h.y + 5); line(g, 'm', h.x - 8, h.y + 1, h.x - 4, h.y + 5); }
        else blade(g, 'w', 'm', x, h.y - 1, x - 4 * out, h.y - 6);
      } else blade(g, 'w', 'm', x, h.y + 1, x, h.y + 5);
    }
  },
};
function runnerFrames(): FrameSet {
  const b = runnerLook.build;
  return commonFrames(b, {
    windup: f => pose(b, f, {
      item: 'raise', bob: 1, legs: f === 's' ? [{ dx: -2, lift: 0 }, { dx: 2, lift: 0 }] : [{ dx: 0, lift: 0 }, { dx: 0, lift: 0 }],
      hands: f === 's' ? [H(1, b.armLen), H(-2, -3)] : hands(f, H(1, -3), hang(b)),
    }),
    strike: f => pose(b, f, {
      item: 'slash', lean: 1, legs: f === 's' ? [{ dx: -3, lift: 0 }, { dx: 3, lift: 0 }] : [{ dx: 0, lift: 0 }, { dx: 0, lift: 1 }],
      hands: f === 's' ? [H(-2, b.armLen), H(4, 1)] : f === 'd' ? hands(f, H(-2, b.armLen + 2), H(-1, b.armLen)) : hands(f, H(-1, -4), hang(b)),
    }),
  });
}

// ---- Gunner: gang shooter in a hoodie, pistol, ammo bandolier ----------------------------
const pistol = (c: DrawCtx) => {
  if (c.layer !== 'front') return;
  const h = c.hands[c.itemHand], g = c.g, it = c.p.item ?? 'hold';
  if (c.f === 's') {
    if (it === 'hold') { rect(g, 'g', h.x + 2, h.y, 2, 1); put(g, 'G', h.x + 2, h.y + 1); return; }
    rect(g, 'g', h.x + 2, h.y - 1, 4, 1); put(g, 'v', h.x + 3, h.y - 1); put(g, 'G', h.x + 2, h.y);
    if (it === 'flash') { rect(g, 'y', h.x + 6, h.y - 2, 2, 3); put(g, 'w', h.x + 6, h.y - 1); put(g, 'y', h.x + 8, h.y - 1); }
  } else if (c.f === 'd') {
    if (it === 'hold') { rect(g, 'g', h.x, h.y + 1, 1, 2); put(g, 'v', h.x, h.y + 1); return; }
    rect(g, 'g', h.x, h.y + 1, 2, 2); put(g, 'k', h.x, h.y + 3);
    if (it === 'flash') { rect(g, 'y', h.x - 1, h.y + 3, 4, 2); put(g, 'w', h.x, h.y + 3); put(g, 'w', h.x + 1, h.y + 4); }
  } else {
    if (it === 'hold') { rect(g, 'g', h.x + 1, h.y + 1, 1, 2); return; }
    rect(g, 'g', h.x, h.y - 2, 2, 2);
    if (it === 'flash') { rect(g, 'y', h.x - 1, h.y - 4, 4, 2); put(g, 'w', h.x, h.y - 4); }
  }
};
const gunnerLook: Look = {
  build: BUILDS.normal, torso: 'hoodie', arms: ['cloth', 'cloth'],
  pal: P({ T: 'p', U: 'P', L: 'm', A: 'Y', E: 'm', N: 'G', O: 'k', B: 'w', I: 'G' }),
  head: {
    d: ['.PPPP.', 'PPPPPP', 'PpPPPP', 'mwmmmm', 'KKKKKK', 'QKKKKQ', '.KQQK.', '..KK..'],
    u: ['.PPPP.', 'PPPPPP', 'PPpPPP', 'mPPPPm', 'UUUUUU', 'UTTTTU', '.UTTU.', '..UU..'],
    s: ['.PPPP.', 'PPPPPPP', 'PPPPPP', 'UUmmmm', 'UUKKKK', 'UUKKKQ', '.UKKQ.', '..KK..'],
  },
  decorate: c => {
    const { x, y, w, h } = c.torso;
    // Ammo bandolier across the chest (over the other shoulder from the back).
    if (c.f === 'd') for (let i = 0; i < h - 2; i++) put(c.g, i % 2 ? 'y' : 'Y', x + 1 + Math.round(i * (w - 3) / (h - 3)), y + i);
    else if (c.f === 'u') for (let i = 0; i < h - 2; i++) put(c.g, 'Y', x + w - 2 - Math.round(i * (w - 3) / (h - 3)), y + i);
    else { put(c.g, 'Y', x + 2, y); put(c.g, 'y', x + 3, y + 1); put(c.g, 'Y', x + 4, y + 2); }
  },
  item: pistol,
};
function gunnerFrames(): FrameSet {
  const b = gunnerLook.build;
  const aim = (item: string) => (f: Facing) => pose(b, f, {
    item, legs: f === 's' ? [{ dx: -2, lift: 0 }, { dx: 2, lift: 0 }] : [{ dx: 0, lift: 0 }, { dx: 0, lift: 0 }],
    lean: item === 'flash' ? -1 : 0, head: item === 'flash' && f !== 's' ? H(0, -1) : undefined,
    hands: f === 's' ? [H(3, 1), H(4, 0)] : f === 'd' ? hands(f, H(-2, b.armLen + 1), H(3, b.armLen)) : hands(f, H(-1, -3), H(2, 0)),
  });
  return commonFrames(b, { windup: aim('aim'), strike: aim('flash') });
}

// ---- Hacker: hooded netrunner, cyberdeck on the forearm, casts quickhacks ---------------
const hackerLook: Look = {
  build: BUILDS.normal, torso: 'coat', tail: 3, arms: ['cloth', 'cloth'],
  pal: P({ H: 'G', F: 'k', T: 'g', U: 'G', L: 'g', A: 'e', I: 'k', N: 'G', O: 'k', B: 'e', V: 'e', K: 'S', Q: 'd' }),
  head: {
    d: ['.HHHH.', 'HHHHHH', 'HFKKFH', 'HVVVVH', 'HKKKKH', 'HQKKQH', '.FKKF.', '..FF..'],
    u: ['.HHHH.', 'HHHHHH', 'HHFFHH', 'HHFFHH', 'HHeHHH', 'HHHHHH', '.HHHH.', '..HH..'],
    s: ['.HHHH.', 'HHHHHH', 'HHHFKK', 'HHHVVVV', 'HHHKKK', 'HHHKKQ', '.HHKK.', '..HH..'],
  },
  emblem: ['e.e', '.e.', 'e.e'],
  decorate: c => {
    const { x, y, w } = c.torso;
    if (c.f === 'd') { put(c.g, 'e', x + 1, y + 2); put(c.g, 'e', x + 1, y + 3); put(c.g, 'e', x + w - 2, y + 3); }
    if (c.f === 's') { put(c.g, 'e', x + 1, y + 2); put(c.g, 'e', x + 2, y + 2); }
  },
  item: c => {
    if (c.layer !== 'front') return;
    const g = c.g, it = c.p.item;
    // Cyberdeck strapped on the off-hand forearm.
    const o = c.hands[1 - c.itemHand];
    if (c.f !== 's') { rect(g, 'k', o.x, o.y - 2, 2, 2); put(g, 'e', o.x + (c.f === 'u' ? 1 : 0), o.y - 2); }
    else { rect(g, 'k', o.x - 1, o.y - 2, 2, 2); put(g, 'e', o.x, o.y - 2); }
    if (it !== 'cast' && it !== 'flash') return;
    // Quickhack glyph forming in front of the casting hand.
    const h = c.hands[c.itemHand];
    const [gx, gy] = c.f === 's' ? [h.x + 4, h.y] : c.f === 'd' ? [h.x, h.y + 4] : [h.x, h.y - 4];
    const ring = it === 'flash' ? 2 : 1;
    for (const [dx, dy] of [[0, -ring], [ring, 0], [0, ring], [-ring, 0]]) put(g, 'e', gx + dx, gy + dy);
    if (it === 'flash') { put(g, 'w', gx, gy); for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) put(g, 'e', gx + dx, gy + dy); }
    else put(g, 'w', gx, gy);
  },
};
function hackerFrames(): FrameSet {
  const b = hackerLook.build;
  const cast = (item: string) => (f: Facing) => pose(b, f, {
    item, bob: 1, tail: 1, head: item === 'flash' ? H(0, -1) : undefined,
    hands: f === 's' ? [H(1, b.armLen - 1), H(4, -1)] : f === 'd' ? hands(f, H(-1, b.armLen + 2), H(1, b.armLen - 1)) : hands(f, H(0, -4), H(1, b.armLen - 1)),
  });
  return commonFrames(b, { windup: cast('cast'), strike: cast('flash') });
}

// ---- Bomber: gas mask, chemical vials, a blinking bomb ---------------------------------
function bomb(g: DrawCtx['g'], x: number, y: number, lit: boolean) {
  rect(g, 'g', x, y, 3, 3); put(g, 'v', x, y); rect(g, 'r', x, y + 2, 3, 1); put(g, lit ? 'y' : 'r', x + 1, y + 1);
  put(g, 'Y', x + 2, y - 1); put(g, lit ? 'w' : 'y', x + 3, y - 2);
}
const bomberLook: Look = {
  build: BUILDS.slim, torso: 'jacket', arms: ['cloth', 'cloth'],
  pal: P({ T: 'y', U: 'Y', L: 'w', A: 'r', I: 'Y', N: 'g', O: 'G', B: 'r', E: 'e' }),
  head: {
    d: ['.YYYY.', 'YyyyyY', 'YggggY', 'gEggEg', 'gggggg', '.gwwg.', '..ww..', '..YY..'],
    u: ['.YYYY.', 'YYyyYY', 'YYYYYY', 'gYYYYg', 'YggggY', '.YYYY.', '..YY..', '..YY..'],
    s: ['.YYYY.', 'YYYyyY', 'YYYggg', 'YYgEgg', 'YYgggg', '.YYgww', '..Yww.', '..YY..'],
  },
  decorate: c => {
    const { x, y, w, h } = c.torso;
    if (c.f === 'd') {
      // Two chemical vials on the chest and a strap.
      for (const vx of [x + 1, x + w - 2]) { put(c.g, 'w', vx, y); rect(c.g, 'e', vx, y + 1, 1, 2); }
      line(c.g, 'r', x + 1, y + h - 3, x + w - 2, y + 3);
    } else if (c.f === 'u') {
      // Pressurised tank on the back.
      rect(c.g, 'e', x + 2, y + 1, w - 4, 3); rect(c.g, 'w', x + 2, y, w - 4, 1); rect(c.g, 'k', x + 2, y + 2, w - 4, 1);
    } else {
      rect(c.g, 'e', x - 1, y + 1, 2, 3); put(c.g, 'w', x - 1, y); put(c.g, 'e', x + w - 1, y + 1);
    }
  },
  item: c => {
    if (c.layer !== 'front') return;
    const lit = c.p.item === 'raise';
    if (lit) {
      const [a, b2] = c.hands;
      bomb(c.g, Math.round((a.x + b2.x) / 2) - 1 + (c.f === 's' ? 1 : 0), Math.min(a.y, b2.y) - 1, true);
    } else {
      const h = c.hands[c.itemHand];
      bomb(c.g, c.f === 's' ? h.x + 1 : h.x - (c.f === 'u' ? 1 : 0), h.y + 1, false);
    }
  },
};
function bomberFrames(): FrameSet {
  const b = bomberLook.build;
  // Both hands over the head, holding the bomb up.
  const up = (f: Facing): [Hand, Hand] => f === 's'
    ? [H(1, -(b.headH - 1)), H(2, -(b.headH - 1))]
    : [H(b.torsoW / 2 + b.armW - 2, -(b.headH - 1)), H(-b.torsoW / 2 + 1, -(b.headH - 1))];
  return commonFrames(b, {
    windup: f => pose(b, f, { item: 'raise', hands: up(f), bob: 0, legs: [{ dx: 0, lift: 0 }, { dx: 0, lift: 1 }] }),
    strike: f => pose(b, f, { item: 'raise', hands: up(f), bob: 1 }),
  });
}

// ---- Brute: chrome-armed colossus ------------------------------------------------------
const bruteLook: Look = {
  build: BUILDS.heavy, torso: 'vest', arms: ['heavy', 'heavy'],
  pal: P({ T: 'M', U: 'P', L: 'm', A: 'y', I: 'k', N: 'g', O: 'G', B: 'v', X: 'v', Z: 'g', V: 'r', K: 's', Q: 'S' }),
  head: {
    d: ['.XXXX.', 'XZXXZX', 'KVVVVK', 'KKKKKK', 'ZZZZZZ', '.ZwwZ.', '.KKKK.'],
    u: ['.XXXX.', 'XXZZXX', 'KZZZZK', 'KKKKKK', 'KQQQQK', '.KKKK.', '.KKKK.'],
    s: ['.XXXX.', 'XXXXZX', 'KKKVVV', 'KKKKKK', 'QKZZZZ', '.KZww.', '.KKK..'],
  },
  decorate: c => {
    const g = c.g, { x, y, w, h } = c.torso;
    if (c.f !== 's') {
      // Chrome pauldrons with a red rivet.
      for (const s of c.shoulders) { rect(g, 'X', s.x - 1, s.y - 1, c.b.armW + 2, 2); put(g, 'w', s.x - 1, s.y - 1); put(g, 'V', s.x + 1, s.y); }
      if (c.f === 'd') { stamp(g, ['y.y', 'yyy', '.y.'], x + w / 2 - 1, y + 2); }
      else for (let r = y + 1; r < y + h - 2; r += 2) rect(g, 'X', x + w / 2 - 1, r, 2, 1);
    } else {
      rect(g, 'X', c.shoulders[1].x - 1, c.shoulders[1].y - 2, 6, 2); put(g, 'w', c.shoulders[1].x - 1, c.shoulders[1].y - 2);
      for (let r = y + 1; r < y + h - 2; r += 2) put(g, 'X', x, r);
    }
  },
};
function bruteFrames(): FrameSet {
  const b = bruteLook.build, L = b.armLen;
  const side = (f: Facing) => f === 's';
  return commonFrames(b, {
    windup: f => pose(b, f, {
      bob: 2, lean: side(f) ? -1 : 0,
      hands: side(f) ? [H(-3, L - 2), H(-3, L - 1)] : [H(3, L - 2), H(-3, L - 2)],
      legs: side(f) ? [{ dx: -3, lift: 0 }, { dx: 3, lift: 0 }] : [{ dx: -1, lift: 0 }, { dx: 1, lift: 0 }],
    }),
    charge: f => pose(b, f, {
      bob: 1, lean: side(f) ? 2 : 0, head: side(f) ? H(1, 1) : H(0, 1), tail: 2,
      hands: side(f) ? [H(4, 2), H(5, 1)] : f === 'd' ? [H(2, L + 1), H(-2, L + 1)] : [H(1, 1), H(-1, 1)],
      legs: side(f) ? [{ dx: -4, lift: 1 }, { dx: 3, lift: 0 }] : [{ dx: 0, lift: 1 }, { dx: 0, lift: 0 }],
    }),
    strike: f => pose(b, f, {
      bob: 1, hands: side(f) ? [H(3, L), H(4, L - 1)] : [H(-2, L), H(2, L)],
      legs: side(f) ? [{ dx: -2, lift: 0 }, { dx: 3, lift: 0 }] : [{ dx: 0, lift: 0 }, { dx: 0, lift: 0 }],
    }),
  }, '');
}

// ---- Bosses: one windup and one strike pose per move -----------------------------------
type BossKit = { aim: string; flash: string };
function bossFrames(b: Build, kit: BossKit): FrameSet {
  const L = b.armLen, side = (f: Facing) => f === 's';
  const overhead = (f: Facing): [Hand, Hand] => side(f)
    ? [H(1, -(b.headH + 1)), H(2, -(b.headH + 2))]
    : [H(b.torsoW / 2 + b.armW - 2, -(b.headH + 1)), H(-b.torsoW / 2 + 1, -(b.headH + 1))];
  const spread = (f: Facing): [Hand, Hand] => side(f) ? [H(-5, 1), H(5, 1)] : [H(-5, 1), H(5, 1)];
  const aim = (item: string) => (f: Facing) => pose(b, f, {
    item, legs: side(f) ? [{ dx: -3, lift: 0 }, { dx: 3, lift: 0 }] : [{ dx: -1, lift: 0 }, { dx: 1, lift: 0 }],
    lean: item === kit.flash && side(f) ? -1 : 0,
    hands: side(f) ? [H(5, 0), H(4, 1)] : f === 'd' ? hands(f, H(-3, L + 1), H(4, L)) : hands(f, H(-1, -5), H(2, 0)),
  });
  return commonFrames(b, {
    'windup-charge': f => pose(b, f, {
      bob: 2, lean: side(f) ? -1 : 0, item: 'back',
      hands: side(f) ? [H(-3, L - 2), H(-4, L - 3)] : hands(f, H(3, L - 3), H(-1, L - 1)),
      legs: side(f) ? [{ dx: -4, lift: 0 }, { dx: 3, lift: 0 }] : [{ dx: -1, lift: 0 }, { dx: 1, lift: 0 }],
    }),
    charge: f => pose(b, f, {
      bob: 1, lean: side(f) ? 2 : 0, head: H(side(f) ? 1 : 0, 1), tail: 3, item: 'thrust',
      hands: side(f) ? [H(4, 2), H(6, 0)] : f === 'd' ? hands(f, H(-2, L + 2), H(2, L)) : hands(f, H(0, -4), H(1, 1)),
      legs: side(f) ? [{ dx: -5, lift: 1 }, { dx: 4, lift: 0 }] : [{ dx: 0, lift: 2 }, { dx: 0, lift: 0 }],
    }),
    'windup-fan': aim(kit.aim), 'strike-fan': aim(kit.flash),
    'windup-barrage': aim(kit.aim), 'strike-barrage': aim(kit.flash),
    'windup-quake': f => pose(b, f, { item: 'overhead', hands: overhead(f), head: H(0, -1), legs: [{ dx: 0, lift: 0 }, { dx: 0, lift: 2 }] }),
    'strike-quake': f => pose(b, f, {
      item: 'slam', bob: 3, head: H(side(f) ? 1 : 0, 1), lean: side(f) ? 2 : 0,
      hands: side(f) ? [H(4, L + 2), H(5, L + 2)] : [H(3, L + 3), H(-3, L + 3)],
      legs: side(f) ? [{ dx: -3, lift: 0 }, { dx: 3, lift: 0 }] : [{ dx: -1, lift: 0 }, { dx: 1, lift: 0 }],
    }),
    'windup-nova': f => pose(b, f, { item: 'none', fx: 'glow', hands: spread(f), head: H(0, -1) }),
    'strike-nova': f => pose(b, f, { item: 'none', fx: 'flash', hands: spread(f), bob: 1 }),
    strike: f => pose(b, f, { item: 'hold', bob: 1, hands: side(f) ? [H(3, L), H(4, L - 1)] : [H(-2, L), H(2, L)] }),
  });
}

/** Lieutenant of the Rats: plated riot armour, rat-eared helmet, heavy rifle, shock coil. */
const wardenLook: Look = {
  build: BUILDS.big, torso: 'armor', arms: ['heavyCloth', 'heavyCloth'],
  pal: P({ T: 'P', U: 'G', L: 'p', A: 'c', I: 'k', N: 'g', O: 'G', B: 'v', X: 'v', Z: 'g', V: 'c', R: 'm' }),
  head: {
    d: ['.p....p.', '.pp..pp.', '.pppppp.', 'pppppppp', 'pPPPPPPp', 'pccccccp', 'pPPPPPPp', '.pPggPp.', '..PPPP..'],
    u: ['.p....p.', '.pp..pp.', '.pppppp.', 'pppppppp', 'pppPPppp', 'cpppppPc', 'pPPPPPPp', '.pPPPPp.', '..PPPP..'],
    s: ['.....p..', '....pp..', '.pppppp.', 'pppppppp', 'ppppPPPP', 'ppppccccc', 'ppppPPPP', '.pppPgg.', '..PPPP..'],
  },
  emblem: ['c.c', 'ccc', '.c.'],
  decorate: c => {
    const g = c.g, { x, y, w } = c.torso, glow = c.p.fx;
    const core = glow === 'flash' ? 'w' : glow === 'glow' ? 'c' : 'C';
    if (c.f === 'd') { rect(g, core, x + w / 2 - 2, y + 2, 4, 3); put(g, glow ? 'w' : 'c', x + w / 2 - 1, y + 3); put(g, glow ? 'w' : 'c', x + w / 2, y + 3); }
    if (c.f === 's') rect(g, core, x + c.torso.w - 2, y + 2, 2, 3);
    if (c.f !== 's') for (const s of c.shoulders) { rect(g, 'p', s.x - 1, s.y - 1, c.b.armW + 2, 3); rect(g, 'c', s.x - 1, s.y + 1, c.b.armW + 2, 1); put(g, 'L', s.x, s.y - 1); }
    else { rect(g, 'p', c.shoulders[1].x - 1, c.shoulders[1].y - 2, 6, 3); rect(g, 'c', c.shoulders[1].x - 1, c.shoulders[1].y, 6, 1); }
    if (glow === 'flash') for (const [dx, dy] of [[-3, -2], [w + 2, -2], [-3, 6], [w + 2, 6]]) put(g, 'c', x + dx, y + dy);
  },
  item: c => {
    if (c.layer !== 'front') return;
    const h = c.hands[c.itemHand], g = c.g, it = c.p.item ?? 'hold';
    if (it === 'none' || it === 'overhead' || it === 'slam') return;
    if (c.f === 's') {
      if (it === 'aim' || it === 'flash') {
        rect(g, 'g', h.x - 2, h.y - 1, 11, 2); rect(g, 'Z', h.x - 2, h.y, 11, 1); put(g, 'c', h.x + 3, h.y - 1); rect(g, 'k', h.x + 9, h.y - 1, 1, 2);
        if (it === 'flash') { rect(g, 'y', h.x + 10, h.y - 2, 3, 4); put(g, 'w', h.x + 10, h.y - 1); put(g, 'w', h.x + 10, h.y); put(g, 'y', h.x + 13, h.y - 1); }
      } else { line(g, 'g', h.x - 3, h.y - 5, h.x + 4, h.y + 2); line(g, 'Z', h.x - 2, h.y - 5, h.x + 5, h.y + 2); }
    } else if (it === 'aim' || it === 'flash') {
      const up = c.f === 'u';
      rect(g, 'g', h.x - 1, up ? h.y - 5 : h.y + 1, 3, 5); put(g, 'c', h.x, up ? h.y - 2 : h.y + 2); rect(g, 'k', h.x - 1, up ? h.y - 5 : h.y + 5, 3, 1);
      if (it === 'flash') { rect(g, 'y', h.x - 2, up ? h.y - 8 : h.y + 6, 5, 3); put(g, 'w', h.x, up ? h.y - 7 : h.y + 7); }
    } else {
      // Rifle carried across the body.
      const dir = c.f === 'u' ? 1 : -1;
      line(g, 'g', h.x, h.y + 1, h.x + 8 * dir, h.y - 6); line(g, 'Z', h.x + 1, h.y + 1, h.x + 8 * dir + 1, h.y - 6);
    }
  },
};

/** Psy-Sec Executioner: red long coat over black plate, horned helmet, psy halo and core, giant blade. */
const bossLook: Look = {
  build: BUILDS.giant, torso: 'armor', tail: 5, arms: ['heavyCloth', 'heavyCloth'],
  pal: P({ T: 'r', U: 'M', L: 'm', A: 'y', I: 'm', N: 'G', O: 'k', B: 'g', X: 'g', Z: 'G', V: 'm', R: 'y' }),
  head: {
    d: ['y......y', '.y....y.', '.yGGGGy.', 'GGGGGGGG', 'GgGGGGgG', 'GrrrrrrG', 'GGGrrGGG', '.GGGGGG.', '..GyyG..', '..GGGG..'],
    u: ['y......y', '.y....y.', '.yGGGGy.', 'GGGGGGGG', 'GGGggGGG', 'GGGGGGGG', 'rGGGGGGr', '.GGGGGG.', '..GGGG..', '..GGGG..'],
    s: ['......y.', '.....y..', '.GGGGy..', 'GGGGGGGG', 'GGGGGgGG', 'GGGGrrrrr', 'GGGGGrrr', '.GGGGGG.', '..GGGyy.', '..GGGG..'],
  },
  decorate: c => {
    const g = c.g, { x, y, w, h } = c.torso, fx = c.p.fx;
    const core = fx === 'flash' ? 'w' : 'm';
    if (c.f !== 's') {
      // Black chest plate with gold trim over the coat, psy core in the middle.
      rect(g, 'G', x + 3, y + 1, w - 6, h - 3); rect(g, 'y', x + 3, y + 1, w - 6, 1);
      if (c.f === 'd') { rect(g, core, x + w / 2 - 2, y + 3, 4, 3); put(g, fx ? 'w' : 'p', x + w / 2 - 1, y + 4); put(g, fx ? 'w' : 'p', x + w / 2, y + 4); }
      else stamp(g, ['y.y', '.y.', 'y.y'], x + w / 2 - 1, y + 3);
      for (const s of c.shoulders) { rect(g, 'G', s.x - 1, s.y - 1, c.b.armW + 2, 3); put(g, 'y', s.x - 1, s.y - 2); put(g, 'y', s.x + c.b.armW, s.y - 2); rect(g, 'y', s.x - 1, s.y + 1, c.b.armW + 2, 1); }
    } else {
      rect(g, 'G', x + 2, y + 1, w - 3, h - 3); rect(g, core, x + w - 3, y + 3, 2, 3);
      rect(g, 'G', c.shoulders[1].x - 1, c.shoulders[1].y - 2, 6, 3); put(g, 'y', c.shoulders[1].x - 1, c.shoulders[1].y - 3); rect(g, 'y', c.shoulders[1].x - 1, c.shoulders[1].y, 6, 1);
    }
    // Psy halo floating over the helmet; it flares when the boss charges a nova.
    const hx = c.cx + (c.f === 's' ? c.p.lean : 0), hy = c.headTop + c.p.bob - 5, r = fx ? 5 : 4, col = fx === 'flash' ? 'w' : 'm';
    rect(g, col, hx - r + 2, hy, 2 * r - 4, 1); rect(g, fx ? col : 'p', hx - r + 2, hy + 2, 2 * r - 4, 1);
    for (const x of [hx - r, hx - r + 1, hx + r - 2, hx + r - 1]) put(g, col, x, hy + 1);
    if (fx) for (const [dx, dy] of [[-7, 4], [7, 4], [-6, 10], [6, 10]]) put(g, 'm', c.cx + dx, c.top + dy);
  },
  item: c => {
    if (c.layer !== 'front') return;
    const h = c.hands[c.itemHand], g = c.g, it = c.p.item ?? 'hold';
    // Psy palm on the off hand when blasting (fan / barrage).
    if (it === 'aim' || it === 'flash') {
      const o = c.hands[1 - c.itemHand];
      const [px, py] = c.f === 's' ? [o.x + 4, o.y] : c.f === 'd' ? [o.x, o.y + 4] : [o.x, o.y - 4];
      rect(g, 'm', px - 1, py - 1, 3, 3); put(g, 'w', px, py);
      if (it === 'flash') for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) put(g, 'p', px + dx, py + dy);
    }
    if (it === 'none') return;
    // The executioner's blade: long, gold-hilted, magenta edge.
    const sw = (x0: number, y0: number, x1: number, y1: number) => { blade(g, 'w', 'm', x0, y0, x1, y1); put(g, 'y', x0, y0); };
    if (c.f === 's') {
      if (it === 'back') sw(h.x - 1, h.y, h.x - 10, h.y - 6);
      else if (it === 'thrust') sw(h.x + 2, h.y, h.x + 14, h.y);
      else if (it === 'overhead') sw(h.x, h.y - 1, h.x - 6, h.y - 10);
      else if (it === 'slam') sw(h.x + 2, h.y + 1, h.x + 12, h.y + 3);
      else sw(h.x + 1, h.y + 2, h.x + 6, h.y + 11);
    } else {
      const out = c.f === 'u' ? -1 : 1, x = h.x + (out > 0 ? 1 : 0);
      if (it === 'back') sw(x, h.y, x + 6 * out, h.y - 10);
      else if (it === 'thrust') sw(x, h.y + 1, x - 2 * out, h.y + 13);
      else if (it === 'overhead') sw(Math.round((c.hands[0].x + c.hands[1].x) / 2), h.y - 1, Math.round((c.hands[0].x + c.hands[1].x) / 2), h.y - 12);
      else if (it === 'slam') sw(x - 2 * out, h.y + 2, x - 2 * out, h.y + 13);
      else sw(x + out, h.y + 1, x + out, h.y + 12);
    }
  },
};

// ---- Drone: hovering quadcopter with a scanning eye -------------------------------------
function drawDrone(f: Facing, frame: string): string[][] {
  const S = 24, g: string[][] = Array.from({ length: S }, () => Array(S).fill('.'));
  const i = Number(frame.replace(/\D/g, '')) || 0;
  const bob = frame.startsWith('hover') ? [0, 0, 1, 1][i] : frame === 'stun' ? 2 : 0;
  const y = 7 + bob, cx = 12;
  const rotor = (x: number, spin: number) => {
    const w = [7, 3, 7, 1][spin % 4];
    rect(g, spin % 2 ? 'g' : 'v', x - Math.floor(w / 2), y - 2, w, 1);
    put(g, 'G', x, y - 1);
  };
  const spin = frame.startsWith('hover') ? i : frame === 'windup' ? 1 : frame === 'stun' ? 0 : 2;
  if (f === 's') {
    rect(g, 'G', cx - 4, y, 9, 5); rect(g, 'g', cx - 4, y, 9, 1); rect(g, 'k', cx - 4, y + 4, 9, 1);
    rotor(cx - 3, spin); rotor(cx + 3, spin + 1);
    const eye = frame === 'windup' || frame === 'fire' ? 'w' : 'r';
    rect(g, 'r', cx + 3, y + 1, 2, 2); put(g, eye, cx + 4, y + 1);
    rect(g, 'g', cx + 1, y + 5, 5, 1); put(g, 'k', cx + 6, y + 5);
    if (frame === 'fire') { rect(g, 'y', cx + 7, y + 4, 2, 3); put(g, 'w', cx + 7, y + 5); }
    put(g, 'c', cx - 3, y - 3 - (i % 2));
    rect(g, 'k', cx - 3, y + 5, 1, 2); rect(g, 'k', cx + 2, y + 5, 1, 2);
  } else {
    rect(g, 'G', cx - 5, y, 10, 5); rect(g, 'g', cx - 5, y, 10, 1); rect(g, 'k', cx - 5, y + 4, 10, 1);
    // Arms out to four rotors (two visible rows).
    rect(g, 'g', cx - 9, y + 1, 4, 1); rect(g, 'g', cx + 5, y + 1, 4, 1);
    rotor(cx - 8, spin); rotor(cx + 7, spin + 1);
    if (f === 'd') {
      const scan = frame.startsWith('hover') ? [-1, 0, 1, 0][i] : 0;
      const hot = frame === 'windup' || frame === 'fire';
      rect(g, 'k', cx - 3, y + 1, 6, 3); rect(g, 'r', cx - 2 + scan, y + 2, 3, 1); put(g, hot ? 'w' : 'y', cx - 1 + scan, y + 2);
      if (hot) { put(g, 'r', cx - 3 + scan, y + 2); put(g, 'r', cx + 1 + scan, y + 2); }
      rect(g, 'g', cx - 1, y + 5, 2, 2);
      if (frame === 'fire') { rect(g, 'y', cx - 2, y + 7, 4, 2); put(g, 'w', cx - 1, y + 7); }
    } else {
      put(g, 'c', cx - 3, y + 2); put(g, 'c', cx + 2, y + 2); rect(g, 'g', cx - 1, y + 1, 2, 2);
    }
    put(g, i % 2 ? 'c' : 'C', cx, y - 1); put(g, 'g', cx, y - 2);
    rect(g, 'k', cx - 4, y + 5, 1, 1); rect(g, 'k', cx + 3, y + 5, 1, 1);
  }
  if (frame === 'stun' || frame === 'hurt') { put(g, 'y', cx + 4, y - 3); put(g, 'w', cx - 5, y + 6); }
  return g;
}

function buildDrone(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const names = ['hover0', 'hover1', 'hover2', 'hover3', 'windup', 'fire', 'hurt', 'stun'], S = 24;
  const tex = scene.textures.createCanvas(key, names.length * S, 3 * S)!;
  const ctx = tex.getContext();
  (['d', 'u', 's'] as Facing[]).forEach((f, row) => names.forEach((n, col) => {
    const g = drawDrone(f, n);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const ch = g[y][x];
      const filled = ch !== '.', near = !filled && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx] && g[y + dy][x + dx] !== '.');
      const hex = filled ? PALETTE[ch] : near ? PALETTE.k : undefined;
      if (hex) { ctx.fillStyle = hex; ctx.fillRect(col * S + x, row * S + y, 1, 1); }
    }
    tex.add(`${f}-${n}`, 0, col * S, row * S, S, S);
    // The rig names its standard frames idle/walk/windup/strike: alias them for the drone.
    if (n.startsWith('hover')) { tex.add(`${f}-idle${n.slice(5)}`, 0, col * S, row * S, S, S); tex.add(`${f}-walk${n.slice(5)}`, 0, col * S, row * S, S, S); }
    if (n === 'fire') tex.add(`${f}-strike`, 0, col * S, row * S, S, S);
  }));
  tex.refresh();
  for (const f of ['d', 'u', 's']) for (const a of ['idle', 'walk']) {
    const k = `${key}-${a}-${f}`;
    if (!scene.anims.exists(k)) scene.anims.create({ key: k, frames: [0, 1, 2, 3].map(i => ({ key, frame: `${f}-hover${i}` })), frameRate: a === 'walk' ? 16 : 12, repeat: -1 });
  }
}

// ---- Registry ---------------------------------------------------------------------------
const LOOKS: Partial<Record<EnemyId, [Look, () => FrameSet, number]>> = {
  runner: [runnerLook, runnerFrames, 12],
  gunner: [gunnerLook, gunnerFrames, 10],
  hacker: [hackerLook, hackerFrames, 9],
  bomber: [bomberLook, bomberFrames, 13],
  brute: [bruteLook, bruteFrames, 8],
  warden: [wardenLook, () => bossFrames(BUILDS.big, { aim: 'aim', flash: 'flash' }), 8],
  boss: [bossLook, () => bossFrames(BUILDS.giant, { aim: 'aim', flash: 'flash' }), 7],
};

export const ENEMY_RIGS = {} as Record<EnemyId, EnemyRig>;

export function generateEnemyArt(scene: Phaser.Scene) {
  for (const [id, [look, frames, walkRate]] of Object.entries(LOOKS) as [EnemyId, [Look, () => FrameSet, number]][]) {
    const anims: Record<string, AnimDef> = { ...BASE_ANIMS, walk: { ...BASE_ANIMS.walk, rate: walkRate } };
    buildSheet(scene, `en-${id}`, look, frames(), anims);
    const b = look.build, feet = b.S - 3;
    ENEMY_RIGS[id] = { key: `en-${id}`, S: b.S, feetRow: feet, headRow: feet - b.legLen - b.torsoH - b.headH, originRow: feet - b.legLen - Math.round(b.torsoH / 2) };
  }
  buildDrone(scene, 'en-drone');
  ENEMY_RIGS.drone = { key: 'en-drone', S: 24, feetRow: 15, headRow: 5, originRow: 10 };
}

export type { Pose };
