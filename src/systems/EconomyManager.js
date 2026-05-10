export class EconomyManager {
  constructor(startGold, startLives, eventEmitter) {
    this.gold = startGold;
    this.lives = startLives;
    this._emitter = eventEmitter;
  }

  spend(amount) {
    if (this.gold < amount) return false;
    this.gold -= amount;
    this._emitter.emit('economy:update', { gold: this.gold, lives: this.lives });
    return true;
  }

  earn(amount) {
    this.gold += amount;
    this._emitter.emit('economy:update', { gold: this.gold, lives: this.lives });
  }

  loseLife() {
    this.lives = Math.max(0, this.lives - 1);
    this._emitter.emit('economy:update', { gold: this.gold, lives: this.lives });
    if (this.lives <= 0) this._emitter.emit('game:defeat');
  }
}
