import type { Stats } from '../core/types';
import type { WeaponArt } from '../gfx/playerArt';

export type WeaponId = 'blade' | 'mantis' | 'gorilla' | 'wire' | 'pistol';

export interface Weapon {
  id: WeaponId;
  name: string;
  /** the play style in one line */
  description: string;
  /** credits to unlock at the apartment rack (0 = owned from the start) */
  cost: number;
  art: WeaponArt;
  /** the four spells this weapon gives (its "class") */
  spells: [string, string, string, string];
  /** weapon-specific stat tweaks */
  modify?: (s: Stats) => Stats;
}

/** Five ways to fight: each weapon is a class with four spells. */
export const WEAPONS: Record<WeaponId, Weapon> = {
  blade: {
    id: 'blade', name: 'Lame-mono', description: 'Équilibrée : bons coups au contact, une ruée qui tranche au passage.', cost: 0, art: 'blade',
    spells: ['cut', 'thrust', 'windcut', 'guard'],
  },
  mantis: {
    id: 'mantis', name: 'Lames mantes', description: 'Agile : beaucoup de petits coups, des critiques, des saignements et des bonds.', cost: 150, art: 'mantis',
    spells: ['rend', 'bleed', 'leap', 'evade'], modify: s => ({ ...s, critChance: s.critChance + 0.05, dodge: s.dodge + 1 }),
  },
  gorilla: {
    id: 'gorilla', name: 'Poings Titan', description: 'Lourd : repousse les ennemis contre les murs et les uns sur les autres.', cost: 250, art: 'fist',
    spells: ['uppercut', 'jab', 'shockwave', 'tackle'], modify: s => ({ ...s, tackle: s.tackle + 1, pushDamage: s.pushDamage + 2 }),
  },
  wire: {
    id: 'wire', name: 'Fil-mono', description: 'Contrôle : frappe à 3 cases, attire, ralentit et immobilise.', cost: 350, art: 'wire',
    spells: ['whip', 'harpoon', 'garrote', 'web'],
  },
  pistol: {
    id: 'pistol', name: 'Pistolet « Vautour »', description: 'À distance : tire de loin, perce les lignes, roule pour garder ses distances.', cost: 450, art: 'gun',
    spells: ['shot', 'pierce', 'volley', 'roll'],
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
export const isWeaponId = (v: unknown): v is WeaponId => typeof v === 'string' && v in WEAPONS;
