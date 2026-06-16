import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import MapSelectScene from './scenes/MapSelectScene.js';
import GameScene from './scenes/GameScene.js';
import UIScene from './scenes/UIScene.js';
import MapEditorScene from './scenes/MapEditorScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NONE,
  },
  backgroundColor: '#1a1a2e',
  scene: [BootScene, MenuScene, MapSelectScene, GameScene, UIScene, MapEditorScene],
};

new Phaser.Game(config);
