# Visual baseline — 2026-10-21

The "before" record for the visual overhaul (roadmap task 0.3). Screenshots
are in `docs/baseline/2026-10-21/` (JPEG, from the capture harness). To
regenerate them:

```
npm run capture -- --screens --maps 0 --devices desktop,iphone   # screens
npm run capture -- --maps 0,3,5,9 --devices desktop              # in-game
```

Each list below is ranked **weakest first**. The arrow names the roadmap task
that addresses it. Measured numbers come from `docs/art-bible.md` §4–§5 and §9.

## Across every screen

1. **Phones are broken, not just unpolished.** At iPhone 14 landscape
   (750×340 CSS px), the canvas renders at about **0.28×** between the HTML
   HUD bars and fills about a third of the width (`iphone-03-in-game.jpg`).
   - The wave button is cut off at the right edge.
   - On map select the **PLAY button sits at y = 320–363**, outside its
     clipped panel, and `body` is `overflow: hidden`. It can't be scrolled
     to, so a phone player can't start a level (`iphone-02-map-select.jpg`;
     checked with Playwright on iPhone 14 and Pixel 7 landscape).
   → 2.2, 2.3.
2. **Units are too small and too dark to read.**
   - Most towers are ~45 design px tall, which is ~36 CSS px on a 1280×720
     desktop window.
   - Soldiers are 9×14 px, and enemies read as specks (map 3's skitter in
     `desktop-in-game-map3-w6.jpg`).
   - The colossus is shorter than the brute.
   - Titan, colossus and archer have mean luminance 0.11–0.17 and contrast
     ≤ 0.08, so they melt into map 9.
   → G1 size decision, 1.3, 4.1.
3. **Nothing touches the ground.** No unit has a contact shadow, so
   everything floats over the painted terrain. → 1.2.
4. **Typography is a stopgap.** Georgia serif sits beside system sans in the
   HUD buttons, and "Story" and "Codex" are unstyled native buttons with white
   backgrounds, unlike their neighbours. → 3.1.
5. **Letterboxing on desktop.** The HUD bars take ~136 px of height, so FIT
   scaling leaves ~180 px dark bars left and right in a 1280×720 window
   (the canvas spans x = 182–1218).
   → 2.2.

## In-game (`desktop-03-in-game.jpg`, `desktop-in-game-map*.jpg`)

1. **The road looks pasted on.** It's a flat stroked band with a dashed
   centre line that reads as a race track over painted terrain. On map 9 it's
   orange double stripes. IN and OUT are bare coloured semicircles at the
   canvas edge. → 1.7.
2. **Empty pads are the loudest thing on screen.** The "+" sandbag rings look
   the same on every map. On map 9 the orange-ringed pads out-shout the
   enemies and towers. → 4.4, 1.8 (pad idle glow should be *subtler*, not
   louder).
3. **Combat is invisible in a still.** Projectiles are small solid dots. There
   are no muzzle flashes, impacts or status tints, so a mid-wave frame looks
   idle. → 1.5, 1.6.
4. **Towers don't read as tiers.** A T3 archer and a T1 archer differ only in
   the panel text. → 4.2 (code-decorated tier pips/glow).
5. **The maps share one mood.** Every backdrop is painted at the same contrast,
   with no grading or vignette, so map 0's desert and map 5's dunes read as the
   same place. → 1.4.
6. **Health bars are plain green strokes** that float well above small
   enemies. → 1.6.

## Tower panel (`desktop-04-tower-panel.jpg`, `iphone-04-tower-panel.jpg`)

1. **It opens partly off the canvas.** Clicking a tower in the lower right
   anchors the panel there, and its tier-4 branch cards are clipped under the
   bottom bar. On iPhone it covers a third of the play area. → 3.3.
2. **It's a wall of text:** five stat lines, matchup lines and armour notes in
   one small-type column. The branch choice, the panel's actual decision, is
   at the bottom and clipped. → 3.3.
3. **It stays open over the Defeat overlay** (`desktop-05-defeat.jpg`). → 3.6.

## Results (`desktop-05-defeat.jpg`, `desktop-07-victory.jpg`)

1. **A small modal (~250 px wide) with one line of text.** There are no stats (kills, lives
   left, waves, gold), and the stars are text glyphs. → 3.6.
2. **The HUD behind it stays live-looking.** "2x" is still enabled and the
   wave button still says "Wave 5 in progress…". → 3.6.
3. The victory story beat plays first (`desktop-06-victory-story.jpg`), which
   works well. Keep it.

## Map select (`desktop-02-map-select.jpg`)

1. **On first run the screen looks empty.** 9 of 10 nodes are near-black
   locked discs with padlocks; the one open node is the only colour. → 3.4.
2. **The featured panel is ~60 % blank space** between the blurb and PLAY.
   → 3.4.
3. **The title is plain Georgia text in gold.** → 3.4 (code-drawn logo with
   glow).
4. The stats strip at the bottom is tiny at desktop size and mostly zeros on
   first run. → 3.4.

## Story dialog (`desktop-01-first-run-story.jpg`, `desktop-06-victory-story.jpg`)

The **strongest screen today**: good portraits, readable text, clear
Skip/Next. Only:

1. **Lore mismatch: the story calls the enemy "the Vorn"** (15 lines in
   `src/data/story.js`), while every enemy name, the codex and the roadmap say
   **"Veth"**. A naming decision is needed before 3.5. (Logged under NEEDS
   HUMAN.)
2. There's no typewriter effect or portrait frame. → 3.5.

## Not covered by this baseline

The upgrades, heroes, audio and codex overlays, and the map editor, aren't
captured yet. Add them to `--screens` when 3.x touches them.
