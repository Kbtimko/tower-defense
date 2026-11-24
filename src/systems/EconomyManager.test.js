import { EconomyManager } from './EconomyManager.js';

describe('EconomyManager', () => {
  let emitter, mgr;

  beforeEach(() => {
    emitter = { emit: vi.fn() };
    mgr = new EconomyManager(200, 25, emitter);
  });

  it('initializes with correct gold and lives', () => {
    expect(mgr.gold).toBe(200);
    expect(mgr.lives).toBe(25);
  });

  it('spend deducts gold and returns true when affordable', () => {
    expect(mgr.spend(60)).toBe(true);
    expect(mgr.gold).toBe(140);
  });

  it('spend returns false without deducting when unaffordable', () => {
    expect(mgr.spend(300)).toBe(false);
    expect(mgr.gold).toBe(200);
  });

  it('earn adds gold', () => {
    mgr.earn(50);
    expect(mgr.gold).toBe(250);
  });

  it('spend and earn emit economy:update', () => {
    mgr.spend(10);
    expect(emitter.emit).toHaveBeenCalledWith('economy:update', expect.any(Object));
    mgr.earn(10);
    expect(emitter.emit).toHaveBeenCalledTimes(2);
  });

  it('loseLife decrements lives', () => {
    mgr.loseLife();
    expect(mgr.lives).toBe(24);
  });

  it('lives cannot go below zero', () => {
    for (let i = 0; i < 30; i++) mgr.loseLife();
    expect(mgr.lives).toBe(0);
  });

  it('loseLife emits game:defeat when lives reach zero', () => {
    for (let i = 0; i < 25; i++) mgr.loseLife();
    expect(emitter.emit).toHaveBeenCalledWith('game:defeat');
  });

  describe('earned counter', () => {
    it('earn counts toward earned', () => {
      mgr.earn(50);
      expect(mgr.earned).toBe(50);
    });
    it('start gold is not counted', () => {
      expect(mgr.earned).toBe(0);
    });
    it('spend leaves earned alone', () => {
      mgr.earn(50);
      mgr.spend(30);
      expect(mgr.earned).toBe(50);
    });
    it('refund adds gold and emits but does not count', () => {
      emitter.emit.mockClear();
      mgr.refund(30);
      expect(mgr.gold).toBe(230);
      expect(emitter.emit).toHaveBeenCalledWith('economy:update', { gold: 230, lives: 25 });
      expect(mgr.earned).toBe(0);
    });
  });
});
