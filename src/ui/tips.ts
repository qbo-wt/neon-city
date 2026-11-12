/** Gameplay tips shown on the loading screens. */
export const TIPS = [
  'La psychose monte à chaque tour. Le neuro-bloqueur [F] coûte 2 PA et la fait redescendre de 30.',
  'À 50 % de psychose tes coups frappent plus fort, à 75 % encore plus, mais ton corps commence à lâcher.',
  'En pleine cyberpsychose, chaque ennemi éliminé te soigne un peu : tu peux rester sur le fil si tu continues de tuer.',
  'Survole un ennemi : tu vois où il peut marcher à son prochain tour.',
  'Deux implants d\'une même famille débloquent une synergie, trois la renforcent.',
  'Les ennemis au contact te taclent : quitter le corps à corps coûte des PM. La fuite réduit ce coût.',
  'Repousser un ennemi contre un mur ou contre un autre ennemi lui inflige des dégâts.',
  'Des renforts arrivent au début des rounds 3 et 5. Ne traîne pas.',
  'La Surchauffe donne des PA tout de suite, contre un peu de psychose.',
  'Un aspect change les sorts de ton arme. Chacun monte jusqu\'au rang III au râtelier de la planque.',
  'Les crédits rapatriés servent chez le Doc Kessler, chez Nyx et au râtelier.',
  'La run du jour propose la même ville à tout le monde. Compare ton temps.',
  'Après une première victoire, l\'avis de recherche règle ta notoriété : des handicaps contre plus de crédits.',
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
