import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import TitleScene from './scenes/TitleScene.js';
import MapSelectScene from './scenes/MapSelectScene.js';
import GameScene from './scenes/GameScene.js';
import UIScene from './scenes/UIScene.js';
import MapEditorScene from './scenes/MapEditorScene.js';
import { resumeAudio } from './systems/shellLifecycle.js';
import { CANVAS_WIDTH, WORLD_HEIGHT } from './data/layout.js';
import { applyHudLayerSize, fitHudLayer } from './ui/hudLayer.js';
import { applyTheme, loadThemeFonts } from './ui/theme.js';
import { watchRailLabels } from './ui/fitLabels.js';
import { coalesceFrame } from './utils/coalesceFrame.js';

// The canvas is the map world plus a HUD rail each side; GameScene's camera
// viewport keeps the map itself 1:1 in world coordinates.
const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: CANVAS_WIDTH,
  height: WORLD_HEIGHT,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  backgroundColor: '#1a1a2e',
  scene: [BootScene, TitleScene, MapSelectScene, GameScene, UIScene, MapEditorScene],
};

applyHudLayerSize(document);
applyTheme(document);
// Deliberately not awaited: boot must not wait on fonts; the fallback stack covers the gap.
const themeFontsSettled = loadThemeFonts(document);
const game = new Phaser.Game(config);

// The HUD rails are DOM pinned over the canvas, so they refit on every Phaser
// resize (it fires after Phaser restyles the canvas). The first fit needs no
// hook of its own: the ScaleManager refreshes once on READY, which emits it.
// A window resize or fullscreen change asks Phaser to re-measure and refresh on
// the next frame rather than trusting its own resize poll: after a portrait ->
// landscape turn the poll can record the new parent size yet keep the old
// canvas size, which the old top/bottom HUD bars only masked by resizing #game
// on level entry. refresh() sizes against the cached parent, so the bounds are
// re-read first; that keeps this correct whichever of it and the poll runs first.
const refitHudLayer = () => fitHudLayer(document, game);
const refreshScale = coalesceFrame(() => {
  if (!game.isBooted) return;
  game.scale.getParentBounds();
  game.scale.refresh();
});
game.scale.on(Phaser.Scale.Events.RESIZE, refitHudLayer);
window.addEventListener('resize', refreshScale);
document.addEventListener('fullscreenchange', refreshScale);
// Fonts settling after the first fit would leave labels sized to the fallback.
const refitRailLabels = watchRailLabels(document);
themeFontsSettled.then(() => refitRailLabels());

// Page-lifetime hooks (no scene owns them). `sound.context` exists only for the
// WebAudio manager, hence the optional chaining.
const unlockAudio = () => resumeAudio(game.sound?.context);
document.addEventListener('pointerup', unlockAudio, { capture: true, passive: true });
document.addEventListener('touchend', unlockAudio, { capture: true, passive: true });
