# Neon City — combat tactique au tour par tour (branche `tactique`)

## Intention

Le combat en temps réel (taper, esquiver, parer) était jugé « bizarre » et répétitif. La branche `tactique` remplace le combat par un système tactique au tour par tour, inspiré du genre des RPG tactiques à points d'action : chaque tour est une suite de décisions (placement, ligne de vue, poussées, tacle), et non de réflexes. `main` garde le jeu d'action intact.

Rien n'est repris d'un jeu existant (noms, classes, monstres, graphismes) : seules les mécaniques du genre sont utilisées, dans l'univers de Neon City.

## Objectifs / non-objectifs

- Objectif : des combats où chaque tour pose un vrai choix, lisibles d'un coup d'œil (zones de portée, chemins, coûts).
- Objectif : garder toute la méta du jeu (appart, couloir, arbres, armes et aspects, implants et synergies, psychose, route, événements, élites, notoriété, run du jour, récit, bestiaire).
- Non-objectif : multijoueur, groupe de plusieurs persos, minuteur de tour.
- Anti-objectif : un combat où le meilleur coup est toujours « frapper le plus proche ».

## Règles

- **Plateau** isométrique (cases en losange 32x16). Case : sol, obstacle (bloque passage et ligne de vue), trou (bloque le passage, pas la vue), hors plateau.
- **Déplacement** sur les 4 cases voisines, 1 PM par case. Les créatures bloquent le passage et la ligne de vue.
- **Tacle** : quitter une case au contact d'ennemis coûte en plus la somme de leur tacle moins ta fuite (minimum 0).
- **Tour** : PA et PM rechargés, effets sur la durée appliqués, temps de relance décomptés. Ordre fixé par l'initiative, affiché sur une frise.
- **Sorts** : coût en PA, portée min-max (modifiable ou non par la portée bonus), ligne de vue, lancer en ligne, relance en tours, nombre de lancers par tour, zone (case, croix, cercle, ligne), effets (dégâts, soin, poussée, attirance, ruée, saut, bonus et malus de PA/PM/dégâts/résistance, bouclier, saignement, invocation, psychose).
- **Dégâts** : jet min-max + dégâts fixes, × (1 + % de dégâts), × critique, × (1 − résistance de la cible), le bouclier absorbe d'abord.
- **Poussée** : chaque case de poussée bloquée inflige des dégâts de poussée ; une créature heurtée en prend la moitié.
- **Placement** sur des cases de départ avant le combat. Les vagues suivantes d'un secteur arrivent en renfort aux rounds 3 et 5.
- **Psychose** : monte à chaque début de tour (base + charge des implants) et à chaque élimination. Paliers : +10 % de dégâts à 50, +25 % et perte de vie par tour à 75, x1,5 en crise (vie qui fond, chaque élimination soigne). **Surchauffe** : une fois par tour, +2 PA contre de la psychose. Neuro-bloqueur : 2 PA en combat, −30 psychose.
- **Arme = classe** : chaque arme donne 4 sorts ; les aspects modifient ces sorts ; certains implants et reliques ajoutent des sorts.
- **IA ennemie** : à chaque action, l'ennemi évalue les sorts lançables depuis sa case, puis depuis chaque case accessible, et choisit le meilleur coup selon son profil (corps à corps, tireur qui garde ses distances, kamikaze qui s'amorce puis explose au tour suivant, hacker qui reste loin, boss à phases).

## Structure

- `src/tactics/` : logique pure testée (plateau, ligne de vue, chemins, sorts, moteur de combat, IA, génération des arènes, projection iso).
- `src/data/spells.ts`, `src/data/units.ts` : sorts et ennemis tactiques.
- `RunScene` réécrite : plateau iso, exploration au clic hors combat, combat, sorties de secteur.
- `gfx/isoArt.ts` : sol, façades et obstacles iso générés par le code. Les persos réutilisent les planches existantes (vue de face et de dos pour les 4 diagonales).
- Appart, couloir et intérieurs restent en vue de dessus, sans combat.

## Laissé au constructeur

Équilibrage chiffré (simulé en IA contre IA puis ajusté), détails visuels, textes.
