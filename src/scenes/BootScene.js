import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    // Phase 1: no assets to preload — placeholder sprites drawn via Graphics.
  }

  create() {
    this.scene.start('MenuScene');
  }
}
