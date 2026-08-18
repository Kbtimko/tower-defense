# Overworld MapSelect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the MapSelect sidebar list with a winding-path overworld — 10 level nodes carrying per-level artwork, connected by a path, showing completed/next/locked state — while keeping the featured detail panel, PLAY, meta-bar, and stats.

**Architecture:** Stay DOM-based. Add per-map `overworldPos`/`overworldArt` to `maps.js`. A pure `classifyOverworld` helper tags each node's state. `MapSelectScene._populateOverworld()` (replacing `_populateSidebar()`) renders an SVG connector layer + absolutely-positioned node elements (art `<img>` with a numbered-circle fallback) into a new `#map-overworld` container. Node art is referenced from `assets/overworld/` with generation prompts provided; the fallback renders until the art exists.

**Tech Stack:** JavaScript (ES modules), Phaser 3, DOM/SVG/CSS, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-06-20-overworld-mapselect-design.md`

---

### Task 1: Add `overworldPos` + `overworldArt` to map data

**Files:**
- Modify: `src/data/maps.js` (all 10 map objects)
- Test: `src/data/maps.test.js`

- [ ] **Step 1: Add the fields to REQUIRED and a validation test**

In `src/data/maps.test.js`, add `'overworldPos'` and `'overworldArt'` to the `REQUIRED` array. Then add this test inside the `for (const map of MAPS)` loop (alongside the other per-map `it(...)` blocks):

```javascript
    it(`map ${map.id} overworldPos is a normalized [x,y] pair`, () => {
      expect(Array.isArray(map.overworldPos)).toBe(true);
      expect(map.overworldPos).toHaveLength(2);
      for (const v of map.overworldPos) {
        expect(typeof v).toBe('number');
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it(`map ${map.id} overworldArt is a .png filename`, () => {
      expect(typeof map.overworldArt).toBe('string');
      expect(map.overworldArt.endsWith('.png')).toBe(true);
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/maps.test.js`
Expected: FAIL — maps lack `overworldPos`/`overworldArt`.

- [ ] **Step 3: Add the two fields to each map**

In `src/data/maps.js`, add an `overworldPos` line and an `overworldArt` line immediately after each map's `startLives:` line. Apply this table exactly (match by `id`):

| id | overworldPos | overworldArt |
|----|--------------|--------------|
| 0 | `[0.092, 0.85]`  | `'overworld_0_outpost_sigma.png'` |
| 1 | `[0.233, 0.717]` | `'overworld_1_lunar_gate.png'` |
| 2 | `[0.383, 0.85]`  | `'overworld_2_the_crater.png'` |
| 3 | `[0.533, 0.70]`  | `'overworld_3_orbital_station.png'` |
| 4 | `[0.683, 0.783]` | `'overworld_4_asteroid_belt.png'` |
| 5 | `[0.85, 0.567]`  | `'overworld_5_titans_reach.png'` |
| 6 | `[0.675, 0.40]`  | `'overworld_6_deep_space_corridor.png'` |
| 7 | `[0.50, 0.467]`  | `'overworld_7_the_void_frontier.png'` |
| 8 | `[0.333, 0.317]` | `'overworld_8_enemy_homeworld.png'` |
| 9 | `[0.50, 0.15]`   | `'overworld_9_last_light.png'` |

For example, map 0 currently has:

```javascript
    startGold: 200,
    startLives: 25,
```

becomes:

```javascript
    startGold: 200,
    startLives: 25,
    overworldPos: [0.092, 0.85],
    overworldArt: 'overworld_0_outpost_sigma.png',
```

(Only add the two new lines — leave all other fields, including `startGold`, untouched.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/data/maps.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/maps.js src/data/maps.test.js
git commit -m "feat(maps): add overworldPos + overworldArt per map (backlog #5)"
```

---

### Task 2: `classifyOverworld` pure state helper

**Files:**
- Create: `src/systems/overworldState.js`
- Test: `src/systems/overworldState.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/systems/overworldState.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { classifyOverworld } from './overworldState.js';

describe('classifyOverworld', () => {
  it('marks all entries locked when none are unlocked', () => {
    const entries = [
      { id: 0, unlocked: false, stars: 0 },
      { id: 1, unlocked: false, stars: 0 },
    ];
    const out = classifyOverworld(entries, 1);
    expect(out.map(n => n.state)).toEqual(['locked', 'locked']);
    expect(out.find(n => n.state === 'next')).toBeUndefined();
  });

  it('marks completed prefix and the first unbeaten unlocked map as next', () => {
    const entries = [
      { id: 0, unlocked: true,  stars: 3 },
      { id: 1, unlocked: true,  stars: 2 },
      { id: 2, unlocked: true,  stars: 0 },
      { id: 3, unlocked: false, stars: 0 },
    ];
    const out = classifyOverworld(entries, 3);
    expect(out.map(n => n.state)).toEqual(['completed', 'completed', 'next', 'locked']);
  });

  it('marks only the lowest-id unbeaten unlocked map as next; others are unlocked', () => {
    const entries = [
      { id: 0, unlocked: true, stars: 0 },
      { id: 1, unlocked: true, stars: 0 },
    ];
    const out = classifyOverworld(entries, 1);
    expect(out.map(n => n.state)).toEqual(['next', 'unlocked']);
  });

  it('has no next when every unlocked map is completed', () => {
    const entries = [
      { id: 0, unlocked: true, stars: 1 },
      { id: 1, unlocked: true, stars: 3 },
    ];
    const out = classifyOverworld(entries, 1);
    expect(out.map(n => n.state)).toEqual(['completed', 'completed']);
  });

  it('flags isFinal for the final id only', () => {
    const entries = [
      { id: 0, unlocked: true, stars: 0 },
      { id: 1, unlocked: false, stars: 0 },
    ];
    const out = classifyOverworld(entries, 1);
    expect(out.find(n => n.id === 1).isFinal).toBe(true);
    expect(out.find(n => n.id === 0).isFinal).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/systems/overworldState.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/systems/overworldState.js`:

```javascript
// Classifies overworld nodes for rendering. Pure: data in, data out.
//   entries: [{ id, unlocked, stars }] (any order)
//   finalId: the map id that is the final/boss level
// Returns each entry with:
//   state: 'completed' | 'next' | 'unlocked' | 'locked'
//   isFinal: boolean (id === finalId)
// "next" is the single lowest-id unlocked entry with zero stars.
export function classifyOverworld(entries, finalId) {
  const nextEntry = [...entries]
    .sort((a, b) => a.id - b.id)
    .find(e => e.unlocked && e.stars === 0);
  const nextId = nextEntry ? nextEntry.id : null;

  return entries.map(e => {
    let state;
    if (!e.unlocked) state = 'locked';
    else if (e.stars > 0) state = 'completed';
    else if (e.id === nextId) state = 'next';
    else state = 'unlocked';
    return { ...e, state, isFinal: e.id === finalId };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/systems/overworldState.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/systems/overworldState.js src/systems/overworldState.test.js
git commit -m "feat(overworld): pure classifyOverworld node-state helper (backlog #5)"
```

---

### Task 3: Overworld markup + CSS in index.html

**Files:**
- Modify: `index.html`

This task is markup/CSS — verified by build + browser (no unit test).

- [ ] **Step 1: Replace the sidebar container with the overworld container**

In `index.html`, find:

```html
        <div id="map-sidebar"></div>
```

replace with:

```html
        <div id="map-overworld"></div>
```

- [ ] **Step 2: Add overworld CSS**

In `index.html`, find the existing map-row CSS block:

```css
    #map-sidebar { width:230px; overflow-y:auto; display:flex; flex-direction:column; gap:5px; }
```

Replace that single `#map-sidebar` rule with the following block (leave the `.map-row*` rules below it in place — they are now unused but harmless; do not spend time removing them):

```css
    #map-overworld { flex:1.6; position:relative; min-height:0; border:1px solid #2a2a4a; border-radius:10px; overflow:hidden;
      background:radial-gradient(ellipse at 30% 20%, #141436 0%, #08081e 60%, #050510 100%); }
    #map-overworld .ow-connectors { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
    #map-overworld .ow-path-dim { fill:none; stroke:#2f2f50; stroke-width:0.8; vector-effect:non-scaling-stroke; }
    #map-overworld .ow-path-lit { stroke:#8b6914; stroke-width:1.2; vector-effect:non-scaling-stroke; }
    .ow-node { position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:2px; }
    .ow-node.unlocked, .ow-node.next, .ow-node.completed { cursor:pointer; }
    .ow-node-art { width:46px; height:46px; border-radius:50%; object-fit:cover; border:2px solid #8b6914; background:#11112a; }
    .ow-node.locked .ow-node-art { filter:grayscale(1) brightness(0.4); border:2px dashed #444; }
    .ow-node.active .ow-node-art { border-color:#ffd700; box-shadow:0 0 10px #ffd700; }
    .ow-node.next .ow-node-art { border-color:#7ab8ff; box-shadow:0 0 12px #7ab8ff; }
    .ow-node.final .ow-node-art { width:54px; height:54px; border-color:#6a2a3a; }
    /* numbered-circle fallback (when art img errors out) */
    .ow-node.ow-node-fallback .ow-node-num { width:46px; height:46px; border-radius:50%; background:#1c2c4c;
      display:flex; align-items:center; justify-content:center; border:2px solid #8b6914; }
    .ow-node-num { font-size:13px; font-weight:bold; color:#ffd700; line-height:1; }
    .ow-node.locked .ow-node-num { color:#666; }
    .ow-node-stars { font-size:10px; color:#ffd700; min-height:12px; line-height:1; }
```

(Note: `#map-overworld` uses `flex:1.6` so it sits to the left of the `#map-featured` panel inside the existing `#map-select-layout` flex row.)

- [ ] **Step 3: Verify the build is clean**

Run: `npm run build`
Expected: build completes with no errors (the pre-existing chunk-size warning is fine).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(map-select): overworld container + node/connector CSS (backlog #5)"
```

---

### Task 4: Render the overworld in MapSelectScene

**Files:**
- Modify: `src/scenes/MapSelectScene.js`
- Test: `src/scenes/MapSelectScene.heroOverlay.test.js`

- [ ] **Step 1: Update the test scaffold + add a render test**

In `src/scenes/MapSelectScene.heroOverlay.test.js`, the `setupDom()` helper creates a `#map-sidebar` element. Rename it to `#map-overworld`. Change:

```javascript
  const sidebar = document.createElement('div');
  sidebar.id = 'map-sidebar';
  document.body.appendChild(sidebar);
```

to:

```javascript
  const overworld = document.createElement('div');
  overworld.id = 'map-overworld';
  document.body.appendChild(overworld);
```

Then add this new `describe` block at the end of the file (it constructs the scene exactly like the existing tests — `new MapSelectScene(); scene.create();` — using the real `SaveManager`, which on a fresh jsdom localStorage has only map 0 unlocked with 0 stars):

```javascript
describe('MapSelectScene — overworld rendering', () => {
  beforeEach(setupDom);

  it('renders one node per map with correct states on a fresh save', () => {
    const scene = new MapSelectScene();
    scene.create();

    const nodes = document.querySelectorAll('#map-overworld .ow-node');
    expect(nodes.length).toBe(10);

    const node0 = document.querySelector('.ow-node[data-map-id="0"]');
    const node9 = document.querySelector('.ow-node[data-map-id="9"]');
    expect(node0.className).toContain('next');     // map 0 unlocked, 0 stars -> next
    expect(node9.className).toContain('locked');   // map 9 not yet unlocked
    expect(node9.className).toContain('final');    // map 9 is the final id
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/scenes/MapSelectScene.heroOverlay.test.js`
Expected: FAIL — `_populateOverworld` does not exist / no `.ow-node` elements (and the existing hero tests still pass because the scaffold now provides `#map-overworld`).

- [ ] **Step 3: Add the import and swap the create() call**

In `src/scenes/MapSelectScene.js`, add the import after the existing `starsDisplay` import:

```javascript
import { classifyOverworld } from '../systems/overworldState.js';
```

In `create()`, change:

```javascript
    this._populateSidebar();
```

to:

```javascript
    this._populateOverworld();
```

- [ ] **Step 4: Replace `_populateSidebar` with `_populateOverworld`**

In `src/scenes/MapSelectScene.js`, replace the entire `_populateSidebar() { … }` method with:

```javascript
  _populateOverworld() {
    const container = document.getElementById('map-overworld');
    container.replaceChildren();

    const entries = MAPS.map(m => ({
      id: m.id,
      unlocked: this._saveMgr.isUnlocked(m.id),
      stars: this._saveMgr.getStars(m.id),
    }));
    const nodes = classifyOverworld(entries, MAPS.length - 1);
    const pts = MAPS.map(m => m.overworldPos);

    // SVG connector layer: dim full path + gold between consecutive unlocked nodes.
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ow-connectors');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');

    const dim = document.createElementNS(NS, 'polyline');
    dim.setAttribute('class', 'ow-path-dim');
    dim.setAttribute('points', pts.map(([x, y]) => `${x * 100},${y * 100}`).join(' '));
    svg.appendChild(dim);

    const unlockedById = new Map(nodes.map(n => [n.id, n.unlocked]));
    for (let i = 0; i < pts.length - 1; i++) {
      if (unlockedById.get(i) && unlockedById.get(i + 1)) {
        const seg = document.createElementNS(NS, 'line');
        seg.setAttribute('class', 'ow-path-lit');
        seg.setAttribute('x1', pts[i][0] * 100);
        seg.setAttribute('y1', pts[i][1] * 100);
        seg.setAttribute('x2', pts[i + 1][0] * 100);
        seg.setAttribute('y2', pts[i + 1][1] * 100);
        svg.appendChild(seg);
      }
    }
    container.appendChild(svg);

    // Nodes.
    for (const node of nodes) {
      const map = MAPS[node.id];
      const el = document.createElement('div');
      el.className = `ow-node ${node.state}` + (node.isFinal ? ' final' : '');
      if (node.id === this._selectedId && node.state !== 'locked') el.classList.add('active');
      el.dataset.mapId = String(node.id);
      el.style.left = `${map.overworldPos[0] * 100}%`;
      el.style.top  = `${map.overworldPos[1] * 100}%`;

      const art = document.createElement('img');
      art.className   = 'ow-node-art';
      art.src         = `assets/overworld/${map.overworldArt}`;
      art.alt         = map.name;
      art.onerror     = () => { art.remove(); el.classList.add('ow-node-fallback'); };
      el.appendChild(art);

      const num = document.createElement('div');
      num.className   = 'ow-node-num';
      num.textContent = node.state === 'locked' ? '🔒' : String(node.id + 1);
      el.appendChild(num);

      const starsEl = document.createElement('div');
      starsEl.className = 'ow-node-stars';
      if (node.unlocked) starsEl.textContent = node.stars > 0 ? starsDisplay(node.stars) : '—';
      el.appendChild(starsEl);

      if (node.unlocked) el.addEventListener('click', () => this._selectMap(node.id));
      container.appendChild(el);
    }
  }
```

- [ ] **Step 5: Update `_selectMap` to highlight nodes**

In `src/scenes/MapSelectScene.js`, replace the `_selectMap` body:

```javascript
  _selectMap(mapId) {
    this._selectedId = mapId;
    document.querySelectorAll('.map-row.active').forEach(r => r.classList.remove('active'));
    document.querySelectorAll('.map-row')[mapId].classList.add('active');
    this._renderFeatured(mapId);
  }
```

with:

```javascript
  _selectMap(mapId) {
    this._selectedId = mapId;
    document.querySelectorAll('.ow-node.active').forEach(n => n.classList.remove('active'));
    const sel = document.querySelector(`.ow-node[data-map-id="${mapId}"]`);
    if (sel) sel.classList.add('active');
    this._renderFeatured(mapId);
  }
```

- [ ] **Step 6: Run the targeted tests**

Run: `npx vitest run src/scenes/MapSelectScene.heroOverlay.test.js`
Expected: PASS (existing hero-overlay tests + the new overworld-rendering test).

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: PASS — all tests green.

- [ ] **Step 8: Commit**

```bash
git add src/scenes/MapSelectScene.js src/scenes/MapSelectScene.heroOverlay.test.js
git commit -m "feat(map-select): render winding-path overworld with node states (backlog #5)"
```

---

### Task 5: Node-art generation prompts

**Files:**
- Create: `assets/overworld/PROMPTS.md`

- [ ] **Step 1: Write the prompts file**

Create `assets/overworld/PROMPTS.md`:

```markdown
# Overworld Node Art — Generation Prompts

Each level shows an iconic node image on the MapSelect overworld. Generate one
square (1:1), transparent-or-dark-background image per level and save it with the
exact filename below into this folder (`assets/overworld/`). Until a file exists the
overworld renders a numbered-circle fallback, so these can be dropped in any time.

Style guidance (keep consistent across all 10): painted sci-fi icon, centered
subject, dark space backdrop, ~512×512, readable at 46px.

- `overworld_0_outpost_sigma.png` — a small fortified ground outpost on a green-grey planet, Earth's last forward base.
- `overworld_1_lunar_gate.png` — a lunar transit gate / moon base on a grey cratered moon.
- `overworld_2_the_crater.png` — a massive impact crater on a barren grey world.
- `overworld_3_orbital_station.png` — a blue-lit orbital space station ring.
- `overworld_4_asteroid_belt.png` — a cluster of drifting asteroids, amber dust.
- `overworld_5_titans_reach.png` — a towering rocky spire / megastructure reaching into space.
- `overworld_6_deep_space_corridor.png` — a narrow starlane corridor between dark nebulae.
- `overworld_7_the_void_frontier.png` — a deep-purple void with faint distant stars, ominous.
- `overworld_8_enemy_homeworld.png` — a hostile alien homeworld, glowing red-violet surface.
- `overworld_9_last_light.png` — the final battleground, a dying star / last bastion, dramatic red.
```

- [ ] **Step 2: Commit**

```bash
git add assets/overworld/PROMPTS.md
git commit -m "docs(assets): overworld node-art generation prompts (backlog #5)"
```

---

## Post-implementation (verify step, handled outside the task loop)

- **Build:** `npm run build` — clean.
- **Browser:** open MapSelect; confirm the winding path renders with 10 nodes, map 0 marked "next", others locked with 🔒, node 9 styled "final"; numbered-circle fallback shows (art not yet generated); clicking the unlocked node selects it (featured panel + PLAY update) and PLAY launches the level; locked nodes are inert; resizing the window keeps nodes positioned correctly; meta-bar (Upgrades/Heroes/Audio), stats footer, and overlays still work.
