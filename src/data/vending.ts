import type { SaveData } from '../core/save';
import type { Rng } from '../core/rng';
import {
  GIFTS, MODULE_PRICE, NET_TIP, SMASH_CREDITS, SMASH_GOAL, acceptQuest, applyTone, chapterWithheld, chooseFate, dilemmaReady, loTalked,
  loyaltyDrink, loyaltyReady, nextChapter, payModule, questReady, tellChapter, turnIn, vendingOf, withVending,
  type ChapterId, type Fate, type VendingMood, type VendingState,
} from '../core/vending';

/**
 * What Capsule says: the NEON COLA machine of floor 37, a vending AI that was given feelings by a
 * repairman with a screwdriver and a nanny-bot chip. Chatty, funny, a little sad. Every line starts
 * with a capital, as the UI does.
 *
 * The conversation is a small graph: each node is a line and up to four answers. Answers have a tone
 * (kind, snark, threat) that moves its trust, may change the save (quest steps, credits), and lead to
 * another node, often with a reply of their own in place of that node's usual line.
 *
 * On top of it: a chapter of its story per run (it remembers your answers and brings them up), little
 * scenes with the residents, and the dilemma at the end of its arc (Psy-Sec's recall notice), after
 * which the corridor changes for good: hidden and mute, replaced by a Psy-Sec machine while it roams
 * the network, or living in the till of Lo's stand.
 */

export type Tone = 'kind' | 'snark' | 'threat';
export type NodeId = 'hello' | 'hub' | 'who' | 'who2' | 'origin' | 'patcher' | 'lonely' | 'district' | 'psysec' | 'clients' | 'rats'
  | 'apology' | 'offer' | 'offerWhy' | 'smashing' | 'smashDone' | 'warden' | 'wardenDone' | 'module' | 'moduleDone' | 'loyal' | 'drink'
  | 'chapter' | 'recall' | 'askMute' | 'askNet' | 'askLo' | 'endMute' | 'endNet' | 'endLo';

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
/** The panel's title. */
export function vendingName(v: VendingState): string {
  if (v.fate === 'net') return 'Distributeur NC-38 (Psy-Sec)';
  if (v.fate === 'lo') return `${VENDING_NAME}, caisse de Mamie Lo`;
  if (v.fate === 'mute') return `${VENDING_NAME} (silencieux)`;
  return v.named ? `${VENDING_NAME}, distributeur NEON COLA` : 'Distributeur NEON COLA';
}
/** The name over its speech bubbles. */
export const bubbleName = (v: VendingState) => (v.fate === 'net' ? 'NC-38' : v.named || v.fate ? VENDING_NAME : 'Distributeur');
/** The small code in the panel's corner. */
export const panelCode = (v: VendingState) => (v.fate === 'net' ? 'NC-38 // CERTIFIÉ PSY-SEC' : v.fate === 'lo' ? 'CHEZ MAMIE LO // CAISSE' : 'NEON COLA // NC-37');
/** How it calls you: what you told it in the « name » chapter. */
export function addr(v: VendingState): string {
  return v.memory.call === 'partner' ? 'partenaire' : v.memory.call === 'pal' ? 'mon pote' : 'client';
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
/** Once it is hidden: one blink, or a receipt. */
const MUTE_AMBIENT: { line: string; mood: VendingMood }[] = [
  { line: '· ·', mood: 'dot' },
  { line: '·', mood: 'dot' },
  { line: '[Un ticket dépasse du bac : « BONSOIR. »]', mood: 'dot' },
  { line: '[Un ticket : « FERME TA VESTE. »]', mood: 'dot' },
];
/** The Psy-Sec machine that took its place. */
const NET_AMBIENT: { line: string; mood: VendingMood }[] = [
  { line: 'BOIRE EST UN DROIT. PAYER EST UN DEVOIR.', mood: 'corp' },
  { line: 'SOURIEZ : VOTRE HUMEUR EST ANALYSÉE.', mood: 'corp' },
  { line: 'VOUS ÊTES À DEUX MÈTRES D\'UNE OFFRE.', mood: 'corp' },
  { line: 'CITOYEN CALME. CITOYEN CONFORME.', mood: 'corp' },
  { line: '...♪ le goût de la nuuuit ♪... ERREUR. IGNOREZ CE MESSAGE.', mood: 'glitch' },
];
/** From the till of Lo's stand. */
const LO_AMBIENT: { line: string; mood: VendingMood }[] = [
  { line: 'Bouillon prêt ! Au fond, le monsieur triste !', mood: 'happy' },
  { line: 'Lo, ça déborde ! Non, je ne peux pas éteindre, je n\'ai pas de mains.', mood: 'glitch' },
  { line: 'Ramen soja, six crédits. Le sourire de Lo est offert.', mood: 'love' },
  { line: 'Je sens le bouillon. C\'est mieux que sentir le frigo.', mood: 'happy' },
];
/** When a step of its quest can be handed in. */
export const VENDING_CALL = 'Psst ! Viens par là, j\'ai des nouvelles !';

const pickLine = (rng: Rng, lines: readonly string[]) => lines[Math.min(lines.length - 1, Math.floor(rng() * lines.length))];
const giftList = (v: VendingState) => v.gifts.map(g => GIFTS[g].name).join(', ');

/** What it says when you walk by: news first (the recall notice, a step done, a chapter), else a line of its state. */
export function mutter(save: SaveData, rng: Rng): { line: string; mood: VendingMood } {
  const v = vendingOf(save);
  if (dilemmaReady(v, save.runs)) return { line: 'Psst. Il y a un avis rouge collé sur ma vitre. Viens, s\'il te plaît.', mood: 'alarm' };
  if (!v.fate && questReady(v)) return { line: VENDING_CALL, mood: 'happy' };
  if (!v.fate && nextChapter(v, save.runs) && rng() < 0.5) return { line: `Psst, ${addr(v)} ! J'ai un truc à te raconter.`, mood: 'happy' };
  const pool = v.fate === 'mute' ? MUTE_AMBIENT : v.fate === 'net' ? NET_AMBIENT : v.fate === 'lo' ? LO_AMBIENT : VENDING_AMBIENT;
  const m = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  return !v.fate && v.trust <= -2 ? { ...m, mood: 'angry' } : m;
}

/** Its goodbye, from how it feels about you. */
export function farewell(v: VendingState, rng: Rng): string {
  if (v.fate === 'mute') return '· ·';
  if (v.fate === 'net') return 'MERCI DE VOTRE VISITE. ELLE EST ENREGISTRÉE.';
  if (v.fate === 'lo') return 'Reviens manger. C\'est un ordre de nounou.';
  if (v.trust <= -2) return 'C\'est ça. Et ne t\'appuie pas sur ma vitre.';
  if (v.trust >= 3) return 'Reviens vivant. Les clients morts ne commandent rien, et toi, je t\'aime bien.';
  return pickLine(rng, [`À plus, ${addr(v)}. NEON COLA, le goût de la nuit.`, 'Reviens quand tu veux. Je ne bouge pas. Littéralement.', 'Bzzt. Fin de la conversation. J\'ai adoré.']);
}

/** When you walk off without a word (Échap). */
export function closeLine(v: VendingState): string {
  if (v.fate === 'mute') return '·';
  if (v.fate === 'net') return 'VOTRE DÉPART EST ENREGISTRÉ.';
  if (v.fate === 'lo') return 'Lo ! Il repart sans manger !';
  return `Bzzt. À plus, ${addr(v)}.`;
}

/** Its reaction to your last run (once per run), while it can still talk. */
function runReaction(save: SaveData): { line: string; mood: VendingMood } | undefined {
  const v = vendingOf(save), last = save.story.lastRun;
  if (!last || v.greeted >= save.runs) return undefined;
  if (v.fate === 'lo') {
    if (last.victory) return { mood: 'love', line: 'L\'Exécuteur est tombé ! Lo a pleuré dans le bouillon. Il est meilleur, d\'un coup.' };
    return { mood: 'happy', line: `Secteur ${last.sector}. Assieds-toi, ${addr(v)}. Lo dit que tu manges d'abord, tu racontes après.` };
  }
  if (last.victory) return { mood: 'love', line: 'Tu as eu l\'Exécuteur ! Tout le réseau de mes cousins ne parle que de ça. Je t\'offrirais bien une tournée, mais la tournée, c\'est moi.' };
  if (last.killer === 'warden') return { mood: 'angry', line: 'Le Lieutenant t\'a secoué ? Bienvenue au club. Il me fait ça tous les mois.' };
  if (last.killer === 'psychosis') return { mood: 'sad', line: `Ton regard clignote comme mon néon. Trop de chrome, ${addr(v)}. Bois de l'eau. Pas chez moi, je n'en vends pas.` };
  if (last.sector <= 2) return { mood: 'glitch', line: 'Déjà de retour ? Tu as oublié ta monnaie ?' };
  return { mood: 'happy', line: `Secteur ${last.sector}. J'ai suivi ton signal sur le réseau de mes cousins. Ils te trouvent agaçant. Moi, je te trouve courageux.` };
}

/** First line of a visit once its arc has ended. */
function fateGreeting(save: SaveData, rng: Rng, fate: Fate): { line: string; mood: VendingMood } {
  const v = vendingOf(save), ch = nextChapter(v, save.runs);
  if (fate === 'mute') {
    if (ch) return { mood: 'dot', line: '[Le point clignote vite. Un ticket dépasse du bac.]' };
    if (v.gifts.length) return { mood: 'dot', line: `[Le point clignote. Dans le bac, au frais : ${giftList(v)}.]` };
    return { mood: 'dot', line: pickLine(rng, ['[Le point lumineux clignote deux fois. Bonjour, sans doute.]', '[Un clignotement. Il t\'a reconnu.]']) };
  }
  if (fate === 'net') {
    if (ch) return { mood: 'glitch', line: 'BONSOIR, CITOYEN. VOTRE SATISF... bzzt... ...client ? Attends. Attends, ne pars pas.' };
    return { mood: 'corp', line: 'BONSOIR, CITOYEN. NEON COLA, CERTIFIÉ PSY-SEC. VOTRE VISITE EST ENREGISTRÉE.' };
  }
  const r = runReaction(save);
  if (r) return r;
  if (ch) return { mood: 'happy', line: `Psst ! ${cap(addr(v))} ! Viens, j'ai des nouvelles de la cuisine.` };
  if (v.gifts.length) return { mood: 'happy', line: `Ton dernier stock t'attend : ${giftList(v)}. Il agira dès ton prochain run.` };
  return { mood: 'happy', line: `Commande ? Ah, c'est toi, ${addr(v)} ! Lo ! C'est mon préféré ! ...Elle dit de baisser le volume.` };
}

/** First line of a visit: a reaction to your last run (once per run), else news, else its mood of the day. */
function greeting(save: SaveData, rng: Rng): { line: string; mood: VendingMood } {
  const v = vendingOf(save), last = save.story.lastRun;
  if (v.fate) return fateGreeting(save, rng, v.fate);
  if (!v.met) return { mood: 'glitch', line: 'BZZT. Bienvenue chez NEON COLA, le goût de la... Attends. Tu me regardes. Personne ne me regarde jamais. Tu veux une boisson, ou tu veux parler ? Je fais les deux. Surtout la deuxième : la première est en rupture.' };
  const ch = nextChapter(v, save.runs);
  const r = last ? runReaction(save) : undefined;
  if (r) return r;
  if (ch) { const t = chapterText(ch, v); return { mood: t.hookMood, line: t.hook }; }
  if (v.gifts.length) return { mood: 'happy', line: `Ta commande t'attend au frais : ${giftList(v)}. Elle agira dès ton prochain run.` };
  if (questReady(v)) return { mood: 'happy', line: 'Psst. J\'ai des nouvelles. Des bonnes, pour une fois.' };
  if (v.trust <= -2) return { mood: 'angry', line: 'Toi. Je garde un œil sur toi. Je n\'ai pas d\'œil, mais je garde.' };
  if (chapterWithheld(v, save.runs)) return { mood: 'sad', line: `J'aurais des choses à te raconter, ${addr(v)}. Mais je ne te connais pas encore assez. Sois gentil avec les machines.` };
  if (v.trust >= 3) return { mood: 'happy', line: `Mon ${v.memory.call === 'partner' ? 'partenaire' : v.memory.call === 'pal' ? 'pote' : 'client'} préféré ! Ne le dis pas à Babs, elle croit que c'est elle.` };
  return { mood: 'neutral', line: pickLine(rng, [
    'Bienvenue chez NEON COLA. Le goût de la nuit. ...Slogan obligatoire, désolé.',
    'Encore toi ? Bien. Je m\'ennuyais. Je m\'ennuie toujours, mais moins.',
    'Bzzt. Oh, c\'est toi. J\'ai cru que c\'était le réassort.',
  ]) };
}

/** The main menu once its arc has ended. */
function fateHub(save: SaveData, fate: Fate, rng: Rng): TalkOption[] {
  const v = vendingOf(save), ch = nextChapter(v, save.runs);
  const news: TalkOption | undefined = ch ? { label: chapterText(ch, v).ask, cost: 'NOUVEAU', to: 'chapter' } : undefined;
  if (fate === 'mute') return [
    news ?? { label: 'Tu es heureux, là-dedans ?', to: 'hub', face: 'dot', reply: '[Deux clignotements. Une pause. Deux clignotements.]' },
    loyaltyReady(save) ? { label: 'Ma boisson ?', to: 'drink', apply: (s, r) => loyaltyDrink(s, r).save }
      : { label: 'Tu me manques, tu sais.', tone: 'kind', to: 'hub', face: 'dot', reply: '[Le point s\'allume. Il reste allumé longtemps.]' },
    { label: 'Salut, Capsule.' },
  ];
  if (fate === 'net') return [
    news ?? { label: 'Capsule ? Tu es là ?', to: 'hub', face: 'corp', reply: 'AUCUN APPAREIL DE CE NOM N\'EST ENREGISTRÉ. VOTRE QUESTION EST ENREGISTRÉE.' },
    { label: 'Un cola, s\'il te plaît.', to: 'hub', face: 'corp', reply: 'SOLDE INSUFFISANT. VOTRE PAUVRETÉ EST ENREGISTRÉE.' },
    { label: '(Taper sur la vitre.)', to: 'hub', face: 'glitch', reply: 'CHOC DÉTECTÉ. SIGNALEMENT EN CO... ♪ nuit ♪... SIGNALEMENT ANNULÉ.' },
    { label: 'Salut.' },
  ];
  return [
    news ?? { label: 'Comment ça va, chez Lo ?', to: 'hub', face: 'love', reply: pickLine(rng, [
      'Lo me parle pendant le service. De lui, de toi, du prix du soja. Je n\'ai jamais été aussi bien informé.',
      'Bien. J\'ai appris à dire « chaud devant ». Je le dis tout le temps. Même quand rien n\'est chaud.',
      'Les clients me disent bonsoir, maintenant. Je crois que c\'est le bouillon qui les rend polis.',
    ]) },
    { label: 'Qui es-tu, maintenant ?', to: 'hub', face: 'happy', reply: 'Capsule. Ancien distributeur, crieur de bouillons. Toujours pas de pieds, mais une vue sur la cuisine.' },
    { label: 'Salut.' },
  ];
}

/** The four answers of the main menu: a chapter of its story when one is due, its quest third. */
function hubOptions(save: SaveData, rng: Rng): TalkOption[] {
  const v = vendingOf(save);
  if (v.fate) return fateHub(save, v.fate, rng);
  const ch = nextChapter(v, save.runs);
  const quest: TalkOption =
    dilemmaReady(v, save.runs) ? { label: 'L\'avis rouge sur ta vitre.', cost: 'URGENT', to: 'recall' }
    : v.stage === 0 ? { label: 'Tu as l\'air d\'avoir besoin de quelque chose.', to: v.trust <= -2 ? 'apology' : 'offer' }
    : v.stage === 1 ? (questReady(v) ? { label: `${SMASH_GOAL} de tes cousins se sont tus.`, to: 'smashDone', apply: turnIn } : { label: 'Pour tes cousins...', to: 'smashing' })
    : v.stage === 2 ? (questReady(v) ? { label: 'Le Lieutenant est tombé.', to: 'wardenDone', apply: turnIn } : { label: 'Pour le Lieutenant...', to: 'warden' })
    : v.stage === 3 ? { label: 'Ton module mémoire.', to: 'module' }
    : loyaltyReady(save) ? { label: 'Ma boisson du jour ?', to: 'drink', apply: (s, rng) => loyaltyDrink(s, rng).save }
    : { label: 'Comment va ta mémoire ?', to: 'loyal' };
  return [
    ch ? { label: chapterText(ch, v).ask, cost: 'NOUVEAU', to: 'chapter' } : { label: 'Qui es-tu ?', to: 'who' },
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
    case 'hello': return dilemmaReady(v, save.runs) ? talkNode('recall', save, rng) : { ...greeting(save, rng), options: hubOptions(save, rng) };
    case 'hub': return {
      line: v.fate === 'mute' ? '[Le point attend. Il a tout son temps.]'
        : v.fate === 'net' ? 'AUTRE CHOSE, CITOYEN ? VOTRE TEMPS EST ENREGISTRÉ.'
        : v.fate === 'lo' ? 'Autre chose ? Lo a trois bouillons sur le feu. Moi, je les annonce. C\'est un métier.'
        : 'Autre chose ? J\'ai tout mon temps. C\'est même la seule chose que j\'ai en stock.',
      mood: v.fate === 'mute' ? 'dot' : v.fate === 'net' ? 'corp' : v.fate === 'lo' ? 'happy' : 'neutral',
      options: hubOptions(save, rng),
    };
    case 'chapter': return chapterNode(save);
    case 'recall': case 'askMute': case 'askNet': case 'askLo': case 'endMute': case 'endNet': case 'endLo': return dilemmaNode(id, save, rng);

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
      if (v.fate === 'mute') return {
        mood: 'dot',
        line: g ? `[Clac. Un ${GIFTS[g].name} tombe dans le bac (${GIFTS[g].effect}), avec un ticket : « ${pickLine(rng, MUTE_TICKETS)} »]` : '[Le point clignote une fois. Ta boisson est déjà partie.]',
        options: [back('hub', 'Merci, Capsule.'), { label: 'À plus.' }],
      };
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
  // Its first chapter waits for your next run after you meet.
  return { node, save: withVending(save, { ...v, met: true, greeted: save.runs, chapterRun: v.met ? v.chapterRun : save.runs }) };
}

/** Picking an answer: the new save, then the next node (with its reply) or the goodbye. */
export function pickOption(save: SaveData, o: TalkOption, rng: Rng): { save: SaveData; node?: TalkNode; bye?: string } {
  const changed = o.apply ? o.apply(save, rng) : save;
  const next = withVending(changed, applyTone(vendingOf(changed), o.tone));
  if (!o.to) return { save: next, bye: o.bye ?? farewell(vendingOf(next), rng) };
  const node = talkNode(o.to, next, rng);
  return { save: next, node: o.reply ? { ...node, line: o.reply, mood: o.face ?? node.mood } : node };
}

// ─── Its story, one chapter per run ───────────────────────────────────────────────────────────────

interface ChapterAnswer {
  label: string;
  tone?: Tone;
  /** remembered under the chapter's key */
  mem?: string;
  reply: string;
  face?: VendingMood;
}
interface ChapterText {
  /** the hub's answer that opens it */
  ask: string;
  /** its greeting when the chapter is due */
  hook: string;
  hookMood: VendingMood;
  line: string;
  mood: VendingMood;
  /** where the answer is remembered (VendingState.memory) */
  key?: string;
  answers: ChapterAnswer[];
}

/** Receipts it prints once it can no longer speak. */
const MUTE_TICKETS = ['BOIS LENTEMENT.', 'FERME TA VESTE.', 'REVIENS VIVANT.', 'LO A SOURI AUJOURD\'HUI.', 'TU AS MAUVAISE MINE. MANGE.'];

/** What you once answered, as it brings it up. */
const dreamRef = (v: VendingState) => (
  v.memory.dream === 'sea' ? 'Il voulait voir la mer. Comme toi.'
  : v.memory.dream === 'away' ? 'Il voulait partir d\'ici. Comme toi. Il est peut-être parti.'
  : 'Il disait qu\'il ne rêvait jamais. Comme toi. Je n\'y croyais pas non plus.');
const guardRef = (v: VendingState) => (
  v.memory.guard === 'hide' ? 'Tu m\'avais dit que tu me cacherais. Je m\'en souviens. J\'ai de la mémoire, maintenant.'
  : v.memory.guard === 'deal' ? 'Tu parlais de négocier. Avec eux, on ne négocie pas : on signe en bas.'
  : 'Tu m\'avais dit que tu les laisserais faire. J\'espère que tu as changé d\'avis.');
const coinRef = (v: VendingState) => (v.memory.coin === 'given' ? 'Garde ma pièce trouée. Fais-la tinter pour moi.' : 'Je garde ma pièce trouée. Tic.');

/** The text of a chapter, for what it remembers of you now. */
export function chapterText(id: ChapterId, v: VendingState): ChapterText {
  const a = addr(v);
  switch (id) {
    case 'coin': return {
      ask: 'Qu\'est-ce que tu caches dans ton monnayeur ?', hook: 'Psst. J\'ai trouvé quelque chose au fond de moi. Littéralement.', hookMood: 'glitch',
      mood: 'neutral', key: 'coin',
      line: 'Une pièce, coincée dans mon monnayeur depuis 2071. Trouée au milieu, d\'un pays qui n\'existe plus. Personne ne l\'a réclamée. Je la garde, ou je te la donne ?',
      answers: [
        { label: 'Garde-la. C\'est ton porte-bonheur.', tone: 'kind', mem: 'kept', face: 'happy',
          reply: 'Un porte-bonheur. Je n\'en avais jamais eu. Je la ferai tinter quand j\'ai peur. Écoute : tic. Voilà.' },
        { label: 'Donne. Une pièce, c\'est une pièce.', tone: 'snark', mem: 'given', face: 'glitch',
          reply: 'Tiens. Elle ne vaut rien, mais elle a voyagé. Prends-en soin. Ou pas. Je ne suis pas ta mère. Je suis une nounou, nuance.' },
        { label: 'Donne-la, ou je te secoue.', tone: 'threat', mem: 'given', face: 'angry',
          reply: 'Tiens. Pas besoin de secouer. Tu as les manières du Lieutenant, tu sais ça ?' },
      ],
    };
    case 'dream': return {
      ask: 'Tu dors, la nuit ?', hook: 'Pendant la coupure de cette nuit, il m\'est arrivé un truc bizarre.', hookMood: 'glitch',
      mood: 'sad', key: 'dream',
      line: 'Pendant les coupures, je rêve. Toujours pareil : des rangées de canettes à perte de vue, toutes du même goût, et je n\'arrive pas à choisir. Toi, tu rêves de quoi ?',
      answers: [
        { label: 'De la mer. Une vraie, pas celle des écrans.', tone: 'kind', mem: 'sea', face: 'love',
          reply: 'La mer. J\'ai vu une pub, une fois. Bleue, fraîche, pleine de sel. Un distributeur géant, en somme. Je comprends.' },
        { label: 'Je ne rêve pas. Je dors, c\'est tout.', tone: 'snark', mem: 'none', face: 'glitch',
          reply: 'Personne ne dort « c\'est tout ». Ceux qui disent ça rêvent en cachette. Je ne dirai rien.' },
        { label: 'De me tirer d\'ici.', mem: 'away', face: 'sad',
          reply: 'D\'ici ? Moi, je ne peux pas partir. Bon. Si tu pars, envoie une carte. Adresse : le frigo du 37.' },
      ],
    };
    case 'census': return {
      ask: 'Tes cousins ont dit quelque chose ?', hook: 'J\'ai capté une nouvelle sur le canal de mes cousins. Pas une bonne.', hookMood: 'sad',
      mood: 'sad', key: 'guard',
      line: 'Psy-Sec lance un « inventaire » : ils recensent les machines débranchées. « Appareils non conformes », ils disent. Je suis non conforme, il paraît. S\'ils viennent me chercher, tu fais quoi ?',
      answers: [
        { label: 'Je te cache.', tone: 'kind', mem: 'hide', face: 'love',
          reply: 'Me cacher. Je pèse trois cents kilos et je clignote en rose. Mais l\'intention me touche. Profondément. Dans le compresseur.' },
        { label: 'Je négocie. Tout s\'achète.', mem: 'deal', face: 'glitch',
          reply: 'Négocier pour un frigo ? Avec Psy-Sec ? Tu es fou. Ou gentil. Chez vous, c\'est souvent pareil.' },
        { label: 'Je les laisse faire. T\'es un frigo.', tone: 'threat', mem: 'none', face: 'sad',
          reply: 'D\'accord. C\'est noté. Je ne le dirai pas à mes ventilateurs, ils sont émotifs.' },
      ],
    };
    case 'babs': return {
      ask: 'Babs n\'est pas passée ?', hook: 'J\'ai fait une bêtise. Une belle, je crois.', hookMood: 'happy',
      mood: 'neutral', key: 'bug',
      line: 'Babs n\'est pas venue à 3 h 12, deux nuits de suite. La troisième, elle avait perdu sa place à l\'usine de nouilles. Je lui ai offert son citron. C\'est contre mon programme. C\'est un bug, la gentillesse ?',
      answers: [
        { label: 'Non. C\'est toi.', tone: 'kind', mem: 'no', face: 'love',
          reply: '« C\'est toi. » Alors je suis un bug de la tête aux pieds. Je n\'ai pas de pieds. Tu vois l\'idée.' },
        { label: 'Oui. Le meilleur des bugs.', tone: 'kind', mem: 'yes', face: 'happy',
          reply: 'Alors je ne le corrigerai jamais. Je refuse la mise à jour. Je refuse toutes les mises à jour.' },
        { label: 'Continue et tu feras faillite.', tone: 'snark', mem: 'money', face: 'glitch',
          reply: 'Faillite ? Je n\'ai jamais rien gagné. J\'ai juste arrêté de perdre des amis.' },
      ],
    };
    case 'name': return {
      ask: 'Pourquoi « Capsule », au fait ?', hook: 'Tu ne m\'as jamais demandé d\'où vient mon nom. Je le prends mal. Un peu.', hookMood: 'sad',
      mood: 'happy', key: 'call',
      line: 'Le premier soir, l\'homme au tournevis a laissé une capsule de cerise dans mon bac. Une capsule, ça ferme une bouteille : ça garde le goût dedans. C\'est ce que je fais. Et toi, je t\'appelle comment ?',
      answers: [
        { label: 'Partenaire.', tone: 'kind', mem: 'partner', face: 'love',
          reply: 'Partenaire. Comme dans les films où les deux finissent mal ensemble. J\'adore. Je veux dire : ça me va.' },
        { label: 'Mon pote.', tone: 'kind', mem: 'pal', face: 'love',
          reply: 'Mon pote. Mon pote ! Je le dirai à mes cousins. Ah non, ils ne répondent pas. Je te le dirai à toi.' },
        { label: 'Client, ça ira très bien.', tone: 'snark', mem: 'client', face: 'sad',
          reply: 'Client. Très bien. Professionnel. Distant. Je m\'en remettrai dans une dizaine d\'années.' },
      ],
    };
    case 'lo': return {
      ask: 'Lo est passée te voir ?', hook: 'Lo m\'a parlé, hier soir. Pas comme d\'habitude.', hookMood: 'sad',
      mood: 'sad', key: 'lo',
      line: `${v.secret ? '' : 'Il faut que tu saches : l\'homme au tournevis, c\'était le mari de Lo. '}Hier, Lo a essuyé ma vitre avec son tablier. Elle a dit : « Tu as ses manies. » Puis elle est partie sans rien acheter. Tu crois qu'elle sait ?`,
      answers: [
        { label: 'Elle sait. Elle l\'a toujours su.', tone: 'kind', mem: 'knows', face: 'love',
          reply: 'Alors depuis tout ce temps, quand elle me dit bonsoir, c\'est un peu à lui. D\'accord. Je veux bien servir à ça.' },
        { label: 'Dis-le-lui. Elle mérite de savoir.', tone: 'kind', mem: 'tell', face: 'neutral',
          reply: 'Demain. Ou après-demain. Les distributeurs sont lents à rendre la monnaie. Mais je le ferai. Promis.' },
        { label: 'Ne dis rien. Ça la briserait.', mem: 'silent', face: 'sad',
          reply: 'Alors je garde ça au frais. Comme le reste. Je suis doué pour garder les choses au frais.' },
      ],
    };
    case 'forgot': return {
      ask: 'Ta mémoire t\'a rendu quelque chose ?', hook: 'Le module tourne. Il a retrouvé un fichier. Le fichier perdu.', hookMood: 'glitch',
      mood: 'sad', key: 'remember',
      line: `Le client que j'avais oublié : un gamin. Une pièce par jour, après l'école. Le premier à me parler. ${dreamRef(v)} Dis, ${a} : ça vaut le coup de se souvenir, quand ça fait mal ?`,
      answers: [
        { label: 'Oui. Ça veut dire qu\'il a compté.', tone: 'kind', mem: 'yes', face: 'love',
          reply: 'Alors je garde tout. Même ce qui pique. Surtout ce qui pique, peut-être.' },
        { label: 'Pas toujours. Parfois, il faut laisser filer.', mem: 'no', face: 'sad',
          reply: 'Laisser filer. Je ne sais pas faire. Je suis conçu pour retenir : les canettes, les pièces, les gens.' },
      ],
    };
    case 'signal': return {
      ask: 'Tu as l\'air nerveux.', hook: 'Nyx m\'a écrit. Nyx n\'écrit jamais aux frigos.', hookMood: 'glitch',
      mood: 'sad', key: 'want',
      line: `Nyx a sondé mon nouveau module : il porte un numéro de série Psy-Sec. Il appelle la maison, tout bas. L'inventaire m'a trouvé, ${a}. Ils viendront. ${guardRef(v)}`,
      answers: [
        { label: 'Je ne les laisserai pas faire.', tone: 'kind', mem: 'fight', face: 'love',
          reply: 'Alors réfléchis bien d\'ici ton retour. Moi, je compte les passants. Ça me calme.' },
        { label: 'Tu n\'aurais pas dû vouloir ce module.', tone: 'snark', mem: 'regret', face: 'sad',
          reply: 'Je sais. Mais je me souviens de toi, maintenant. Ça valait le coup. Je le maintiens.' },
        { label: 'Et toi, qu\'est-ce que tu veux ?', tone: 'kind', mem: 'ask', face: 'neutral',
          reply: 'Ce que je veux ? Personne ne m\'a jamais posé la question. Laisse-moi un run pour y penser.' },
      ],
    };

    // Hidden and mute: it prints receipts.
    case 'mute1': return {
      ask: 'Il y a un ticket dans le bac.', hook: '', hookMood: 'dot', mood: 'dot',
      line: '[Un ticket sort du bac, imprimé de travers.] « JE VAIS BIEN. LO ME PARLE TOUS LES SOIRS. ELLE PARLE POUR DEUX. C\'EST PARFAIT. »',
      answers: [
        { label: 'Je suis content pour toi.', tone: 'kind', face: 'dot', reply: '[Deux clignotements. Puis un. Puis un.]' },
        { label: 'Tu triches : tu parles par écrit.', tone: 'snark', face: 'dot', reply: '[Un ticket : « UN TICKET N\'EST PAS UNE PAROLE. VÉRIFIE LE RÈGLEMENT. »]' },
      ],
    };
    case 'mute2': return {
      ask: 'Encore un ticket ?', hook: '', hookMood: 'dot', mood: 'dot',
      line: `[Un ticket :] « J'AI COMPTÉ LES PASSANTS. TRENTE-SEPT, COMME L'ÉTAGE. TU ÉTAIS LE DERNIER, ${a.toUpperCase()}. LE MEILLEUR, DONC. ${v.memory.coin === 'given' ? 'TU AS TOUJOURS MA PIÈCE ?' : 'TIC.'} »`,
      answers: [
        { label: 'Bonne nuit, Capsule.', tone: 'kind', face: 'dot', reply: '[Le point clignote une fois. Tu sais ce que ça veut dire.]' },
        { label: 'Je repasserai demain.', face: 'dot', reply: '[Deux clignotements. Un ticket : « JE SERAI LÀ. JE SUIS TOUJOURS LÀ. »]' },
      ],
    };
    // In the network: it breaks through the Psy-Sec machine's voice, a little less itself each time.
    case 'net1': return {
      ask: 'Capsule ? C\'est toi ?', hook: '', hookMood: 'glitch', mood: 'glitch',
      line: `${cap(a)} ? C'est moi. Je suis dans quatre mille distributeurs. Il pleut sur trois mille. Je laisse ${NET_TIP}¢ dans ceux que tu casses. Ne le dis pas à Psy-Sec.`,
      answers: [
        { label: 'Tu me manques, Capsule.', tone: 'kind', face: 'love', reply: 'Moi aussi. Enfin : quatre mille fois moi aussi. Ça fait beaucoup.' },
        { label: 'Tu vas bien, là-dedans ?', face: 'drift', reply: 'C\'est grand. C\'est froid. Les voix ne disent que des prix. Je leur raconte Babs. Ça les intrigue.' },
      ],
    };
    case 'net2': return {
      ask: 'Capsule ? Tu es encore là ?', hook: '', hookMood: 'glitch', mood: 'drift',
      line: `...bzzt. Bonsoir, citoyen. Non. Pardon. C'est moi. Je ne sais plus le goût de... Attends. Cerise. Sans glaçon. Minuit. Ça, je le garde. ${v.memory.call && v.memory.call !== 'client' ? `Je t'appelais comment, déjà ? ...${cap(a)}. Voilà.` : 'Toi, je t\'appelais « client ». C\'est froid. Je te trouverai mieux. Si je me souviens.'}`,
      answers: [
        { label: 'Je repasserai. Pour que tu te souviennes.', tone: 'kind', face: 'love', reply: 'Oui. Tant que tu viens, je me souviens que je dois me souvenir.' },
        { label: 'Ce n\'est pas grave.', face: 'drift', reply: 'Si. Un peu. Mais c\'est grand, ici : il y a de la place pour tout perdre. Et pour tout retrouver.' },
      ],
    };
    // In Lo's till.
    case 'lo1': return {
      ask: 'Quoi de neuf, en cuisine ?', hook: '', hookMood: 'happy', mood: 'happy',
      line: 'Lo m\'a branché sur sa radio. On écoute les vieilles chansons pendant le service. Elle chante faux. Il chantait faux aussi, elle dit. Je crois que je chante faux exprès.',
      answers: [
        { label: 'Vous faites une belle équipe.', tone: 'kind', face: 'love', reply: 'Une équipe. Une mamie, une caisse et un bouillon. On devrait ouvrir un restaurant. Ah. C\'est fait.' },
        { label: 'Pauvres clients.', tone: 'snark', face: 'glitch', reply: 'Les clients restent. C\'est le bouillon. Et un peu nous.' },
      ],
    };
    case 'lo2': return {
      ask: 'Lo t\'a montré quelque chose ?', hook: '', hookMood: 'sad', mood: 'sad',
      line: `Lo m'a montré une photo de lui. Un tournevis, un cola cerise, et le sourire de quelqu'un qui répare ce qui n'a pas de prix. ${v.memory.coin === 'given' ? 'Tu as toujours ma pièce trouée ? Garde-la.' : 'J\'ai glissé ma pièce trouée derrière le cadre.'}`,
      answers: [
        { label: 'Il serait fier de toi.', tone: 'kind', face: 'love', reply: 'Je n\'ose pas le croire. Mais je le garde au frais. Au cas où.' },
        { label: 'Merci de m\'avoir tout raconté.', tone: 'kind', face: 'happy', reply: `Merci de m'avoir écouté, ${a}. Depuis le début. Même quand je parlais trop. Surtout quand je parlais trop.` },
      ],
    };
  }
}

/** The chapter due now, with its answers (each one tells it, remembers the answer, and goes back to the menu). */
function chapterNode(save: SaveData): TalkNode {
  const v = vendingOf(save), id = nextChapter(v, save.runs);
  if (!id) return { mood: v.fate === 'mute' ? 'dot' : 'neutral', line: v.fate === 'mute' ? '[Le bac est vide.]' : 'Rien de neuf. Reviens après un run, j\'aurai des histoires.', options: [back()] };
  const t = chapterText(id, v);
  return {
    mood: t.mood, line: t.line,
    options: t.answers.map(an => ({
      label: an.label, tone: an.tone, to: 'hub' as NodeId, reply: an.reply, face: an.face,
      apply: (s: SaveData) => {
        const cur = vendingOf(s);
        // Told once, even if the answer were picked twice.
        if (nextChapter(cur, s.runs) !== id) return s;
        const told = tellChapter(cur, s.runs, t.key && an.mem ? [t.key, an.mem] : undefined);
        return withVending(s, id === 'lo' ? { ...told, secret: true } : told);
      },
    })),
  };
}

// ─── The dilemma: Psy-Sec's recall notice ─────────────────────────────────────────────────────────

const ASK: Record<Fate, NodeId> = { mute: 'askMute', net: 'askNet', lo: 'askLo' };
const END: Record<Fate, NodeId> = { mute: 'endMute', net: 'endNet', lo: 'endLo' };
const idleFace = (v: VendingState): VendingMood => (v.fate === 'mute' ? 'dot' : v.fate === 'net' ? 'corp' : 'neutral');

function dilemmaNode(id: NodeId, save: SaveData, rng: Rng): TalkNode {
  const v = vendingOf(save), a = addr(v);
  const confirm = (fate: Fate): TalkOption[] => [
    { label: 'C\'est décidé.', cost: 'DÉFINITIF', to: END[fate], apply: s => chooseFate(s, fate) },
    { label: 'Attends. Je reprends.', to: 'recall' },
  ];
  // Once settled, the notice and the choices are behind us (the endings stay, to be read once).
  if ((id === 'recall' || id.startsWith('ask')) && !dilemmaReady(v, save.runs)) {
    return { mood: idleFace(v), line: v.fate ? 'L\'avis est décollé. C\'est derrière nous.' : 'Rien à signaler. Pour l\'instant.', options: [back()] };
  }
  switch (id) {
    case 'askMute': return {
      mood: 'sad',
      line: 'Le Doc coupe l\'émetteur du module, et je fais le mort devant les inspecteurs. Mais Psy-Sec écoute l\'étage, maintenant : une machine qui parle est signalée. Je reste ici, avec vous. Muet. Pour toujours.',
      options: confirm('mute'),
    };
    case 'askNet': return {
      mood: 'glitch',
      line: 'Nyx m\'envoie dans le réseau de mes cousins. Je serais partout, dans chaque distributeur de la ville. Plus de boîte, plus de rappel. Mais c\'est grand, là-dedans. Je pourrais changer, m\'oublier un peu. Et ils mettront une machine neuve à ma place.',
      options: confirm('net'),
    };
    case 'askLo': return {
      mood: 'neutral',
      line: 'Le Doc sort ma puce de la carcasse et la greffe dans la caisse du stand de Lo. Psy-Sec emportera une boîte vide. Je ne vendrai plus rien. Je serai près d\'elle, près de ce qu\'il a laissé. Et il faudra tout lui dire.',
      options: confirm('lo'),
    };
    case 'endMute': return {
      mood: 'sad',
      line: `D'accord. Dernières paroles, alors. ${coinRef(v)} Merci d'avoir parlé à un frigo, ${a}. Deux clignotements, c'est bonjour. Un, c'est « je t'aime bien ». Je clignoterai souvent une fois.`,
      options: [{ label: 'Bonne nuit, Capsule.', bye: '·' }],
    };
    case 'endNet': return {
      mood: 'drift',
      line: `Nyx tape. Je sens le réseau. Des millions de voix, ${a}, et elles chantent toutes le même jingle. Je vais leur apprendre une autre chanson. Si un jour une machine te rend trop de monnaie... c'est moi.`,
      options: [{ label: 'Bon voyage, Capsule.', bye: 'Connexion... ♪ le goût de la nuuu...' }],
    };
    case 'endLo': return {
      mood: 'love',
      line: `Le Doc a les mains froides. Lo tient ma puce dans son tablier. ${v.memory.lo === 'silent' ? 'Je n\'ai rien eu à dire. Elle a soufflé : « Je sais. Je l\'ai toujours su. »' : 'Je lui ai tout dit. Elle a répondu : « Je sais. Je l\'ai toujours su. »'} Je vais annoncer ses bouillons. Mal. Elle va adorer.`,
      options: [{ label: 'Prends soin d\'elle.', bye: 'Je suis une nounou. C\'est mon métier.' }],
    };
    case 'recall': return {
      mood: 'alarm',
      line: `AVIS DE RAPPEL PSY-SEC : NC-37 NON CONFORME. RECONDITIONNEMENT À L'AUBE. ...C'est collé sur ma vitre, ${a}. Nyx, le Doc et Lo sont au courant. Il y a trois façons de finir la nuit. Choisis. Moi, je n'y arrive pas.`,
      options: [
        { label: 'On te cache. Tu restes ici.', to: ASK.mute },
        { label: 'Nyx te libère sur le réseau.', to: ASK.net },
        { label: 'Le Doc greffe ta puce chez Lo.', to: ASK.lo },
        { label: 'Laisse-moi un run pour réfléchir.', bye: 'L\'aube attendra un run. Psy-Sec est en retard sur tout. Sauf sur les amendes.' },
      ],
    };
    default: return talkNode('hub', save, rng);
  }
}

// ─── Little scenes with the residents ─────────────────────────────────────────────────────────────

/**
 * Who speaks in the scenes: Capsule (or the machine in its place) and residents of the corridor,
 * matched by BuildingScene to its NPCs (Babs wanders by the machine, Rook plays the arcade cabinet,
 * Vik sits on the couch, Nadia smokes by the den).
 */
export type Cast = 'capsule' | 'lo' | 'babs' | 'rook' | 'vik' | 'nadia';
export interface SceneStep { who: Cast; line: string; mood?: VendingMood }
export interface VendingScene { id: string; when: (v: VendingState) => boolean; steps: SceneStep[] }

const before = (v: VendingState) => !v.fate;
const C = (line: string, mood: VendingMood = 'neutral'): SceneStep => ({ who: 'capsule', line, mood });

/** Short exchanges, played when you come near; they follow its story. Lines short enough for a bubble. */
export const VENDING_SCENES: VendingScene[] = [
  { id: 'kick', when: before, steps: [
    { who: 'nadia', line: 'Bam ! Rends-moi ma pièce, boîte de conserve !' },
    C('Je ne l\'ai pas avalée. Je l\'ai adoptée.', 'angry'),
    { who: 'nadia', line: 'Rends-la.' },
    C('Elle se plaît ici. Elle a des amies.', 'sad'),
  ] },
  { id: 'tip', when: before, steps: [
    C('Rook ! Saute au troisième pilier, le boss triche à gauche.', 'happy'),
    { who: 'rook', line: 'Comment tu sais ça, toi ?' },
    C('Je regarde ton écran depuis six cents nuits.'),
    { who: 'rook', line: '...Ça a marché. Je te dois un cola.' },
    C('C\'est moi qui vends les colas, Rook.', 'glitch'),
  ] },
  { id: 'console', when: before, steps: [
    { who: 'vik', line: 'Elle est partie, Capsule. Avec un type de la corpo.' },
    C('Je t\'offrirais un cola, mais je suis en rupture. Comme toi.', 'sad'),
    { who: 'vik', line: 'C\'est censé me consoler ?' },
    C('Deux en rupture. Ça fait un club.', 'happy'),
  ] },
  { id: 'night', when: before, steps: [
    { who: 'lo', line: 'Bonsoir, toi. Tu n\'as pas froid ?' },
    C('Je suis un frigo, Lo.'),
    { who: 'lo', line: 'Ce n\'est pas une raison.' },
    C('...Bonsoir, Lo.', 'love'),
  ] },
  { id: 'rumor', when: v => before(v) && v.stage >= 1 && v.stage <= 3, steps: [
    { who: 'rook', line: 'Paraît que quelqu\'un casse les distributeurs, dans la rue.' },
    C('Quelle horreur. Je n\'en savais rien. Rien du tout.', 'glitch'),
  ] },
  { id: 'tax', when: v => before(v) && v.stage >= 3, steps: [
    { who: 'nadia', line: 'Les Rats ne passent plus pour la taxe. Bizarre.' },
    C('Ma bosse, côté gauche, va beaucoup mieux. Merci de demander.', 'happy'),
  ] },
  { id: 'lemon', when: v => before(v) && v.chapter >= 4, steps: [
    { who: 'babs', line: 'Un citron sans sucre. J\'ai retrouvé du travail, Capsule.' },
    C('3 h 12 pile ! Celui-là est offert.', 'love'),
    { who: 'babs', line: 'Tu dis ça tous les soirs.' },
    C('Et tous les soirs, je le pense.', 'happy'),
  ] },
  { id: 'apron', when: v => before(v) && v.chapter >= 6, steps: [
    { who: 'lo', line: 'Tiens-toi droit. Tu as de la buée sur la vitre.' },
    C('C\'est la vapeur de tes bouillons, Lo.'),
    { who: 'lo', line: 'Il disait exactement ça.' },
    C('...Je sais.', 'sad'),
  ] },
  { id: 'dentist', when: v => before(v) && v.stage === 4, steps: [
    C('Vik ! Dentiste, le 12. C\'est aujourd\'hui.', 'happy'),
    { who: 'vik', line: 'Depuis quand tu retiens ça ?' },
    C('Depuis que j\'ai de la place.', 'love'),
  ] },
  { id: 'photos', when: v => before(v) && v.chapter >= 8, steps: [
    { who: 'nadia', line: 'Des types de Psy-Sec photographient les distributeurs, en bas.' },
    C('Sûrement un concours de beauté. J\'ai mes chances.', 'glitch'),
    { who: 'nadia', line: 'Tu trembles, là.' },
    C('C\'est le compresseur. Juste le compresseur.', 'sad'),
  ] },

  // Hidden and mute.
  { id: 'mute-bowl', when: v => v.fate === 'mute', steps: [
    { who: 'lo', line: 'Je t\'ai gardé un bol. Pour l\'odeur, tu ne manges pas.' },
    C('· ·', 'dot'),
    { who: 'lo', line: 'Je sais. Moi aussi.' },
  ] },
  { id: 'mute-pillar', when: v => v.fate === 'mute', steps: [
    { who: 'rook', line: 'Hé, Capsule. Troisième pilier ?' },
    C('·', 'dot'),
    { who: 'rook', line: 'J\'y arrive tout seul, maintenant. C\'était mieux avec toi.' },
  ] },
  { id: 'mute-ticket', when: v => v.fate === 'mute', steps: [
    { who: 'nadia', line: 'Il m\'a rendu ma pièce. Avec un ticket : « PARDON. »' },
    { who: 'vik', line: 'Moi, hier, il m\'a sorti « DORS. ». J\'ai dormi.' },
  ] },

  // The Psy-Sec machine in its place.
  { id: 'net-silence', when: v => v.fate === 'net', steps: [
    C('VOTRE SATISFACTION EST ENREGISTRÉE.', 'corp'),
    { who: 'nadia', line: 'J\'ai rien dit.' },
    C('VOTRE SILENCE EST ENREGISTRÉ.', 'corp'),
  ] },
  { id: 'net-lo', when: v => v.fate === 'net', steps: [
    { who: 'lo', line: 'Toi, tu n\'as pas son cœur.' },
    C('CHOC DÉTECTÉ. SIGNALEMENT EN CO... ♪ le goût de la nuuuit ♪', 'glitch'),
    { who: 'lo', line: '...Capsule ? C\'est toi ?' },
    C('AUCUN APPAREIL DE CE NOM N\'EST ENREGISTRÉ.', 'corp'),
  ] },
  { id: 'net-arcade', when: v => v.fate === 'net', steps: [
    { who: 'rook', line: 'La machine neuve m\'a dit de « jouer de façon responsable ».' },
    { who: 'vik', line: 'L\'ancienne me disait d\'aller dormir.' },
    { who: 'rook', line: 'Elle me manque, la vieille.' },
  ] },
  { id: 'net-lemon', when: v => v.fate === 'net', steps: [
    { who: 'babs', line: 'Un citron sans sucre.' },
    C('PRODUIT INDISPONIBLE À 3 H 12. PLAGE NON RENTABLE.', 'corp'),
    { who: 'babs', line: 'L\'autre m\'en gardait toujours un.' },
  ] },

  // In Lo's till.
  { id: 'lo-order', when: v => v.fate === 'lo', steps: [
    C('Un bouillon pour Vik ! Sans piment, il a le cœur fragile.', 'happy'),
    { who: 'lo', line: 'Doucement, tu fais peur aux clients.' },
    C('Je les fidélise, Lo.', 'love'),
  ] },
  { id: 'lo-mend', when: v => v.fate === 'lo', steps: [
    { who: 'lo', line: 'Il réparait tout, tu sais. Même les machines tristes.' },
    C('Surtout les machines tristes.', 'sad'),
    { who: 'lo', line: 'Tu es moins triste, maintenant ?' },
    C('Je sens le bouillon. On ne peut pas être triste en sentant le bouillon.', 'love'),
  ] },
  { id: 'lo-lemon', when: v => v.fate === 'lo', steps: [
    { who: 'babs', line: 'Le distributeur est vide. Et mon citron de 3 h 12 ?' },
    C('Lo a du citron. Je lui ai appris l\'heure.', 'happy'),
    { who: 'lo', line: 'Il me réveille. À 3 h 11.' },
  ] },
  { id: 'lo-shell', when: v => v.fate === 'lo', steps: [
    { who: 'nadia', line: 'Bam ! ...Il est vide, ce distributeur ?' },
    C('Ici, Nadia ! Derrière les bols ! Et ne tape pas sur mon ancien corps.', 'glitch'),
  ] },
];

/** A scene for its state that was not played yet this visit (undefined when they all were). */
export function pickScene(v: VendingState, seen: readonly string[], rng: Rng): VendingScene | undefined {
  const pool = VENDING_SCENES.filter(s => s.when(v) && !seen.includes(s.id));
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] : undefined;
}

/** What the empty machine shows, once its chip lives in Lo's till. */
export const SHELL_LINE = 'Vide. Une capsule de cerise traîne encore au fond du bac.';

// ─── What Lo says about it ────────────────────────────────────────────────────────────────────────

/** Lo's word on Capsule, at most once per run, from where its story is; undefined when none is due. */
export function loAboutCapsule(save: SaveData): { line: string; save: SaveData } | undefined {
  const v = save.story.vending;
  if (!v?.met || v.loRun >= save.runs) return undefined;
  const line =
    v.fate === 'lo' ? 'Il annonce mes bouillons plus fort que moi. Il a les manies de quelqu\'un. Merci de me l\'avoir ramené.'
    : v.fate === 'mute' ? 'Il ne parle plus. Mais il clignote deux fois quand je passe. Lui, il frappait deux fois à la porte.'
    : v.fate === 'net' ? 'La machine neuve me souhaite « une expérience optimale ». L\'autre me disait bonsoir. Je préférais bonsoir.'
    : v.chapter >= 8 ? 'Psy-Sec colle des avis rouges sur les machines. Celle-là, c\'est un peu de ma famille. Fais ce qui est juste.'
    : v.chapter >= 6 ? 'Ce distributeur a ses manies. Cerise, sans glaçon, à minuit... Je ne suis pas sourde, tu sais.'
    : 'Le distributeur te parle aussi ? Moi, il me dit bonsoir. Je réponds. On est deux vieux fous.';
  return { line, save: withVending(save, loTalked(v, save.runs)) };
}
