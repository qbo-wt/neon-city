# Neon City

Rogue-lite tactique au tour par tour, dans le navigateur. Pixel art cyberpunk en vue isométrique, bruitages et musique entièrement générés par le code (aucun fichier image ni son).

> Branche `tactique` : combat au tour par tour sur damier. La version action en temps réel (frappe, dash, parade) reste sur `main`.

## Lancer

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests de la logique de jeu (Vitest)
npm run build      # vérification des types + build statique dans dist/
```

## Contrôles

| Action | Commande |
|---|---|
| Se déplacer (appart, couloir) | ZQSD, WASD ou flèches |
| Interagir | E |
| En run : marcher, choisir une sortie, parler | Clic sur une case |
| Choisir un sort | 1 à 9 ou clic sur la barre, puis clic sur la cible |
| Annuler le sort choisi | Clic droit ou Échap |
| Fin du tour / prêt au placement | Espace ou Entrée |
| Neuro-bloqueur (2 PA, -30 psychose) | F |
| Infos d'une créature, chemin, portée, dégâts prévus | Survol |
| Couper / remettre le son | M |
| Aide des commandes | I ou bouton « i » |

## Le combat

- **Placement** sur les cases bleues, puis l'ordre des tours suit l'**initiative** (frise en haut à droite).
- Chaque tour : **6 PA** pour les sorts, **3 PM** pour marcher (1 PM par case).
- **Sorts** : coût en PA, portée, ligne de vue, lancer en ligne, relance, lancers par tour, zone (case, croix, cercle, ligne).
- **Tacle et fuite** : quitter le contact d'un ennemi coûte des PM en plus (sa valeur de tacle moins ta fuite).
- **Poussée** : un ennemi repoussé contre un mur ou une créature prend des dégâts pour chaque case qu'il n'a pas pu faire. La créature heurtée en prend la moitié.
- **Couverts** : obstacles et créatures bloquent la ligne de vue. Caisses, barils et distributeurs se cassent et lâchent du butin.
- **Renforts** : dans les secteurs avancés, la vague suivante arrive au round 3.
- **Psychose** : monte à chaque début de tour (base + charge des implants) et à chaque élimination. Bonus de dégâts à 50 % et 75 %, la vie fond à partir de 75 %, x1,5 en crise. **Surchauffe** (0 PA, une fois par tour) : +2 PA contre de la psychose.
- **Ennemis** : punk à lame (tacle), tireur (garde ses distances), colosse (ruée, marteau qui repousse), drone (rapide), kamikaze (s'amorce à côté de toi et explose au tour suivant, sur ses alliés aussi), netrunner (hacks sans ligne de vue, soigne ses alliés). Boss à phases aux secteurs 5 et 10.

## Armes (classes)

Chaque arme donne 4 sorts. Ses 3 **aspects** (râtelier de l'appart, jusqu'au rang III) modifient ces sorts.

| Arme | Sorts |
|---|---|
| Lame-mono | Entaille, Estoc (repousse), Tranche-vent (ruée qui tranche au passage), Garde haute |
| Lames mantes | Lacération (3x par tour), Saignée, Bond de mante (saut + zone), Esquive (+2 PM) |
| Poings Titan | Uppercut (repousse de 2), Direct, Onde de choc (zone, repousse, -1 PM), Plaquage |
| Fil-mono | Fouet (3 cases), Harpon (attire), Garrot (-2 PM), Toile (croix, -1 PM) |
| Pistolet « Vautour » | Tir, Tir perçant (ligne), Rafale (zone), Roulade |

## Boucle de jeu

Appart → couloir de l'immeuble → ascenseur → run de 10 secteurs → mort ou victoire → les crédits sont gardés, les implants et la psychose sont perdus → retour à l'appart.

- **Implants** : 29 implants, 4 familles, 3 raretés plus le marché noir. Ils donnent des PA, PM, portée, résistance, dégâts de poussée, vol de vie… et certains ajoutent un sort (Court-circuit, Tourelle, Grenade, Stimulant, Bouclier cinétique, Tir réflexe). Retrouver un implant l'améliore. 2 et 3 implants d'une famille débloquent une synergie.
- **Route** : chaque sortie annonce sa récompense, une rencontre (fixer et ses contrats, charcudoc de rue, netrunner, marchande) ou un secteur d'élite (boucliers, explosifs, camouflés, enragés).
- **Contrats du fixer** : gagner sans perdre un PV, gagner en 3 rounds, éliminer 2 ennemis dans le même tour.
- **Notoriété**, run du jour, récit des voisins et bestiaire comme sur `main`.

## Structure

```
src/
  tactics/         moteur de combat pur et testé : plateau, ligne de vue, chemins, sorts, tours, IA, arènes
  data/            contenu : sorts, ennemis, armes, aspects, implants, synergies, notoriété, récit, bestiaire
  core/            logique pure de la méta (stats, psychose, offres, contrats, sauvegarde, run du jour)
  scenes/          Boot, Menu, Hideout, Building, Ripperdoc, Netrunner, Run (+ run/ : vue des unités, interface), Hud, Death
  gfx/             art iso (sol, façades, obstacles), rig de personnages animés, décors
  audio/ entities/ systems/ ui/ fx/ input/
tests/             tests Vitest (core et tactics)
docs/              conception
```

Ajouter un sort, un ennemi, un implant ou un aspect = ajouter une entrée dans `src/data/`.

Debug : `?debug` dans l'URL expose le jeu sur `window.__NEON__` et l'IA de combat sur `window.__NEON_AI__` (tests automatisés).
