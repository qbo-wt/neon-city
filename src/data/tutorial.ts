import type { TutorialStep } from '../core/tutorial';

/** What the scenes tell the tutorial about their live state (the run only, for now). */
export interface TutorialCtx {
  /** whose turn it is: placement phase, your turn (animations included), the enemies', or no fight */
  turn?: 'placement' | 'player' | 'enemy' | 'none';
  /** a spell is chosen and waits for its target */
  aiming?: boolean;
  /** the sector is cleared and its exits are open */
  exits?: boolean;
}

/**
 * The guided tutorial, in order. One or two sentences per bubble.
 *
 * Events sent by the scenes:
 * - every place: `enter:<place>` when it opens
 * - hub: `hub:moved` (walked a few steps), `hub:interact` (any [E]), `hub:talk`, `hub:guide`,
 *   `hub:elevator`, `hub:shop:doc`, `hub:shop:nyx`
 * - run: `run:placed`, `run:ready`, `run:moved`, `run:select`, `run:cast`, `run:endturn`, `run:turn`
 *   (your turn begins), `run:exit`
 * - tip triggers: `see:trap`, `see:barrel`, `see:bonus`, `see:cover`, `see:boss`, `see:telegraph`,
 *   `got:relic`, `got:implant`, `psy:high`
 *
 * Anchors (`point`): hub — player, datapad, door, lo, clinic, den, elevator, doc, nyx; run — start,
 * end, papm, slot0, hero, foe, timeline, exit, trap, barrel, bonus, cover, boss, telegraph, psy, relics, implants.
 */
type Step = TutorialStep<TutorialCtx>;
const fight = (c: TutorialCtx) => c.turn === 'placement' || c.turn === 'player' || c.turn === 'enemy';

const HUB: Step[] = [
  // The apartment.
  { id: 'h-move', track: 'basic', place: 'hideout', point: 'player', ack: true, until: ['hub:moved'],
    text: 'Bienvenue chez toi, runner. Déplace-toi avec ZQSD, WASD ou les flèches.' },
  { id: 'h-use', track: 'basic', place: 'hideout', point: 'datapad', ack: true, after: ['h-move'], until: ['hub:interact'],
    text: 'Approche-toi d\'un objet et appuie sur E. Le datapad, sur le bureau, contient le guide du runner.' },
  { id: 'h-out', track: 'basic', place: 'hideout', point: 'door', ack: true, after: ['h-use'], until: ['enter:building'],
    text: 'Le râtelier change ton arme, le serveur tient ton bestiaire. Le reste de l\'immeuble est derrière la porte.' },
  // The corridor.
  { id: 'b-talk', track: 'basic', place: 'building', point: 'lo', ack: true, until: ['hub:talk'],
    text: 'Tout l\'étage vit ici. Approche-toi de quelqu\'un et appuie sur E pour lui parler : Mamie Lo, au stand de ramen, a toujours un mot.' },
  { id: 'b-shops', track: 'basic', place: 'building', point: 'clinic', ack: true, after: ['b-talk'], until: ['enter:clinic', 'enter:den'],
    text: 'La clinique du Doc (corps) et, à l\'autre bout, le repaire de Nyx (esprit) vendent des améliorations permanentes contre tes crédits.' },
  { id: 'b-run', track: 'basic', place: 'building', point: 'elevator', ack: true, after: ['b-shops'], until: ['hub:elevator'],
    text: 'Prêt ? L\'ascenseur descend dans la rue : c\'est là que commence un run. Les crédits gagnés reviennent avec toi.' },
  // The shops, whenever you first walk in.
  { id: 'c-doc', track: 'basic', place: 'clinic', point: 'doc', ack: true, until: ['hub:shop:doc'],
    text: 'Doc Kessler greffe du chrome : PV, dégâts, PM… Parle-lui (E) pour ouvrir son catalogue ; tout reste acquis d\'un run à l\'autre.' },
  { id: 'd-nyx', track: 'basic', place: 'den', point: 'nyx', ack: true, until: ['hub:shop:nyx'],
    text: 'Nyx calibre ton esprit : résistance à la psychose, charge d\'implants, crédits. Parle-lui (E) pour voir ses greffes.' },
];

const FIGHT: Step[] = [
  { id: 'f-place', track: 'basic', place: 'run', point: 'start', ack: true, until: ['run:placed', 'run:ready'],
    when: c => c.turn === 'placement',
    text: 'Un combat ! Clique une case bleue pour choisir où tu démarres. Les ennemis attendent sur les cases rouges.' },
  { id: 'f-ready', track: 'basic', place: 'run', point: 'end', after: ['f-place'], until: ['run:ready'],
    when: c => c.turn === 'placement',
    text: 'Ta place te va ? Appuie sur Espace (ou PRÊT) pour lancer le combat.' },
  { id: 'f-papm', track: 'basic', place: 'run', point: 'papm', ack: true, until: ['run:moved', 'run:cast'],
    when: c => c.turn === 'player',
    text: 'À toi ! PA (cyan) : points d\'action, pour les sorts. PM (vert) : points de mouvement. Tout revient à ton prochain tour.' },
  { id: 'f-move', track: 'basic', place: 'run', point: 'hero', ack: true, after: ['f-papm'], until: ['run:moved'],
    when: c => c.turn === 'player' && !c.aiming,
    text: 'Clique une case verte pour t\'y déplacer. Au survol, le chemin et son coût en PM s\'affichent.' },
  { id: 'f-spell', track: 'basic', place: 'run', point: 'slot0', ack: true, after: ['f-move'], until: ['run:select', 'run:cast'],
    when: c => c.turn === 'player' && !c.aiming,
    text: 'Choisis un sort : touche 1 à 6, ou clic sur sa case. Le badge bleu dans le coin, c\'est son coût en PA.' },
  { id: 'f-aim', track: 'basic', place: 'run', point: 'foe', ack: true, after: ['f-spell'], until: ['run:cast'],
    when: c => c.turn === 'player' && !!c.aiming,
    text: 'Sa portée est en bleu : clique un ennemi dedans. Le survol montre les dégâts prévus. Clic droit ou Échap : annuler.' },
  { id: 'f-los', track: 'basic', place: 'run', ack: true, after: ['f-aim'], until: ['run:endturn'], onlyShown: true,
    when: c => c.turn === 'player' && !!c.aiming,
    text: 'Cases grises : pas de ligne de vue. Un mur, une voiture ou une caisse arrête le tir : change d\'angle ou rapproche-toi.' },
  { id: 'f-end', track: 'basic', place: 'run', point: 'end', after: ['f-aim'], until: ['run:endturn'],
    when: c => c.turn === 'player' && !c.aiming,
    text: 'Plus de PA ou de PM utiles ? Termine ton tour : Espace, Entrée ou FIN DU TOUR.' },
  { id: 'f-enemy', track: 'basic', place: 'run', point: 'timeline', ack: true, after: ['f-end'], until: ['run:turn'], onlyShown: true,
    when: c => c.turn === 'enemy',
    text: 'Tour ennemi : chacun joue dans l\'ordre de la frise, en haut à droite. Survole un ennemi pour voir jusqu\'où il peut aller.' },
  { id: 'f-exit', track: 'basic', place: 'run', point: 'exit', ack: true, after: ['f-end'], until: ['run:exit'],
    when: c => c.turn === 'none' && !!c.exits,
    text: 'Secteur nettoyé ! Chaque sortie affiche sa récompense (implant, soin, crédits…). Clique celle que tu veux.' },
];

const TIPS: Step[] = [
  { id: 't-trap', track: 'tip', place: 'run', point: 'trap', trigger: 'see:trap', ack: true, when: fight,
    text: 'Piège ! Décharge, acide ou vapeur blessent qui marche dessus, toi compris. Un chemin qui en traverse passe au rouge.' },
  { id: 't-barrel', track: 'tip', place: 'run', point: 'barrel', trigger: 'see:barrel', ack: true, when: fight,
    text: 'Baril explosif : détruis-le, ou pousses-y un ennemi, et il saute en 3 x 3. Pratique contre un groupe, pas à côté de toi.' },
  { id: 't-bonus', track: 'tip', place: 'run', point: 'bonus', trigger: 'see:bonus', ack: true, when: fight,
    text: 'Case bonus : la trousse soigne la première créature qui marche dessus, le relais piraté te donne des PA.' },
  { id: 't-cover', track: 'tip', place: 'run', point: 'cover', trigger: 'see:cover', ack: true, when: fight, until: ['run:endturn'],
    text: 'Cet ennemi est à couvert : tes attaques à distance lui font 25 % de dégâts en moins. Change d\'angle ou frappe au contact.' },
  { id: 't-boss', track: 'tip', place: 'run', point: 'boss', trigger: 'see:boss', ack: true, when: fight,
    text: 'Un boss ! Il change de phase quand ses PV baissent et annonce ses grosses attaques un tour à l\'avance.' },
  { id: 't-telegraph', track: 'tip', place: 'run', point: 'telegraph', trigger: 'see:telegraph', ack: true, when: fight, until: ['run:endturn'],
    text: 'Attaque annoncée : elle frappera les cases marquées à son prochain tour. Sors-en avant de finir le tien !' },
  { id: 't-relic', track: 'tip', place: 'run', point: 'relics', trigger: 'got:relic', ack: true,
    text: 'Relique ! Elle te suit jusqu\'à la fin du run, sans charge psy. Survole la ligne rouge en bas à gauche pour relire son effet.' },
  { id: 't-implant', track: 'tip', place: 'run', point: 'implants', trigger: 'got:implant', ack: true,
    text: 'Implant greffé : un bonus pour tout le run, mais sa charge fait grimper ta psychose plus vite. Tes greffes sont listées en bas à gauche.' },
  { id: 't-psy', track: 'tip', place: 'run', point: 'psy', trigger: 'psy:high', ack: true,
    text: 'Psychose à 50 % : tes coups font plus mal, mais dès 75 % tu perds des PV à chaque tour. Le neuro-bloqueur (F) la fait baisser.' },
];

export const TUTORIAL_STEPS: readonly Step[] = [...HUB, ...FIGHT, ...TIPS];
