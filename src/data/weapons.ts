import type { Stats } from '../core/types';
import type { WeaponArt } from '../gfx/playerArt';

export type WeaponId = 'blade' | 'mantis' | 'gorilla' | 'wire' | 'pistol';
export type SpecialId = 'windcut' | 'leap' | 'shockwave' | 'garrote' | 'volley';

export interface Weapon {
  id: WeaponId;
  name: string;
  description: string;
  /** credits to unlock at the apartment rack (0 = owned from the start) */
  cost: number;
  art: WeaponArt;
  combo: number;
  cooldownMs: number;
  /** extra recovery after the last hit of the combo */
  finisherMs: number;
  /** how far in front of the player the hit lands, and its radius (normal / finisher) */
  reach: number;
  radius: [number, number];
  damageMult: number;
  /** knockback strength multiplier on light enemies */
  knock: number;
  /** the finisher stuns light enemies for this long (ms) */
  finisherStun: number;
  /** ranged weapon: left click fires instead of slashing */
  shot?: { speed: number; charged: number };
  /** look of the swing arc */
  arc: { scale: [number, number]; tint?: number };
  special: { id: SpecialId; name: string; description: string; cooldownMs: number };
  /** weapon-specific stat tweaks */
  modify?: (s: Stats) => Stats;
}

/** Five ways to fight, each with its own rhythm and a special on E / Shift. */
export const WEAPONS: Record<WeaponId, Weapon> = {
  blade: {
    id: 'blade', name: 'Lame-mono', description: 'Équilibrée : combo de 3 coups, portée moyenne.', cost: 0, art: 'blade',
    combo: 3, cooldownMs: 220, finisherMs: 120, reach: 15, radius: [14, 18], damageMult: 1, knock: 1, finisherStun: 0,
    arc: { scale: [1, 1] },
    special: { id: 'windcut', name: 'Tranche-vent', description: 'Fonce en avant et tranche tout sur ton passage (x1,6).', cooldownMs: 5000 },
  },
  mantis: {
    id: 'mantis', name: 'Lames mantes', description: 'Rapides : combo de 4 coups courts, +10 % de critique.', cost: 150, art: 'mantis',
    combo: 4, cooldownMs: 150, finisherMs: 100, reach: 12, radius: [12, 15], damageMult: 0.62, knock: 0.6, finisherStun: 0,
    arc: { scale: [0.8, 0.8], tint: 0xff2a6d },
    special: { id: 'leap', name: 'Bond de mante', description: 'Bondis vers le curseur et retombe sur tes ennemis (x2, zone).', cooldownMs: 6000 },
    modify: s => ({ ...s, critChance: s.critChance + 0.1 }),
  },
  gorilla: {
    id: 'gorilla', name: 'Poings Titan', description: 'Lourds : 2 coups dévastateurs, le second étourdit.', cost: 250, art: 'fist',
    combo: 2, cooldownMs: 380, finisherMs: 180, reach: 14, radius: [16, 22], damageMult: 1.75, knock: 1.8, finisherStun: 600,
    arc: { scale: [1.2, 1.2], tint: 0xe8e8ff },
    special: { id: 'shockwave', name: 'Onde de choc', description: 'Frappe le sol : dégâts autour de toi et tout le monde étourdi.', cooldownMs: 7000 },
  },
  wire: {
    id: 'wire', name: 'Fil-mono', description: 'Allonge : un fouet qui frappe loin, en large arc.', cost: 350, art: 'wire',
    combo: 2, cooldownMs: 300, finisherMs: 150, reach: 30, radius: [20, 24], damageMult: 0.95, knock: 0.8, finisherStun: 0,
    arc: { scale: [1.8, 0.7], tint: 0x00f0ff },
    special: { id: 'garrote', name: 'Garrot', description: 'Attrape les ennemis proches, les tire vers toi et les étourdit.', cooldownMs: 6000 },
  },
  pistol: {
    id: 'pistol', name: 'Pistolet « Vautour »', description: 'À distance : clic gauche tire, un tir chargé tous les 3 coups.', cost: 450, art: 'gun',
    combo: 3, cooldownMs: 230, finisherMs: 80, reach: 0, radius: [0, 0], damageMult: 0.85, knock: 0.5, finisherStun: 0,
    shot: { speed: 340, charged: 1.9 },
    arc: { scale: [0, 0] },
    special: { id: 'volley', name: 'Rafale', description: 'Sept balles en éventail.', cooldownMs: 5000 },
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
export const isWeaponId = (v: unknown): v is WeaponId => typeof v === 'string' && v in WEAPONS;
