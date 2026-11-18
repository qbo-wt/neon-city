---
name: neon-fix
description: Use for a small, localized Neon City fix the user reports (a misplaced prop, an NPC clipping, a UI offset, a wrong value, a text tweak) — usually from a screenshot. Do it inline, without spawning an agent.
---

# Small Neon City fix, inline

Goal: fix it in a few thousand tokens. No agent, no exploration of `src/`.

1. **Locate** with the code map in `CLAUDE.md`, then one targeted `Grep` (a label, an id, a coordinate). Read only the lines around the hit (`Read` with `offset`/`limit`).
   - Interior props / collisions → `src/three/interior/<room>.ts` (`at(px, py, h)`, `blockers`); NPC placement → the room's scene (`res(...)`, `this.npc(...)`).
   - UI → the panel in `src/ui/`; loading screen → `src/ui/LoadingScreen.ts`; combat UI → `src/scenes/run/TacticalUi.ts`.
   - Balance → `NORMAL_TUNING` (`src/core/mode.ts`), `BOSS_TUNING` (`src/tactics/bosses.ts`), `src/data/*`.
2. **Edit** the smallest change that fixes the cause. Keep the existing style; add a one-line comment only when the reason is not obvious.
3. **Check**: `npx tsc --noEmit -p .`. Run `npx vitest run` only if logic changed (not for coordinates or text). A screenshot only for a 3D placement that can't be judged blind — one crop, scripts in the scratchpad (`pw/int-crop.mjs` for interiors).
4. **Commit + push** on `main`:
   `git add <files>` (never `git add -A` — another agent may have staged work) then
   `git -c user.name="Quentin Bonhoure" -c user.email="q.bonhoure@reply.com" commit -q -m "fix: <what was wrong>"` and `git push -q`. No Co-Authored-By, no AI mention.
5. **Reply** in French, 2-3 sentences: what was wrong, what changed, whether it was checked visually. Vercel redeploys on push.
