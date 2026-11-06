# Neon City

Rogue-lite d'action en vue de dessus, dans le navigateur. Pixel art cyberpunk entièrement généré par le code (aucun fichier image).

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
| Frapper (combo x3, vers le curseur) | Clic gauche (maintenir = enchaîner) |
| Parer (fenêtre de 150 ms) | Clic droit |
| Neuro-bloqueur (-30 psychose) | F |
| Interagir (planque) | E |
| Choisir un implant | Clic ou 1 / 2 / 3 |

## Boucle de jeu

Planque → run de 8 secteurs (le dernier est un boss) → mort ou victoire → les crédits sont gardés, les implants et la psychose sont perdus → arbre de compétences au terminal de la planque.

**Psychose** : chaque implant ajoute de la charge. La jauge monte avec le temps passé en combat et à chaque ennemi tué. À 50 % : glitchs visuels. À 75 % : la vie baisse lentement. À 100 % : crise de cyberpsychose (+50 % dégâts et vitesse, mais la vie fond).

## Structure

```
src/
  config.ts        tous les réglages chiffrés
  core/            logique pure, testée, sans Phaser (stats, psychose, parade, arbre, sauvegarde, génération)
  data/            contenu : implants, ennemis, nœuds de l'arbre, salles
  entities/        Player, Enemy, Bullets
  scenes/          Boot, Menu, Hideout, Run, Hud, Death
  gfx/             sprites en grilles de caractères + génération des textures
  systems/ ui/ fx/ input/
tests/core/        tests Vitest
docs/              conception et plan
```

Ajouter un implant, un ennemi ou un nœud = ajouter une entrée dans `src/data/`.

Debug : `?debug` dans l'URL expose l'instance du jeu sur `window.__NEON__`.
