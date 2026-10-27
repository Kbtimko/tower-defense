export class EconomyManager {
  constructor(startGold, startLives, eventEmitter) {
    this.gold = startGold;
    this.lives = startLives;
    this._emitter = eventEmitter;
    // Income only (not start gold, refunds or spends): the results screen's GOLD chip.
    this.earned = 0;
  }

  spend(amount) {
    if (this.gold < amount) return false;
    this.gold -= amount;
    this._emitter.emit('economy:update', { gold: this.gold, lives: this.lives });
    return true;
  }

  earn(amount) {
    this.earned += amount;
    this.gold += amount;
    this._emitter.emit('economy:update', { gold: this.gold, lives: this.lives });
  }

  // Sell refunds return spent gold; counting them as income would inflate GOLD.
  refund(amount) {
    this.gold += amount;
    this._emitter.emit('economy:update', { gold: this.gold, lives: this.lives });
  }

  loseLife() {
    this.lives = Math.max(0, this.lives - 1);
    this._emitter.emit('economy:update', { gold: this.gold, lives: this.lives });
    if (this.lives <= 0) this._emitter.emit('game:defeat');
  }
}
