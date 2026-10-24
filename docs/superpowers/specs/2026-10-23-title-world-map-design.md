# Roadmap 3.4: title screen and world map (design)

**Branch:** `visual/3.4-title-world-map` (off `origin/visual/integration`: 2.1–2.4, #43, 3.1 theme, 3.3 radial, #52 merged) · **Date:** 2026-10-23
**Mockups (rough sketches, not pixel specs):** `docs/captures/3.4-title-world-map/mockups/`. These are `title-flash.html` (option A "beam sweep" chosen), `world-map-vista.html` + `.png` (the chosen backdrop) and `before-mapselect-*.png` (today's screen).

Tags used below: **[User]** = decided by the user, not reopened here. **[Claude]** = Claude's call; the user may override it. **[Builder]** = left to the implementer, within the stated constraints.

## 1. Intent

### The literal ask
- *"I picture an intro screen with a space theme and LAST LIGHT flashing across the screen. Then the user clicks to get into the game and sees the world maps."*
- *"The world map doesn't have a background — there's no connection to progress in a story — why am I going from map to map?"*
- On the backdrop: *"two looks better, but I'd want more planets"*.
- After a win: *"transition back to the home screen [= the world map, confirmed] and show the movement to the next stage."*
- Roadmap 3.4: *"Animated starfield + parallax, typographic logo with glow (code, not generated), overworld nodes with state (locked/open/cleared + stars), polished transitions."*

### Why
Today the game boots straight into a utilitarian map select. `MenuScene.create()` is a single `scene.start('MapSelectScene')`. The map select has no backdrop beyond a radial gradient, says nothing about why mission 4 follows mission 3, and gives no sense of progress after a win. On an iPhone 14 in landscape the overworld nodes run off the bottom of their clipped panel (`before-mapselect-iphone.png`). The story already exists in `src/data/story.js`: Sol Vanguard pushes the Veth from Earth out to the hive core. But that story only appears in dialogs. 3.4 puts it on the map itself.

### Goals
1. A title screen that sets the tone in about 2 s and never stands in the way.
2. A world map that reads as a war campaign. You can see where you are (act, front line, sectors retaken), where you're going (route, hive core) and why (Command's briefing line).
3. Winning a mission visibly moves the campaign forward on the map.
4. It's fully usable on a 750×340 phone viewport, with every control at least 44 px on touch and nothing clipped.
5. Everything is code-drawn, so no new art is needed. A generated backdrop could drop in later.

### Non-goals
- Restyling the story dialogs (3.5), the results screen or star rules (3.6), new generated art, and balance.
- A level-select replay of the post-win movement, cut-scenes, voice, or new music.
- Requesting fullscreen on the title tap. The existing `⛶ Fullscreen` button stays the only path.

### Anti-goals (it "works" but counts as a failure)
- **A title that delays repeat players.** Any tap must leave the title at once, even mid-sweep. No minimum display time.
- **A map that is unreadable or clipped on a phone.** Nodes off-screen, labels colliding, or a launch button below the fold.
- **Animation that blocks input with no skip.** Any tap or key during the post-win movement jumps to its end state.
- **A tap that leaks through a transition.** For example, the tap that dismisses the title must not land on `LAUNCH` underneath and start mission 1.
- **Story text that contradicts the existing dialogue.** Act and objective lines are written *from* `story.js`. The briefing card quotes it verbatim.
- **Canvas text.** All words are DOM text, so font loading, accessibility and the layout audit all see them.

## 2. Screens and flow

```
launch → BootScene → TitleScene (#title-screen)
           └─ tap / click / Enter / Space ──► MapSelectScene ("World Map", #map-select)
                                                ├─ campaign_intro dialog (first visit only) ─┐
                                                ▼                                            ▼
                                              world map interactive ◄──────────────────────────┘
                                                └─ LAUNCH ──► GameScene (briefing dialog first time)
                                                                └─ victory/defeat/abandon → #game-msg
                                                                      └─ "↩ World Map" ──► MapSelectScene { from }
                                                                                              └─ first clear: movement animation
```

| # | Rule | Tag |
|---|---|---|
| F1 | The title shows on **every** launch, including fresh and returning players. | [Claude] |
| F2 | Returning from a mission (victory, defeat or abandon) goes to the world map, **never** back through the title. | [User] for victory, [Claude] for defeat/abandon |
| F3 | One tap or click anywhere on the title, or Enter/Space, goes to the world map. A tap during the beam sweep counts too. | [User] + [Claude] for keys |
| F4 | `campaign_intro` (today it pops over map select on the first visit) plays after the title tap, over the world map, before the map is interactive. First time only, via the existing `hasSeenBeat`. No code change is needed beyond the new order. | [Claude] |
| F5 | The post-win movement plays only on a **first clear**. A replay of a cleared mission never flies the ship. | [User] (movement) + [Claude] (first clear only) |
| F6 | The debug/capture entry (`?debug=1…`, compiled out of production) still jumps straight to `GameScene`, skipping the title. | existing |
| F7 | The "↩ Map Select" label on `#game-msg` becomes "↩ World Map". It's a text change only, and 3.6 restyles the screen. | [Claude] |

### 2.1 Title screen [User: space theme, beam sweep, gold Orbitron logo, "TAP TO START", one tap]
- **Layers, back to front:**
  - a full-viewport `<canvas>` starfield with 3 parallax layers drifting slowly leftward and a faint twinkle (as in `title-flash.html`)
  - an optional soft gold nebula glow behind the logo (canvas)
  - the DOM logo `LAST LIGHT`
  - the DOM prompt
- **Logo (code-drawn, never generated art):**
  - Orbitron 700, gold `--ui-currency`, letter-spacing ≈ 0.12 em, centred at about 38 % height
  - size `clamp()` from viewport width, so it fills about 60 % of the width on desktop and never wraps at 750 px
- **Beam sweep (option A):**
  1. The title starts dim, "in shadow" (a dark gold mixed toward the panel colour).
  2. A bright band (`#fff7c2` core) sweeps across it left to right, like a searchlight. This is CSS `background-clip: text` with a moving gradient, plus `-webkit-` prefixes.
  3. It then settles **lit**, in gold with a soft gold `text-shadow` glow.
  4. Timings are in `src/data/title.js`. Seeds: delay 300 ms, sweep 1600 ms, settle 600 ms.
  5. The logo holds lit. It doesn't loop.
- **Prompt:**
  - Orbitron at `--ui-fs-sm` or larger, letter-spacing 0.35 em, accent cyan
  - appears after the sweep starts, then pulses (opacity 0.25 ↔ 1, about 2.2 s)
  - text is "TAP TO START" on a coarse pointer and "CLICK TO START" on a fine pointer [Claude]. Both strings are data.
- **Fonts:** before starting the sweep, the title waits for `document.fonts.load('700 1em Orbitron')`, capped at `TITLE.fontWaitMs` (seed 600 ms). The dim "shadow" state is the waiting state, so the wait doesn't show. On timeout it sweeps on the fallback face, which is narrower than Orbitron (3.1 rule), so it can't overflow.
- **Input:**
  - Listen for `click` on `#title-screen` (the **last** event of a tap, so no click is left over to land on the map) and `keydown` Enter/Space on the document.
  - The first one wins, and the handler unbinds itself before `scene.start`.
  - `#title-screen` has `role="button"`, `tabindex="0"` and `aria-label="Start game"`. No `title=` attribute (guard `noNativeTitles`).
- **Audio:** the title tap is a user gesture. `main.js`'s capture-phase `pointerup` already resumes WebAudio. `MapSelectScene` keeps its `playMusic('menu')`, so the music now starts right after the gesture. [Builder] may start the menu track on the title if `AudioManager` defers cleanly until the unlock, and must confirm that `playMusic('menu')` on the map doesn't restart a playing track.
- **Portrait phone:** `#rotate-prompt` (z 1000) covers the title and swallows taps. The title stays put until the player rotates.

### 2.2 World map [User: deep-space vista with many planets, story layer, briefing card]
Regions, laid out per §5:
- **Backdrop canvas** (full screen):
  - base gradient: blue (Sol side) → navy → violet (Veth side)
  - sun glare behind Earth, nebulae, 2-layer star drift and an asteroid-belt band
  - **planets** [User]:
    - Sol's planets along the first half of the route: Mars, banded Jupiter, ringed Saturn by Titan's Reach, and Neptune at the edge of Sol
    - alien worlds past the front line: a toxic green world, a cracked dark rogue planet at the Void Frontier, and the big glowing violet Veth homeworld
  - All of it is drawn procedurally (radial gradients, clipped bands, ring ellipses, crack strokes), as in `world-map-vista.html`. Planet list and placement are data.
- **Story layer canvas** (on top of the backdrop):
  - **Veth-held haze:** a violet radial wash centred on the hive core
  - **front line:** a dashed violet arc at the haze edge
  - **route:** Earth → mission 1 … mission 10 (the hive core). The travelled part is solid gold; the part ahead is faint and dashed.
  - **Vanguard ship marker:** a small code-drawn chevron hull with an amber `#ffb000` engine glow (art bible human accent), oriented along the route tangent and parked at the frontier mission, which is the furthest unlocked one on any normal save (gap saves: §12.6) [Claude]
- **DOM, in screen space (all text lives here):**
  - **Earth tag** and **"LAST LIGHT · HIVE CORE" tag** (Orbitron, small caps).
  - **Nodes:** one `<button class="ow-node …">` per map, keeping the round `overworld_*.png` art with the numbered-circle fallback [Claude].
    - States: `locked` / `next` (open) / `completed` (cleared) / `unlocked`, plus `final` and `active`, via the existing pure `classifyOverworld`.
    - Each node shows its stars. The `next` node has a slow cyan pulse.
    - Map 10's node sits on the hive core glow.
  - **Act banner** (top-left) [User]. Three lines:
    - the act label, e.g. `ACT I · RETAKE SOL`
    - the objective, e.g. `Take back our own guns`
    - `Front line: 3 of 10 sectors retaken`
  - **Meta bar:** `★ n / 30` plus Upgrades, Heroes, Audio, Story, Codex and Fullscreen, all on the kit (`.ui-btn`), absorbing #41f.
  - **Briefing card** (right column, `.ui-panel`) [User]:
    - `MISSION 4` and the map name
    - Command's briefing line, quoted verbatim with a "SOL COMMAND" attribution
    - `New threat: …` and `Towers upgrade to Tier N`
    - the mission's stars
    - **`▶ LAUNCH`** (`#featured-play`, `.ui-btn--currency`, large)
  - **Lifetime stats** chips: on tall screens only, as today. Labels go up to ≥ 11 px (#50a).
- **Removed:**
  - the `#map-select-title` "LAST LIGHT" header, since the title screen owns the logo now and this frees about 50 px on phones [Claude]
  - the SVG connector layer `.ow-connectors`, replaced by the story-layer canvas route
- **The blurb** (`map.blurb`) is no longer shown on the card. The Command quote replaces it [Claude]. `blurb` stays in `maps.js`.

### 2.3 Post-win movement [User: return to the world map and show the movement; Claude: the details]
This plays when `from.result === 'victory'`, it is a first clear of the mission that was the frontier, and that mission is not the last one. Order, with seed timings in `src/data/worldMap.js` (`ARRIVAL`) for a total of about 3.2 s:

| t (ms) | Beat |
|---|---|
| 0–300 | The won node is focused (gold ring brightens, a slight scale-up). The map is already at its *pre-win* state: trail and front line at the old frontier, next node locked. |
| 300–750 | The earned stars stamp in one by one (≈150 ms each: scale 1.6 → 1 with a flash). |
| 750–2750 | The ship flies along the route from the won node to the next node with ease-in-out. The gold trail extends behind it, in sync. |
| 1750–2750 | The front line and haze recede to the new frontier, also with ease-in-out. |
| 2750–3050 | The next node lights: locked → next. Its art un-greys and the cyan pulse starts. The banner's sector count ticks up, and the act and objective lines cross-fade if they changed. |
| 3050–3200 | The next mission becomes selected and its briefing card opens. |

- **Skip:** any `pointerdown` or `keydown` anywhere on `#map-select` while the movement runs jumps to the end state. The event is **swallowed** (capture phase, `preventDefault` + `stopPropagation`). A skip tap never also selects a node or launches. The handler is removed when the movement ends.
- **Waits for dialogs:** if a story dialog is open (e.g. `campaign_intro` on a capture run), the movement starts when it closes.
- **Replay that improves stars** (e.g. 1★ → 3★) [Claude]: only the stamp beat plays on that node, and the card stays on it. No flight. This is cheap to drop if unwanted.
- **Map 10 first clear** = campaign complete [Claude]:
  1. the stars stamp in
  2. the gold trail reaches the hive core
  3. the haze and front line fade out
  4. the hive core's violet glow dims ("The core's dark", `campaign_ending`)
  5. the banner switches to the complete state (§3.2)
  6. the card stays on Last Light, replayable
  The ship stays parked at the hive core.
- **Defeat or abandon:** no animation. The map opens with the mission just played selected, so a retry is one tap [Claude].

## 3. Data model additions (tunables in `src/data/`)

### 3.1 `src/data/campaign.js` (new) — acts and objectives [Claude: derived from existing dialogue]
```js
export const ACTS = [
  { id: 'I',   name: 'Retake Sol',      mapIds: [0, 1, 2, 3, 4] },
  { id: 'II',  name: 'Into Veth Space', mapIds: [5, 6, 7] },
  { id: 'III', name: 'The Hive',        mapIds: [8, 9] },
];
// Objective shown while this map is the frontier. Each line paraphrases story.js (source in the comment).
export const OBJECTIVES = { outpost_sigma: 'Hold Outpost Sigma', /* … */ };
export const CAMPAIGN_COMPLETE = { act: 'CAMPAIGN COMPLETE', objective: 'The war is won' };
```
Draft objective lines. Each comes from the dialogue named, and the user may edit them:

| Map | Objective | Source |
|---|---|---|
| 1 Outpost Sigma | Hold Outpost Sigma | `campaign_intro` "Hold it." / brief "humanity's last forward base" |
| 2 Lunar Gate | Push them off the Moon | `epilogue_outpost_sigma` |
| 3 The Crater | Hit them before they dig in | `epilogue_lunar_gate` "Don't give them time" |
| 4 Orbital Station | Take back our own guns | `epilogue_the_crater` "they've taken our own guns" |
| 5 Asteroid Belt | Drive them to the edge of Sol | `epilogue_orbital_station` |
| 6 Titan's Reach | Bring down the first Titan | `brief_titans_reach` |
| 7 Deep Space Corridor | Press on without support | `brief_deep_space_corridor` |
| 8 The Void Frontier | Break the Titan packs | `brief_the_void_frontier` |
| 9 Enemy Homeworld | End it where it began | `epilogue_the_void_frontier` |
| 10 Last Light | Turn the lights off | `brief_enemy_homeworld` (Rael) / `epilogue_enemy_homeworld` "Finish this." |

Act boundaries follow the dialogue:
- Act I ends with "We've pushed them out of Sol entirely" (`epilogue_asteroid_belt`).
- Act II opens with "You've crossed into Veth-held space" (`brief_titans_reach`).
- Act III is the homeworld and the hive core.

### 3.2 Banner text (derived, not stored)
- In progress: `ACT ${act.id} · ${act.name.toUpperCase()}` / `OBJECTIVES[frontier.storyKey]` / `Front line: ${retaken} of ${MAPS.length} sectors retaken`.
- Complete: `CAMPAIGN COMPLETE` / `The war is won` / `${MAPS.length} of ${MAPS.length} sectors retaken`.

### 3.3 `src/data/worldMap.js` (new) — layout and look
- `ROUTE`:
  - `earth: [x, y]`
  - `nodes: { [mapId]: [x, y] }`, normalized to the **route frame** (§5), not the screen
  - Map 9's node is the hive core.
  - Positions are hand-tuned [Builder], starting from the mockup's shape: Earth bottom-left, rising and winding to the hive core top-right of the frame.
  - **Supersedes `maps.js` `overworldPos`.** Remove that field and its `maps.test.js` case, since it has no other consumer (grep: only `MapSelectScene`) [Claude]. `overworldArt` stays.
- `PLANETS`: `[{ id, x, y, r, base:[c0,c1], bands?, ring?, cracks?, glow? }]`, in route-frame coords with `r` as a fraction of the frame's short side. The ids are `mars`, `jupiter`, `saturn`, `neptune`, `toxic`, `rogue`, `homeworld`. **No planet gets a text label** [Claude] (see Open question 1).
- `NEBULAE`, `BELT` (band endpoints, count, size range) and `SUN_GLARE`.
- `HAZE`: colour, max alpha, edge feather, and front-line dash, colour and width.
- `TRAIL`:
  - travelled: gold `--ui-currency`, width 2.5
  - ahead: violet-grey at 0.3 alpha, dashed
- `SHIP`: size in CSS px, hull colour, `engine: '#ffb000'`.
- `STARS_MAP`: 2 drift layers (count, speed, size, alpha). Ambient motion stays below 20 % opacity (art bible §8).
- `ARRIVAL`: the beat timings above, `easing`, `stampScale`.
- `LAYOUT`:
  - node diameter per layout class: tall 56 (final 64); compact 44 (final 50)
  - card width clamps per class, frame margins, `inputGuardMs: 250`, `maxCanvasDpr: 2`
- `BACKDROP_ART: 'assets/worldmap/vista.webp'`: the deferred-asset slot (§4.4).

### 3.4 `src/data/title.js` (new)
- `TITLE`: `sweepDelayMs`, `sweepMs`, `settleMs`, `promptDelayMs`, `pulseMs`, `fontWaitMs`
- prompt strings `{ coarse: 'TAP TO START', fine: 'CLICK TO START' }`
- `STARS_TITLE`: 3 layers, e.g. z 0.15 / 0.4 / 1, about 160 stars, speed 14 CSS px/s × z
- the CSS durations read these through `--title-*` custom properties that `TitleScreen` sets, so JS stays the single source (the `--hud-k` / `--ui-*` precedent)

### 3.5 Save data — no migration [Claude]
- Progress is fully derived from `maps[]` stars: unlock = previous map has stars, and the frontier = the first map with 0 stars.
- "First clear" travels in the scene data `from` (§4.3), not in the save.
- Trade-off: if the tab closes between the win and the "↩ World Map" tap, the movement never plays. The next launch shows the end state. This is accepted: a persisted "last shown frontier" field would need a v5 migration and seeding for old saves, to avoid replaying history on first load.

## 4. Module breakdown

### 4.1 Pure modules (Vitest, no canvas, no Phaser)
| Module | Exports (illustrative) | Notes |
|---|---|---|
| `src/systems/campaignProgress.js` | `frontierIndex(stars)`, `sectorsRetaken(stars)`, `actForMap(id, acts)`, `bannerFor(stars, {maps, acts, objectives})` | Frontier = index of the first 0-star map, or `MAPS.length` when all are cleared. `sectorsRetaken` = the frontier index (a contiguous prefix), not a raw count, so a gap save can't claim sectors beyond a locked node. |
| `src/systems/briefingCard.js` | `commandQuote(storyKey)`, `newThreats(mapId)`, `briefingCardModel(mapId, save)` | Quote = the first `speaker: 'command'` panel of `STORY_SEQUENCES[briefKey(storyKey)]`, verbatim. Threats = enemy types in `MAP_WAVES[mapId]` that appear on no earlier map, named from `ENEMY_DEFS`, with "(flying)" when `flying`. When there are none the line is omitted. Model = `{ missionNo, name, quote, threats, maxTier, stars, launchable }`. |
| `src/systems/worldRoute.js` | `routePoints(frame, route)`, `frontRadius(points, hive, frontier)`, `trailProgress(points, frontier)` | Uses the existing `pathLength` / `pointAtProgress` in `src/systems/pathGeometry.js`. The front line is an arc centred on the hive core whose radius is the distance from the hive to the frontier node, so the fighting is at the next mission. All-cleared → 0. |
| `src/systems/arrivalPlan.js` | `planArrival({ from, stars, maps })` → `{ kind: 'none'\|'stamp'\|'advance'\|'complete', mapId, toId, newStars }`; `arrivalFrame(plan, tMs, ARRIVAL)` → `{ stamped, shipT, frontT, nextLit, cardOpen, done }` | `advance` only when `result === 'victory'`, `prevStars === 0`, `stars > 0` **and** `mapId` was the frontier before the win. `tMs = Infinity` gives the end state. Skip and reduced motion both use it. |
| `src/systems/starfield.js` | `makeStars(seed, layers, w, h)`, `advanceStars(stars, dtMs, w)` | A seeded RNG, so captures are deterministic. Wraps on the left edge. |
| `src/systems/worldMapLayout.js` | `routeFrame(rects)`, `nodeRects(frame, route, classSizes)`, `worldMapProblems({ nodes, frame, viewport, minTouchPx })` | The scene and the capture audit share it: pairwise overlap, outside frame or viewport, and touch size. |

### 4.2 DOM / canvas UI (thin, no game rules)
- `src/ui/TitleScreen.js`:
  - `show({ motion, pointerFine, onStart })` / `destroy()`
  - sets `--title-*` vars, toggles `.motion-off`, waits for fonts, binds `click` + `keydown` as a **pair**
  - `destroy()` removes both and hides the screen
- `src/ui/SpaceCanvas.js`:
  - a 2D-canvas helper: sizes the canvas to its box × `min(devicePixelRatio, LAYOUT.maxCanvasDpr)`, runs one rAF loop, and draws starfield layers
  - stops on `document.hidden` and on `destroy()`
  - **no-ops when `getContext('2d')` returns null** (jsdom), so the existing scene tests keep running
- `src/ui/WorldMapRenderer.js`:
  - draws the backdrop (cached to an offscreen canvas and rebuilt only on resize) and the story layer (haze, front arc, route, trail, ship) from a frame model
  - `render(state)` is idempotent; drawing has no logic beyond geometry
- `src/ui/BriefingCard.js` renders `briefingCardModel` into `#map-featured`. It keeps the ids `#featured-name` and `#featured-play` (the harness and tests use them).

### 4.3 Scenes
- **`TitleScene`** (new, replaces `MenuScene`):
  - `main.js` scene array and `BootScene`'s final `scene.start` are updated, and `MenuScene.js` is deleted [Claude]
  - `create()` mounts `TitleScreen`, then `onStart` → `scene.start('MapSelectScene', {})`
  - `this.events.once('shutdown', …)` destroys the screen
- **`MapSelectScene`** (scene key and `#map-select` id kept, to avoid harness/test churn; the user-facing name is "World Map") [Claude]:
  - `create(data)` reads `data.from` and builds the models from a fresh `SaveManager`
  - renders nodes, banner, card and meta bar; starts `SpaceCanvas` / `WorldMapRenderer`
  - runs `planArrival`, and if needed drives `arrivalFrame` from the rAF clock until done
  - applies an `inputGuardMs` swallow window on entry, so a carried-over tap can't select or launch
  - meta-bar buttons keep the clone-to-rebind pattern
  - **New listeners come in add/remove pairs:** window `resize`, `orientationchange`, `fonts` `loadingdone` (re-measure), the arrival skip handler and the guard timer. All are removed in `shutdown()`, together with cancelling the rAF.
  - `shutdown` stays registered with `once` (memory: `this.events` survives shutdown).
- **`GameScene`** (minimal, surgical):
  - In `_onVictory`, read `prevStars = saveMgr.getStars(mapId)` **before** `setStars`. Keep it with the earned stars on `this`.
  - The `msg-btn` handler becomes `scene.start('MapSelectScene', { from: { mapId, result, prevStars, stars } })`, where `result` is `'victory'` if `won`, `'defeat'` if `over`, else `'abandon'`.
  - **Always pass an object.** Phaser's `Systems.start(data)` assigns `settings.data` only `if (data)` (verified in `node_modules/phaser/src/scene/Systems.js:740`), so a bare `scene.start('MapSelectScene')` would replay the *previous* `from` and its animation.
  - `TitleScene` passes `{}` for the same reason.
  - `GameScene` remains the only owner of `#game-msg` and its buttons (HUD DOM ownership note).

### 4.4 DOM vs canvas, and why
| Part | Medium | Why |
|---|---|---|
| Starfield, vista backdrop, haze, front line, route, trail, ship | **2D `<canvas>` inside the DOM screen** (not Phaser) | It must fill the *viewport*. The Phaser canvas is FIT-letterboxed at 1632×720 / 1488×720, so it would show bars on 16:10 desktops and 19.5:9 phones. Gradients, glows and particles are cheap in 2D canvas and match the mockups exactly. Phaser has nothing to add, and the map screen has no gameplay. |
| Logo, prompt, nodes, labels, Earth/hive tags, banner, card, meta bar, stats | **DOM** | Real text (fonts, a11y, no canvas text), real buttons (focus, keyboard, ≥ 44 px audit, kit styling), and the layout-audit harness can measure them. Today's map select is already DOM (`#map-select`). |
| Rejected: SVG for the route/haze | — | Crisp and inspectable, but the haze gradient, glow and per-frame trail growth need a second rendering path next to the canvas backdrop. The DOM `data-*` hooks (§7) give the harness the inspectability instead. |
| Rejected: drawing everything in the Phaser canvas | — | Letterboxing (above), and node buttons would lose kit/focus/audit for nothing. |

**Deferred-asset slot** [Claude]:
- `BootScene` probes `BACKDROP_ART` (a `worldMap.js` key) 404-tolerantly, the same way it probes portraits, and stores the result in the registry.
- A pure `worldBackdropSource(registered)` returns `'procedural'` or the URL.
- If the art exists, it replaces **only** the far layer (base gradient, nebulae, far stars), drawn with `object-fit: cover` behaviour. Planets, haze, route and nodes stay code-drawn, because generated art with baked planets could not stay aligned with the nodes across frame aspects.
- Today the file doesn't exist and the procedural path draws everything.

## 5. Per-device layout rules
There are two layout classes, using the existing `COMPACT_QUERY` (`max-height: 500px`, `src/data/mobile.js`):
- **tall**: desktop 1280×720 / 1440×900 / 1920×1080, iPad Pro 11 landscape
- **compact**: iPhone 14 at 750×340 visible / 844×390 nominal, Pixel 7 landscape, 932×430

Both classes:
- keep 2.3's safe-area padding and `100dvh`
- set touch sizes by pointer class (coarse ≥ 44 CSS px on every DOM control, since these are CSS px, not the scaled canvas)
- produce no page overflow and no zoom

| Element | Tall | Compact |
|---|---|---|
| Top band | Banner top-left over the backdrop (act line Orbitron ≈ 13–15 px, objective Orbitron `--ui-fs-xl` 24, sector line Rajdhani `--ui-fs-md`). Meta bar top-right: `★ n/30` + 6 kit buttons with icon + label. | One row of ≤ 52 px: banner left (line 1 act · sectors at `--ui-fs-xs`/`sm`, line 2 objective at `--ui-fs-md`, ellipsis if needed); meta bar right as **icon-only** 44×44 kit buttons with `aria-label` (no `title=`). |
| Briefing card | Right column, `clamp(280px, 26vw, 360px)`, from below the meta bar to the bottom inset. | Right column, `clamp(220px, 32vw, 300px)`, below the top row. |
| Card body | The quote area is `flex:1; min-height:0; overflow-y:auto`, so LAUNCH is always pinned and visible (the 2.3 `#featured-blurb` lesson). LAUNCH height ≥ 48 px. | Same; LAUNCH ≥ 44 px. |
| Route frame | The area left of the card, below the banner, above the stats strip. | The area left of the card, below the top row. |
| Nodes | Ø 56 (final 64); label "N · Name" + stars below at `--ui-fs-xs`/`sm`. | Ø 44 (final 50); label = stars only. The number is inside the node, and the name is on the card. |
| Lifetime stats | Bottom strip under the frame; labels ≥ 11 px (#50a). | Hidden (as today). |

**Fit rule (fixes #41c):** every node rectangle, label included, lies inside the route frame with a ≥ 4 px margin. No two node rectangles overlap. On coarse pointers every non-locked node is ≥ 44 px. `worldMapProblems` checks this:
- as a unit test, against the harness `DEVICES` viewports (derived from `scripts/capture.mjs`, not re-typed)
- in the live audit

Node positions are one normalized set. If one set can't pass for both frame aspects, [Builder] may add a `compact` override in `ROUTE`.

**Front-line consistency:** the route's distance to the hive core must strictly decrease from Earth through node 9. Otherwise a "retaken" node could sit inside the haze. A unit test asserts this in px for every device frame.

Resize and orientation change re-measure the rects, recompute the frame and redraw. A running arrival continues in route-parameter space (`shipT`, `frontT` and the `flight()` trail are fractions), so it survives a resize mid-flight.

## 6. Reduced motion
The source is the existing registry flag `ambientMotion` (saved setting wins, otherwise `prefers-reduced-motion`, via `resolveAmbientMotion`). It is read **live**, the same way `AmbientBackgroundLayer` does, so toggling it in Settings from the map takes effect at once. It is applied as the `.motion-off` class from JS, not as a CSS media query, because the saved setting can override the OS preference.

| Thing | Motion on | Motion off |
|---|---|---|
| Title starfield | Drifts and twinkles | Drawn once, static |
| Logo | Beam sweep, then lit | Lit immediately, no sweep |
| Prompt | Pulses | Static, full opacity |
| Map star drift, `next` node pulse | On | Off |
| Post-win movement | §2.3 timeline | Plays the end state at once (`arrivalFrame(plan, Infinity)`); the next node is selected with its card open |

## 7. Testing strategy

### 7.1 Unit (Vitest)
Each new test must be mutation-checked: break the code, see *that* test fail.
1. **`campaignProgress`:**
   - frontier on a fresh save (0), partial (3), all cleared (10)
   - a gap save `[3,0,2,0,…]` → frontier 1, retaken 1
   - act lookup at every boundary (4→I, 5→II, 7→II, 8→III, 9→III)
   - the complete banner
   - `ACTS` covers every `MAPS` id exactly once, contiguously and in order (derived from `MAPS`, not literals)
   - every `storyKey` has an `OBJECTIVES` entry
2. **`briefingCard`:**
   - every map has a Command quote, and it equals the first command panel text (derived from `STORY_SEQUENCES`)
   - `newThreats` is computed from `MAP_WAVES` against an independent re-derivation, never a hardcoded list (memory: derive test allow-lists)
   - a map that introduces nothing omits the line
3. **`arrivalPlan`:**
   - `advance` only for the first clear of the frontier
   - `stamp` for a star improvement
   - `none` for defeat, abandon, a non-improving replay, a missing or garbage `from`, and a first clear of a non-frontier map (gap save)
   - `complete` for the first clear of map 9
   - `arrivalFrame` is monotonic in `t`, `Infinity` = end state, and beat boundaries match `ARRIVAL`
4. **`worldRoute` / `worldMapLayout`:**
   - the hive-distance monotonic test
   - the per-device fit test (§5)
   - front radius at 0 / mid / all cleared
5. **`starfield`:** same seed → same stars; wrap; stars stay in bounds after many steps.
6. **Scenes (jsdom, Phaser mocked per memory):**
   - `TitleScene`: click → exactly one `scene.start('MapSelectScene', {})` even on a double click; Enter works; listeners are gone after shutdown.
   - `MapSelectScene`: enter → shutdown ×3 leaves no stacked window/document listeners and no live rAF. Count `addEventListener`/`removeEventListener` pairs, the 2026-08-17 leak test pattern.
   - The arrival skip swallows the event (no node select, no launch).
   - `scene.start` with `{}` after a `{ from }` entry does **not** replay.
   - `GameScene`: victory on a fresh map 0 passes `{ mapId:0, result:'victory', prevStars:0, stars:N }`. `prevStars` must be read before `setStars`: prove it by moving the read after `setStars` and watching the test fail. Defeat → `'defeat'`; exit-confirm → `'abandon'`.
   - Update the existing `MapSelectScene.*.test.js` DOM fixtures for the new markup.
7. **CSS guards stay green:**
   - `themeCss`: fonts via `var(--ui-font-*)`, every `var(--ui-*)` exists
   - `kitRollout`: the meta-bar buttons and card become kit surfaces. Their old `background`/`border`/`color` rules are deleted, and the guard's surface list is extended to them.
   - `railCss`, `noNativeTitles`
   - **New guard (#50a):** no `font-size` below 11 px in `index.html` outside `calc(… * var(--hud-k))` rail rules. This catches today's `.stat-chip-lbl` 9, `.ow-node-stars` 10, `.ho-card-role` 10, `.ho-card-unlock` 9, `.ho-card-badge` 9, `.upgrade-node-gate` 10 and `.upgrade-node-refund` 10, which all go to `var(--ui-fs-xs)`.

### 7.2 Device matrix (`npm run matrix`, `scripts/capture.mjs --flow`)
- **`FLOW_STEPS`** (`src/systems/deviceFlow.js`) gains a **`title`** step at n = 2, and the later steps renumber to 3–18 [Claude; the alternative is folding the tap into `boot`, which hides which half failed]. Update `deviceFlow.test.js`'s step-table literal and the step comments in `capture.mjs`.
  - `boot`: expects `#title-screen` visible and `#story-dialog` **not** visible.
  - `title`: a real tap at the screen centre (it must be a real tap: Phaser/DOM ignore synthetic events, memory), then expects `#title-screen` hidden, `#map-select` visible and `#story-dialog` visible (fresh run).
  - The `skip-story` / `select-map` / `play` selectors are unchanged (`.ow-node[data-map-id="0"]`, `#featured-name`, `#featured-play`). `play`'s tap must come after the input guard, so the harness waits for `#map-select[data-ready="1"]`, which the scene sets when the guard ends.
- **`MAP_SELECT_TARGETS`** grows to `#featured-play`, `#map-meta-bar button`, `.ow-node:not(.locked)`. The audit adds `worldMapProblems` (overlap, inside frame, touch ≥ 44 on coarse) and `overlayProblems` touch sizing for the meta bar.
- Desktop 16/16 → 17/17 and touch devices 17/17 → 18/18 must pass.

### 7.3 Screens (`npm run capture -- --screens`, 5 devices)
New and changed shots:
- `00-title.png` (mid-sweep) and `00b-title-lit.png`, plus a page-level audit of `#title-screen`
- then the first-run story and `02-map-select.png` as today
- the `captureRotation` portrait start must dismiss the title with `el.click()` on `#title-screen`, since the rotate prompt covers it, just as it already does for the story skip
- **post-win:**
  1. After `07-victory.png`, tap `#msg-btn` (now "↩ World Map").
  2. Expect `#map-overworld[data-arrival="playing"]` and shoot `07b-arrival-mid.png` at about 1.5 s.
  3. Tap to skip. Expect `data-arrival="done"`, `data-frontier="1"`, `#featured-name` = `MAPS[1].name` and `.ow-node[data-map-id="1"].next`.
  4. Shoot `07c-arrival-done.png`.
  - This victory must use **map 0** whatever `--maps` says, because a fresh context's frontier is 0 and any other map is a gap save (no flight). Run it in a **new browser context**, not the page the earlier screen shots used: that page has already skipped `campaign_intro`. In the new context, expect the `campaign_intro` dialog first (rule: the arrival waits for dialogs). [Claude, from the builder check]
- one run with Playwright `reducedMotion: 'reduce'` on `desktop1440` and `iphone`: the title is lit at once, and the arrival goes straight to `data-arrival="done"`
- one run with `*.woff2` blocked (3.1 practice): the title still sweeps on the fallback face, and the layout audit is clean

`#map-overworld` exposes `data-frontier`, `data-arrival` (`none|waiting|playing|done`) and `data-ready`. `#title-screen` exposes `data-phase` (`waiting|sweep|lit`). These hooks are for the harness and the acceptance agent, and they ship in production because they are harmless.

### 7.4 Live smoke on the production build
Run `npm run build && npm run preview` at **1440×900** and **iPhone 14 landscape**, scripted with the worktree's own Playwright (memory: the MCP browser may be locked). Production has no `?debug`, so seed `lastlight_save`:
- (a) A fresh save: title → tap → intro → map 1 card → LAUNCH reaches the level.
- (b) `maps:[3,2,1,0,0,0,0,0,0,0]` with `seenStoryBeats.campaign_intro` set: Act I banner, "3 of 10", Orbital Station card with its Command quote, ship at node 4, haze edge at node 4.
- (c) A 10-cleared save: the complete banner, no haze, the card on Last Light.
- (d) A save with `version: 2`: migrates and renders.

The **post-win movement is verified in the `capture`-mode build** (the production bundle plus debug hooks) via §7.3, because a production win means playing a full mission. Say so in the PR rather than claiming a production check.

## 8. Acceptance list (for the browser-acceptance agent)
1. A cold load of `/` shows the title, not the map and not a dialog. "LAST LIGHT" is gold Orbitron. A light band crosses it, and it then holds lit with a glow. "TAP TO START" (touch) / "CLICK TO START" (mouse) pulses beneath.
2. A tap at t ≈ 0.5 s (mid-sweep) shows the world map within one frame. Nothing is launched and no node changes selection from that tap.
3. On a fresh save, the intro dialog plays over the map after the title, and the map is not interactive until it closes. On a reload, the title shows again and the intro does not.
4. The map shows:
   - a full-screen space vista with **at least 7 planets** (Mars, banded Jupiter, ringed Saturn, Neptune, toxic green, cracked dark, big violet homeworld) plus a belt band and nebula glow
   - Earth at the route start and "LAST LIGHT · HIVE CORE" at the end
5. Route: from Earth to the frontier node it's solid gold; beyond that it's faint and dashed. The violet haze and the dashed front-line arc meet at the frontier node.
6. The banner reads exactly as §3.2 for the seeded saves (b) and (c) of §7.4.
7. Selecting an unlocked node opens its card with:
   - `MISSION N`, the name, and the Command quote matching `brief_<storyKey>`'s first Command line character for character
   - `New threat:` (or no line)
   - `Towers upgrade to Tier N`, the stars, and `▶ LAUNCH`
   Locked nodes do nothing.
8. iPhone 14 landscape and Pixel 7:
   - no page scroll or zoom
   - all 10 nodes, the card and LAUNCH fully visible
   - every meta-bar button, unlocked node and LAUNCH is ≥ 44×44 CSS px
   - no node overlaps another
   - all text ≥ 11 px
9. Desktop 1280×720 and 1440×900: same visibility checks, node names visible under the nodes, and lifetime stats visible with ≥ 11 px labels.
10. Meta-bar buttons look like the kit buttons in the HUD (navy face, bevel, ring), not browser defaults (#41f).
11. Winning map 1 on a fresh save (capture build), then tapping "↩ World Map":
    - node 1's stars stamp in
    - the ship flies to node 2 in about 2 s while the gold trail grows behind it
    - the haze recedes to node 2, and node 2 lights and pulses
    - the banner reads "1 of 10"
    - the Lunar Gate card opens
    The whole thing takes about 3.2 s.
12. A tap during (11) jumps to the end state at once and does not select or launch anything.
13. Replaying a cleared mission and winning: no flight. If the stars improved, they stamp in on that node.
14. A defeat or abandon returns to the map with that mission selected and no animation.
15. Clearing map 10 (capture build): the haze and front line fade, the hive glow dims, and the banner reads "CAMPAIGN COMPLETE · The war is won · 10 of 10".
16. With Settings → ambient motion off (or OS reduced motion): the title is lit instantly with a static prompt and static stars, and the post-win state appears instantly.
17. Rotating a phone portrait → landscape during the title or the arrival: the layout re-fits, nothing is clipped, and the arrival finishes or remains skippable.
18. With fonts blocked: the title and map still lay out without overflow.

## 9. Edge cases (each must be covered by a test or an acceptance item)
| Case | Expected | Covered by |
|---|---|---|
| Fresh save | Frontier 0. Ship at node 1. Haze edge at node 1. Act I, "0 of 10". Intro dialog after the title. | 7.1-1, 7.3, 8.3 |
| Partial progress | Frontier = first 0-star map. Card defaults to it. | 7.1-1, 8.6 |
| All 10 cleared | Complete banner, no haze, ship at the hive core, card on map 10. | 7.1-1, 8.15 |
| Replay of a cleared mission, same or fewer stars | `none`: no animation, card on that mission. | 7.1-3, 8.13 |
| Replay with more stars | `stamp` only. | 7.1-3 |
| Defeat / abandon | `none`, the mission selected. | 7.1-3/6, 8.14 |
| First clear of map 10 | `complete` sequence. `campaign_ending` already played in GameScene before the results. | 7.1-3, 8.15 |
| Gap save (stars on a map after a 0-star one; legacy or hand-edited) | Frontier = the first 0-star map. Starred-but-locked nodes render `locked` (`classifyOverworld` puts the lock first). No flight for a non-frontier first clear. | 7.1-1/3 |
| Older save versions (v1–v3, legacy array) | `SaveManager` migrates as today. 3.4 adds no fields, so no migration. | 7.4(d) |
| Stale scene data | `{}` / `{ from }` always passed; never a bare `scene.start`. | 7.1-6 |
| Locked heroes | Unaffected. Hero unlock still derives from stars, and Hero Command shows a newly unlocked hero as today. No announcement in 3.4. | existing tests |
| Missing node art | The existing `onerror` → numbered-circle fallback, with the same state classes, pulse and arrival lighting. | 7.3 (block one PNG) |
| Missing backdrop art | Always the case today: procedural path. | 7.1 (`worldBackdropSource`) |
| Fonts not loaded at title time | Dim wait ≤ `fontWaitMs`, then sweep. No canvas text anywhere, so nothing else depends on fonts. Labels re-measure on `loadingdone`. | 7.3 woff2-blocked run |
| Resize / orientation change mid-animation | Re-layout and continue in fractional route space. Portrait shows the rotate prompt, and the arrival keeps running under it. | 8.17 |
| Tab hidden mid-animation | The rAF pauses with the page. On return the arrival resumes from its clock, or [Builder] jumps it to the end state; either is fine. | — |
| Tap during the title sweep | Leaves at once (anti-goal 1). | 8.2 |
| Tap that dismissed the title lands on the map | Title advances on `click` (the last event), plus a `inputGuardMs` swallow window on map entry. | 7.1-6, 8.2 |
| Double tap on the title | One `scene.start`. | 7.1-6 |
| Keyboard only | Enter/Space start; nodes are `<button>`s in route order; Tab reaches the meta bar, nodes and LAUNCH; any key skips the arrival. | 7.1-6 |
| Overlay opened during the arrival | Impossible: the first tap is swallowed as a skip. | 8.12 |
| Story dialog open on entry (capture run) | The arrival waits (`data-arrival="waiting"`) until it closes. | 7.3 |
| jsdom (no canvas) | Renderers no-op. Scene tests run. | 7.1-6 |
| Very wide or very tall desktop (1920×1080, 2560×1440) | The frame grows. Nodes keep their px size and positions scale. Fit test on `desktop1080`. | 7.1-4 |

## 10. Absorbed backlog
- **#41f:** meta-bar buttons move to the kit (`.ui-btn`, neutral; Fullscreen keeps its hide-when-unsupported logic). The bespoke `#open-* / #fullscreen-btn` paint rules are deleted.
- **#50a:** every sub-11-px rule on font-only screens goes to `var(--ui-fs-xs)`, with a guard (§7.1-7). The `.ow-node-stars` rule is rewritten anyway. #50b (off-palette hexes) is taken only where 3.4 rewrites the rule: `#featured-*`, `.ow-*`, `#story-log-inner h3` stays for 3.5.
- **#41c:** node clip edge, via the fit rule and `worldMapProblems`.
- Notes for the PR: #41c, #41f and #50a are closed by 3.4.

## 11. Out of scope
- Story dialog restyle (3.5), results screen and stars rework (3.6), new generated art, balance, new SFX or music, hero-unlock announcements, a map "zoom/pan", and changing unlock rules.
- The upgrade and hero-management overlays get the #50a type floor only, not a redesign.
- The dead `.map-row*` CSS stays (pre-existing, not made dead by this change).

## 12. Resolved questions [Claude, 2026-10-23]
The user said "move forward" rather than review these, so Claude settled them. Each is a default the user may still override:
1. **Saturn vs "edge of Sol":** keep the user's layout (Saturn by Titan's Reach, inside the haze until mission 6). Planets carry **no text labels**, so nothing on screen contradicts the dialogue.
2. **Objective lines:** the §3.1 drafts stand.
3. **"New threat" is derived from `MAP_WAVES`** (enemy types first seen on that map), not hand-written. The builder check ran it against the wave data:
   - Mission 1 lists Drone, Skitter and Brute.
   - Orbital Station shows "Veth Phantom (flying)".
   - Asteroid Belt shows Colossus.
   - Titan's Reach shows Titan.
   - Missions 2, 3, 7, 8, 9 and 10 show no threat line.

   It stays true if the waves change.
4. **Lifetime stats** stay as a bottom strip on desktop, hidden on phones, as today. The tall route frame is tuned with the strip present.
5. **Locked missions** stay inert, with their names still shown under the nodes on desktop, as in the mockup.
6. **Gap saves** (a hand-edited save with a map beyond the frontier unlocked): the ship parks at the **frontier**, not at the furthest unlocked map. [from the builder check]

> **Implementation note (2026-10-23):** `arrivalFrame` no longer returns `trailT`. The trail is computed by `flight()` in `src/systems/worldRoute.js` (ship departs from the won node's exit point; the trail runs won node → landing spot, always behind the ship). `BACKDROP_ART` ships as `null` (empty deferred slot).
