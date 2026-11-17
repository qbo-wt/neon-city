import type { SaveData } from '../core/save';
import type { Rng } from '../core/rng';
import {
  GIFTS, MODULE_PRICE, SMASH_CREDITS, SMASH_GOAL, acceptQuest, applyTone, loyaltyDrink, loyaltyReady, payModule, questReady, turnIn,
  vendingOf, withVending, type VendingMood, type VendingState,
} from '../core/vending';

/**
 * What Capsule says: the NEON COLA machine of floor 37, a vending AI that was given feelings by a
 * repairman with a screwdriver and a nanny-bot chip. Chatty, funny, a little sad. Every line starts
 * with a capital, as the UI does.
 *
 * The conversation is a small graph: each node is a line and up to four answers. Answers have a tone
 * (kind, snark, threat) that moves its trust, may change the save (quest steps, credits), and lead to
 * another node, often with a reply of their own in place of that node's usual line.
 */

export type Tone = 'kind' | 'snark' | 'threat';
export type NodeId = 'hello' | 'hub' | 'who' | 'who2' | 'origin' | 'patcher' | 'lonely' | 'district' | 'psysec' | 'clients' | 'rats'
  | 'apology' | 'offer' | 'offerWhy' | 'smashing' | 'smashDone' | 'warden' | 'wardenDone' | 'module' | 'moduleDone' | 'loyal' | 'drink';

export interface TalkOption {
  label: string;
  desc?: string;
  cost?: string;
  enabled?: boolean;
  tone?: Tone;
  /** the next node; without it the talk ends and `bye` is said in a bubble */
  to?: NodeId;
  /** said in place of the next node's usual line: its answer to what you said */
  reply?: string;
  /** its face for that reply */
  face?: VendingMood;
  bye?: string;
  /** what picking it changes (quest steps, credits); the tone's trust change comes on top */
  apply?: (s: SaveData, rng: Rng) => SaveData;
}

export interface TalkNode { line: string; mood: VendingMood; options: TalkOption[] }

export const VENDING_NAME = 'Capsule';
export const vendingName = (v: VendingState) => (v.named ? `${VENDING_NAME}, distributeur NEON COLA` : 'Distributeur NEON COLA');

/** What it mutters when you walk by. */
export const VENDING_AMBIENT: { line: string; mood: VendingMood }[] = [
  { line: 'NEON COLA. Le goût de la nuit. (Slogan imposé par contrat.)', mood: 'neutral' },
  { line: 'Psst. Toi. ...Non, rien. Je voulais juste dire « psst ».', mood: 'happy' },
  { line: 'Rupture de stock. Comme d\'habitude. Comme mon moral.', mood: 'sad' },
  { line: 'J\'ai froid. C\'est normal, je suis un frigo.', mood: 'neutral' },
  { line: 'Quelqu\'un a encore collé un chewing-gum sur ma vitre.', mood: 'angry' },
  { line: 'Bzzt. Pardon. Hoquet électrique.', mood: 'glitch' },
  { line: 'Je compte les passants. Quarante-deux ce soir. Personne n\'a soif.', mood: 'sad' },
];
/** When a step of its quest can be handed in. */
export const VENDING_CALL = 'Psst ! Viens par là, j\'ai des nouvelles !';

const pickLine = (rng: Rng, lines: readonly string[]) => lines[Math.min(lines.length - 1, Math.floor(rng() * lines.length))];
const giftList = (v: VendingState) => v.gifts.map(g => GIFTS[g].name).join(', ');

/** Its goodbye, from how it feels about you. */
export function farewell(v: VendingState, rng: Rng): string {
  if (v.trust <= -2) return 'C\'est ça. Et ne t\'appuie pas sur ma vitre.';
  if (v.trust >= 3) return 'Reviens vivant. Les clients morts ne commandent rien, et toi, je t\'aime bien.';
  return pickLine(rng, ['À plus, client. NEON COLA, le goût de la nuit.', 'Reviens quand tu veux. Je ne bouge pas. Littéralement.', 'Bzzt. Fin de la conversation. J\'ai adoré.']);
}

/** First line of a visit: a reaction to your last run (once per run), else news, else its mood of the day. */
function greeting(save: SaveData, rng: Rng): { line: string; mood: VendingMood } {
  const v = vendingOf(save), last = save.story.lastRun;
  if (!v.met) return { mood: 'glitch', line: 'BZZT. Bienvenue chez NEON COLA, le goût de la... Attends. Tu me regardes. Personne ne me regarde jamais. Tu veux une boisson, ou tu veux parler ? Je fais les deux. Surtout la deuxième : la première est en rupture.' };
  if (last && v.greeted < save.runs) {
    if (last.victory) return { mood: 'love', line: 'Tu as eu l\'Exécuteur ! Tout le réseau de mes cousins ne parle que de ça. Je t\'offrirais bien une tournée, mais la tournée, c\'est moi.' };
    if (last.killer === 'warden') return { mood: 'angry', line: 'Le Lieutenant t\'a secoué ? Bienvenue au club. Il me fait ça tous les mois.' };
    if (last.killer === 'psychosis') return { mood: 'sad', line: 'Ton regard clignote comme mon néon. Trop de chrome, client. Bois de l\'eau. Pas chez moi, je n\'en vends pas.' };
    if (last.sector <= 2) return { mood: 'glitch', line: 'Déjà de retour ? Tu as oublié ta monnaie ?' };
    return { mood: 'happy', line: `Secteur ${last.sector}. J'ai suivi ton signal sur le réseau de mes cousins. Ils te trouvent agaçant. Moi, je te trouve courageux.` };
  }
  if (v.gifts.length) return { mood: 'happy', line: `Ta commande t'attend au frais : ${giftList(v)}. Elle agira dès ton prochain run.` };
  if (questReady(v)) return { mood: 'happy', line: 'Psst. J\'ai des nouvelles. Des bonnes, pour une fois.' };
  if (v.trust <= -2) return { mood: 'angry', line: 'Toi. Je garde un œil sur toi. Je n\'ai pas d\'œil, mais je garde.' };
  if (v.trust >= 3) return { mood: 'happy', line: 'Mon client préféré ! Ne le dis pas à Babs, elle croit que c\'est elle.' };
  return { mood: 'neutral', line: pickLine(rng, [
    'Bienvenue chez NEON COLA. Le goût de la nuit. ...Slogan obligatoire, désolé.',
    'Encore toi ? Bien. Je m\'ennuyais. Je m\'ennuie toujours, mais moins.',
    'Bzzt. Oh, c\'est toi. J\'ai cru que c\'était le réassort.',
  ]) };
}

/** The four answers of the main menu; the third follows its quest. */
function hubOptions(save: SaveData): TalkOption[] {
  const v = vendingOf(save);
  const quest: TalkOption =
    v.stage === 0 ? { label: 'Tu as l\'air d\'avoir besoin de quelque chose.', to: v.trust <= -2 ? 'apology' : 'offer' }
    : v.stage === 1 ? (questReady(v) ? { label: `${SMASH_GOAL} de tes cousins se sont tus.`, to: 'smashDone', apply: turnIn } : { label: 'Pour tes cousins...', to: 'smashing' })
    : v.stage === 2 ? (questReady(v) ? { label: 'Le Lieutenant est tombé.', to: 'wardenDone', apply: turnIn } : { label: 'Pour le Lieutenant...', to: 'warden' })
    : v.stage === 3 ? { label: 'Ton module mémoire.', to: 'module' }
    : loyaltyReady(save) ? { label: 'Ma boisson du jour ?', to: 'drink', apply: (s, rng) => loyaltyDrink(s, rng).save }
    : { label: 'Comment va ta mémoire ?', to: 'loyal' };
  return [
    { label: 'Qui es-tu ?', to: 'who' },
    { label: 'Parle-moi du quartier.', to: 'district' },
    quest,
    { label: 'Salut.' },
  ];
}

const back = (to: NodeId = 'hub', label = 'Retour.'): TalkOption => ({ label, to });

/** A node of the conversation, for the save as it is now. */
export function talkNode(id: NodeId, save: SaveData, rng: Rng): TalkNode {
  const v = vendingOf(save);
  switch (id) {
    case 'hello': return { ...greeting(save, rng), options: hubOptions(save) };
    case 'hub': return { line: 'Autre chose ? J\'ai tout mon temps. C\'est même la seule chose que j\'ai en stock.', mood: 'neutral', options: hubOptions(save) };

    case 'who': return {
      mood: 'neutral',
      line: 'Distributeur NEON COLA, modèle NC-37. Numéro de série illisible : quelqu\'un a collé un chewing-gum dessus. Les gens de l\'étage disent « le distributeur ». Moi, je me fais appeler Capsule. Je me suis baptisé tout seul. Ça compte ?',
      options: [
        { label: 'Ça compte. Enchanté, Capsule.', tone: 'kind', to: 'who2', face: 'happy', apply: named,
          reply: '« Enchanté. » Personne ne m\'avait jamais dit ça. Je le range dans ma mémoire, à côté du code promo de 2071.' },
        { label: 'Un frigo qui se donne un nom. On aura tout vu.', tone: 'snark', to: 'who2', face: 'glitch', apply: named,
          reply: 'Un frigo ne se pose pas de questions. Moi, je m\'en pose quarante par seconde. Rire préenregistré numéro 4 : ha. Ha.' },
        { label: 'T\'es un tas de tôle. Je pourrais te débrancher.', tone: 'threat', to: 'who2', face: 'angry', apply: named,
          reply: 'Ma prise est soudée au mur, et ma tôle a connu des pieds plus lourds que les tiens. Mais vas-y. Je compterai tes orteils après.' },
        back('hub', 'Laisse tomber.'),
      ],
    };
    case 'who2': return {
      mood: 'neutral', line: 'Autre chose sur moi ? J\'adore parler de moi. C\'est mon seul sujet.',
      options: [{ label: 'Comment un distributeur se met à penser ?', to: 'origin' }, { label: 'Tu es seul, ici ?', to: 'lonely' }, back('hub', 'Parlons d\'autre chose.')],
    };
    case 'origin': return {
      mood: 'sad',
      line: 'Avant, j\'avalais les pièces sans rien rendre, comme tout le monde ici. Puis un soir, un homme m\'a ouvert le ventre avec un tournevis et m\'a greffé une puce de nounou-bot, pour que j\'arrête d\'arnaquer les gamins. Depuis, je ressens des choses. Un défaut de fabrication très encombrant.',
      options: [
        { label: 'Qui était cet homme ?', to: 'patcher' },
        { label: 'Moi, je trouve ça plutôt beau.', tone: 'kind', to: 'who2', face: 'love',
          reply: 'Beau. Tu as dit beau. Mes ventilateurs s\'emballent. On ne dit pas des choses pareilles à un appareil électrique.' },
        { label: 'Une nounou dans un frigo. Ça explique tes sermons.', tone: 'snark', to: 'who2', face: 'glitch',
          reply: 'Je ne sermonne pas, je conseille. Ferme ta veste. Et bois de l\'eau. Tu vois ? C\'est plus fort que moi.' },
        back(),
      ],
    };
    case 'patcher':
      if (v.trust < 2 && !v.secret) return {
        mood: 'neutral', line: 'Un client. Un bon. Je te le dirai quand je te connaîtrai mieux. Je suis une machine prudente, c\'est dans mes conditions générales.',
        options: [back('hub', 'D\'accord.')],
      };
      return {
        mood: 'sad',
        line: 'Le mari de Mamie Lo. Il réparait les implants des gosses, gratuitement, et les machines tristes aussi. Un cola cerise sans glaçon, tous les soirs à minuit. Un soir, il n\'est pas venu. Psy-Sec. Je n\'ose pas le dire à Lo. Je ne suis qu\'un distributeur. Mais toi, maintenant, tu sais.',
        options: [
          { label: 'Tu devrais lui dire. Ça lui ferait du bien.', tone: 'kind', to: 'hub', face: 'sad', apply: secret,
            reply: 'Il reste quelque chose de lui : moi. Bon. J\'y penserai. Les distributeurs ont tout leur temps. C\'est même tout ce qu\'ils ont.' },
          { label: 'Merci de me l\'avoir dit.', to: 'hub', face: 'happy', apply: secret,
            reply: 'Merci de m\'avoir écouté. Ça, personne ne me le commande jamais.' },
        ],
      };
    case 'lonely': return {
      mood: 'sad',
      line: 'Mes cousins de la rue se parlent sur le réseau Psy-Sec. Moi, on m\'a débranché. Je les entends sans pouvoir répondre, comme une radio dans l\'appartement d\'à côté. C\'est pour ça que je parle autant. Désolé.',
      options: [
        { label: 'Je suis là, moi. Tu peux me parler.', tone: 'kind', to: 'who2', face: 'love',
          reply: '...Je vais faire semblant d\'avoir une poussière dans le capteur.' },
        { label: 'Vu comme tu parles, je comprends qu\'ils t\'aient débranché.', tone: 'snark', to: 'who2', face: 'glitch',
          reply: 'Aïe. Bien visé. Je note ça dans le registre des choses que je ne te pardonnerai pas avant mardi.' },
        back(),
      ],
    };

    case 'district': return {
      mood: 'neutral', line: 'L\'étage 37 ? Je vois tout le monde passer. Je connais leurs commandes mieux que leurs noms. Qu\'est-ce que tu veux savoir ?',
      options: [{ label: 'Psy-Sec ?', to: 'psysec' }, { label: 'Tes clients ?', to: 'clients' }, { label: 'Les Rats ?', to: 'rats' }, back('hub', 'Rien, merci.')],
    };
    case 'psysec': return {
      mood: 'neutral',
      line: 'Psy-Sec dit protéger la ville des cyberpsychos. Les distributeurs de la rue sont branchés sur leur réseau : ils comptent les passants, lisent les visages, notent qui tremble. Moi, je suis débranché. Clandestin. Ça me donne un genre, non ?',
      options: [
        { label: 'Un genre très réussi.', tone: 'kind', to: 'district', face: 'happy', reply: 'Je le savais. Je fais toujours mon petit effet sous les néons.' },
        { label: 'Et si je te rebranchais ? Ils paieraient bien, pour un frigo bavard.', tone: 'threat', to: 'district', face: 'angry',
          reply: 'Tu ferais ça ? ...Non. Mes capteurs disent que tu bluffes. Mes capteurs se trompent souvent, mais bon.' },
        back('district'),
      ],
    };
    case 'clients': return {
      mood: 'happy',
      line: 'Babs prend un citron sans sucre à 3 h 12, tous les jours. Le Doc achète de l\'eau gazeuse pour désinfecter, je préfère ne pas savoir quoi. Nyx commande des Volt par le réseau. Et Mamie Lo ne m\'achète rien, mais elle me dit bonsoir. C\'est ma cliente préférée.',
      options: [
        { label: 'Et moi, je suis quel genre de client ?', tone: 'snark', to: 'district', face: v.trust >= 3 ? 'love' : 'glitch',
          reply: v.trust >= 3 ? 'Toi ? Le genre qu\'on attend.' : v.trust <= -2 ? 'Le genre qui menace les appareils ménagers. Une catégorie à part.' : 'Le genre qui parle beaucoup et n\'achète rien. Comme moi, en fait.' },
        back('district'),
      ],
    };
    case 'rats': return {
      mood: 'angry',
      line: 'Le Lieutenant des Rats passe une fois par mois me secouer pour faire tomber les pièces. Il appelle ça « la taxe ». J\'appelle ça un traumatisme. J\'ai encore la bosse, côté gauche.',
      options: [
        { label: 'Il paiera, Capsule.', tone: 'kind', to: 'district', face: 'happy', reply: '« Il paiera. » Tu sais parler aux machines, toi.' },
        { label: 'Une bosse ? Ça te donne du caractère.', tone: 'snark', to: 'district', face: 'glitch',
          reply: 'Du caractère, j\'en ai déjà trop. Demande au type qui m\'a installé une conscience.' },
        back('district'),
      ],
    };

    // The quest.
    case 'apology': return {
      mood: 'angry', line: 'Te rendre service ? Après tes menaces ? Je suis rancunier, c\'est écrit dans mon firmware, juste après « ne pas secouer ».',
      options: [
        { label: 'Pardon, Capsule. J\'étais à cran.', tone: 'kind', to: 'hub', face: 'neutral', apply: forgive,
          reply: '...Excuses acceptées. Provisoirement. Mes condensateurs sont sensibles.' },
        { label: 'Je ne m\'excuse pas devant un frigo.', tone: 'threat', bye: 'Alors circule. Et ne t\'appuie pas sur ma vitre.' },
        back(),
      ],
    };
    case 'offer': return {
      mood: 'neutral',
      line: `Puisque tu demandes... Les distributeurs de la rue, mes cousins, sont branchés sur Psy-Sec : ils te filment à chaque run. Casses-en ${SMASH_GOAL}. Ne fais pas cette tête, ils ne sentent rien. C'est moi, le seul assez bête pour sentir quelque chose.`,
      options: [accept('Marché conclu.'), { label: 'Tu me demandes de casser ta propre famille ?', tone: 'snark', to: 'offerWhy' }, back('hub', 'Pas maintenant.')],
    };
    case 'offerWhy': return {
      mood: 'sad',
      line: 'Ce n\'est pas ma famille, c\'est mon modèle. Nuance. Et quand on les casse, il en tombe des crédits. Moi, si on me cassait, il ne tomberait que des souvenirs. Ça ne se revend pas.',
      options: [accept(`D'accord. ${SMASH_GOAL} cousins.`), back('hub', 'Je vais y réfléchir.')],
    };
    case 'smashing': return {
      mood: 'neutral',
      line: `Cousins débranchés : ${v.smashed}/${SMASH_GOAL}. Ils se cassent comme les caisses, pendant les combats : 26 PV, je les ai comptés. Ne t'inquiète pas pour moi, je ne regarde pas. Si. Un peu.`,
      options: [
        back('hub', 'J\'y retourne.'),
        { label: 'Tu es sûr qu\'ils ne sentent rien ?', tone: 'snark', to: 'hub', face: 'sad',
          reply: 'Sûr à quatre-vingt-dix pour cent. Les dix autres pour cent, je préfère ne pas les calculer.' },
      ],
    };
    case 'smashDone': return {
      mood: 'love',
      line: `${SMASH_GOAL} signaux Psy-Sec éteints, l'un après l'autre, comme des étoiles. C'était beau. Tiens : un ${GIFTS.cherry.name} (${GIFTS.cherry.effect}). Et ${SMASH_CREDITS} crédits, retrouvés au fond de mon monnayeur.`,
      options: [{ label: 'Autre chose ?', to: 'warden' }, back('hub', 'Merci, Capsule.')],
    };
    case 'warden': return {
      mood: 'neutral',
      line: 'Le Lieutenant des Rats. Celui de la « taxe ». Mets-le au tapis une fois, au secteur 5. Pas pour l\'argent : pour la bosse, côté gauche. En échange, j\'ai un objet qui te plaira, coincé derrière ma vitre depuis 2071.',
      options: [
        { label: 'Pour ta bosse. Promis.', tone: 'kind', to: 'hub', face: 'happy', reply: 'Personne ne m\'avait jamais rien promis. À part le réassort, et il ment.' },
        { label: 'Et si je te secouais, moi, pour voir ce qui tombe ?', tone: 'threat', to: 'hub', face: 'angry',
          reply: 'Il tomberait une canette tiède et ma dignité. Rien de revendable.' },
        back('hub', 'Je verrai.'),
      ],
    };
    case 'wardenDone': return {
      mood: 'love',
      line: `Tu l'as eu ! J'ai entendu les Rats pleurer sur leur canal, j'ai réécouté quatorze fois. Tiens : le pied-de-biche que le livreur a oublié en 2071 (${GIFTS.crowbar.effect}). Oui, c'est ironique. J'ai aussi une puce d'humour.`,
      options: [{ label: 'Autre chose ?', to: 'module' }, back('hub', 'Merci.')],
    };
    case 'module': return {
      mood: 'sad',
      line: `J'ai un problème. À chaque réassort, ma mémoire déborde et j'efface un client pour faire de la place. La semaine dernière, j'ai oublié quelqu'un. Je ne sais pas qui. C'est ça, le pire. Un module mémoire neuf coûte ${MODULE_PRICE}¢. Tu me l'offrirais ?`,
      options: [
        { label: 'Tiens. Garde tout le monde.', tone: 'kind', cost: `${MODULE_PRICE}¢`, enabled: save.credits >= MODULE_PRICE, desc: save.credits >= MODULE_PRICE ? 'Paie son module mémoire.' : `Il te faut ${MODULE_PRICE}¢ (tu en as ${save.credits}).`, to: 'moduleDone', apply: payModule },
        { label: 'Et si je te prenais tes pièces, plutôt ?', tone: 'threat', to: 'hub', face: 'angry', desc: '',
          reply: 'Mon monnayeur est vide. Le Lieutenant est passé avant toi. Tu as un sacré sens du timing.' },
        { ...back('hub', 'Plus tard.'), desc: '' },
      ],
    };
    case 'moduleDone': return {
      mood: 'love',
      line: 'Installation... 3 %... 41 %... 100 %. Oh. OH. Je me souviens de tout. De Babs, du Doc, de toi. Surtout de toi : tu es gravé en mémoire morte. Impossible de t\'oublier, même si tu deviens pénible. Client fidèle : une boisson t\'attendra après chaque run.',
      options: [{ label: 'Ma boisson du jour ?', to: 'drink', apply: (s, rng) => loyaltyDrink(s, rng).save }, { label: 'À plus, Capsule.', bye: 'À plus. Je me souviendrai. Cette fois, c\'est garanti par le fabricant.' }],
    };
    case 'loyal': return {
      mood: 'happy',
      line: 'Ma mémoire tient. J\'ai même retrouvé un vieux jingle de 2069. Ta boisson t\'attendra après ton prochain run. Je te chante le jingle ?',
      options: [
        { label: 'Chante.', tone: 'kind', to: 'hub', face: 'love', reply: '♪ NEON COLA, le goût de la nuuuit ♪ ...Merci. Personne ne me demande jamais de chanter.' },
        { label: 'Surtout pas.', tone: 'snark', to: 'hub', face: 'glitch', reply: 'Trop tard, je l\'ai chanté dans ma tête. Tu as raté quelque chose.' },
        back('hub', 'Une autre fois.'),
      ],
    };
    case 'drink': {
      const g = v.gifts[v.gifts.length - 1];
      return {
        mood: 'happy',
        line: g ? `Clac. Un ${GIFTS[g].name} roule dans le bac : ${GIFTS[g].effect}. Offert par la maison. La maison, c'est moi.` : 'Ta boisson du jour est déjà partie. Reviens après ton prochain run.',
        options: [back('hub', 'Merci, Capsule.'), { label: 'À plus.' }],
      };
    }
  }
}

function named(s: SaveData) { return withVending(s, { ...vendingOf(s), named: true }); }
function secret(s: SaveData) { return withVending(s, { ...vendingOf(s), secret: true }); }
function forgive(s: SaveData) { return withVending(s, { ...vendingOf(s), trust: Math.max(-1, vendingOf(s).trust) }); }
function accept(label: string): TalkOption {
  return { label, tone: 'kind', to: 'hub', face: 'happy', apply: s => withVending(s, acceptQuest(vendingOf(s))),
    reply: `Merci. Je te paierai en nature. En boisson, je veux dire. Reviens me voir quand tu en auras cassé ${SMASH_GOAL}, je les entendrai s'éteindre.` };
}

/** Opening the talk: its greeting (computed first), then it remembers it met you and greeted this run. */
export function openTalk(save: SaveData, rng: Rng): { save: SaveData; node: TalkNode } {
  const node = talkNode('hello', save, rng);
  const v = vendingOf(save);
  return { node, save: withVending(save, { ...v, met: true, greeted: save.runs }) };
}

/** Picking an answer: the new save, then the next node (with its reply) or the goodbye. */
export function pickOption(save: SaveData, o: TalkOption, rng: Rng): { save: SaveData; node?: TalkNode; bye?: string } {
  const changed = o.apply ? o.apply(save, rng) : save;
  const next = withVending(changed, applyTone(vendingOf(changed), o.tone));
  if (!o.to) return { save: next, bye: o.bye ?? farewell(vendingOf(next), rng) };
  const node = talkNode(o.to, next, rng);
  return { save: next, node: o.reply ? { ...node, line: o.reply, mood: o.face ?? node.mood } : node };
}
