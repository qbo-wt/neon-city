import type { EnemyId } from './enemies';

/** Bestiary files: the description at 1 kill, a tactic at 10, a piece of lore at 25. */
export const CODEX_TIERS = [1, 10, 25] as const;

export const CODEX: Record<EnemyId, [desc: string, tip: string, lore: string]> = {
  runner: [
    'Gamin des rues armé d\'une machette lumineuse. Rapide, fragile, toujours en groupe.',
    'Il lève sa lame juste avant de frapper : pare à cet instant, le contre fait double dégâts.',
    'Les Rats recrutent les punks à lame à quatorze ans. La machette leur sert de diplôme.',
  ],
  gunner: [
    'Tireur des Rats au pistolet. Garde ses distances et tourne autour de toi.',
    'Ses balles se parent : renvoyées, elles font double dégâts.',
    'Chaque cartouche de sa cartouchière porte une initiale gravée : celle de sa prochaine cible.',
  ],
  brute: [
    'Colosse aux bras de chrome. Charge en ligne droite.',
    'Esquive la charge par le côté : s\'il percute un mur, il reste étourdi et sans défense.',
    'Ancien docker. Les Rats ont payé ses bras, et il les rembourse encore.',
  ],
  drone: [
    'Drone de surveillance armé. Tire des rafales de trois balles.',
    'Il est fragile : un seul combo suffit. Avance entre deux rafales.',
    'Les drones de Psy-Sec filment tout. Quelqu\'un regarde, quelque part.',
  ],
  bomber: [
    'Kamikaze chimique. Fonce sur toi et explose.',
    'Quand il clignote en jaune, dashe ou recule. S\'il saute tout seul, il ne rapporte rien.',
    'Les fioles vertes contiennent du solvant à implants. Il ne restera rien de lui, ni de ton chrome.',
  ],
  hacker: [
    'Netrunner pirate. Ses piratages lents font monter ta psychose.',
    'Priorité absolue : ses orbes verts te font perdre la tête. Ils se parent aussi.',
    'Il lit tes implants comme un livre ouvert. Il sait exactement où appuyer.',
  ],
  warden: [
    'Le Lieutenant des Rats. Armure anti-émeute, fusil lourd, bobine de choc.',
    'Sous la moitié de sa vie, il accélère. Sors de l\'anneau rouge avant le séisme.',
    'Il tient le secteur 5 depuis six ans. Personne n\'a jamais vu son visage.',
  ],
  boss: [
    'L\'Exécuteur Psy-Sec. Chasseur de cyberpsychos : lame géante, halo psionique.',
    'Chaque phase ajoute un anneau à sa nova : cherche l\'ouverture dans le cercle de balles.',
    'Psy-Sec ne dit pas qui est sous l\'armure. Certains disent qu\'il n\'y a plus personne.',
  ],
};
