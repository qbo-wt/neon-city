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
| Scènes | `src/scenes/` : `MenuScene`, `HideoutScene` (appart), `BuildingScene` (couloir), `InteriorScene` (base des intérieurs), `RipperdocScene` (Doc), `NetrunnerScene` (Nyx), `RunScene` (run + combat), `HudScene`, `DeathScene`, `BootScene` |
| Combat (logique pure, testée) | `src/tactics/` : `fight.ts` (règles, `FightHooks`, `cloneFight`), `ai.ts`, `arena.ts` (génération, `TERRAIN`), `terrain.ts` + `hazards.ts` (pièges, barils, couverts), `bosses.ts` (`BOSS_HOOKS`, `BOSS_TUNING`), `units.ts`, `board.ts` |
| Run, progression | `src/core/` : `runMap.ts`, `relics.ts`, `psychosis.ts`, `stats.ts`, `loot.ts`, `save.ts`, `story.ts`, `daily.ts`, `skillTree.ts`, `tutorial.ts`, `vending.ts` (Capsule), `settings.ts` ; `src/systems/runState.ts`, `streetEvents.ts` |
| Données | `src/data/` : `enemies`, `spells`, `weapons`, `implants`, `synergies`, `relics`, `heat`, `aspects`, `story`, `dialogue`, `codex`, `tutorial`, `vending`, `rooms`, `skillNodes` |
| Rendu 3D | `src/three/` : `stage.ts` (canvas three sous Phaser), `stylize.ts` (`StylePass` : cel, encre, effets), `characters.ts` (VRM `CharacterRig`, `CAST`), `cyberware.ts` (table `CYBER`), `World3D.ts` + `street/*` (rues/combat), `Interior3D.ts` + `interior/*` (une pièce par fichier : `apartment`, `corridor`, `clinic`, `den`), `portraits.ts`, `quality.ts`, `preload.ts` |
| UI | `src/ui/` : `kit.ts` (style des panneaux), `text.ts` (polices), `GuidePanel`, `OptionsPanel`, `Tutorial`, `ChoicePanel`, `VendingTalk`, `HelpOverlay`, `LoadingScreen` ; `src/scenes/run/TacticalUi.ts` (UI de combat) |
| Effets, son | `src/fx/animeFx.ts`, `src/fx/screenFx.ts`, `src/audio/audio.ts` (`TRACKS`) |

## Pièges connus
- Les crochets de combat ne gardent **aucun état propre** : l'IA et les aperçus jouent sur des copies (`cloneFight`). État par unité dans `Unit.mem`, état de combat dans `Fight`.
- Les scènes réécrivent leur copie complète de la sauvegarde : un état modifié en cours de scène hors de cette copie doit avoir sa propre clé localStorage (comme `settings.ts`, `tutorial.ts`).
- Intérieurs : positions en pixels logiques via `at(px, py, h)` ; collisions dans les `blockers` de chaque pièce. Les scènes ambiantes de Capsule repèrent les habitants par l'ordre des `res(...)` dans `BuildingScene` : ne pas les réordonner.
- Modèles Kenney/KayKit inutilisés supprimés : en récupérer un avec `git checkout 95b5303 -- public/assets/kenney/<kit>/<nom>.glb`, l'ajouter à `DYNAMIC` dans `scripts/prune-kits.mjs` s'il est référencé dynamiquement.
- Nouveau VRM : passer `scripts/slim-vrm.mjs` puis `scripts/compress-vrm.mjs`.

Direction artistique détaillée : `docs/art-direction.md`.
