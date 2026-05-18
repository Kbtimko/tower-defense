import { ProgressManager } from './ProgressManager.js';

const STORAGE_KEY = 'lastlight_progress';

beforeEach(() => {
  localStorage.clear();
});

describe('ProgressManager', () => {
  it('fresh load: all stars are 0, only map 0 unlocked', () => {
    const pm = new ProgressManager();
    for (let i = 0; i < 10; i++) expect(pm.getStars(i)).toBe(0);
    expect(pm.isUnlocked(0)).toBe(true);
    expect(pm.isUnlocked(1)).toBe(false);
  });

  it('setStars upgrades but never downgrades', () => {
    const pm = new ProgressManager();
    pm.setStars(0, 1);
    expect(pm.getStars(0)).toBe(1);
    pm.setStars(0, 3);
    expect(pm.getStars(0)).toBe(3);
    pm.setStars(0, 1);
    expect(pm.getStars(0)).toBe(3);
  });

  it('beating map N unlocks map N+1 via isUnlocked', () => {
    const pm = new ProgressManager();
    expect(pm.isUnlocked(1)).toBe(false);
    pm.setStars(0, 2);
    expect(pm.isUnlocked(1)).toBe(true);
  });

  it('map 0 is always unlocked regardless of storage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([0,0,0,0,0,0,0,0,0,0]));
    const pm = new ProgressManager();
    expect(pm.isUnlocked(0)).toBe(true);
  });

  it('unlockNext(9) is a no-op — does not throw', () => {
    const pm = new ProgressManager();
    expect(() => pm.unlockNext(9)).not.toThrow();
  });
});
