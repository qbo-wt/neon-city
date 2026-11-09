import type { SpellDef } from '../tactics/types';

type S = Omit<SpellDef, 'los' | 'line' | 'rangeMod' | 'cooldown' | 'perTurn' | 'zone' | 'color'> & Partial<SpellDef>;

/** Defaults: sight needed, any direction, range bonus applies, no cooldown, no per-turn cap, single cell. */
const sp = (s: S): SpellDef => ({
  los: true, line: false, rangeMod: false, cooldown: 0, perTurn: 0, zone: { shape: 'cell' }, color: 0x00f0ff, ...s,
});

/**
 * Every spell in the game. Weapons give four (their "class"), some implants and relics add one,
 * enemies have their own. Ids are stable: aspects and the save refer to them.
 */
export const SPELLS: Record<string, SpellDef> = Object.fromEntries([
  // ===== Lame-mono: balanced melee with a dash =====
  sp({ id: 'cut', name: 'Entaille', icon: 'EN', desc: 'Coup de lame au contact.', pa: 3, range: [1, 1], target: 'enemy', perTurn: 2,
    effects: [{ k: 'dmg', min: 11, max: 14 }], tag: 'melee', fx: 'slash' }),
  sp({ id: 'windcut', name: 'Tranche-vent', icon: 'TV', desc: 'Fonce en ligne droite sur une case libre : chaque ennemi au bord de ta trajectoire est tranché. Ignore le tacle.',
    pa: 3, range: [2, 4], line: true, target: 'empty', cooldown: 2, effects: [{ k: 'dash', min: 9, max: 12 }], tag: 'move', fx: 'slash' }),
  sp({ id: 'thrust', name: 'Estoc', icon: 'ES', desc: 'Coup d\'estoc jusqu\'à 2 cases en ligne, qui repousse d\'une case.', pa: 4, range: [1, 2], line: true, target: 'enemy', perTurn: 1,
    effects: [{ k: 'dmg', min: 15, max: 19 }, { k: 'push', n: 1 }], tag: 'melee', fx: 'slash' }),
  sp({ id: 'guard', name: 'Garde haute', icon: 'GH', desc: '+30 % de résistance jusqu\'à ton prochain tour.', pa: 2, range: [0, 0], target: 'self', cooldown: 3,
    effects: [{ k: 'buff', stat: 'res', v: 30, turns: 1, self: true }], tag: 'util', fx: 'buff', color: 0xe8e8ff }),

  // ===== Lames mantes: many small hits, crits, bleeding, jumps =====
  sp({ id: 'rend', name: 'Lacération', icon: 'LA', desc: 'Trois fois par tour. +10 % de critique.', pa: 2, range: [1, 1], target: 'enemy', perTurn: 3, crit: 0.1,
    effects: [{ k: 'dmg', min: 7, max: 9 }], tag: 'melee', fx: 'slash', color: 0xff2a6d }),
  sp({ id: 'leap', name: 'Bond de mante', icon: 'BO', desc: 'Saute sur une case libre (sans ligne de vue) et frappe tout ce qui est autour à l\'atterrissage.',
    pa: 3, range: [2, 4], los: false, target: 'empty', cooldown: 2, zone: { shape: 'circle', r: 1 },
    effects: [{ k: 'jump' }, { k: 'dmg', min: 7, max: 10 }], tag: 'move', fx: 'jump', color: 0xff2a6d }),
  sp({ id: 'bleed', name: 'Saignée', icon: 'SA', desc: 'Entaille profonde : la cible saigne 5 PV au début de ses 2 prochains tours.', pa: 3, range: [1, 1], target: 'enemy', perTarget: 1,
    effects: [{ k: 'dmg', min: 5, max: 7 }, { k: 'bleed', v: 5, turns: 2 }], tag: 'melee', fx: 'slash', color: 0xff3b3b }),
  sp({ id: 'evade', name: 'Esquive', icon: 'EQ', desc: '+2 PM tout de suite.', pa: 1, range: [0, 0], target: 'self', cooldown: 3,
    effects: [{ k: 'buff', stat: 'pm', v: 2, turns: 1, self: true }], tag: 'move', fx: 'buff', color: 0x39ff88 }),

  // ===== Poings Titan: heavy blows and pushes =====
  sp({ id: 'uppercut', name: 'Uppercut', icon: 'UP', desc: 'Coup lourd qui repousse de 2 cases. Contre un mur : dégâts de poussée.', pa: 4, range: [1, 1], target: 'enemy', perTurn: 1,
    effects: [{ k: 'dmg', min: 14, max: 18 }, { k: 'push', n: 2 }], tag: 'melee', fx: 'blast', color: 0xe8e8ff }),
  sp({ id: 'jab', name: 'Direct', icon: 'DI', desc: 'Coup de poing rapide.', pa: 3, range: [1, 1], target: 'enemy', perTurn: 2,
    effects: [{ k: 'dmg', min: 10, max: 13 }], tag: 'melee', fx: 'blast', color: 0xe8e8ff }),
  sp({ id: 'shockwave', name: 'Onde de choc', icon: 'OC', desc: 'Frappe le sol : touche tout à 2 cases autour de toi, repousse de 2 et retire 1 PM.', pa: 4, range: [0, 0], target: 'self', cooldown: 3,
    zone: { shape: 'circle', r: 2 }, effects: [{ k: 'dmg', min: 7, max: 10 }, { k: 'push', n: 2, fromCell: true }, { k: 'buff', stat: 'pm', v: -1, turns: 1 }], tag: 'melee', fx: 'blast', color: 0xe8e8ff }),
  sp({ id: 'tackle', name: 'Plaquage', icon: 'PL', desc: 'Fonce en ligne sur un ennemi jusqu\'à 4 cases, le frappe et le repousse d\'une case.', pa: 3, range: [2, 4], line: true, target: 'enemy', cooldown: 2,
    effects: [{ k: 'charge' }, { k: 'dmg', min: 8, max: 11 }, { k: 'push', n: 1 }], tag: 'move', fx: 'blast', color: 0xe8e8ff }),

  // ===== Fil-mono: reach, pulls and control =====
  sp({ id: 'whip', name: 'Fouet', icon: 'FO', desc: 'Le fil frappe jusqu\'à 3 cases en ligne.', pa: 3, range: [1, 3], line: true, target: 'enemy', perTurn: 2,
    effects: [{ k: 'dmg', min: 10, max: 13 }], tag: 'melee', fx: 'wire' }),
  sp({ id: 'harpoon', name: 'Harpon', icon: 'HA', desc: 'Attrape un ennemi en ligne jusqu\'à 5 cases et l\'attire de 3 cases vers toi.', pa: 3, range: [2, 5], line: true, target: 'enemy', perTurn: 1,
    effects: [{ k: 'dmg', min: 8, max: 10 }, { k: 'pull', n: 3 }], tag: 'util', fx: 'wire' }),
  sp({ id: 'garrote', name: 'Garrot', icon: 'GA', desc: 'Étrangle la cible : dégâts et -2 PM à son prochain tour.', pa: 4, range: [1, 1], target: 'enemy', cooldown: 2,
    effects: [{ k: 'dmg', min: 11, max: 14 }, { k: 'buff', stat: 'pm', v: -2, turns: 1 }], tag: 'melee', fx: 'wire' }),
  sp({ id: 'web', name: 'Toile', icon: 'TO', desc: 'Tend des fils en croix : dégâts et -1 PM dans la zone.', pa: 3, range: [2, 5], target: 'any', cooldown: 2, zone: { shape: 'cross', r: 1 },
    effects: [{ k: 'dmg', min: 5, max: 7 }, { k: 'buff', stat: 'pm', v: -1, turns: 1 }], tag: 'util', fx: 'wire' }),

  // ===== Pistolet « Vautour »: range, line shots, an escape =====
  sp({ id: 'shot', name: 'Tir', icon: 'TI', desc: 'Tir à distance (pas au contact). Portée modifiable.', pa: 3, range: [2, 7], rangeMod: true, target: 'enemy', perTurn: 2,
    effects: [{ k: 'dmg', min: 10, max: 13 }], tag: 'ranged', fx: 'shot', color: 0xf5e663 }),
  sp({ id: 'pierce', name: 'Tir perçant', icon: 'TP', desc: 'Traverse : touche la cible et les 3 cases derrière elle.', pa: 4, range: [1, 6], line: true, rangeMod: true, target: 'any', cooldown: 2,
    zone: { shape: 'line', len: 4 }, effects: [{ k: 'dmg', min: 9, max: 12 }], tag: 'ranged', fx: 'shot', color: 0xf5e663 }),
  sp({ id: 'volley', name: 'Rafale', icon: 'RA', desc: 'Arrose une zone : la case et ses 4 voisines.', pa: 4, range: [3, 6], rangeMod: true, target: 'any', cooldown: 2, zone: { shape: 'circle', r: 1 },
    effects: [{ k: 'dmg', min: 7, max: 10 }], tag: 'ranged', fx: 'blast', color: 0xf5e663 }),
  sp({ id: 'roll', name: 'Roulade', icon: 'RO', desc: 'Roule de 1 ou 2 cases en ligne. Ignore le tacle.', pa: 2, range: [1, 2], line: true, los: false, target: 'empty', cooldown: 2,
    effects: [{ k: 'jump' }], tag: 'move', fx: 'jump', color: 0x39ff88 }),

  // ===== Always there =====
  sp({ id: 'overheat', name: 'Surchauffe', icon: 'SU', desc: '+2 PA tout de suite, contre de la psychose. Une fois par tour.', pa: 0, range: [0, 0], target: 'self', perTurn: 1,
    effects: [{ k: 'buff', stat: 'pa', v: 2, turns: 1, self: true }], tag: 'util', fx: 'buff', color: 0xff2a6d }),
  sp({ id: 'blocker', name: 'Neuro-bloqueur', icon: 'NB', desc: 'Retire 30 de psychose (consomme un neuro-bloqueur).', pa: 2, range: [0, 0], target: 'self',
    effects: [], tag: 'util', fx: 'heal', color: 0x39ff88 }),

  // ===== From implants and relics =====
  sp({ id: 'shortcircuit', name: 'Court-circuit', icon: 'CC', desc: 'Hack sans ligne de vue : dégâts et -1 PA au prochain tour de la cible.', pa: 2, range: [1, 6], los: false, target: 'enemy', perTurn: 1,
    effects: [{ k: 'dmg', min: 6, max: 8 }, { k: 'buff', stat: 'pa', v: -1, turns: 1 }], tag: 'ranged', fx: 'hack', color: 0x39ff88 }),
  sp({ id: 'reflex', name: 'Tir réflexe', icon: 'TR', desc: 'Un tir rapide du lien balistique.', pa: 2, range: [2, 6], rangeMod: true, target: 'enemy', perTurn: 1,
    effects: [{ k: 'dmg', min: 6, max: 8 }], tag: 'ranged', fx: 'shot', color: 0xf5e663 }),
  sp({ id: 'grenade', name: 'Grenade', icon: 'GR', desc: 'Explose sur la case et ses 4 voisines.', pa: 4, range: [2, 5], target: 'any', cooldown: 3, zone: { shape: 'circle', r: 1 },
    effects: [{ k: 'dmg', min: 9, max: 12 }], tag: 'ranged', fx: 'blast', color: 0xff8c2a }),
  sp({ id: 'turret', name: 'Tourelle', icon: 'TU', desc: 'Pose une tourelle qui tire à chaque tour.', pa: 3, range: [1, 2], target: 'empty', cooldown: 4,
    effects: [{ k: 'summon', unit: 'turret' }], tag: 'util', fx: 'buff' }),
  sp({ id: 'stim', name: 'Stimulant', icon: 'ST', desc: 'Soigne 10 à 14 PV.', pa: 2, range: [0, 0], target: 'self', cooldown: 3,
    effects: [{ k: 'heal', min: 10, max: 14 }], tag: 'util', fx: 'heal', color: 0x39ff88 }),
  sp({ id: 'kshield', name: 'Bouclier cinétique', icon: 'BC', desc: '20 points de bouclier pendant 2 tours.', pa: 2, range: [0, 0], target: 'self', cooldown: 3,
    effects: [{ k: 'shield', v: 20, turns: 2, self: true }], tag: 'util', fx: 'buff', color: 0x00f0ff }),
  sp({ id: 'goldshot', name: 'Tir doré', icon: 'OR', desc: 'Pistolets jumeaux : deux fois par tour.', pa: 2, range: [1, 5], target: 'enemy', perTurn: 2,
    effects: [{ k: 'dmg', min: 8, max: 10 }], tag: 'ranged', fx: 'shot', color: 0xf5e663 }),

  // ===== Enemies =====
  sp({ id: 'e-knife', name: 'Coup de lame', icon: '', desc: '', pa: 3, range: [1, 1], target: 'enemy', perTurn: 2, effects: [{ k: 'dmg', min: 4, max: 6 }], tag: 'melee', fx: 'slash', color: 0xff2a6d }),
  sp({ id: 'e-shot', name: 'Tir', icon: '', desc: '', pa: 3, range: [2, 6], target: 'enemy', perTurn: 2, effects: [{ k: 'dmg', min: 4, max: 6 }], tag: 'ranged', fx: 'shot', color: 0xff2a6d }),
  sp({ id: 'e-burst', name: 'Rafale de drone', icon: '', desc: '', pa: 4, range: [1, 4], target: 'enemy', perTurn: 1, effects: [{ k: 'dmg', min: 5, max: 7 }], tag: 'ranged', fx: 'shot', color: 0xff2a6d }),
  sp({ id: 'e-prime', name: 'Amorçage', icon: '', desc: '', pa: 2, range: [0, 0], target: 'self', perTurn: 1, effects: [{ k: 'prime' }], tag: 'util', fx: 'buff', color: 0xf5e663 }),
  sp({ id: 'e-claw', name: 'Griffure', icon: '', desc: '', pa: 2, range: [1, 1], target: 'enemy', perTurn: 1, effects: [{ k: 'dmg', min: 3, max: 5 }], tag: 'melee', fx: 'slash', color: 0xf5e663 }),
  sp({ id: 'e-hammer', name: 'Marteau', icon: '', desc: '', pa: 4, range: [1, 1], target: 'enemy', perTurn: 1, effects: [{ k: 'dmg', min: 8, max: 11 }, { k: 'push', n: 1 }], tag: 'melee', fx: 'blast', color: 0xff2a6d }),
  sp({ id: 'e-rush', name: 'Ruée', icon: '', desc: '', pa: 3, range: [2, 4], line: true, target: 'enemy', cooldown: 2, effects: [{ k: 'charge' }, { k: 'dmg', min: 5, max: 7 }], tag: 'move', fx: 'blast', color: 0xff2a6d }),
  sp({ id: 'e-hack', name: 'Quickhack', icon: '', desc: '', pa: 3, range: [2, 8], los: false, target: 'enemy', perTurn: 1, effects: [{ k: 'dmg', min: 3, max: 5 }, { k: 'psy', v: 8 }], tag: 'ranged', fx: 'hack', color: 0x39ff88 }),
  sp({ id: 'e-jam', name: 'Brouillage', icon: '', desc: '', pa: 3, range: [1, 6], los: false, target: 'enemy', cooldown: 2, effects: [{ k: 'buff', stat: 'pm', v: -1, turns: 1 }], tag: 'util', fx: 'hack', color: 0x39ff88 }),
  sp({ id: 'e-patch', name: 'Soin réseau', icon: '', desc: '', pa: 3, range: [1, 6], los: false, target: 'unit', cooldown: 2, effects: [{ k: 'heal', min: 9, max: 12 }], tag: 'util', fx: 'heal', color: 0x39ff88 }),
  sp({ id: 'e-turret', name: 'Tir de tourelle', icon: '', desc: '', pa: 3, range: [1, 6], target: 'enemy', perTurn: 1, effects: [{ k: 'dmg', min: 6, max: 8 }], tag: 'ranged', fx: 'shot', color: 0x00f0ff }),
  // Lieutenant des Rats
  sp({ id: 'b-butt', name: 'Coup de crosse', icon: '', desc: '', pa: 4, range: [1, 1], target: 'enemy', perTurn: 1, effects: [{ k: 'dmg', min: 8, max: 10 }, { k: 'push', n: 1 }], tag: 'melee', fx: 'blast', color: 0xff2a6d }),
  sp({ id: 'b-barrage', name: 'Barrage', icon: '', desc: '', pa: 4, range: [2, 6], target: 'any', cooldown: 2, zone: { shape: 'circle', r: 1 }, effects: [{ k: 'dmg', min: 5, max: 7 }], tag: 'ranged', fx: 'blast', color: 0xff2a6d }),
  sp({ id: 'b-call', name: 'Appel des Rats', icon: '', desc: '', pa: 3, range: [1, 2], target: 'empty', cooldown: 5, effects: [{ k: 'summon', unit: 'runner' }], tag: 'util', fx: 'buff', color: 0xff2a6d }),
  sp({ id: 'b-charge', name: 'Charge', icon: '', desc: '', pa: 3, range: [2, 5], line: true, target: 'enemy', cooldown: 3, effects: [{ k: 'charge' }, { k: 'dmg', min: 5, max: 7 }, { k: 'push', n: 1 }], tag: 'move', fx: 'blast', color: 0xff2a6d }),
  // Exécuteur Psy-Sec
  sp({ id: 'x-blade', name: 'Lame psy', icon: '', desc: '', pa: 4, range: [1, 1], target: 'enemy', perTurn: 1, effects: [{ k: 'dmg', min: 10, max: 12 }, { k: 'psy', v: 6 }], tag: 'melee', fx: 'slash', color: 0xff2a6d }),
  sp({ id: 'x-ray', name: 'Rayon', icon: '', desc: '', pa: 4, range: [1, 7], line: true, target: 'any', cooldown: 2, zone: { shape: 'line', len: 4 }, effects: [{ k: 'dmg', min: 6, max: 8 }], tag: 'ranged', fx: 'shot', color: 0xff2a6d }),
  sp({ id: 'x-wave', name: 'Onde psy', icon: '', desc: '', pa: 4, range: [0, 0], target: 'self', cooldown: 3, zone: { shape: 'circle', r: 2 },
    effects: [{ k: 'dmg', min: 5, max: 7 }, { k: 'push', n: 1, fromCell: true }, { k: 'psy', v: 6 }], tag: 'melee', fx: 'blast', color: 0xff2a6d }),
  sp({ id: 'x-blink', name: 'Saut', icon: '', desc: '', pa: 2, range: [2, 5], los: false, target: 'empty', cooldown: 3, effects: [{ k: 'jump' }], tag: 'move', fx: 'jump', color: 0xff2a6d }),
  sp({ id: 'x-drones', name: 'Essaim', icon: '', desc: '', pa: 3, range: [1, 2], target: 'empty', cooldown: 5, effects: [{ k: 'summon', unit: 'drone' }], tag: 'util', fx: 'buff', color: 0xff2a6d }),
].map(s => [s.id, s]));

/** A private copy, so aspects and implants can change it for one run. */
export const spell = (id: string): SpellDef => {
  const s = SPELLS[id];
  if (!s) throw new Error(`Unknown spell ${id}`);
  return { ...s, range: [...s.range], effects: s.effects.map(e => ({ ...e })), zone: { ...s.zone } };
};
