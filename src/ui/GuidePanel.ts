import Phaser from 'phaser';
import { CONFIG } from '../config';
import { SPELLS } from '../data/spells';
import { audio } from '../audio/audio';
import { zoneIcon, zoneLabel } from './spellInfo';
import { hex, title, txt } from './text';
import { Button, C, Card, T, bold, chip, cutPoly, hints, keycap, pinToCamera, screenFrame } from './kit';

/** One piece of a guide page. */
type Block =
  | { h: string }
  | { p: string }
  | { tip: string }
  | { keys: [string, string][] }
  | { list: [string, string][] }
  | { zones: string[] }
  | { chips: [string, number][] };

interface Chapter { name: string; pages: Block[][] }

const PSY = CONFIG;

/** Everything a new runner needs, chapter by chapter. Numbers come from the game's own config. */
const CHAPTERS: Chapter[] = [
  { name: 'BIENVENUE', pages: [[
    { h: 'La boucle de jeu' },
    { p: 'Neon City est un rogue-lite tactique au tour par tour. Tu vis dans un appart au 37e étage ; la rue, en bas, est un enchaînement de combats.' },
    { list: [
      ['APPART', 'Râtelier d\'armes, terminal (historique), serveur (bestiaire), ce guide.'],
      ['COULOIR', 'Le Doc Kessler (améliorations du corps), Nyx (améliorations de l\'esprit) et l\'ascenseur.'],
      ['ASCENSEUR', 'Lance une run normale, la run du jour ou règle ta notoriété.'],
      ['LA RUN', `${CONFIG.ROOMS_PER_RUN} secteurs à traverser. Un boss tous les ${CONFIG.BOSS_EVERY} secteurs, le dernier ferme le contrat.`],
    ] },
    { h: 'Ce que tu gardes' },
    { p: 'À la mort comme à la victoire, les crédits gagnés pendant la run sont rapatriés. Les implants, les reliques et la psychose sont perdus : chaque run repart de zéro, mais tu reviens plus fort grâce aux crédits.' },
    { tip: 'Une victoire contre le dernier boss rapporte une prime en plus.' },
  ]] },
  { name: 'SE DÉPLACER', pages: [[
    { h: 'Dans l\'immeuble' },
    { keys: [['ZQSD / WASD / flèches', 'Marcher'], ['E', 'Interagir avec ce qui est proche (le libellé s\'affiche au-dessus de toi)'], ['1 à 4', 'Choisir une option dans un panneau'], ['ÉCHAP ou E', 'Fermer un panneau']] },
    { p: 'Approche-toi d\'un meuble, d\'une porte ou d\'un voisin : une invite [E] apparaît. Les voisins se souviennent de ta dernière run et racontent leur histoire, une réplique par run.' },
    { h: 'Dans la rue' },
    { p: 'Hors combat, tu cliques sur une case pour y marcher. Pour quitter un secteur, marche jusqu\'à une des sorties : chacune annonce ce qu\'elle rapporte.' },
    { tip: 'Le bouton « i » (ou la touche I) rappelle les commandes à tout moment.' },
  ]] },
  { name: 'LE COMBAT', pages: [[
    { h: 'Placement' },
    { p: 'Au début d\'un combat, clique une case bleue pour choisir où tu commences, puis PRÊT (Espace).' },
    { h: 'Initiative et frise' },
    { p: 'Chaque créature joue à son tour, dans l\'ordre de son initiative. La frise en haut à droite montre qui joue maintenant (cadre jaune) et qui suit.' },
    { h: 'PA, PM, PV' },
    { list: [
      ['PA', `Points d'action : ${CONFIG.PLAYER_PA} par tour, pour les sorts.`],
      ['PM', `Points de mouvement : ${CONFIG.PLAYER_PM} par tour, une case coûte 1 PM.`],
      ['PV', `Ta vie : ${CONFIG.PLAYER_BASE_HP} au départ. À 0, la run s'arrête.`],
    ] },
    { p: 'Clique une case pour marcher (le coût en PM s\'affiche au survol). Ce qui n\'est pas dépensé est perdu : termine ton tour avec Espace ou FIN DU TOUR.' },
    { tip: `Quand un secteur compte plusieurs vagues, des renforts arrivent au début des rounds ${CONFIG.REINFORCE_ROUNDS.join(' et ')}.` },
  ]] },
  { name: 'LES SORTS', pages: [[
    { h: 'Lancer un sort' },
    { p: 'Choisis un sort (touches 1 à 9 ou clic sur la barre), puis clique la cible. Clic droit ou Échap annule. Survole un bouton : la carte du sort montre son coût, sa portée, sa zone et ses dégâts.' },
    { list: [
      ['COÛT', 'En PA, dans le coin du bouton.'],
      ['PORTÉE', 'Nombre de cases, minimum et maximum (« portée 2-4 »).'],
      ['LIGNE DE VUE', 'Obstacles et créatures bloquent la cible. Certains sorts s\'en passent.'],
      ['EN LIGNE', 'Le sort ne part qu\'en ligne droite depuis toi.'],
      ['RELANCE', 'Tours d\'attente avant de pouvoir le relancer (chiffre sur le bouton).'],
      ['PAR TOUR', 'Nombre maximum de lancers dans un même tour.'],
    ] },
  ], [
    { h: 'Les zones' },
    { p: 'Une zone touche plusieurs cases autour du point visé. En couleur : les cases touchées ; blanc : où tu vises ; cyan : toi (en combat, la zone visée s\'allume en rouge sur le terrain).' },
    { zones: ['cut', 'web', 'volley', 'pierce'] },
    { p: 'En visant, les dégâts prévus s\'affichent au-dessus de chaque cible (une croix = elle meurt), et la ligne au-dessus de la barre résume le coup.' },
    { tip: 'Survole un ennemi pour voir ses PV, ses PM et toutes les cases où il pourra marcher à son tour.' },
  ]] },
  { name: 'TACLE & POUSSÉE', pages: [[
    { h: 'Tacle et fuite' },
    { p: 'Quitter une case au contact d\'ennemis coûte des PM en plus : la somme de leur tacle, moins ta fuite. Le chemin affiché au survol en tient compte (« tacle »).' },
    { h: 'Poussée' },
    { p: `Certains sorts repoussent ou attirent. Une cible poussée contre un mur ou une créature prend ${5} dégâts par case qu'elle n'a pas pu faire (plus tes bonus de poussée). La créature heurtée en prend la moitié.` },
    { h: 'Couverts et objets cassables' },
    { p: 'Murs, voitures, barrières et créatures bloquent la ligne de vue : mets-les entre toi et les tireurs. Caisses, barils, poubelles et distributeurs se cassent ; ils lâchent parfois des crédits ou des soins, très rarement une relique.' },
    { chips: [['CAISSE 14 PV', C.yellow], ['BARIL 18 PV', C.orange], ['POUBELLE 8 PV', C.green], ['DISTRIBUTEUR 26 PV', C.cyan]] },
  ]] },
  { name: 'PSYCHOSE', pages: [[
    { h: 'La jauge PSY' },
    { p: `Neon City t'use : la psychose monte au début de chacun de tes tours (${PSY.PSY_PER_TURN} de base, plus la charge de tes implants) et de ${PSY.PSY_PER_KILL} à chaque élimination.` },
    { list: [
      ['50 %', `Glitch : dégâts x${PSY.PSY_GLITCH_DAMAGE}. L'écran grésille.`],
      ['75 %', `Dérive : dégâts x${PSY.PSY_DRAIN_DAMAGE}, mais tu perds ${PSY.PSY_DRAIN_SLOW * 100} % de tes PV max à chaque tour.`],
      ['100 %', `Cyberpsychose : dégâts x${PSY.CRISIS_DAMAGE_MULT}, ${PSY.PSY_DRAIN_FAST * 100} % de PV perdus par tour, chaque élimination rend ${PSY.CRISIS_KILL_HEAL} PV.`],
    ] },
    { h: 'Surchauffe et neuro-bloqueur' },
    { list: [
      ['SURCHAUFFE', `0 PA, une fois par tour : +${PSY.OVERHEAT_PA} PA tout de suite, contre ${PSY.OVERHEAT_PSY} de psychose.`],
      ['NEURO-BLOQUEUR', `Touche F, 2 PA : -${PSY.BLOCKER_AMOUNT} de psychose. Il faut en avoir un (coffres, rencontres, arbre de Nyx).`],
    ] },
    { tip: 'La psychose est aussi une arme : rester juste sous 75 % donne de gros dégâts sans perdre de vie.' },
  ]] },
  { name: 'ENNEMIS', pages: [[
    { h: 'Les archétypes' },
    { list: [
      ['PUNK À LAME', 'Fonce au contact, tacle. Souvent en groupe.'],
      ['TIREUR', 'Garde ses distances et a besoin d\'une ligne de vue.'],
      ['DRONE', 'Très rapide, joue souvent en premier. Dès le secteur 2.'],
      ['COLOSSE', 'Résistant, ruée en ligne, marteau qui repousse. Dès le secteur 3.'],
      ['KAMIKAZE', 'S\'amorce à côté de toi et explose à son tour suivant, sur ses alliés aussi. Éloigne-toi ou pousse-le vers eux.'],
      ['NETRUNNER', 'Hacks sans ligne de vue (dégâts et psychose), ralentit, soigne ses alliés et fuit. Dès le secteur 4.'],
    ] },
    { h: 'Les boss' },
    { p: 'Secteur 5 : le Lieutenant des Rats, qui appelle des renforts. Secteur 10 : l\'Exécuteur Psy-Sec, qui se téléporte et lâche des drones. Sous 50 % puis 25 % de vie, ils passent en phase supérieure : plus de PA, de PM et de dégâts.' },
    { tip: `Plus tu descends, plus ils sont solides : +${Math.round(CONFIG.DEPTH_HP * 100)} % de vie et +${Math.round(CONFIG.DEPTH_DAMAGE * 100)} % de dégâts par secteur.` },
  ]] },
  { name: 'ARMES & ASPECTS', pages: [[
    { h: 'Le râtelier' },
    { p: 'Le râtelier de l\'appart vend et équipe les armes avec tes crédits. Chaque arme donne 4 sorts et un style de jeu.' },
    { list: [
      ['LAME-MONO', 'Équilibrée : coups au contact, ruée qui tranche. Offerte.'],
      ['LAMES MANTES', 'Agile : petits coups, critiques, saignements, bonds.'],
      ['POINGS TITAN', 'Lourd : repousse contre les murs et les uns sur les autres.'],
      ['FIL-MONO', 'Contrôle : frappe à 3 cases, attire, ralentit, immobilise.'],
      ['PISTOLET « VAUTOUR »', 'À distance : tire de loin, perce les lignes, roule.'],
    ] },
    { h: 'Les aspects' },
    { p: 'Chaque arme a 3 aspects qui modifient ses sorts (portée, dégâts, effets). Le premier est offert ; les autres se débloquent puis montent jusqu\'au rang III. Un seul aspect est équipé à la fois.' },
    { tip: 'La fiche de l\'arme au râtelier montre ses 4 sorts avec l\'aspect équipé.' },
  ]] },
  { name: 'IMPLANTS', pages: [[
    { h: 'Pendant la run' },
    { p: 'Les cliniques de la rue proposent un implant parmi trois. Ils donnent PA, PM, portée, résistance, vol de vie, dégâts de poussée… et certains ajoutent un sort (Grenade, Tourelle, Stimulant, Bouclier cinétique, Court-circuit, Tir réflexe).' },
    { p: 'Chaque implant ajoute de la charge psy : ta psychose monte plus vite. Retrouver un implant déjà posé l\'améliore (jusqu\'au niveau III).' },
    { h: 'Familles et synergies' },
    { chips: [['CHROME', C.white], ['NEURAL', C.green], ['SANG', C.red], ['OPTIQUE', C.yellow]] },
    { p: '2 puis 3 implants d\'une même famille débloquent ses synergies : blindage et épines (chrome), psychose réduite et +1 PA (neural), soins aux éliminations et frénésie (sang), critiques et portée (optique).' },
    { h: 'Marché noir' },
    { p: 'Dès le secteur 3, une carte du marché noir peut apparaître : un gros avantage, avec une contrepartie.' },
  ]] },
  { name: 'ROUTE & RENCONTRES', pages: [[
    { h: 'Choisir sa sortie' },
    { p: 'Après chaque combat, 2 ou 3 sorties s\'ouvrent ; chacune annonce sa récompense : implant (avec sa famille), crédits, soin, coffre, rencontre ou secteur d\'élite.' },
    { h: 'Rencontres' },
    { list: [
      ['ROOK, FIXER', 'Propose un contrat sur le prochain combat.'],
      ['DOC PAVÉ', 'Charcudoc de rue : greffe propre, greffe du marché noir, purge de psychose.'],
      ['ZÉRO', 'Netrunner : paris (psychose quitte ou double, distributeur piraté), neuro-bloqueur pirate.'],
      ['MAMA KIT', 'Marchande : stimpack, neuro-bloqueur, révision d\'implant, parfois une relique.'],
    ] },
    { h: 'Secteurs d\'élite' },
    { p: 'Un ennemi de plus par vague, tous plus solides et marqués d\'un trait : boucliers, explosifs (ils sautent en mourant), camouflés (ciblables à 2 cases au plus) ou enragés (+1 PM, plus de dégâts). La récompense est meilleure.' },
    { h: 'Contrats du fixer' },
    { p: 'Gagner sans perdre un PV (un implant rare ou mieux), gagner en 3 rounds (30¢), éliminer 2 ennemis dans le même tour (un implant épique). La progression s\'affiche en haut à droite.' },
  ]] },
  { name: 'PROGRESSION', pages: [[
    { h: 'Le Doc Kessler — le CORPS' },
    { p: 'Sa clinique, dans le couloir, vend des améliorations permanentes en 4 branches : Ossature, Muscle, Mobilité, Instinct. Chaque palier demande le précédent.' },
    { h: 'Nyx — l\'ESPRIT' },
    { p: 'La netrunneuse vend Sérénité (moins de psychose, implants moins lourds, un neuro-bloqueur de départ) et Réseau (plus de crédits, neuro-bloqueurs plus forts, prime de victoire doublée).' },
    { h: 'Notoriété' },
    { p: 'Après une première victoire, l\'avis de recherche de l\'ascenseur active des handicaps (ennemis blindés, enragés, air vicié…). Chaque point donne +10 % de crédits ; battre ton record rapporte une prime.' },
    { h: 'Run du jour et bestiaire' },
    { p: 'La run du jour : la même ville pour tout le monde, avec la Lame-mono et sans notoriété. Le serveur de l\'appart tient le bestiaire : chaque type d\'ennemi éliminé ouvre son dossier, puis sa tactique (10 éliminations) et son histoire (25).' },
  ]] },
  { name: 'CONTRÔLES', pages: [[
    { h: 'Immeuble' },
    { keys: [['ZQSD / WASD / flèches', 'Se déplacer'], ['E', 'Interagir'], ['1 à 4', 'Choisir une option'], ['ÉCHAP', 'Fermer un panneau']] },
    { h: 'Combat' },
    { keys: [
      ['CLIC sur une case', 'Marcher (coût en PM affiché) / choisir une sortie'],
      ['1 à 9 ou clic', 'Choisir un sort, puis clic sur la cible'],
      ['CLIC DROIT / ÉCHAP', 'Annuler le sort choisi'],
      ['ESPACE / ENTRÉE', 'Fin du tour (PRÊT au placement)'],
      ['F', 'Neuro-bloqueur'],
      ['MOLETTE / ZQSD', 'Zoomer / déplacer la caméra'],
      ['SURVOL', 'Infos, chemin, portée, dégâts prévus'],
    ] },
    { h: 'Partout' },
    { keys: [['M', 'Couper / remettre le son'], ['I', 'Aide des commandes (et ce guide)']] },
  ]] },
];

/**
 * The runner's guide: chapters on the left, a paged chapter on the right. Keys: ↑ ↓ or 1-9 change
 * chapter, ← → change page, Échap closes. Opened from the apartment datapad, the help overlay and
 * the main menu.
 */
export class GuidePanel {
  private root?: Phaser.GameObjects.Container;
  private chapter = 0;
  private page = 0;
  private keyHandler?: (e: KeyboardEvent) => void;

  constructor(private scene: Phaser.Scene, private onClose?: () => void) {}

  get isOpen() { return !!this.root; }

  open(chapter = this.chapter) {
    this.chapter = chapter;
    this.page = 0;
    this.render();
    audio.sfx('uiOpen');
    if (!this.keyHandler) {
      this.keyHandler = (e: KeyboardEvent) => {
        if (!this.root) return;
        if (e.code === 'Escape') { this.close(); return; }
        if (e.code === 'ArrowUp') this.go(this.chapter - 1);
        else if (e.code === 'ArrowDown') this.go(this.chapter + 1);
        else if (e.code === 'ArrowLeft') this.turn(-1);
        else if (e.code === 'ArrowRight') this.turn(1);
        else if (/^Digit[1-9]$/.test(e.code)) this.go(Number(e.code.slice(5)) - 1);
      };
      this.scene.input.keyboard?.on('keydown', this.keyHandler);
      this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { if (this.keyHandler) this.scene.input.keyboard?.off('keydown', this.keyHandler); });
    }
  }

  close() {
    if (!this.root) return;
    this.root.destroy();
    this.root = undefined;
    this.onClose?.();
  }

  private go(i: number) {
    const n = Phaser.Math.Clamp(i, 0, CHAPTERS.length - 1);
    if (n === this.chapter) return;
    this.chapter = n; this.page = 0;
    audio.sfx('ui');
    this.render();
  }

  private turn(d: number) {
    const n = Phaser.Math.Clamp(this.page + d, 0, CHAPTERS[this.chapter].pages.length - 1);
    if (n === this.page) return;
    this.page = n;
    audio.sfx('ui');
    this.render();
  }

  private render() {
    this.root?.destroy();
    const s = this.scene, W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const root = s.add.container(0, 0).setDepth(6000);
    this.root = root;
    // Swallows clicks so nothing under the guide reacts.
    root.add(s.add.zone(W / 2, H / 2, W, H).setInteractive());
    root.add(screenFrame(s, 'GUIDE DU RUNNER', C.cyan, 'MANUEL DE SURVIE // NEON CITY'));

    // Chapter list.
    CHAPTERS.forEach((c, i) => {
      const sel = i === this.chapter;
      const card = new Card(s, 14, 24 + i * 17.5, 124, 15.5, { accent: sel ? C.yellow : C.cyan, state: sel ? 'sel' : 'idle', cut: 4, onClick: () => this.go(i) });
      card.add(title(s, 9, 8.3, String(i + 1).padStart(2, '0'), 10, sel ? T.yellow : T.mute).setFontStyle('600').setOrigin(0, 0.5));
      card.add(bold(s, 24, 7.8, c.name, 5.5, sel ? T.text : T.dim).setOrigin(0, 0.5));
      root.add(card);
    });

    // The page.
    const ch = CHAPTERS[this.chapter], pages = ch.pages.length;
    const x = 152, w = W - x - 18, top = 24;
    root.add(title(s, x, top + 7, `${String(this.chapter + 1).padStart(2, '0')} — ${ch.name}`, 17, T.cyan).setFontStyle('600').setOrigin(0, 0.5));
    const g = s.add.graphics();
    g.lineStyle(0.5, C.cyan, 0.5).lineBetween(x, top + 16, x + w, top + 16);
    g.fillStyle(C.cyan, 1).fillRect(x, top + 15.5, 30, 1.25);
    root.add(g);
    let y = top + 21;
    for (const b of ch.pages[this.page]) y = this.block(root, b, x, y, w) + 3.5;
    if (pages > 1) {
      root.add(new Button(s, x + w - 92, H - 33, 44, 11, '◄ PRÉC.', { accent: C.cyan, font: 'ui', size: 5, state: this.page ? 'idle' : 'off', onClick: () => this.turn(-1) }));
      root.add(new Button(s, x + w - 46, H - 33, 44, 11, 'SUIV. ►', { accent: C.cyan, font: 'ui', size: 5, state: this.page < pages - 1 ? 'idle' : 'off', onClick: () => this.turn(1) }));
      root.add(bold(s, x + w - 98, H - 27.5, `PAGE ${this.page + 1}/${pages}`, 5, T.yellow).setOrigin(1, 0.5));
    }
    root.add(hints(s, W / 2, H - 12, [['↑ ↓ / 1-9', 'Chapitre'], ['← →', 'Page'], ['ÉCHAP', 'Fermer']], C.cyan));
    pinToCamera(root);
  }

  /** Draws one block from y; returns the y under it. */
  private block(root: Phaser.GameObjects.Container, b: Block, x: number, y: number, w: number): number {
    const s = this.scene;
    if ('h' in b) {
      const g = s.add.graphics();
      g.fillStyle(C.magenta, 1).fillPoints(cutPoly(x, y + 1.5, 2, 6, 0), true);
      root.add(g);
      const t = title(s, x + 5, y + 4.8, b.h.toUpperCase(), 10, T.magenta).setFontStyle('600').setOrigin(0, 0.5);
      root.add(t);
      return y + 10;
    }
    if ('p' in b) {
      const t = txt(s, x, y, b.p, 6, T.text).setWordWrapWidth(w).setLineSpacing(1.5);
      root.add(t);
      return y + t.height;
    }
    if ('tip' in b) {
      const t = txt(s, x + 30, y + 3, b.tip, 6, T.yellow).setWordWrapWidth(w - 36).setLineSpacing(1.5);
      const h = t.height + 6, g = s.add.graphics();
      g.fillStyle(C.yellow, 0.08).fillPoints(cutPoly(x, y, w, h, [0, 0, 4, 0]), true);
      g.fillStyle(C.yellow, 1).fillRect(x, y, 1.5, h);
      root.add([g, chip(s, x + 4, y + h / 2, 'ASTUCE', C.yellow, { filled: true, size: 4.5 }), t]);
      return y + h;
    }
    if ('keys' in b) {
      for (const [k, v] of b.keys) {
        root.add(keycap(s, x, y + 4, k, C.yellow, 5));
        root.add(txt(s, x + 92, y + 4, v, 6, T.text).setOrigin(0, 0.5));
        y += 10.5;
      }
      return y;
    }
    if ('list' in b) {
      for (const [k, v] of b.list) {
        root.add(bold(s, x, y, k, 5.5, T.cyan));
        const t = txt(s, x + 70, y - 0.5, v, 6, T.text).setWordWrapWidth(w - 70).setLineSpacing(1.5);
        root.add(t);
        y += Math.max(9, t.height + 1.5);
      }
      return y;
    }
    if ('zones' in b) {
      const cw = w / b.zones.length;
      b.zones.forEach((id, i) => {
        const sp = SPELLS[id];
        if (!sp) return;
        const cx = x + cw * i + cw / 2, g = s.add.graphics();
        g.fillStyle(C.deep, 0.8).fillPoints(cutPoly(cx - cw / 2 + 2, y, cw - 4, 40, [0, 4, 0, 4]), true);
        g.lineStyle(0.25, sp.color, 0.6).strokePoints(cutPoly(cx - cw / 2 + 2, y, cw - 4, 40, [0, 4, 0, 4]), true);
        root.add(g);
        root.add(zoneIcon(s, cx, y + 17, sp, sp.color));
        root.add(bold(s, cx, y + 31, sp.name.toUpperCase(), 4.5, hex(sp.color)).setOrigin(0.5));
        root.add(txt(s, cx, y + 36.5, zoneLabel(sp), 4.5, T.mute).setOrigin(0.5));
      });
      return y + 42;
    }
    let cx = x;
    for (const [label, col] of b.chips) {
      const c = chip(s, cx, y + 4, label, col, { size: 5 });
      root.add(c);
      cx += c.width + 4;
    }
    return y + 9;
  }
}
