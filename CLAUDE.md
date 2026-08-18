# tower-defense

Phaser-based tower-defense game ("Last Light") — 10 maps, tier-branching towers, hero units, and a storyline. Deployed to Vercel at tower-defense-black.vercel.app.

This is a **vanilla JavaScript** project — the root `~/projects/CLAUDE.md` TypeScript/Next.js conventions do NOT apply here. Rules below override the root defaults for this directory.

## Session start

Read `.claude/notes.md` first — it has current state, blockers, and the prioritized backlog.

## Tech stack

- **Phaser 3** (`^3.88`) — game engine
- **Vite 5** — dev server and bundler (`vite.config.js`)
- **Vitest 2** + **jsdom** — test runner
- Plain ES modules, JavaScript — no TypeScript, no JSX, no framework

## Commands

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Production build | `npm run build` (outputs to `dist/`) |
| Preview build | `npm run preview` |
| Run tests | `npm run test` (`vitest run`) |
| Watch tests | `npm run test:watch` |

## Source layout (`src/`)

| Dir | Holds |
|---|---|
| `scenes/` | Phaser scenes (menu, game, UI overlays) |
| `entities/` | Towers, enemies, projectiles, soldiers |
| `systems/` | Wave spawning, targeting, economy, collisions |
| `ui/` | HUD, tower picker, branch picker |
| `data/` | Tower/enemy/wave config and balance tables |
| `utils/` | Shared helpers |

Static assets live in `public/` (served as-is) and `assets/` (source art/audio).

## Conventions

- Default branch is `main` — open PRs against `main`.
- Keep game balance and tunable numbers in `src/data/` — never hardcode stats inside entity logic.
- Game logic should be unit-testable without a running canvas: keep pure logic (targeting math, economy, wave timing) out of Phaser lifecycle methods so Vitest + jsdom can exercise it.
- One concern per module; prefer pure functions for anything that isn't directly touching the Phaser scene graph.
- Comments explain *why*, not *what*.
- Backlog lives in `.claude/notes.md`; specs/plans under `docs/superpowers/`.
- Default to `superpowers:subagent-driven-development` for plan execution; don't offer inline.

## Deferred-asset pattern

Several features ship ahead of their art/audio. A pure key-deriving helper falls back to a placeholder until the real file is registered, so the asset drops in with zero (or one-line) code change. See `src/systems/sfxKeys.js`, `src/systems/portraitFallback.js`, `src/systems/spriteKeys.js`, and the per-directory `assets/*/PROMPTS.md`.

## Definition of Done

Before declaring any fix complete:
- Enumerate the edge cases the change must handle (missing/zero values, empty sets, excluded/filtered records, boundary & off-by-one cases) and confirm each is covered — make the enumeration visible, not implicit.
- Validate behavior against the real data source or live app (browser-verify the running game), not just unit tests — a green test is not a working feature.
- Name the root cause, not just the surface patch; if the fix papers over a deeper data/pipeline gap, say so.

## Workflow

Follow the superpowers pipeline (brainstorm → spec → plan → `superpowers:subagent-driven-development` → verify → PR). Specs in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`.

## Deploy

**`main` is the Vercel production branch** — merging to `main` publishes to tower-defense-black.vercel.app. Every other branch produces a preview deployment only. Never push to `main` without an explicit ask.

Vercel runs a static Vite build from `dist/`. Verify a production build locally (`npm run build && npm run preview`) before pushing.
