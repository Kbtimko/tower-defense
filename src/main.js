import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import MapSelectScene from './scenes/MapSelectScene.js';
import GameScene from './scenes/GameScene.js';
import UIScene from './scenes/UIScene.js';
import MapEditorScene from './scenes/MapEditorScene.js';
import { resumeAudio } from './systems/shellLifecycle.js';
import { CANVAS_WIDTH, WORLD_HEIGHT } from './data/layout.js';
import { applyHudLayerSize, fitHudLayer } from './ui/hudLayer.js';

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
  scene: [BootScene, MenuScene, MapSelectScene, GameScene, UIScene, MapEditorScene],
};

applyHudLayerSize(document);
const game = new Phaser.Game(config);

// The HUD rails are DOM pinned over the canvas, so they refit on every Phaser
// resize (it fires after Phaser restyles the canvas) and once the first canvas
// size is known. A window resize or fullscreen change asks Phaser to refresh on
// the next frame rather than trusting its own resize poll: after a portrait ->
// landscape turn its poll can record the new parent size yet keep the old
// canvas size, which the old top/bottom HUD bars only masked by resizing #game
// on level entry.
const refitHudLayer = () => fitHudLayer(document, game);
const refreshScale = () => requestAnimationFrame(() => { if (game.isBooted) game.scale.refresh(); });
game.scale.on(Phaser.Scale.Events.RESIZE, refitHudLayer);
window.addEventListener('resize', refreshScale);
document.addEventListener('fullscreenchange', refreshScale);
game.events.once(Phaser.Core.Events.READY, refitHudLayer);

// Page-lifetime hooks (no scene owns them). `sound.context` exists only for the
// WebAudio manager, hence the optional chaining.
const unlockAudio = () => resumeAudio(game.sound?.context);
document.addEventListener('pointerup', unlockAudio, { capture: true, passive: true });
document.addEventListener('touchend', unlockAudio, { capture: true, passive: true });
