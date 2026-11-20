/**
 * The credits, as plain data (kept in step with CREDITS.md at the repo root). Each section is an
 * asset family: who made it, under which licence, and where to find it. CC-BY items carry the
 * attribution their licence asks for: author, title, licence and a link.
 */
export interface CreditSection {
  title: string;
  /** what it is used for in the game */
  use: string;
  /** one line each: author, work, licence, link */
  lines: string[];
  /** a licence note shown in a dimmer colour */
  note?: string;
}

export const GAME_CREDIT = {
  name: 'NEON CITY',
  by: 'Un jeu de Quentin Bonhoure',
  lines: ['Conception, code, écriture et direction artistique : Quentin Bonhoure.', 'Tous les personnages, quêtes, noms et répliques sont originaux.'],
};

export const CREDIT_SECTIONS: CreditSection[] = [
  {
    title: 'PERSONNAGES (CC-BY)',
    use: 'Héros, runners, résidents, boss et PNJ (VRM)',
    lines: [
      '« VIPE Heroes Genesis » par Polygonal Mind',
      'Licence Creative Commons Attribution 4.0 (CC-BY)',
      'https://creativecommons.org/licenses/by/4.0/',
      'https://www.vipe.io  ·  https://www.polygonalmind.com',
    ],
    note: 'Modèles allégés (expressions inutilisées retirées) ; aucun autre changement.',
  },
  {
    title: 'ANIMATIONS',
    use: 'Marche, combat, sorts, victoire…',
    lines: ['Universal Animation Library, par Quaternius (quaternius.com), licence CC0', 'https://quaternius.com/packs/universalanimationlibrary.html'],
  },
  {
    title: 'DÉCORS (CC0)',
    use: 'Rues, immeubles, voitures, stations, bornes d\'arcade, épicerie',
    lines: [
      'Kenney (www.kenney.nl), licence CC0 : City Kit Commercial, Industrial, Roads, Suburban,',
      'Car Kit, Space Station Kit, Modular Space Kit, Mini Arcade, Mini Market',
      'Mini Arcade et Mini Market : avec Fleur Keijsers et Guus Vermeulen',
      'https://kenney.nl/assets',
    ],
  },
  {
    title: 'MOBILIER (CC0)',
    use: 'L\'appartement et les intérieurs',
    lines: ['« Furniture Bits » par Kay Lousberg (KayKit), licence CC0', 'https://www.kaylousberg.com'],
  },
  {
    title: 'MUSIQUE (CC0)',
    use: 'Appart, rue, boss',
    lines: [
      '« Space City » par MintoDog',
      'https://opengameart.org/content/space-city',
      '« Dark City » par cinameng (James Gargette)',
      'https://opengameart.org/content/dark-city-0',
      '« Cyberpunk Moonlight Sonata » (v2) par Joth',
      'https://opengameart.org/content/cyberpunk-moonlight-sonata',
      '« Night Prowler » par Section 31 - Tech',
      'https://opengameart.org/content/night-prowler',
      '« The 9th Circle » (V2) par Joth',
      'https://opengameart.org/content/the-9th-circle',
    ],
    note: 'Toutes en CC0 sur OpenGameArt.org (crédit apprécié, non obligatoire).',
  },
  {
    title: 'POLICES (OFL)',
    use: 'Textes et titres',
    lines: ['Chakra Petch et Teko', 'SIL Open Font License 1.1, via @fontsource', 'https://openfontlicense.org'],
  },
  {
    title: 'LOGICIELS LIBRES',
    use: 'Moteur et rendu',
    lines: [
      'Phaser (MIT), three.js (MIT)',
      '@pixiv/three-vrm (MIT) : le retarget des animations s\'inspire de son exemple « humanoidAnimation »',
      'https://github.com/pixiv/three-vrm',
    ],
  },
];

export type CreditLine = { kind: 'title' | 'use' | 'text' | 'link' | 'note' | 'gap' | 'big' | 'sub'; text: string };

/** The whole credits as a flat list of lines, ready to be shown a window at a time. */
export function creditLines(): CreditLine[] {
  const out: CreditLine[] = [
    { kind: 'big', text: GAME_CREDIT.name },
    { kind: 'sub', text: GAME_CREDIT.by },
    ...GAME_CREDIT.lines.map(text => ({ kind: 'text' as const, text })),
  ];
  for (const s of CREDIT_SECTIONS) {
    out.push({ kind: 'gap', text: '' }, { kind: 'title', text: s.title }, { kind: 'use', text: s.use });
    for (const l of s.lines) out.push({ kind: /^https?:/.test(l) ? 'link' : 'text', text: l });
    if (s.note) out.push({ kind: 'note', text: s.note });
  }
  out.push({ kind: 'gap', text: '' }, { kind: 'sub', text: 'Merci d\'avoir joué.' });
  return out;
}
