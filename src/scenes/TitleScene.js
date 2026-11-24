import Phaser from 'phaser';
import { TitleScreen } from '../ui/TitleScreen.js';
import { isPointerFine } from '../data/layout.js';

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    // `once`: the scene emitter outlives shutdown, so `on` would stack a copy per entry.
    this.events.once('shutdown', this.shutdown, this);
    this._screen = new TitleScreen(document.getElementById('title-screen'));
    this._screen.show({
      motion: this.game.registry.get('ambientMotion') !== false,
      pointerFine: isPointerFine(window),
      // Always an object: Phaser keeps the previous scene data when start() gets none.
      onStart: () => this.scene.start('MapSelectScene', {}),
    });
  }

  shutdown() {
    this._screen?.destroy();
    this._screen = null;
  }
}
