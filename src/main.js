import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import MapSelectScene from './scenes/MapSelectScene.js';
import GameScene from './scenes/GameScene.js';
import UIScene from './scenes/UIScene.js';
import MapEditorScene from './scenes/MapEditorScene.js';
import { resumeAudio } from './systems/shellLifecycle.js';

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  backgroundColor: '#1a1a2e',
  scene: [BootScene, MenuScene, MapSelectScene, GameScene, UIScene, MapEditorScene],
};

const game = new Phaser.Game(config);

// Page-lifetime hooks (no scene owns them). `sound.context` exists only for the
// WebAudio manager, hence the optional chaining.
document.addEventListener('pointerdown', () => resumeAudio(game.sound?.context), true);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) resumeAudio(game.sound?.context);
});
