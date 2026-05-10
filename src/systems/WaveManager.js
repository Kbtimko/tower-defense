import { ENEMY_DEFS } from '../data/enemies.js';

export class WaveManager {
  constructor(waves, eventEmitter) {
    this.waves = waves;
    this.currentWave = 0;
    this.active = false;
    this._emitter = eventEmitter;
    this._spawnQ = [];
    this._elapsed = 0;
  }

  get hasQueuedEnemies() {
    return this._spawnQ.length > 0;
  }

  get done() {
    return this.currentWave >= this.waves.length;
  }

  startWave() {
    if (this.active || this.done) return;
    this.active = true;
    this._elapsed = 0;
    this._spawnQ = [];
    const scaleFactor = 1 + this.currentWave * 0.13;
    let delay = 0;
    for (const group of this.waves[this.currentWave]) {
      const def = ENEMY_DEFS[group.type];
      for (let i = 0; i < group.count; i++) {
        this._spawnQ.push({ delayMs: delay, def: { ...def }, scaleFactor });
        delay += group.interval;
      }
    }
    this._spawnQ.sort((a, b) => a.delayMs - b.delayMs);
    this.currentWave++;
    this._emitter.emit('wave:start', { waveNum: this.currentWave });
  }

  update(deltaMs) {
    if (!this.active || !this.hasQueuedEnemies) return;
    this._elapsed += deltaMs;
    while (this._spawnQ.length > 0 && this._elapsed >= this._spawnQ[0].delayMs) {
      const { def, scaleFactor } = this._spawnQ.shift();
      this._emitter.emit('enemy:spawn', { def, scaleFactor });
    }
  }
}
