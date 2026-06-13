vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
      },
    },
  },
}));

// Transitive Phaser imports in entity/system modules are safe because Phaser
// itself is mocked above — all `import Phaser from 'phaser'` calls receive
// the stub. We never instantiate GameScene; we only call prototype methods.
import GameScene from './GameScene.js';

describe('GameScene._fadeOutDeadEnemy', () => {
  it('starts a 300ms alpha-to-0 tween targeting the enemy', () => {
    const enemy = { destroy: vi.fn() };
    const tweenAdd = vi.fn();
    const ctx = { tweens: { add: tweenAdd } };

    GameScene.prototype._fadeOutDeadEnemy.call(ctx, enemy);

    expect(tweenAdd).toHaveBeenCalledOnce();
    const config = tweenAdd.mock.calls[0][0];
    expect(config.targets).toBe(enemy);
    expect(config.alpha).toBe(0);
    expect(config.duration).toBe(300);
    expect(typeof config.onComplete).toBe('function');
  });

  it('destroys the enemy when the tween onComplete fires', () => {
    const enemy = { destroy: vi.fn() };
    const tweenAdd = vi.fn();
    const ctx = { tweens: { add: tweenAdd } };

    GameScene.prototype._fadeOutDeadEnemy.call(ctx, enemy);
    const config = tweenAdd.mock.calls[0][0];
    config.onComplete();

    expect(enemy.destroy).toHaveBeenCalledOnce();
  });
});

describe('GameScene._destroyDeadProjectile', () => {
  it('destroys the trail and the projectile container', () => {
    const projectile = { destroyTrail: vi.fn(), destroy: vi.fn() };

    GameScene.prototype._destroyDeadProjectile(projectile);

    expect(projectile.destroyTrail).toHaveBeenCalledOnce();
    expect(projectile.destroy).toHaveBeenCalledOnce();
  });

  it('still destroys the projectile if destroyTrail is absent', () => {
    const projectile = { destroy: vi.fn() };

    GameScene.prototype._destroyDeadProjectile(projectile);

    expect(projectile.destroy).toHaveBeenCalledOnce();
  });
});
