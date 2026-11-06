# Design — Rogue-lite cyberpunk (nom de travail : **NEON//PSYCHE**)

Date : 2026-11-06 · Statut : validé (plus d'ennemis et d'implants prévus après la v0.1)

## 1. Intention

Un rogue-lite d'action solo, vue de dessus, jouable dans le navigateur, avec une ambiance cyberpunk en pixel art (néons, pluie, mégacorpos). Le joueur traverse les rues d'une mégapole salle par salle, frappe des ennemis, ouvre des coffres et installe des **implants**. Chaque implant le rend plus fort mais le rapproche de la **psychose** : la puissance a un prix.

Inspirations : Cyberpunk 2077 pour l'ambiance, Hades pour la structure. **Univers 100 % original** : on ne reprend aucun nom, personnage, lieu ou asset de CD Projekt. Ville : **Neon City**.

## 2. Objectifs de la v0.1 (tranche jouable)

- **Contrôles** : déplacement avec ZQSD ou les flèches · **Espace** = dash (invulnérable pendant le dash, recharge de ~0,8 s) · **clic gauche** = attaque vers le curseur (combo de 3 coups) · **clic droit** = parade.
- **Parade** : une fenêtre de ~150 ms. Réussie, elle annule le coup, étourdit l'ennemi ~1 s et ouvre un contre à dégâts doublés. Ratée, elle laisse un court temps mort (la spammer est risqué).
- **Structure d'une run** (façon Hades) : 1 district de ~8 salles. Les portes se verrouillent tant que la salle n'est pas nettoyée. À la sortie, 2 ou 3 portes affichent leur récompense (implant, crédits, soin, coffre). Le district se termine par un mini-boss.
- **Ennemis** : 3 types (mêlée rapide, tireur à distance, brute qui charge) et 1 mini-boss.
- **Implants** : environ 8, chacun avec un bonus et une **charge** de psychose. Exemples : lames de bras (+dégâts), jambes renforcées (double dash), optique (dégâts critiques), dermo-blindage (+vie max).
- **Psychose** : une jauge de 0 à 100 % (détail en §3).
- **Planque (hub)** : on y revient à la mort. On y dépense les **crédits** dans un **arbre de compétences permanent** d'environ 8 nœuds (vie max, dash, résistance à la psychose, crédits gagnés…).
- **Sauvegarde** locale dans le navigateur (localStorage) : progression de l'arbre et crédits.
- **HUD** : vie, jauge de psychose, crédits, implants installés.

## 3. Psychose (proposition, à ajuster)

- Chaque implant ajoute de la **charge**. La jauge de psychose monte lentement, à une vitesse proportionnelle à la charge totale, et grimpe un peu à chaque ennemi tué.
- **Seuils** :
  - 50 % : effets visuels (glitch, aberration chromatique), sans impact sur le jeu.
  - 75 % : la vie commence à baisser lentement.
  - 100 % : **crise de cyberpsychose**. La vie baisse vite, mais les dégâts augmentent de 50 % et la vitesse aussi. C'est un mode berserk risqué.
- **Contre-mesures** : des « neuro-bloqueurs » (consommables trouvés en run) font baisser la jauge, et certains nœuds de l'arbre réduisent la charge des implants.
- Le système complet de bonus et malus liés à la folie est **hors v0.1** : la structure est prévue pour qu'on l'ajoute plus tard.

## 3 bis. Règles de mort (mon choix, à valider)

- À la mort, on **perd les implants** et la psychose revient à 0 : chaque run repart d'un corps « propre ».
- On **garde tous les crédits** gagnés pendant la run, pour les dépenser à la planque.
- Battre le mini-boss termine la run par une victoire : on garde un bonus de crédits, puis on revient à la planque.

## 4. Hors périmètre (non-objectifs)

Multijoueur, backend et comptes, mise en ligne (prévue plus tard, mais pas maintenant), manette et mobile, plusieurs districts, musique (au mieux quelques effets sonores simples).

## 5. Anti-objectifs (échec même si « ça marche »)

- Des combats mous ou imprécis : le déplacement, le dash et la parade doivent répondre instantanément.
- Du contenu copié de Cyberpunk 2077.
- Un code impossible à faire évoluer : ajouter un implant, un ennemi ou un nœud de l'arbre doit revenir à ajouter une entrée de données, pas à réécrire le moteur.

## 6. Approches envisagées

| Option | Pour | Contre |
|---|---|---|
| **Phaser + TypeScript + Vite** ✅ | Framework 2D mature : collisions, entrées, scènes, caméra, animations fournies. Build statique facile à héberger. | Une dépendance, à garder à jour. |
| Canvas HTML pur | Zéro dépendance, contrôle total. | Tout est à recoder (collisions, scènes) : plus lent pour le même résultat. |
| Godot (export web) | Moteur complet. | Éditeur à installer, travail surtout à la souris, export web lourd. |

**Choix : Phaser + TypeScript + Vite** (validé par l'utilisateur). Version stable de Phaser à vérifier dans la doc au moment de l'implémentation.

## 7. Décisions techniques

- **Physique** : Arcade (hitboxes rectangulaires et circulaires, suffisant pour une vue de dessus).
- **Graphismes** : le pixel art est généré **dans le code** au démarrage (grilles de caractères converties en textures), donc sans fichier image externe. Palette néon : cyan, magenta, jaune, sur fond nuit bleu-violet. Résolution interne basse (≈ 480×270) agrandie en pixel-perfect.
- **Scènes** : Boot (génération des textures) → Menu → Planque ↔ Run (+ scène HUD superposée) → écran de mort → Planque.
- **Données** : implants, ennemis, nœuds de l'arbre et salles sont décrits dans des fichiers de données typés (`src/data/*.ts`).
- **Salles** : sont générées à partir de gabarits simples (murs et obstacles) et de vagues d'ennemis tirées au sort.
- **Lancement local** : `npm install` puis `npm run dev`.

## 8. Laissé au constructeur

L'équilibrage des chiffres, le dessin exact des sprites et des salles, les noms des implants et des ennemis (originaux, dans l'esprit cyberpunk), et le style du HUD.
