# Neon City — guide pour l'agent

Roguelite tactique cyberpunk au tour par tour (PA/PM, sorts, grille, ligne de vue), Phaser 4 + three.js 0.181 + TypeScript + Vite. Jeu et UI en français ; code, commentaires et messages de commit en anglais.

## Branche
- Une seule branche : `main`, le jeu (rendu 3D anime cel-shading). Ne pas créer d'autre branche sans demande.

## Commandes
- `npx tsc --noEmit -p .` — doit être propre.
- `npx vitest run` — doit être vert (tests dans `tests/core`, `tests/tactics`, `tests/three`).
- `npx vite build` — build de prod.
- `npx vite --port 5199` puis `http://localhost:5199/?debug` : `window.__NEON__` = jeu Phaser, `window.__NEON_AI__` = IA de combat (pour faire jouer le héros dans un test).
- `node scripts/asset-manifest.mjs` après tout ajout/suppression d'asset dans `public/assets`.

## Mode de travail voulu par l'utilisateur
- Il teste lui-même en jouant : **pas de vérification navigateur ni de captures** sauf si la tâche est visuelle et impossible à faire à l'aveugle (placement 3D) — alors 1 à 3 captures max, scripts et images dans le scratchpad, jamais dans le repo.
- Économiser les tokens : lire les fichiers ciblés ci-dessous plutôt qu'explorer tout `src/`.
- Commit + push sur `main` autorisés. Auteur et committer : `Quentin Bonhoure <q.bonhoure@reply.com>` (`git -c user.name="Quentin Bonhoure" -c user.email="q.bonhoure@reply.com" commit …`). **Jamais** de ligne Co-Authored-By ni de mention de Claude / IA / Anthropic.
- Ne jamais lire ni écrire `.env`.
- Ne jamais copier les persos, quêtes, noms ou répliques d'une œuvre existante : on prend les traits du genre cyberpunk, tout le reste est original.

## Carte du code
| Zone | Fichiers |
|---|---|
| Config, entrée | `src/config.ts` (`SCENES`, `ZOOM = 4`, logique 480×270), `src/main.ts` |
| Scènes | `src/scenes/` : `MenuScene`, `HideoutScene` (appart), `BuildingScene` (couloir), `InteriorScene` (base des intérieurs), `RipperdocScene` (Doc), `NetrunnerScene` (Nyx), `RunScene` (run + combat), `HudScene`, `EndingScene` (fin d'une victoire, avant `DeathScene`), `BootScene` |
| Combat (logique pure, testée) | `src/tactics/` : `fight.ts` (règles, `FightHooks`, `cloneFight`), `ai.ts`, `arena.ts` (génération, `TERRAIN`), `terrain.ts` + `hazards.ts` (pièges, barils, couverts), `bosses.ts` (`BOSS_HOOKS`, `BOSS_TUNING`), `units.ts`, `board.ts` |
| Run, progression | `src/core/` : `mode.ts` (paliers de run), `ending.ts` (fin par palier + liseré du héros débloqué à la première victoire, textes dans `src/data/ending.ts`, état dans `save.endings` et `settings.look`), `runMap.ts`, `relics.ts`, `psychosis.ts`, `stats.ts`, `loot.ts`, `save.ts`, `story.ts`, `daily.ts`, `skillTree.ts`, `tutorial.ts`, `vending.ts` (Capsule), `settings.ts` ; `src/systems/runState.ts`, `streetEvents.ts` |
| Données | `src/data/` : `enemies`, `spells`, `weapons`, `implants`, `synergies`, `relics`, `heat`, `aspects`, `story`, `dialogue`, `codex`, `tutorial`, `vending`, `rooms`, `skillNodes` |
| Rendu 3D | `src/three/` : `stage.ts` (canvas three sous Phaser), `stylize.ts` (`StylePass` : cel, encre, effets), `characters.ts` (VRM `CharacterRig`, `CAST`), `cyberware.ts` (table `CYBER`), `World3D.ts` + `street/*` (rues/combat), `Interior3D.ts` + `interior/*` (une pièce par fichier : `apartment`, `corridor`, `clinic`, `den`), `portraits.ts`, `quality.ts`, `preload.ts` |
| Textures 2D restantes | `src/gfx/` : `generateTextures.ts` (icônes de la carte, glow, slash, corps physiques invisibles), `sprites.ts`, `vendingFace.ts` (visage de Capsule) |
| UI | `src/ui/` : `kit.ts` (style des panneaux), `text.ts` (polices), `GuidePanel`, `OptionsPanel`, `Tutorial`, `ChoicePanel`, `VendingTalk`, `HelpOverlay`, `LoadingScreen` ; `src/scenes/run/TacticalUi.ts` (UI de combat) |
| Effets, son | `src/fx/animeFx.ts`, `src/fx/screenFx.ts`, `src/audio/audio.ts` (`TRACKS`) |

## Classement des potes (backend Vercel)
- `api/scores.ts` (Vercel Function, Web handlers `GET`/`POST`) + `api/_scoreboard.ts` (logique, stockage injecté pour les tests) : une meilleure run par joueur et par mode (normale, cyberhard, du jour), stockée dans un Redis Upstash. Les imports de `api/` vers `src/` gardent l'extension `.js` (runtime Node ESM).
- `src/core/ranking.ts` : **ordre de classement unique** (victoire, secteur, notoriété, temps) + validation du payload, importé par le client et par la fonction (aucun import interne, pour rester déployable seul). `src/core/leaderboard.ts` (client, silencieux hors ligne), `src/core/player.ts` (pseudo + « ne pas participer », clé localStorage à part), `src/ui/NamePanel.ts` (saisie du pseudo). Onglet CLASSEMENT dans `HistoryPanel`, envoi dans `DeathScene`.
- Il faut un **Redis Upstash relié au projet Vercel** (Storage → Marketplace → Upstash Redis → Connect Project, puis redéployer) : variables `KV_REST_API_URL/TOKEN` ou `UPSTASH_REDIS_REST_URL/TOKEN`. Sans lui, l'API répond 503 et le jeu affiche « classement hors ligne ». `vite` en local ne sert pas `/api`.

## Pièges connus
- Paliers de run (`src/core/mode.ts`) : run normale (défaut, sans psychose, réglages dans `NORMAL_TUNING`) → CyberHard (débloquée par une victoire) → avis de recherche (victoire en CyberHard, notoriété CyberHard seulement), persistés dans `save.unlocks`. La run du jour garde les règles CyberHard. Tout ce qui touche la psychose passe par `psyOn` (`RunScene`) ou `Fight.noPsy` ; le contenu qui n'a de sens qu'avec elle est marqué `psyOnly` (reliques, implants), `cyberhard` (nœuds de Nyx) ou `calm` (synergie).
- Les crochets de combat ne gardent **aucun état propre** : l'IA et les aperçus jouent sur des copies (`cloneFight`). État par unité dans `Unit.mem`, état de combat dans `Fight`.
- Les scènes réécrivent leur copie complète de la sauvegarde : un état modifié en cours de scène hors de cette copie doit avoir sa propre clé localStorage (comme `settings.ts`, `tutorial.ts`).
- Intérieurs : positions en pixels logiques via `at(px, py, h)` ; collisions dans les `blockers` de chaque pièce. Les scènes ambiantes de Capsule repèrent les habitants par l'ordre des `res(...)` dans `BuildingScene` : ne pas les réordonner.
- Modèles Kenney/KayKit inutilisés supprimés : en récupérer un avec `git checkout 95b5303 -- public/assets/kenney/<kit>/<nom>.glb`, l'ajouter à `DYNAMIC` dans `scripts/prune-kits.mjs` s'il est référencé dynamiquement.
- Cache : les fichiers de `public/assets` gardent leur nom d'un déploiement à l'autre. Tout téléchargement passe par `assetUrl()` (`src/three/assetUrl.ts`, branché sur `THREE.DefaultLoadingManager`), qui ajoute `?v=<hash>` depuis le manifeste. Un nouveau `fetch` d'asset doit l'utiliser aussi, sinon un ancien navigateur mélange nouveau code et vieux fichiers (T-pose générale). Les bundles Vite sont dans `build/` (cache immuable, `vercel.json`).
- Nouveau VRM : passer `scripts/slim-vrm.mjs` puis `scripts/compress-vrm.mjs`.

Direction artistique détaillée : `docs/art-direction.md`.
