import Phaser from 'phaser';
import { MAPS } from '../data/maps.js';

export default class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const { width, height } = this.scale;
    let selectedMapId = 0;

    // Background
    this.cameras.main.setBackgroundColor('#1a1a2e');

    // Title
    this.add.text(width / 2, height / 2 - 120, 'LAST LIGHT', {
      fontSize: '52px', color: '#ffd700', fontFamily: 'Georgia', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 65, 'A Tower Defense Game', {
      fontSize: '18px', color: '#aaa', fontFamily: 'Georgia',
    }).setOrigin(0.5);

    // Map selector buttons
    const mapBtns = MAPS.map((map, i) => {
      const btn = this.add.text(width / 2 - 110 + i * 130, height / 2, map.name, {
        fontSize: '13px', color: '#ccc', fontFamily: 'Georgia',
        backgroundColor: '#2a2a4a', padding: { x: 10, y: 6 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      btn.on('pointerdown', () => {
        selectedMapId = i;
        mapBtns.forEach((b, j) => b.setStyle({ backgroundColor: j === i ? '#8b6914' : '#2a2a4a' }));
      });

      return btn;
    });
    mapBtns[0].setStyle({ backgroundColor: '#8b6914' });

    // Play button
    const play = this.add.text(width / 2, height / 2 + 70, '▶  PLAY', {
      fontSize: '26px', color: '#fff', fontFamily: 'Georgia', fontStyle: 'bold',
      backgroundColor: '#8b1a1a', padding: { x: 28, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    play.on('pointerover', () => play.setStyle({ backgroundColor: '#aa2222' }));
    play.on('pointerout',  () => play.setStyle({ backgroundColor: '#8b1a1a' }));
    play.on('pointerdown', () => this.scene.start('GameScene', { mapId: selectedMapId }));
  }
}
