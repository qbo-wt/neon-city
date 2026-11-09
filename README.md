# Neon City

Rogue-lite d'action en vue de dessus, dans le navigateur. Pixel art cyberpunk, bruitages et musique entièrement générés par le code (aucun fichier image ni son).

## Lancer

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests de la logique de jeu (Vitest)
npm run build      # vérification des types + build statique dans dist/
```

## Contrôles

| Action | Touche |
|---|---|
| Bouger | ZQSD, WASD ou flèches |
| Dash (invulnérable) | Espace |
| Frapper vers le curseur (maintenir = enchaîner) | Clic gauche |
| Parer (fenêtre de 150 ms) | Clic droit |
| Capacité spéciale de l'arme | E ou Maj (en run) |
| Neuro-bloqueur (-30 psychose) | F |
| Interagir | E |
| Choisir une option | Clic ou 1 à 7 |
| Couper / remettre le son | M |
| Aide des commandes | I ou bouton « i » |

## Boucle de jeu

Appart → couloir de l'immeuble → ascenseur → run de 10 secteurs → mort ou victoire → les crédits sont gardés, les implants et la psychose sont perdus → retour à l'appart.

- **Appart** : terminal (historique des runs, meilleures runs, runs du jour), serveur (bestiaire), râtelier d'armes.
- **Couloir** : PNJ animés qui se souviennent de ta dernière run, clinique du charcudoc (arbre du **corps**), repaire de la netrunneuse (arbre de l'**esprit**).
- **Ascenseur** : run normale, run du jour (même ville pour tout le monde à une date donnée), avis de recherche (notoriété).

## Systèmes

- **Sensations** : hitstop selon le poids du coup, ralenti et flash chromatique sur parade parfaite, boss abattus au ralenti. Bruitages synthétisés et musique synthwave qui suit l'action (planque, combat, rue nettoyée, boss).
- **Armes** (râtelier de l'appart) : Lame-mono, Lames mantes, Poings Titan, Fil-mono, Pistolet « Vautour », chacune avec son rythme et sa capacité spéciale. Chaque arme a 3 **aspects** (celui de base et 2 à débloquer) qui changent sa façon de jouer, chacun jusqu'au rang III.
- **Implants** : 24 implants, 4 familles (chrome, neural, sang, optique), 3 raretés plus le marché noir (gros bonus, vrai défaut). Retrouver un implant l'améliore (jusqu'au niveau III). 2 et 3 implants d'une famille débloquent une synergie.
- **Psychose** : la jauge monte pendant les combats, plus vite avec la charge des implants et à chaque ennemi tué. C'est aussi une force : +10 % de dégâts à 50 %, +25 % et +10 % de vitesse à 75 % (mais la vie baisse), x1,5 en crise (la vie fond, chaque élimination soigne un peu).
- **Route** : chaque porte annonce sa récompense (implant d'une famille, soin, crédits, coffre), une **rencontre** (fixer et ses contrats, charcudoc de rue, pari de netrunner, marchande ambulante) ou un **secteur d'élite** (boucliers, explosifs, camouflés ou enragés, meilleur butin).
- **Rues** : 7 types de cartes plus grandes que l'écran, objets cassables (vie, crédits, rarement une relique), événements de lumière.
- **Boss** : secteurs 5 et 10, 3 phases, répliques selon ton historique avec eux.
- **Notoriété** (après une première victoire) : 7 handicaps à rangs, +10 % de crédits par point, prime pour chaque nouveau record.
- **Récit** : Mamie Lo, le Doc Kessler et Nyx réagissent à ta dernière run et racontent leur histoire, une étape par run, avec un cadeau à la fin. Bestiaire débloqué par les éliminations (description, tactique, secret).

## Structure

```
src/
  config.ts        réglages chiffrés
  audio/           moteur WebAudio : bruitages et séquenceur de musique
  core/            logique pure, testée, sans Phaser (stats, psychose, offres d'implants, contrats,
                   sauvegarde, run du jour, dialogues, génération)
  data/            contenu : implants, synergies, armes, ennemis, notoriété, récit, bestiaire, salles
  entities/        Player, Enemy, Npc, Bullets
  scenes/          Boot, Menu, Hideout, Building, Ripperdoc, Netrunner, Run, Hud, Death
  gfx/             rig de personnages animés, décors et textures générés
  systems/ ui/ fx/ input/
tests/core/        tests Vitest
docs/              conception et plan
```

Ajouter un implant, une arme, un ennemi, un pacte de notoriété ou une réplique = ajouter une entrée dans `src/data/`.

Debug : `?debug` dans l'URL expose l'instance du jeu sur `window.__NEON__`.
