# 2026-11-08 → 2026-11-15 — #49 upgrade visuals (code half)

Branch `visual/49-upgrade-visuals` → PR into `visual/integration`, **stacked on #118** (#48 rally flag, still open): merge #118 first.

## What the user asked
- Backlog #49: towers and soldiers should look different as they upgrade; ship the code half before the art (deferred-asset pattern).
- "i want the t3/t4 towers to look bigger and more powerful to reflect that they inflict more damage"
- "yes soldiers should be stronger as barracks upgrade" (look stronger; stats already rise)

## Decisions (user, from animated mockups)
- Towers: option C "Charged" — scale 100/112/125/140% for every tower (archer included, its 8 contact-shadow overlaps accepted); T2 core, T3 + embers, T4 + ring (A solid/breathing, B dashed/spinning); pips 1/2/3 then an A/B badge.
- Narrow ring (`rx` 25), its 7 tight-pair crossings accepted.
- Soldiers: option B "Gold armour" — 100/110/120/130%; warm toward gold; 4B gold squad of four; 4A ice-blue + shield.
- Reduced motion: same marks, still.

## Shipped
- Pure: `src/data/tierLooks.js`, `spriteKeys` variant resolver, `colorMatrix.js`, `tierLookMath.js` (incl. R25 pad-fit guards pinning the accepted sets).
- Render: `EntitySprite` variants + foot-pivot tier scale; `TowerTierLook`; `Tower._applyTier/footY/muzzlePoint/lookSnapshot`; `Soldier` tier look + 4A shield; boot-time soldier recolour (`soldierTierTextures.js`); GameScene ring layer, look updates on `_fxTime`, muzzle point, `__capture.looks`; capture runs `tier-looks` / `tier-looks-still`.
- 13 plan tasks, each implementer + opus task review; fix rounds on Tasks 3, 4, 6, 12; final opus review → one fix wave (paused-upgrade embers) → clean re-review; one capture-driven tuning (`TIER_EMBERS.sizePx` 4 → 10).

## Verification
- `npx vitest run` @a700033: 221 files, **3753 passed**, exit 0 (baseline 3607).
- `npm run build` exit 0. `npm run balance` SHA `b803a0c6345cab24f4611edf341b6ebeedba0e0b0f7105a2e04f60210ffb0467` = baseline.
- `npm run matrix`: desktop 17/17, iphone 18/18, pixel 18/18, ipad 18/18.
- `npm run capture -- --screens`: desktop + pixel clean @bb4c1f6; desktop1440 + iphone + ipad clean @a700033 (after the size-only tuning). Load-induced timeouts in pre-existing runs (ipad busiest-frame, results-audit) cleared on quiet re-runs.
- Live, prod build, real mouse/touch, desktop 1440×900 + iPhone 14: 7/7 checks pass, 0 console errors.

## Rulings I made (cost if wrong in brackets)
1. Built stacked on the #118 branch rather than waiting for its merge [one rebase].
2. Ruling A: pure modules never import `src/ui/theme.js` (Node capture imports them) [a Node import crash, caught].
3. Plan bug: the dash formula lapped once per 36 s; fixed to one lap per `spin.periodS` (3 s) [ring speed retune].
4. Plan bug: "clamp once at the end" couldn't fail E37; a two-stage clamp test added [none].
5. `expectedTowerLook` pips derive from the variant [none].
6. Per-state sprite defs follow the resolved key; `setVariant` re-applies anchor/shadow [none until variant art lands].
7. R10 "no allocation" = no game objects per frame; small pose objects accepted [minor GC].
8. No-art T4 badge crosses its ring's front arc — accepted for the fallback only [visible on a broken-art board].
9. `TIER_PIPS.badge.cornerPx` added to data [none].
10. Shield drawn as 4 vertex-coloured triangles (Phaser fills polygons by vertex order); canvas renderer may draw it dark (R-3) [flat/dark shield on canvas].
11. Shield default facing follows `baseFacing` until the first move [none].
12. Ring kind derived via `tierVariant`; B `ringPhase` reported unwrapped [none].
13. Capture: the stronger R20(c) tier-key check; R26 kept as specified; `window.__game` exposed in capture builds instead of patching Phaser [none; production strips it].
14. Final fix wave also took three cheap minors; spec wording slips (rx 33 → 15 crossings, not 17; C4 map-2 row) corrected in the PR body [none].
15. The red-alone commit f3be509 left unsquashed (interactive rebase unavailable) [one non-bisectable commit].
16. `TIER_EMBERS.sizePx` 4 → 10 after viewing captures [embers too bold → retune].
17. Many test-stub extensions across Barracks/heroSoldierHpBar/GameScene tests (stub-only, no optional chaining in production).

## Follow-ups logged (backlog 66–69)
- 66 the old r=18 tier stroke ring is now redundant over the core; 67 A/B badge hidden on tight pairs and under a road-hugging barracks squad; 68 stale tower depth after a barracks Move (pre-existing); 69 #49 polish (iPhone pip size, canvas shield, latent soldier guards, no in-level Ambient motion control).

## Next
- User: merge #118, then this PR; G3 on a real phone (rally flag + tier looks); `visual/integration` → `main` after G3; #56(a).
