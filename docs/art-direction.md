# Neon City — direction artistique (branche `anime`)

Le joueur a rejeté le rendu réaliste (scans photo Poly Haven + persos Mixamo) puis le même rendu passé au filtre BD. Ce qu'il veut : **un jeu magnifique, une patte graphique forte**. Sa référence est l'anime cyberpunk en général (il cite *Cyberpunk: Edgerunners* comme exemple du *genre* de rendu). On en prend les traits de genre, **jamais** les persos, logos, plans ou designs précis de la série.

## Les traits du style

- **Formes nettes, low-poly, couleurs franches.** Aucune texture photo. Décors = kits Kenney (CC0) + KayKit Furniture (CC0) + géométrie maison simple (boîtes, biseaux, panneaux).
- **Ombres en aplats** (cel-shading à 2-3 paliers) et **traits d'encre** autour des formes (`StylePass` dans `src/three/stylize.ts` : contour depuis le depth buffer ; persos VRM : contour MToon).
- **Nuit saturée** : fond indigo/violet profond, éclairage coloré par les néons. Palette maison du jeu (garder l'identité existante) :
  - cyan `#00f0ff`, magenta `#ff2a6d`, jaune `#f5e663`, vert `#39ff88`, violet `#b84dff`, orange `#ff8c2a`
  - nuit : `#0b0820` (fond), `#1a1040`, `#2a1a5a` ; ombres teintées violet, jamais noires pures.
- **Les néons racontent les lieux** : grandes enseignes lisibles (texte en canvas, typo Teko/Chakra Petch), bandeaux lumineux, écrans, hologrammes. Une enseigne doit se lire sans zoomer (min. ~40 px de haut à l'écran en 1080p).
- **Vie et mouvement** : rien n'est figé. Pluie, vapeur qui monte, néons qui grésillent, écrans qui défilent, câbles qui se balancent, ventilateurs, passants, reflets qui ondulent.
- **Composition** : chaque pièce a un point focal clair (le perso important + sa lumière), un premier plan, un fond. Pas de grands sols vides : tapis, marquages, câbles, flaques, détritus, lumière au sol.
- **Effets graphiques façon anime** : éclair plein écran sur les gros coups, décalage chromatique bref, lignes de vitesse, trame (halftone) dans les ombres, textes d'impact.

## Persos

VRM anime (VIPE Heroes, Polygonal Mind, CC-BY) dans `public/assets/vrm/`, chargés par `src/three/characters.ts` (`CharacterRig`, même API que les anciens rigs : `root`, `height`, `ready`, `play(anim)`, `update(dt)`, `flash(color)`, `setMood`). Distribution : `hero`, `lo` (mamie du stand de ramen), `doc` (Doc Kessler), `nyx` (netrunneuse), ennemis `runner gunner brute bomber hacker warden boss`, passants `res0`…`res9`.

**Cyberware procédural** (`src/three/cyberware.ts`) : chaque perso porte des augmentations en géométrie maison low-poly (métal MToon cel-shadé violet, liserés néon non éclairés, contour d'encre en coque inversée), ajustées sur sa peau mesurée au repos et attachées aux os normalisés VRM pour suivre les animations. Le look de chacun tient dans la table `CYBER` (bras mécanique qui remplace l'avant-bras d'origine, visière, œil, lignes de joue, prises de nuque, câbles, colonne, plaques, casque Psy-Sec qui rentre les cheveux…), reprise de l'identité des sprites pixel art (héros : bras chromé gauche + œil cyan ; brute : bras hydrauliques ; gunner : visière + bras canon, etc.).

## Assets disponibles (tous CC0 sauf persos)

- `public/assets/kenney/<kit>/*.glb` (+ `Textures/colormap.png`, une palette par kit) : `commercial` (immeubles, auvents), `industrial`, `roads` (routes, lampadaires, barrières), `suburban`, `cars` (berline, taxi, police, van…), `station` (lits, chaises, ordis, écrans, conteneurs, tuyaux, portes, murs SF), `space` (couloirs modulaires, câbles), `arcade` (bornes d'arcade, distributeur, flipper), `market` (étagères, frigos, caisse).
- `public/assets/kaykit/furniture/*.gltf` (+ `texture/furniturebits_texture.png`) : lits, canapés, fauteuils, tables, étagères, lampes, tapis, cadres, plantes.
- **Seuls les modèles référencés dans `src/` sont dans le repo** (`node scripts/prune-kits.mjs --delete` retire les autres ; les noms construits à l'exécution vont dans sa liste `DYNAMIC`). Les kits complets sont dans l'historique git (commit qui précède `perf: lighter first download`) : `git checkout <commit> -- public/assets/kenney/<kit>/<nom>.glb` pour en récupérer un.
- Les palettes `colormap.png` peuvent être **recolorées** vers la palette néon (copie modifiée, ne pas écraser l'original sans raison). Ces textures-palettes ne doivent **pas** être aplaties par `stylizeScene` (qui réduit les textures photo à une couleur moyenne).
- Les anciens assets Poly Haven (`public/assets/ph`, hors git) ne doivent plus être utilisés à terme.

## Contraintes techniques

- three.js 0.181 sous un canvas Phaser transparent (`src/three/stage.ts`). Phaser garde toute la logique (collisions, interactions, panneaux, bulles), en coordonnées logiques 480×270 (canvas 1920×1080, `CONFIG.ZOOM = 4`).
- Intérieurs : caméra orthographique regardant le nord, mapping pixel exact `at(px, py, h)` dans `Interior3D.ts`, pour que les bulles et invites Phaser restent alignées.
- Rues : caméra iso orthographique, `CELL = 1.5` m, `World3D.buildBoard`.
- Poids des assets : l'écran de chargement télécharge tout `public/assets/manifest.json` (`scripts/asset-manifest.mjs`, sans la musique, streamée). Tout nouveau VRM passe par `scripts/slim-vrm.mjs` puis `scripts/compress-vrm.mjs` (textures 1024 px en PNG palette, morphs en accessors sparse, index 16 bits) : ~1,1 Mo par perso au lieu de ~3.
- Tests : `npx vitest run` (196), `npx tsc --noEmit -p .`, `npx vite build`. Dev server : `http://localhost:5199/?debug` (`window.__NEON__` = jeu Phaser, `window.__NEON3D__()` = le World3D, pour `renderer.info`). Scripts Playwright d'exemple dans le scratchpad `pw/` (Edge headless, `--use-angle=d3d11`).
- **Performance** : le coût d'une image est surtout le nombre de draw calls (~10 µs chacun sur un GPU intégré), pas la résolution. Une seconde après la construction d'un lieu, `World3D.bakeShadows` fusionne ce qui n'a pas bougé : les ombres statiques en un seul mesh de profondeur, le reste par matériau et par tuile de 12 m (les originaux restent dans la scène sans calque). Conséquence : **un objet de décor qu'on déplace, cache ou dont on change le matériau après coup doit être ajouté après la construction**, ou bouger pendant la première seconde (sinon son ombre et son image restent figées). Les matériaux propres à un seul objet (enseignes en canvas, `glow()`) ne fusionnent pas : réutiliser un matériau partagé quand c'est possible. Le cyberware d'un perso est un seul `SkinnedMesh`. `disposeTree` (`src/three/dispose.ts`) libère un lieu quand on le quitte ; les géométries de cache se marquent `userData.shared`. Option QUALITÉ GRAPHIQUE (auto/haute/basse, `src/three/quality.ts`).
