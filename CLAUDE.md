# tower-defense

Browser tower-defense game built with Phaser 3. Deployed to Vercel (tower-defense-black.vercel.app).

This is a **vanilla JavaScript** project — the root `~/projects/CLAUDE.md` TypeScript/Next.js conventions do NOT apply here. Rules below override the root defaults for this directory.

## Session start

Read `.claude/notes.md` first for current state, blockers, and the prioritized backlog.

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

- Keep game balance and tunable numbers in `src/data/` — never hardcode stats inside entity logic.
- Game logic should be unit-testable without a running canvas: keep pure logic (targeting math, economy, wave timing) out of Phaser lifecycle methods so Vitest + jsdom can exercise it.
- One concern per module; prefer pure functions for anything that isn't directly touching the Phaser scene graph.
- Comments explain *why*, not *what*.

## Workflow

Follow the superpowers pipeline (brainstorm → spec → plan → `superpowers:subagent-driven-development` → verify → PR), same as the other projects. Specs in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`.

## Deploy

Vercel static build from `dist/`. Verify a production build locally (`npm run build && npm run preview`) before pushing.
