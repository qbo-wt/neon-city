/**
 * Everything the building says about you. Lines react to the last run (who killed you, how far you
 * got), each main character tells their story one beat per run, and the last beat comes with a gift.
 * Every line starts with a capital, as the UI does.
 */
export type StoryNpc = 'lo' | 'doc' | 'nyx' | 'resident';

export interface LastRunView { victory: boolean; sector: number; killer?: string; killerName?: string; heat: number }

type Reaction = (r: LastRunView) => string | undefined;

/** First match wins. */
export const REACTIONS: Record<StoryNpc, Reaction[]> = {
  lo: [
    r => (r.victory ? 'Tu as eu l\'Exécuteur ? Assieds-toi, c\'est la maison qui régale.' : undefined),
    r => (r.killer === 'boss' ? 'L\'Exécuteur... Mon mari n\'est jamais revenu de chez Psy-Sec. Toi, tu es revenu. C\'est déjà ça.' : undefined),
    r => (r.killer === 'warden' ? 'Le Lieutenant t\'a eu ? Mange. Tu y retournes le ventre plein.' : undefined),
    r => (r.killer === 'psychosis' ? 'Tes mains tremblent encore. Trop de chrome, pas assez de bouillon.' : undefined),
    r => (r.sector <= 2 ? 'Tu n\'as même pas eu le temps d\'avoir faim. Prends ton temps, la rue ne bouge pas.' : undefined),
    r => (r.killerName ? `Battu par ${r.killerName}, secteur ${r.sector} ? Tsss. Mange, et ne recommence pas.` : undefined),
  ],
  doc: [
    r => (r.victory ? 'Tu reviens entier. Presque décevant, je n\'ai rien à recoudre.' : undefined),
    r => (r.heat >= 4 ? 'Avec ta notoriété, même les drones connaissent ton visage. Je double mes tarifs ?' : undefined),
    r => (r.killer === 'psychosis' ? 'Ta tête a lâché avant ton corps. Je peux ajouter du chrome... mais tu sais ce que ça coûte.' : undefined),
    r => (r.killer === 'warden' ? 'Le Lieutenant frappe fort. Travaille ta parade, je ne refais pas les crânes.' : undefined),
    r => (r.killer === 'boss' ? 'L\'Exécuteur coupe net. Proprement, au moins. J\'apprécie le travail bien fait.' : undefined),
    r => (r.killerName ? `${r.killerName} t'a ouvert comme une boîte de conserve. J'ai vu pire. Pas beaucoup.` : undefined),
  ],
  nyx: [
    r => (r.victory ? 'J\'ai vu ta signature passer sur le réseau Psy-Sec. Ils te cherchent. Bien joué.' : undefined),
    r => (r.killer === 'psychosis' ? 'Ton signal a décroché en plein combat. La psychose, c\'est du bruit. Il faut apprendre à le filtrer.' : undefined),
    r => (r.killer === 'hacker' ? 'Un netrunner pirate t\'a grillé ? Un amateur. Je vais trouver qui c\'est.' : undefined),
    r => (!r.victory ? `Ton signal s'est éteint au secteur ${r.sector}. Je l'ai vu sur mes écrans.` : undefined),
  ],
  resident: [
    r => (r.victory ? 'On raconte que tu as nettoyé tout le district. C\'est vrai ?' : undefined),
    r => (r.killer === 'psychosis' ? 'Paraît que tu as fait une crise en pleine rue. Repose-toi un peu.' : undefined),
    r => (r.killerName ? `Il paraît que ${r.killerName} t'a eu au secteur ${r.sector}. Ça arrive à tout le monde.` : undefined),
  ],
};

/** One beat per run; the last one gives credits. */
export const ARCS: Partial<Record<StoryNpc, { beats: string[]; gift: number }>> = {
  lo: {
    gift: 60,
    beats: [
      'Mon restaurant était au rez-de-chaussée, avant. Les Rats l\'ont racheté. Enfin, « racheté »...',
      'Mon mari réparait les implants des gamins du quartier. Gratuitement. Psy-Sec n\'aimait pas ça.',
      'Un soir, l\'Exécuteur est venu. Il a dit que mon mari était un cyberpsycho. Il n\'avait qu\'un bras en chrome.',
      'Je garde sa louche. C\'est idiot, mais elle me rassure quand j\'entends les sirènes.',
      'Tiens. Il gardait ça pour les jours difficiles. C\'est à toi, maintenant. Ramène-moi la tête de cet Exécuteur.',
    ],
  },
  doc: {
    gift: 80,
    beats: [
      'J\'étais chirurgien pour une corpo. Je réparais des cadres. Maintenant je répare des gens.',
      'Psy-Sec m\'a proposé un poste : classer les cyberpsychos. Je leur ai rendu leur stylo.',
      'Les implants ne rendent pas fou. C\'est la façon dont on les vend. Plus vite, plus fort. Jamais assez.',
      'Ce bras, je me le suis posé moi-même. Avec un miroir et beaucoup de whisky.',
      'J\'ai récupéré un lot de pièces sur un convoi Psy-Sec. Vends-les, ça paiera tes prochaines greffes.',
    ],
  },
  nyx: {
    gift: 70,
    beats: [
      'Je ne sors plus. Le réseau est plus grand que la ville, et bien moins sale.',
      'Psy-Sec a un serveur central. Chaque cyberpsycho abattu y laisse une trace. Des milliers.',
      'Ton signal neural est bizarre. Stable, alors que tu portes trop de chrome. Comment tu fais ?',
      'J\'ai trouvé ton nom dans leurs fichiers. Tu es classé « menace prioritaire ». Félicitations.',
      'J\'ai siphonné un compte de Psy-Sec. Prends ta part, ils ne le remarqueront même pas.',
    ],
  },
};

/** What the two bosses say: on entry (first time / again / they killed you / you beat them), at each phase, and when they fall. */
export const BOSS_LINES: Record<'warden' | 'boss', { first: string; again: string; killedYou: string; beaten: string; enraged: string; frenzy: string; death: string }> = {
  warden: {
    first: 'Un nouveau ? Ce secteur est à moi. Dégage, ou je te tonds.',
    again: 'Encore toi ? J\'ai gardé ta place sur le trottoir.',
    killedYou: 'Tu reviens te faire tondre ? J\'adore les habitués.',
    beaten: 'La dernière fois, tu as eu de la chance. Les Rats n\'oublient pas.',
    enraged: 'Tu commences à m\'énerver !',
    frenzy: 'LES RATS NE TOMBENT PAS !',
    death: 'Les Rats... se souviendront de toi...',
  },
  boss: {
    first: 'Sujet identifié. Cyberpsychose avancée. Protocole d\'élimination engagé.',
    again: 'Sujet récidiviste. Le protocole s\'adapte.',
    killedYou: 'Je t\'ai déjà effacé une fois. Je recommencerai.',
    beaten: 'Mise à jour terminée. Cette fois, tu restes au sol.',
    enraged: 'Anomalie détectée. Recalibrage.',
    frenzy: 'PURGE TOTALE.',
    death: 'Erreur... fatale...',
  },
};
