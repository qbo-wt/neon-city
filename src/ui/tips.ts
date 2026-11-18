/** Gameplay tips shown on the loading screens. */
export const TIPS = [
  'Commence par la run normale : pas de cyberpsychose, des ennemis moins coriaces. Gagne-la pour débloquer la run CyberHard.',
  'Run CyberHard : la psychose monte à chaque tour. Le neuro-bloqueur [F] coûte 2 PA et la fait redescendre de 30.',
  'Run CyberHard : à 50 % de psychose tes coups frappent plus fort, à 75 % encore plus, mais ton corps commence à lâcher.',
  'En pleine cyberpsychose (run CyberHard), chaque ennemi éliminé te soigne un peu : tu peux rester sur le fil si tu continues de tuer.',
  'Survole un ennemi : tu vois où il peut marcher à son prochain tour.',
  'Deux implants d\'une même famille débloquent une synergie, trois la renforcent.',
  'Les ennemis au contact te taclent : quitter le corps à corps coûte des PM. La fuite réduit ce coût.',
  'Repousser un ennemi contre un mur ou contre un autre ennemi lui inflige des dégâts.',
  'Des renforts arrivent au début des rounds 3 et 5. Ne traîne pas.',
  'La Surchauffe donne des PA tout de suite, contre un peu de vie en run normale, un peu de psychose en CyberHard.',
  'Un aspect change les sorts de ton arme. Chacun monte jusqu\'au rang III au râtelier de la planque.',
  'Les crédits rapatriés servent chez le Doc Kessler, chez Nyx et au râtelier.',
  'La run du jour propose la même ville à tout le monde. Compare ton temps.',
  'Une victoire en CyberHard débloque l\'avis de recherche : des handicaps sur tes runs CyberHard contre plus de crédits.',
  'La run CyberHard rapporte 25 % de crédits en plus que la run normale.',
  'Clic droit ou Échap annule le sort choisi. Molette pour zoomer, ZQSD pour déplacer la caméra.',
  'Le bestiaire du terminal s\'ouvre au fil des éliminations : faiblesses, tactiques, histoire.',
  'Un boss attend tous les 5 secteurs. Le dernier ferme le contrat.',
];

let last = -1;
/** A random tip, never the same twice in a row. */
export function randomTip() {
  let i = Math.floor(Math.random() * TIPS.length);
  if (i === last) i = (i + 1) % TIPS.length;
  last = i;
  return TIPS[i];
}
