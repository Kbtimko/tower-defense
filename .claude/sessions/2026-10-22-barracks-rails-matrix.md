# 2026-10-22 — Barracks crash, desktop rails, device matrix

**Accomplished:**
- **#44, a production crash.** Tapping a tier-3 barracks on a tier-4 map threw in `_setUpgradeButton`.
  - Root cause: the branch-picker gate had excluded barracks since 936b0f2.
  - The fix is one line. Barracks tier 4 had never been purchasable, even though the sim already assumed Vanguard.
  - PR #103 into `main` (not merged: merging deploys production) and forward-port #104 into `visual/integration`.
  - Verified on both production builds; Vanguard was bought live.
  - Found along the way: on `main` the tier-3 picker panel hides Sell behind the bottom bar for every tower type (#46). 2.2 already fixes this.
- **#43(b), desktop rails.** PR #105, stacked on #104.
  - On a `(pointer: fine)` device the rails are 104 px and the canvas 1488 wide, chosen at boot via `railMetricsFor`.
  - Rail CSS lengths are written as `calc(Npx * var(--hud-k))`, with a guard test.
  - The capture harness and layout audit are now pointer-aware.
  - Map sizes match the spec table exactly. The phone/tablet rail fingerprint is identical to the base.
- **Roadmap 2.4, device matrix.** PR stacked on #105.
  - `npm run matrix` runs a real-input flow on desktop, iPhone 14, Pixel 7 and iPad, asserting state at every step.
  - Each check was shown to fail on a deliberate break: gold, the confirm gate, the step-12 map freeze, and pause.
  - Result: 2276 tests.

**Decisions made:**
- User: #44 first, then #43(b), then 2.4. User: 104-px rails.
- Accepted: about 10 CSS px rail text below roughly 1100-px desktop windows.
- Option C, a `--hud-k` multiplier, over transform or `zoom`: it keeps layout px equal to game px, and `zoom` behaves differently across browsers.
- The matrix is a `--flow` mode of `capture.mjs`, with its pure logic in `src/systems/deviceFlow.js`.
- Step 13 waits for finished animations, because the wave banner holds its final frame with `fill-mode: forwards`.
- Steps 12 and 13 sample the map rect only, because the rails' DOM sits inside the canvas box.

**Where we left off:** Four PRs are open. Merge order: #104 → #105 → 2.4; #103 is the user's production call. Desktop Safari/Firefox are unverified and belong to the G3 desktop half. Follow-ups are #46 and #47.
