# Overworld MapSelect — Design (backlog #5)

**Date:** 2026-06-20
**Status:** Approved
**Backlog item:** #5 — Map-progression overworld for MapSelect

## Problem

MapSelect currently lists the 10 levels as a vertical sidebar of text rows
(`#map-sidebar`). It conveys no sense of journey or spatial progression. Replace
the list with a **winding-path overworld** (Super Mario World style) that shows the
10 levels as connected nodes carrying per-level artwork, with completed / next /
locked state shown spatially.

## Goal

A node-graph overworld where each level is a node along a winding path, ordered by
map id, showing earned stars and lock state, with per-level iconic artwork on each
node. Selecting an unlocked node behaves exactly like today — it populates the
featured detail panel; PLAY starts the level.

## Scope

Replace only the `#map-sidebar` list with a `#map-overworld` node graph. **Keep
unchanged:** the title, the meta-bar (total stars + Upgrades / Heroes / Audio
buttons), the featured detail panel + PLAY, the lifetime-stats footer, and all
existing scene wiring (SaveManager, `_selectMap`, `scene.start('GameScene', …)`,
overlay open/close).

## Decisions (from brainstorming)

- **Layout:** winding S-path, left→right, nodes ordered by map id.
- **Interaction:** click an unlocked node → `_selectMap(id)` → featured panel → PLAY.
- **Node art:** each map gets iconic artwork (planet, station, asteroid, ship, …).
  The renderer uses it with a graceful fallback (numbered circle) so the feature
  ships before the art exists. Art is generated separately (manual pass, like the
  backdrops); generation prompts are provided.
- **Background:** procedural CSS starfield behind the nodes (no new full-screen art).
- **Node positions:** stored per-map in `maps.js` (consistent with `waypoints` /
  `towerSlots`), not a separate layout file.
- **"Next" node:** the lowest-id **unlocked** map with **0 stars** (the next level to
  beat). Gets a highlighted/pulsing ring. If every unlocked map has stars, no node
  is marked "next".

## Components (designed for isolation/testability)

### 1. `src/data/maps.js` — per-map fields (×10)
- `overworldPos: [x, y]` — normalized 0–1 position within the overworld box, hand-
  authored into the winding S-curve.
- `overworldArt: 'overworld_<id>_<slug>.png'` — node art filename (e.g.
  `overworld_0_outpost_sigma.png`), served from `assets/overworld/`.

### 2. `src/systems/overworldState.js` — pure classifier (NEW, unit-tested)
```js
// entries: [{ id, unlocked, stars }] (any order); finalId: number
// returns the same entries, each with: { ...entry, state, isFinal }
//   state: 'completed' (unlocked && stars > 0)
//        | 'next'      (the single lowest-id unlocked entry with stars === 0)
//        | 'unlocked'  (unlocked, stars === 0, not the "next" one)
//        | 'locked'    (!unlocked)
//   isFinal: id === finalId
export function classifyOverworld(entries, finalId) { … }
```
No DOM, no Phaser — data → data. (`'unlocked'` covers the rare case of multiple
unlocked-but-unbeaten maps; only the first is `'next'`.)

### 3. `MapSelectScene._populateOverworld()` — replaces `_populateSidebar()`
(Called from `create()` in place of `this._populateSidebar()`.) Builds the overworld
into `#map-overworld` from the classified nodes + `overworldPos`:
- An **SVG connector layer** (viewBox `0 0 100 100`, `preserveAspectRatio="none"`):
  a dim polyline through all nodes in id order, plus bright gold segments drawn
  between consecutive nodes when **both** endpoints are unlocked.
- One **node element per map**, absolutely positioned at `overworldPos` (`%`):
  an `<img class="ow-node-art" src="assets/overworld/<overworldArt>">` with
  `onerror` → swap to a numbered-circle fallback; overlaid with the map number,
  earned stars (or `—`), a 🔒 for `locked`, a `next` ring for `next`, and a `final`
  variant for `isFinal`. State drives a CSS class (`completed`/`next`/`unlocked`/
  `locked`, plus `final`). Unlocked nodes wire `click → _selectMap(id)`; locked
  nodes are inert.

`MapSelectScene` stays thin: read `isUnlocked(id)` + `getStars(id)` → build
`entries` → `classifyOverworld` → `_populateOverworld`. `_selectMap(id)` is updated
to move the `.active` highlight between **node** elements (it currently toggles
`.map-row.active`); default-selection logic is unchanged.

### 4. `index.html` — markup + CSS
- Replace `<div id="map-sidebar"></div>` with `<div id="map-overworld"></div>`.
- Add CSS: starfield background on `#map-overworld`, `.ow-node` (+ state variants),
  `.ow-node-art`, number/stars overlays, connector sizing. Keep `#map-select-layout`
  flex (overworld left, featured panel right).

### 5. `assets/overworld/` — art + prompts
- `assets/overworld/PROMPTS.md` — one generation prompt per level (planet / station /
  asteroid / ship / homeworld, etc.), mirroring `assets/backgrounds/PROMPTS.md`.
- The 10 `overworld_<id>_<slug>.png` files are dropped in later by the user; until
  then the numbered-circle fallback renders.

## Data flow
`SaveManager.isUnlocked/getStars` → `entries` → `classifyOverworld(entries, 9)` →
`_renderOverworld()` paints nodes/connectors → node click → `_selectMap(id)` →
`_renderFeatured(id)` → PLAY → `scene.start('GameScene', { mapId, heroId })`
(unchanged).

## Testing
- **Unit:** `overworldState.test.js` — `classifyOverworld` covers: all-locked,
  sequential completed prefix + one `next`, fully completed (no `next`), `isFinal`
  flag, and the multi-unlocked → only-first-is-`next` case.
- **Browser:** the overworld renders the winding path with correct node states;
  clicking an unlocked node selects it (featured panel updates) and PLAY launches;
  locked nodes are inert; the numbered-circle fallback shows when art is absent;
  layout scales with the window (responsive); meta-bar/stats/overlays still work.

## Out of scope
Unlock rules, star awarding, GameScene, the hero/upgrade/settings overlays, and the
actual node art bitmaps (separate manual generation; fallback ships meanwhile).
