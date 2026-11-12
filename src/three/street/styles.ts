import type { FacadeSpec } from './paint';

/** Neon colours of the art direction. */
export const N = { cyan: 0x00f0ff, magenta: 0xff2a6d, yellow: 0xf5e663, green: 0x39ff88, violet: 0xb84dff, orange: 0xff8c2a };

/** How one arena style looks: its buildings, words, colours, ground, weather. */
export interface Theme {
  facade: FacadeSpec['kind'];
  /** wall colours of the buildings (albedo) */
  walls: number[];
  /** dominant neon colours, most frequent first */
  neon: number[];
  /** shop / place names on signs */
  signs: string[];
  /** small lines under some signs */
  subs: string[];
  /** blade (vertical) sign words */
  blades: string[];
  ground: 'avenue' | 'alley' | 'market' | 'crossroad' | 'parking' | 'plaza' | 'docks' | 'checkpoint';
  /** hemisphere light: sky, ground; fog colour */
  sky: number; bounce: number; fog: number;
  /** lit fraction of windows */
  lit: number;
  rain: boolean;
  /** street level of the buildings is shops */
  shops: boolean;
  /** Kenney car models for car props */
  cars: string[];
  /** building height range near the board (m) */
  height: [number, number];
  /** lantern strings over the street */
  lanterns: boolean;
  /** holographic ads */
  holos: number;
  /** puddles: 0..1 */
  wet: number;
}

const SHOP_WALLS = [0x4b4378, 0x3d5a78, 0x6a3a68, 0x5a4a7e, 0x3a4a6e, 0x6e4a5e, 0x48407a];

export const THEMES: Record<string, Theme> = {
  avenue: {
    facade: 'shop', walls: SHOP_WALLS, neon: [N.magenta, N.cyan, N.yellow, N.violet, N.orange],
    signs: ['RAMEN', 'HÔTEL', 'BAR 88', 'PHARMA', 'CLUB VEGA', 'SUSHI', 'KARAOKÉ', 'NOODLES', '24/7', 'CYBERCAFÉ', 'MOTEL', 'TATOUAGE'],
    subs: ['OUVERT', 'NUIT & JOUR', 'IMPLANTS', 'BIÈRE · SAKÉ', 'NIVEAU 2'],
    blades: ['HÔTEL', 'BAR', 'RAMEN', 'CLUB', 'SAKÉ', 'NÉON'],
    ground: 'avenue', sky: 0x4a3aa8, bounce: 0x5a1a5a, fog: 0x1c1248, lit: 0.42, rain: true, shops: true,
    cars: ['taxi', 'sedan', 'police', 'van', 'suv', 'sedan-sports', 'hatchback-sports'], height: [11, 19], lanterns: false, holos: 2, wet: 0.7,
  },
  alley: {
    facade: 'alley', walls: [0x5a3a4a, 0x4a3a5a, 0x3e3a56, 0x5a4048, 0x46405e], neon: [N.magenta, N.violet, N.green, N.cyan],
    signs: ['BAR', 'DOC', 'PACHINKO', 'NO EXIT', 'GOGO', 'RATS'],
    subs: ['ENTRÉE ARRIÈRE', 'MEMBRES', 'CLINIQUE', 'FERMÉ'],
    blades: ['BAR', 'DOC', 'XXX', 'HÔTEL'],
    ground: 'alley', sky: 0x3a2a88, bounce: 0x4a1a4a, fog: 0x180e3a, lit: 0.3, rain: true, shops: false,
    cars: ['hatchback-sports', 'sedan'], height: [10, 16], lanterns: false, holos: 0, wet: 1,
  },
  market: {
    facade: 'shop', walls: [0x6a4a3a, 0x5a3a5a, 0x4a4a6a, 0x6a3a4a, 0x5a5070], neon: [N.orange, N.magenta, N.yellow, N.cyan, N.green],
    signs: ['MARCHÉ', 'FRUITS', 'POISSON', 'SUN-LO', 'NOUILLES', 'ÉPICES', 'DUMPLINGS', 'THÉ'],
    subs: ['FRAIS', 'DEPUIS 2049', 'À EMPORTER', 'PAS CHER'],
    blades: ['MARCHÉ', 'THÉ', 'RIZ', 'SOBA', 'BAZAR'],
    ground: 'market', sky: 0x4a3a98, bounce: 0x6a2a3a, fog: 0x22123a, lit: 0.5, rain: true, shops: true,
    cars: ['delivery', 'van'], height: [9, 15], lanterns: true, holos: 1, wet: 0.5,
  },
  crossroad: {
    facade: 'shop', walls: SHOP_WALLS, neon: [N.cyan, N.magenta, N.yellow, N.violet],
    signs: ['DELTA', 'BANQUE', 'ARCADE', 'CINÉMA', 'NEURO-COLA', 'CASINO', 'MÉTRO', 'GRILL'],
    subs: ['SORTIE 9', 'JEUX', '3D', 'CRÉDITS'],
    blades: ['CINÉ', 'MÉTRO', 'ARCADE', 'BAR'],
    ground: 'crossroad', sky: 0x4a3aa8, bounce: 0x4a1a6a, fog: 0x1c1248, lit: 0.45, rain: true, shops: true,
    cars: ['taxi', 'police', 'sedan'], height: [13, 22], lanterns: false, holos: 3, wet: 0.6,
  },
  parking: {
    facade: 'parking', walls: [0x5a5a78, 0x4e5070, 0x585470], neon: [N.cyan, N.yellow, N.magenta],
    signs: ['NIVEAU -1', 'PARKING HOSHI', 'SORTIE', 'ASCENSEUR'],
    subs: ['→', 'VITESSE 10', 'CAMÉRAS'],
    blades: ['P', 'P-1'],
    ground: 'parking', sky: 0x3a3a88, bounce: 0x2a2a5a, fog: 0x10102a, lit: 0, rain: false, shops: false,
    cars: ['sedan', 'suv', 'hatchback-sports', 'van', 'suv-luxury', 'sedan-sports'], height: [4.6, 4.6], lanterns: false, holos: 0, wet: 0.35,
  },
  plaza: {
    facade: 'shop', walls: [0x4a4a7e, 0x3e5a7a, 0x5a4a80, 0x6a4a6e], neon: [N.violet, N.cyan, N.magenta, N.green],
    signs: ['VEGA', 'TOTEM', 'GALERIE', 'CAFÉ', 'BOUTIQUE', 'NEURO·SPA', 'MUSÉE'],
    subs: ['ESPLANADE', 'LUXE', 'OUVERT'],
    blades: ['VEGA', 'SPA', 'CAFÉ'],
    ground: 'plaza', sky: 0x5a3ab8, bounce: 0x3a2a6a, fog: 0x1e1450, lit: 0.5, rain: true, shops: true,
    cars: ['sedan-sports'], height: [14, 24], lanterns: false, holos: 3, wet: 0.55,
  },
  docks: {
    facade: 'warehouse', walls: [0x4a5a6a, 0x5a4a5a, 0x3e4e66, 0x5e5a4a], neon: [N.orange, N.cyan, N.yellow],
    signs: ['DOCK 7', 'ENTREPÔT', 'FRET', 'DOUANE', 'KESSLER LOG.'],
    subs: ['ZONE INDUSTRIELLE', 'ACCÈS RESTREINT', 'QUAI EST'],
    blades: ['DOCK', 'FRET'],
    ground: 'docks', sky: 0x3a3a98, bounce: 0x2a2a5a, fog: 0x141a3a, lit: 0.25, rain: true, shops: false,
    cars: ['truck', 'delivery', 'truck-flat'], height: [9, 14], lanterns: false, holos: 1, wet: 0.8,
  },
  checkpoint: {
    facade: 'bunker', walls: [0x4a4a62, 0x52506a, 0x44465e], neon: [N.magenta, N.cyan, N.yellow],
    signs: ['PSY-SEC', 'CONTRÔLE', 'ARRÊT', 'ZONE ROUGE', 'SCAN'],
    subs: ['PAPIERS SVP', 'NIVEAU 3', 'TIR AUTORISÉ'],
    blades: ['STOP', 'PSY'],
    ground: 'checkpoint', sky: 0x4a2a88, bounce: 0x5a1a3a, fog: 0x1e0e30, lit: 0.3, rain: true, shops: false,
    cars: ['police', 'tractor-police'], height: [10, 16], lanterns: false, holos: 2, wet: 0.6,
  },
};

export const themeOf = (style: string) => THEMES[style] ?? THEMES.avenue;
