import type { EndingTier } from '../core/ending';

/** One illustrated beat: a caption over the 3D street, who stands in it (the first one is the camera's focus), how close the camera is. */
export interface EndingBeat { text: string; cast: string[]; zoom: number }

export interface EndingText { chapter: string; beats: EndingBeat[]; reward: { title: string; line: string } }

/** All original writing. The cast uses avatar names of three/characters.ts. */
export const ENDINGS: Record<EndingTier, EndingText> = {
  normal: {
    chapter: 'CHAPITRE 1 // LE DISTRICT RESPIRE',
    beats: [
      { text: 'Le dernier verrou de Psy-Sec s\'effondre sur le bitume. La pluie lave le chrome, pas le silence qui suit.', cast: ['hero'], zoom: 2.8 },
      { text: 'Dans la rue, les néons se rallument un à un. Personne n\'applaudit : on rouvre simplement les volets.', cast: ['hero', 'res3', 'res6'], zoom: 2.1 },
      { text: 'Lo relève son rideau de fer et repose une louche sur le comptoir. Doc range son scalpel. Nyx coupe enfin le flux qui te traquait.', cast: ['lo', 'hero', 'doc', 'nyx'], zoom: 2.3 },
      { text: 'Tu as gardé la tête claire et les mains propres. Le district respire. Quelque part, un serveur te range déjà dans « menace prioritaire ».', cast: ['hero'], zoom: 1.6 },
    ],
    reward: { title: 'LISERÉ CYAN DÉBLOQUÉ', line: 'Ton héros s\'entoure d\'un liseré cyan néon. Réglable dans les options : LISERÉ DU HÉROS.' },
  },
  cyberhard: {
    chapter: 'CHAPITRE 2 // LE CHROME ET LE SILENCE',
    beats: [
      { text: 'L\'Exécuteur tombe, et ta tête résiste encore. Le chrome chante dans tes os, la psychose rôde au bord du signal.', cast: ['hero'], zoom: 2.8 },
      { text: 'Nyx lit tes constantes sur dix écrans. « Impossible. Tu aurais dû craquer au secteur trois. »', cast: ['nyx', 'hero'], zoom: 2.4 },
      { text: 'Doc te regarde sans rien dire, puis rit pour la première fois. « Tu es la preuve que je ne me trompais pas. »', cast: ['doc', 'hero', 'lo'], zoom: 2.3 },
      { text: 'Psy-Sec efface ton dossier et en ouvre un autre, plus épais. À l\'aube, les premiers avis de recherche tombent sur la ville.', cast: ['hero'], zoom: 1.6 },
    ],
    reward: { title: 'LISERÉ MAGENTA DÉBLOQUÉ', line: 'Ton héros s\'entoure d\'un liseré magenta néon. Réglable dans les options : LISERÉ DU HÉROS.' },
  },
  wanted: {
    chapter: 'CHAPITRE 3 // LÉGENDE DE LA RUE',
    beats: [
      { text: 'Ton visage couvre tous les murs de la ville. Drones, caméras, indics : chacun a tenté sa chance, et chacun est rentré bredouille.', cast: ['hero'], zoom: 2.8 },
      { text: 'Le quartier a monté la garde pour toi. Des gamins ont brouillé les caméras, des vendeurs ont menti aux patrouilles.', cast: ['hero', 'res3', 'res6', 'res1'], zoom: 2.1 },
      { text: 'Lo, Doc et Nyx collent ton avis de recherche au-dessus du comptoir. Récompense : une soupe, à vie.', cast: ['lo', 'doc', 'hero', 'nyx'], zoom: 2.3 },
      { text: 'Psy-Sec a perdu plus qu\'un Exécuteur : la peur a changé de camp. En ville, on ne dit plus « cyberpsycho ». On dit ton nom.', cast: ['hero'], zoom: 1.6 },
    ],
    reward: { title: 'LISERÉ OR DÉBLOQUÉ', line: 'Ton héros s\'entoure d\'un liseré or. Réglable dans les options : LISERÉ DU HÉROS.' },
  },
};
