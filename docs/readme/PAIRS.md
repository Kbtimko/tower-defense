# README before/after gallery

"Before" images are the 2026-10-21 baseline (`docs/baseline/2026-10-21/`,
described in `docs/visual-baseline.md`). "After" images were reshot on
2026-11-23 from `main` + this branch with the same harness commands:

```
npm run capture -- --screens --maps 0 --devices desktop,iphone   # -> .art-cache/captures/<device>/screens/
npm run capture -- --maps 0,3,5,9 --devices desktop              # -> .art-cache/captures/desktop/
```

Every image is resized to 1280 px wide (aspect kept) and saved as JPEG q80.
The game changed a lot between the two dates (HUD rails, radial tower ring,
story dialogs, results screen), so "same screen" means the same moment, device
and map, not the same layout.

| Screen | Device | Before source | After harness output | Files | Mapping note |
|---|---|---|---|---|---|
| Map select | desktop | `desktop-02-map-select.jpg` | `desktop/screens/02-map-select.png` | `before-map-select.jpg`, `after-map-select.jpg` | First run, map 1 open, nothing unlocked. |
| Map select | iphone | `iphone-02-map-select.jpg` | `iphone/screens/02-map-select.png` | `before-map-select-iphone.jpg`, `after-map-select-iphone.jpg` | Before: PLAY button clipped out of reach. After: LAUNCH visible. The after capture is 2250 px wide (3x), so it is downscaled; the before was 1280. |
| In-game, map 0 | desktop | `desktop-03-in-game.jpg` | `desktop/screens/03-in-game.png` | `before-ingame.jpg`, `after-ingame.jpg` | Wave 5/10, same save and layout of towers. Top/bottom bars became side rails, and the bottom tower bar became a right-hand rail. |
| In-game, map 0 | iphone | `iphone-03-in-game.jpg` | `iphone/screens/03-in-game.png` | `before-ingame-iphone.jpg`, `after-ingame-iphone.jpg` | The phone fix: the board now fills the screen instead of about a third of it. Downscaled from 2250 px. |
| Tower panel vs tower ring | desktop | `desktop-04-tower-panel.jpg` | `desktop/screens/04-tower-ring.png` | `before-tower.jpg`, `after-tower.jpg` | Not the same widget. The panel was replaced by a radial ring of actions around the selected tower, plus a stats tooltip. Same moment: the same T3 archer selected on map 0, wave 5. The after shows locked tier-4 branches ("Map 5"). |
| Results (victory) | desktop | `desktop-07-victory.jpg` | `desktop/screens/07-victory.png` | `before-results.jpg`, `after-results.jpg` | Same forced-victory moment from the harness (HUD still reads wave 5/10, 0 kills, which is why the stats show 0). Small modal became a full results screen. |
| In-game, map 9 | desktop | `desktop-in-game-map9-w9.jpg` | `desktop/map9-w9.png` | `before-ingame-map9.jpg`, `after-ingame-map9.jpg` | Wave 9/18, 10 lives in both. Gold differs (300 before, 690 after) (cause not investigated; the harness seeds each state). |

## Hero

`hero.jpg` is `desktop/map5-w7.png` from the second harness run (map 5, wave
7/14, enemies, towers, projectiles in view), cropped to the board (y 50 to
670, removing the empty letterbox bars) and saved as JPEG q82 at 1280x620.
It is a harness frame, not a `release/media/` full-board shot (see the task
report for why).
