import type { EnemyId } from './enemies';

/** Bestiary files: the description at 1 kill, a tactic at 10, a piece of lore at 25. */
export const CODEX_TIERS = [1, 10, 25] as const;

export const CODEX: Record<EnemyId, [desc: string, tip: string, lore: string]> = {
  runner: [
    'Gamin des rues armé d\'une machette lumineuse. 4 PM, deux coups par tour, toujours en groupe.',
    'Il te tacle : quitter son contact coûte des PM. Tue-le avant de bouger, ou passe par une ruée.',
    'Les Rats recrutent les punks à lame à quatorze ans. La machette leur sert de diplôme.',
  ],
  gunner: [
    'Tireur des Rats au pistolet. Garde ses distances, de 2 à 6 cases.',
    'Il lui faut une ligne de vue : cache-toi derrière un obstacle ou une créature, puis fonce au contact.',
    'Chaque cartouche de sa cartouchière porte une initiale gravée : celle de sa prochaine cible.',
  ],
  brute: [
    'Colosse aux bras de chrome. Ruée en ligne, marteau qui repousse, gros tacle.',
    'Ne reste jamais aligné avec lui, ni dos à un mur : son marteau t\'y écrase.',
    'Ancien docker. Les Rats ont payé ses bras, et il les rembourse encore.',
  ],
  drone: [
    'Drone de surveillance armé. Très rapide, il joue souvent en premier.',
    'Il est fragile : un seul bon coup suffit. Il ne tacle pas, tu peux le quitter librement.',
    'Les drones de Psy-Sec filment tout. Quelqu\'un regarde, quelque part.',
  ],
  bomber: [
    'Kamikaze chimique. Il s\'amorce à côté de toi et explose à son tour suivant, sur 2 cases.',
    'Amorcé, il brille en jaune : éloigne-toi, repousse-le vers ses amis ou tue-le avant. S\'il saute tout seul, il ne rapporte rien.',
    'Les fioles vertes contiennent du solvant à implants. Il ne restera rien de lui, ni de ton chrome.',
  ],
  hacker: [
    'Netrunner pirate. Ses hacks traversent les murs et font monter ta psychose. Il soigne ses alliés.',
    'Priorité absolue : il reste loin derrière. Une ruée, un bond ou un harpon l\'atteignent.',
    'Il lit tes implants comme un livre ouvert. Il sait exactement où appuyer.',
  ],
  warden: [
    'Le Lieutenant des Rats. Armure anti-émeute, fusil lourd, bobine de choc.',
    'Il appelle des Rats en renfort et repousse contre les murs. Sous la moitié de sa vie, il gagne des PM.',
    'Il tient le secteur 5 depuis six ans. Personne n\'a jamais vu son visage.',
  ],
  boss: [
    'L\'Exécuteur Psy-Sec. Chasseur de cyberpsychos : lame géante, halo psionique.',
    'Son onde psy frappe tout à 2 cases autour de lui, son rayon perce les lignes : ne reste ni collé ni aligné.',
    'Psy-Sec ne dit pas qui est sous l\'armure. Certains disent qu\'il n\'y a plus personne.',
  ],
};
