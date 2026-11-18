---
name: neon-agent
description: Use before spawning a subagent for a Neon City feature or multi-file change. Gives the model choice and a short brief template so the agent explores less and reports briefly.
---

# Delegating a Neon City task

**Do it inline instead** if it touches 1-2 files you can name (see the `neon-fix` skill).

## Model
- `model: "sonnet"` by default: decor, dialogue/text, tuning, UI panels, small features, cleanups.
- Omit `model` (top model) only for cross-cutting game rules: combat systems, run modes, psychosis, save migrations, performance.
- One agent at a time; resume an interrupted one with `SendMessage` rather than starting fresh.

## Brief template (keep it under ~25 lines)
```
Neon City, repo c:\Users\q.bonhoure\OneDrive - Reply\Bureau\Taff\Jeu, branch main.
Read CLAUDE.md first (code map, rules, known traps) — do not re-explore src/ beyond the files it points to.

Goal (user's words): <quote>
Do: <3-8 concrete bullets, with the exact files to touch>
Don't: <scope limits>

Rules: no browser/screenshots unless <reason>; npx tsc --noEmit -p . clean; npx vitest run green
(add 1-3 tests that can fail if logic changed); commit + push on main as
Quentin Bonhoure <q.bonhoure@reply.com>, no Co-Authored-By, no AI mention; never read or write .env;
git add only your own files.

Report in French, max 10 lines: what changed, where to tune it, commit hash, what the user should test.
```

## After the agent
Relay the report to the user in French, shorter than the agent's. Don't re-verify what the agent already ran unless something looks off.
