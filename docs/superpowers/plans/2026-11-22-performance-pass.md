# Performance Pass (roadmap 6.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove and secure the frame rate (60 fps desktop, ≥ 30 fps on the phone proxy) by baking the one Graphics layer that dominates the frame, gate it with `npm run perf`, show fps with `?fps=1`, and add a Graphics Auto/High/Low setting beside a separate Reduce motion checkbox.

**Architecture:**
- A pure frame-statistics recorder backs both the in-game `?fps=1` meter and the Playwright perf gate, so the gate and the counter read the same numbers.
- The static layer (blockers, platforms, legacy path) keeps its Phaser Graphics as an off-screen drawing surface and is stamped into a RenderTexture at render scale k. Phaser stops re-triangulating its 348 filled paths every frame.
- A pure `resolveGraphics` turns the saved `graphics` setting into registry flags that the existing consumers read.

**Tech Stack:** Phaser 3.90 (WebGL1), vanilla ES modules, Vite 5, Vitest 2 + jsdom, Playwright (already a dev dependency).

**Spec:** `docs/superpowers/specs/2026-11-22-performance-pass-design.md`. Its "What the measurements say" section has the baseline numbers and the profile.

## Global Constraints

- No new dependencies.
- Tunables live in `src/data/`. Pure logic lives in `src/systems/` with Vitest tests. Comments explain *why*.
- Render scale k ∈ {1, 2} comes from `getRenderScale()` (`src/systems/renderScale.js`). The world is `WORLD_WIDTH × WORLD_HEIGHT`.
- **Perf budget:**
  - desktop = `desktop1440x2`, 1x CPU, mean fps ≥ 57, p95 ≤ 20 ms;
  - phone = `iphone`, 4x CPU, mean fps ≥ 30, p95 ≤ 34 ms;
  - every map at its last wave (`MAP_WAVES[map].length`);
  - refuse to run while the 1-minute load average is ≥ 6.
- **No per-map threshold overrides.** If a map fails after the bake, fix the pad glow and ambient layer. If it still fails, stop and report.
- The gate runs at the default settings (Graphics Auto). Never pass it by turning visuals off.
- **`?fps=1` works in every build, production included.** Every other debug hook stays behind `import.meta.env.DEV || import.meta.env.MODE === 'capture'`.
- **Graphics setting:**
  - `graphics: 'auto' | 'high' | 'low'`, default `'auto'`;
  - Low = grade off, in-game ambient particles off, bursts × 0.5 rounded up (never 0 from a non-zero burst);
  - High = grade on (WebGL only), ambient on, bursts × 1;
  - Auto = grade on WebGL and not touch, ambient on, bursts × 1.
- **Reduce motion:**
  - It is a separate checkbox (`#reduce-motion`): checked means `ambientMotion: false`.
  - `ambientMotion` keeps every current consumer.
  - The in-game ambient layer draws only when `ambientMotion !== false` AND `ambientFx !== false`.
- **Migration:**
  - only a saved boolean `mapGrade`: `false` becomes `'low'`, `true` becomes `'high'`, and a missing or null value becomes `'auto'`;
  - an invalid saved `graphics` value becomes `'auto'`;
  - the saved `ambientMotion` is untouched.
- The grade applies from the next level (the label says so). Ambient and particle changes apply live.
- `npm test`, `npm run build` and `npm run matrix` stay green.

## Review Focus

1. **A build, sell or move must show at once.** An occupancy change after a build, sell or Move must appear in the baked layer immediately. Today the Graphics repaints on `_repaintStaticLayers`, and a bake that is not redone looks fine until someone sells a tower. Pinned in Task 3.
2. **Replays must not stack textures.** Restarting or replaying a level must not stack RenderTextures (≈ 14.7 MB each at k = 2). Pinned in Task 3: shutdown destroys the bake.
3. **Older saves must still load.** A v5 save with `mapGrade: false`, `true`, `null` or missing, or with a garbage `graphics` value, must load to a valid level. Pinned in Task 4.
4. **The Canvas renderer must never grade.** Even at High, Canvas never grades (there is no preFX). Pinned in Task 4.
5. **The counter must cost nothing when it's off.** Without `?fps=1` there is no meter element and no rAF loop. Production players pay nothing. Pinned in Task 1.

---

### Task 1: Frame statistics and the `?fps=1` meter

**Files:**
- Create: `src/systems/frameStats.js`, `src/systems/frameStats.test.js`
- Create: `src/ui/FpsMeter.js`, `src/ui/FpsMeter.test.js`
- Create: `src/data/fpsMeter.js`
- Modify: `src/main.js` (call `installFpsMeter()` once at boot); `index.html` (CSS for `#fps-meter`, theme tokens `--ui-*`)

**Interfaces:**
- Produces:
  - `frameStats(intervalsMs: number[]) -> { frames, fps, p50, p95, p99 }`. `fps = frames / (sum of intervals / 1000)`. Percentiles are nearest-rank on the sorted intervals. Returns all zeros for an empty array. Values are rounded to 0.1.
  - `createFrameRecorder({ capacityMs }) -> { tick(nowMs), stats(windowMs) }`. `tick` records the interval since the previous tick (the first tick records nothing). It drops intervals older than `capacityMs` measured back from the last tick. `stats(windowMs)` is `frameStats` of the intervals whose end falls within `windowMs` of the last tick.
  - `installFpsMeter(win = window) -> null | { destroy() }`.
    - It returns `null` unless `new URLSearchParams(win.location.search).get('fps') === '1'`.
    - Otherwise it appends `<div id="fps-meter" aria-hidden="true">` to `document.body`, runs a rAF loop that calls `tick`, rewrites the text every `FPS_METER.refreshMs` as `"<fps> fps · p95 <p95> ms"` over `FPS_METER.windowMs`, and sets `win.__fps = { stats: (ms) => recorder.stats(ms) }`.
  - `FPS_METER = { capacityMs: 20000, windowMs: 2000, refreshMs: 500 }` in `src/data/fpsMeter.js`.

- [ ] **Step 1: Write the failing tests.**

```js
// src/systems/frameStats.test.js
import { frameStats, createFrameRecorder } from './frameStats.js';
it('steady 60 Hz reads 60 fps and a 16.7 ms p95', () => {
  const s = frameStats(Array(120).fill(1000 / 60));
  expect(s).toMatchObject({ frames: 120, fps: 60, p50: 16.7, p95: 16.7 });
});
it('one long frame in twenty moves p95, not p50', () => {
  const s = frameStats([...Array(19).fill(16.7), 50]);
  expect(s.p50).toBe(16.7); expect(s.p99).toBe(50); expect(s.fps).toBeCloseTo(20 / (19 * 16.7 + 50) * 1000, 1);
});
it('empty input is all zeros', () => expect(frameStats([])).toEqual({ frames: 0, fps: 0, p50: 0, p95: 0, p99: 0 }));
it('recorder windows by time and drops past capacity', () => {
  const r = createFrameRecorder({ capacityMs: 1000 });
  [0, 10, 20, 520, 1020, 1030].forEach(t => r.tick(t));      // intervals 10,10,500,500,10
  expect(r.stats(5).frames).toBe(1);                           // only the interval ending at 1030
  expect(r.stats(100).frames).toBe(2);                         // ends at 1020 and 1030
  expect(r.stats(5000).frames).toBe(3);                        // capacity 1000 dropped the intervals ending at 10 and 20
});
```

```js
// src/ui/FpsMeter.test.js (jsdom): stub requestAnimationFrame with vi.fn
it('does nothing without ?fps=1', () => {
  const win = { location: { search: '?map=3' }, requestAnimationFrame: vi.fn() };
  expect(installFpsMeter(win)).toBeNull();
  expect(document.getElementById('fps-meter')).toBeNull();
  expect(win.requestAnimationFrame).not.toHaveBeenCalled();
  expect(win.__fps).toBeUndefined();
});
it('with ?fps=1 mounts the meter and exposes __fps.stats', () => {
  const win = { location: { search: '?fps=1' }, requestAnimationFrame: vi.fn() };
  const m = installFpsMeter(win);
  expect(document.getElementById('fps-meter')).not.toBeNull();
  expect(typeof win.__fps.stats).toBe('function');
  m.destroy(); expect(document.getElementById('fps-meter')).toBeNull();
});
```

- [ ] **Step 2:** Run `npx vitest run src/systems/frameStats.test.js src/ui/FpsMeter.test.js`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement the three modules per Interfaces. In `src/main.js`, call `installFpsMeter()` **outside** any `import.meta.env` gate. Put the meter in the top-left corner over the map area, in a theme body font, small, with `pointer-events: none`.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run `npm test` and `npm run build`; both exit 0.
- [ ] **Step 4b: Mutation check.** (a) Make `installFpsMeter` mount regardless of `?fps=1` and confirm 'does nothing without ?fps=1' FAILS. (b) Make the recorder skip the capacity drop and confirm the `stats(5000)` assertion FAILS. Restore both and paste the failing-then-passing output in the report.
- [ ] **Step 5:** Commit: `git add src/systems/frameStats.js src/systems/frameStats.test.js src/ui/FpsMeter.js src/ui/FpsMeter.test.js src/data/fpsMeter.js src/main.js index.html && git commit -m "feat(perf): ?fps=1 frame meter on a pure frame recorder"`

### Task 2: `npm run perf`, the performance gate

**Files:**
- Create: `scripts/perf.mjs`, `src/data/perfBudget.js`, `src/systems/perfVerdict.js`, `src/systems/perfVerdict.test.js`
- Modify: `package.json` (`"perf": "node scripts/perf.mjs"`); `.gitignore` if the report path is not already ignored

**Interfaces:**
- Consumes: `window.__fps.stats(ms)` (Task 1); `DEVICES` (`scripts/captureDevices.mjs`); `defaultCaptureBuild` (`src/systems/debugCapture.js`); `MAPS`, `MAP_WAVES`; the capture build in `.art-cache/capture-dist`, built with `vite build({ mode: 'capture', … })` as `scripts/capture.mjs` does.
- Produces:
  - `PERF_BUDGET` in `src/data/perfBudget.js`:

    ```js
    export const PERF_BUDGET = {
      maxLoad: 6, warmupSimMs: 3000, sampleMs: 12000,
      runs: [
        { id: 'desktop', device: 'desktop1440x2', cpuThrottle: 1, minFps: 57, maxP95Ms: 20 },
        { id: 'phone',   device: 'iphone',        cpuThrottle: 4, minFps: 30, maxP95Ms: 34 },
      ],
    };
    ```

  - `perfVerdict(stats, run) -> string[]`: an empty array means pass. Each failure is a message naming the measured value and the limit (fps under `minFps`; p95 over `maxP95Ms`; `frames === 0`).
  - The CLI is `node scripts/perf.mjs [--maps 0,9] [--runs phone] [--cpu-throttle N] [--rebuild] [--port N]`.
    - It launches Chromium with `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`.
    - It aborts (exit 2) if `os.loadavg()[0] >= maxLoad`, or if the WebGL `UNMASKED_RENDERER_WEBGL` string contains "SwiftShader" (software GL makes the numbers meaningless).
    - Per map × run it opens `?debug=1&map=M&wave=<last>&build=<defaultCaptureBuild>&fps=1`, waits until `__capture.simMs >= warmupSimMs`, applies `Emulation.setCPUThrottlingRate`, waits `sampleMs` of wall time, and reads `__fps.stats(sampleMs)`.
    - It prints one line per run (map, run id, fps, p95, p99, peak `__capture.enemies` sampled during the window, canvas size, verdict).
    - It writes `.art-cache/perf/report.json` and exits 1 if any verdict fails.
    - `--cpu-throttle` overrides every run's throttle. It exists to prove the gate can fail.

- [ ] **Step 1: Write the failing test.**

```js
// src/systems/perfVerdict.test.js
import { perfVerdict } from './perfVerdict.js';
import { PERF_BUDGET } from '../data/perfBudget.js';
const phone = PERF_BUDGET.runs.find(r => r.id === 'phone');
it('passes at the limits', () => expect(perfVerdict({ frames: 360, fps: 30, p95: 34 }, phone)).toEqual([]));
it('fails on fps, on p95, and on no frames, naming value and limit', () => {
  expect(perfVerdict({ frames: 300, fps: 25.8, p95: 33 }, phone)[0]).toMatch(/25\.8.*30/);
  expect(perfVerdict({ frames: 400, fps: 33, p95: 50 }, phone)[0]).toMatch(/50.*34/);
  expect(perfVerdict({ frames: 0, fps: 0, p95: 0 }, phone).length).toBeGreaterThan(0);
});
it('budget matches the spec', () => expect(PERF_BUDGET.runs.map(r => [r.device, r.cpuThrottle, r.minFps, r.maxP95Ms]))
  .toEqual([['desktop1440x2', 1, 57, 20], ['iphone', 4, 30, 34]]));
```

- [ ] **Step 2:** Run `npx vitest run src/systems/perfVerdict.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `perfBudget.js`, `perfVerdict.js` and `scripts/perf.mjs` per Interfaces. Reuse `DEVICES` and the capture-dist build rather than copying them. Drop the `portrait` key from the device entry before `browser.newContext`. Default port 4190 (capture uses 4188).
- [ ] **Step 4:** Run `npx vitest run src/systems/perfVerdict.test.js`. Expected: PASS. **Mutation check:** delete the p95 rule from `perfVerdict` and confirm the p95 test FAILS; restore. Paste the output in the report.
- [ ] **Step 5: Prove the gate can fail, on this pre-bake code.** Check `uptime` (load < 6) first. Run `npm run perf -- --rebuild --maps 9 --runs phone --cpu-throttle 6`. Expected: exit 1, map 9 phone fps around 26 (the spec's baseline), and a FAIL line. Then run `npm run perf` on every map at the real budget and **save its full output** to the task report as the before numbers. Its exit code is recorded, not required: the base may already pass at 4x.
- [ ] **Step 6:** Run `npm test` and `npm run build`; both exit 0. Commit: `git add scripts/perf.mjs src/data/perfBudget.js src/systems/perfVerdict.js src/systems/perfVerdict.test.js package.json && git commit -m "feat(perf): npm run perf frame-rate gate on the real GPU"` (add `.gitignore` only if you changed it).

### Task 3: Bake the static layer into a texture

**Files:**
- Create: `src/systems/staticLayerBake.js`, `src/systems/staticLayerBake.test.js`
- Modify: `src/scenes/GameScene.js` (create at ~343, `_renderStaticLayers` ~2236, `_repaintStaticLayers` ~2309, shutdown ~756); `src/scenes/gameSceneHarness.js` and `src/scenes/GameScene.road.test.js` only as needed to keep the existing tests meaningful
- Test: `src/scenes/GameScene.staticBake.test.js`

**Interfaces:**
- Consumes: `getRenderScale()`; Phaser `RenderTexture` (`scene.add.renderTexture`, `.clear()`, `.draw(gameObject, x, y)`, `.destroy()`; check `node_modules/phaser/src/gameobjects/rendertexture/RenderTexture.js` for the 3.90 signatures).
- Produces:
  - `createStaticBake(scene, { width, height, resolution, depth }) -> { surface, image, rebake(), destroy() }`.
    - `surface` is a Graphics **not on the display list** (`scene.make.graphics({}, false)`), scaled by `resolution`, so the existing draw helpers still draw in world units.
    - `image` is a RenderTexture of `width*resolution × height*resolution` at `depth`, origin 0, display size `width × height`.
    - `rebake()` clears the RenderTexture and draws `surface` into it.
    - `destroy()` destroys both.
  - In GameScene:
    - `this._staticLayers` stays the drawing surface (`bake.surface`), so every helper and test that draws into `this._staticLayers` keeps working.
    - `this._staticBake` holds the bake.
    - `_renderStaticLayers(map)` ends with `this._staticBake?.rebake()`.
    - Shutdown calls `this._staticBake?.destroy()` and nulls both fields.

- [ ] **Step 1: Write the failing tests.**

```js
// src/systems/staticLayerBake.test.js: a minimal fake scene; record calls
it('surface is off the display list and scaled by k; image is k× and shown at world size', () => {
  const s = fakeScene(); const b = createStaticBake(s, { width: 1280, height: 720, resolution: 2, depth: 10 });
  expect(s.make.graphics).toHaveBeenCalledWith({}, false);
  expect(b.surface.scale).toBe(2);
  expect(s.add.renderTexture).toHaveBeenCalledWith(0, 0, 2560, 1440);
  expect(b.image.depth).toBe(10); expect(b.image.displayWidth).toBe(1280); expect(b.image.displayHeight).toBe(720);
});
it('rebake clears then draws the surface', () => {
  const b = createStaticBake(fakeScene(), { width: 1280, height: 720, resolution: 1, depth: 10 });
  b.rebake();
  expect(b.image.calls).toEqual(['clear', ['draw', b.surface, 0, 0]]);
});
it('destroy destroys surface and image', () => {
  const b = createStaticBake(fakeScene(), { width: 1280, height: 720, resolution: 1, depth: 10 });
  b.destroy();
  expect(b.surface.destroy).toHaveBeenCalledTimes(1); expect(b.image.destroy).toHaveBeenCalledTimes(1);
});
```

```js
// src/scenes/GameScene.staticBake.test.js: through gameSceneHarness
// Use the harness's real _renderStaticLayers (un-mock it for this file) with a createStaticBake spy.
it('the static layer draws through the bake, not a display-list Graphics (the per-frame cost)', () => {
  const scene = makeScene(); scene.create({ mapId: 3 });
  expect(createStaticBakeSpy).toHaveBeenCalledWith(scene, { width: WORLD_WIDTH, height: WORLD_HEIGHT, resolution: getRenderScale(), depth: 10 });
  expect(scene._staticLayers).toBe(scene._staticBake.surface);
  const depth10 = scene.add.graphics.mock.results.map(r => r.value).filter(g => g.setDepth.mock.calls.some(([d]) => d === 10));
  expect(depth10).toEqual([]);   // the old per-frame layer was add.graphics().setDepth(10)
});
it('repainting after a build re-bakes, after the surface is redrawn (Review Focus 1)', () => {
  const scene = makeScene(); scene.create({ mapId: 3 });
  const order = [];
  scene._staticLayers.clear = vi.fn(() => order.push('surface.clear'));
  scene._staticBake.rebake = vi.fn(() => order.push('rebake'));
  scene._repaintStaticLayers();
  expect(order[0]).toBe('surface.clear'); expect(order.at(-1)).toBe('rebake');
});
it('shutdown destroys the bake and nulls it (Review Focus 2)', () => {
  const scene = makeScene(); scene.create({ mapId: 3 });
  const bake = scene._staticBake; scene.shutdown();
  expect(bake.destroy).toHaveBeenCalledTimes(1);
  expect(scene._staticBake).toBeNull(); expect(scene._staticLayers).toBeNull();
});
```

- [ ] **Step 2:** Run `npx vitest run src/systems/staticLayerBake.test.js src/scenes/GameScene.staticBake.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement `createStaticBake` and wire GameScene per Interfaces, using `resolution: getRenderScale()` and `depth: 10`.
- [ ] **Step 4:** Run the same command, then `npm test`. Expected: all PASS. If an existing test mocks `_staticLayers` as `{ clear }`, keep its assertion meaningful rather than deleting it.
- [ ] **Step 5: Mutation check.** Remove the `rebake()` call from `_renderStaticLayers`, confirm the Review Focus 1 test FAILS, then restore it.
- [ ] **Step 6: The look must not change** (a one-off A/B, numbers into the report).
  - Seed a save with `ambientMotion: false`, so the pad glow is static and the ambient layer is off.
  - Load `?debug=1&map=M&wave=1&build=<defaultCaptureBuild>&res=K` for M ∈ {3, 9} and K ∈ {1, 2}.
  - Pause the scene immediately after `__capture` appears (`window.__game.sys.pause()`) and screenshot the canvas.
  - Shoot head twice and base (`git worktree add` at the commit before this task) twice.
  - Diff with `sharp`, as the % of pixels differing by > 2 levels.
  - Expected: head-vs-base ≤ max(base-vs-base, head-vs-head) + 0.5 %.
  - Also **Read** a head and a base crop of the pads at k = 2 and confirm by eye: no blur, no offset.
  - Remove the base worktree afterwards.
- [ ] **Step 7: The gate.** With load < 6, run `npm run perf` (all maps). Expected: exit 0. Record the full output as the after numbers. **If any map fails:** profile that map's run the way the spec did. If the cause is `_padGlow` or the ambient layer, fix it in this task with its own failing test. If it is anything else, or it still fails after that, stop and report BLOCKED with the numbers. No budget changes.
- [ ] **Step 8:** Commit: `git add src/systems/staticLayerBake.js src/systems/staticLayerBake.test.js src/scenes/GameScene.js src/scenes/GameScene.staticBake.test.js` (plus the harness or road test if touched) `&& git commit -m "perf: bake the static layer into a render texture"`

### Task 4: The Graphics setting model (resolver, save migration, boot)

**Files:**
- Create: `src/data/graphicsQuality.js`, `src/systems/graphicsQuality.js`, `src/systems/graphicsQuality.test.js`
- Modify:
  - `src/systems/SaveManager.js` (the default `graphics: 'auto'` replaces `mapGrade: null`; migrate in `_normalize`) and `SaveManager.test.js`;
  - `src/scenes/BootScene.js` (~36–46) and `BootScene.test.js`;
  - `src/systems/mapGrade.js`: delete `resolveMapGrade` and its tests, because this task makes it unused.

**Interfaces:**
- Produces:
  - `GRAPHICS_LEVELS = ['auto', 'high', 'low']` and `LOW_PARTICLE_SCALE = 0.5` in `src/data/graphicsQuality.js`.
  - `resolveGraphics(setting, { webgl, touch }) -> { mapGrade: boolean, ambientFx: boolean, particleScale: number }`. An unknown setting resolves as `'auto'`.
  - `migrateGraphicsSetting(savedSettings) -> 'auto'|'high'|'low'`.
    - A valid `savedSettings.graphics` wins.
    - Otherwise `mapGrade === false` gives `'low'`, `mapGrade === true` gives `'high'`, and anything else gives `'auto'`.
  - `scaleBurst(n, particleScale) -> number`: `0` for `n <= 0`, otherwise `Math.max(1, Math.ceil(n * particleScale))`.
  - Registry keys set by BootScene:
    - `mapGrade`, `ambientFx` and `particleScale` (from `resolveGraphics`);
    - `graphicsEnv: { webgl, touch }`, for the settings overlay to re-resolve live;
    - `ambientMotion`, unchanged.
  - A loaded save's `settings` has `graphics` and no `mapGrade` key.

- [ ] **Step 1: Write the failing tests.**

```js
// src/systems/graphicsQuality.test.js
const desk = { webgl: true, touch: false }, phone = { webgl: true, touch: true }, canvas = { webgl: false, touch: false };
it('auto = today: grade on desktop WebGL only', () => {
  expect(resolveGraphics('auto', desk)).toEqual({ mapGrade: true, ambientFx: true, particleScale: 1 });
  expect(resolveGraphics('auto', phone)).toEqual({ mapGrade: false, ambientFx: true, particleScale: 1 });
});
it('high grades on touch; Canvas never grades (Review Focus 4)', () => {
  expect(resolveGraphics('high', phone).mapGrade).toBe(true);
  expect(resolveGraphics('high', canvas).mapGrade).toBe(false);
});
it('low turns grade and ambient off and halves bursts', () =>
  expect(resolveGraphics('low', desk)).toEqual({ mapGrade: false, ambientFx: false, particleScale: 0.5 }));
it('garbage setting resolves as auto', () => expect(resolveGraphics('ultra', phone)).toEqual(resolveGraphics('auto', phone)));
it('migration maps only mapGrade (Review Focus 3)', () => {
  expect(migrateGraphicsSetting({ mapGrade: false, ambientMotion: true })).toBe('low');
  expect(migrateGraphicsSetting({ mapGrade: true })).toBe('high');
  expect(migrateGraphicsSetting({ mapGrade: null })).toBe('auto');
  expect(migrateGraphicsSetting({})).toBe('auto');
  expect(migrateGraphicsSetting({ graphics: 'low', mapGrade: true })).toBe('low');
  expect(migrateGraphicsSetting({ graphics: 'ultra' })).toBe('auto');
});
it('scaleBurst never zeroes a real burst', () => {
  expect(scaleBurst(1, 0.5)).toBe(1); expect(scaleBurst(30, 0.5)).toBe(15); expect(scaleBurst(7, 0.5)).toBe(4);
  expect(scaleBurst(0, 0.5)).toBe(0); expect(scaleBurst(12, 1)).toBe(12);
});
```

SaveManager tests:
- a stored v5 save with `settings: { mapGrade: false, ambientMotion: false }` loads as `graphics: 'low'`, keeps `ambientMotion: false`, and has no `mapGrade` key;
- a fresh save has `graphics: 'auto'`;
- `setSettings({ graphics: 'high' })` round-trips through storage.

BootScene test: with a saved `graphics: 'low'`, the registry gets `mapGrade: false`, `ambientFx: false`, `particleScale: 0.5` and `graphicsEnv`.

- [ ] **Step 2:** Run `npx vitest run src/systems/graphicsQuality.test.js src/systems/SaveManager.test.js src/scenes/BootScene.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement per Interfaces. `_normalize` sets `env.settings.graphics = migrateGraphicsSetting(parsed.settings)` and deletes `env.settings.mapGrade`. The envelope version stays 5: load already merges settings over the defaults.
- [ ] **Step 4:** Run `npm test`. Expected: all PASS, including the deleted resolver's former callers.
- [ ] **Step 4b: Mutation check.** (a) Drop the `webgl` check from High and confirm the Canvas test FAILS. (b) Remove the `_normalize` migration line and confirm the SaveManager `graphics: 'low'` test FAILS. Restore both; paste the output in the report.
- [ ] **Step 5:** Commit: `git add src/data/graphicsQuality.js src/systems/graphicsQuality.js src/systems/graphicsQuality.test.js src/systems/SaveManager.js src/systems/SaveManager.test.js src/scenes/BootScene.js src/scenes/BootScene.test.js src/systems/mapGrade.js src/systems/mapGrade.test.js && git commit -m "feat(settings): graphics auto/high/low model with mapGrade migration"`

### Task 5: The settings UI and the consumers (Graphics select, Reduce motion, ambient gate, particle scale)

**Files:**
- Modify:
  - `index.html` (~1442–1446): `#ambient-motion` becomes `<label><input id="reduce-motion" type="checkbox" /> Reduce motion</label>`. `#map-grade` becomes `<label>Graphics <select id="graphics-quality"><option value="auto">Auto</option><option value="high">High</option><option value="low">Low</option></select></label>` with the hint "colour grading applies from the next level", styled with the `.ui-*` kit and ≥ 44 px touch height.
  - `src/ui/SettingsOverlay.js` and `SettingsOverlay.test.js`.
  - `src/systems/AmbientBackgroundLayer.js:43` and its test.
  - `src/systems/ParticleSpawner.js` (every `explode(q…)` and `emitParticleAt(…, n)`: lines 46, 54, 85, 100, 115, 126) and its test.
- Check: `scripts/capture.mjs`, `src/scenes/mapSelectDom.testutil.js` and any test that builds the settings DOM, for the old ids.

**Interfaces:**
- Consumes: `resolveGraphics`, `scaleBurst`, `GRAPHICS_LEVELS` and the registry keys from Task 4.
- Produces:
  - **The `#graphics-quality` select:**
    - On open it shows `save.getSettings().graphics`.
    - On change it calls `save.setSettings({ graphics })` and sets the registry `mapGrade`, `ambientFx` and `particleScale` from `resolveGraphics(value, registry.get('graphicsEnv'))`.
  - **The `#reduce-motion` checkbox:**
    - On open, `checked = registry.get('ambientMotion') === false`.
    - On change it sets `ambientMotion = !checked` in the registry and in the save.
  - **The ambient layer is off when** `ambientMotion === false || ambientFx === false` (read live each frame, as today).
  - **ParticleSpawner** reads `registry.get('particleScale') ?? 1` at each burst and passes counts through `scaleBurst`.

- [ ] **Step 1: Write the failing tests.**
  - SettingsOverlay:
    - Open with a saved `graphics: 'low'` and the select shows `low`.
    - Choose `high` with `graphicsEnv: { webgl: true, touch: true }`: the save gets `graphics: 'high'`, and the registry gets `mapGrade: true`, `ambientFx: true`, `particleScale: 1`.
    - `#reduce-motion` is checked when `ambientMotion === false`. Checking it sets `ambientMotion: false` in the registry and the save.
    - `close()` removes both listeners: a change after close doesn't touch the registry.
  - AmbientBackgroundLayer: with `ambientMotion: true, ambientFx: false`, an update clears and does not step or draw. With both true, it steps.
  - ParticleSpawner: with `particleScale: 0.5`, a muzzle def of `quantity: 7` explodes 4. A missing `particleScale` explodes 7. The hero VFX burst of 30 explodes 15.
- [ ] **Step 2:** Run `npx vitest run src/ui/SettingsOverlay.test.js src/systems/AmbientBackgroundLayer.test.js src/systems/ParticleSpawner.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement per Interfaces. Remove the old `#ambient-motion` and `#map-grade` handlers. Update every test or harness that builds the old DOM ids.
- [ ] **Step 4:** Run `npm test` and `npm run build`; both exit 0. Run `npm run matrix` (check `uptime` first; under load, flakes are a known issue, see project notes). Expected: PASS on desktop, iphone, pixel and ipad.
- [ ] **Step 5: Mutation check.** Make ParticleSpawner ignore `particleScale` and confirm the 7 → 4 test FAILS. Make the ambient gate ignore `ambientFx` and confirm its test FAILS. Restore both.
- [ ] **Step 6: Live check.** On the capture build with real mouse input:
  - open Settings, pick Low, start a map, and confirm no backdrop grade (`backdrop.preFX.list.length === 0`), no ambient drawing (`_ambient._layers[0].gfx.commandBuffer.length === 0` after a frame) and 0 page errors;
  - tick Reduce motion and confirm `registry.get('ambientMotion') === false` and the title starfield stays still.
  Record the evidence in the report.
- [ ] **Step 7:** Commit: `git add index.html src/ui/SettingsOverlay.js src/ui/SettingsOverlay.test.js src/systems/AmbientBackgroundLayer.js src/systems/AmbientBackgroundLayer.test.js src/systems/ParticleSpawner.js src/systems/ParticleSpawner.test.js` (plus any test util you updated) `&& git commit -m "feat(settings): Graphics select and Reduce motion; ambient and particles follow them"`
