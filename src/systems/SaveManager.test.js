import { SaveManager } from './SaveManager.js';

const STORAGE_KEY = 'lastlight_save';
const LEGACY_KEY  = 'lastlight_progress';

beforeEach(() => {
  localStorage.clear();
});

describe('SaveManager — map stars', () => {
  it('fresh load: all stars 0, only map 0 unlocked', () => {
    const sm = new SaveManager();
    for (let i = 0; i < 10; i++) expect(sm.getStars(i)).toBe(0);
    expect(sm.isUnlocked(0)).toBe(true);
    expect(sm.isUnlocked(1)).toBe(false);
  });

  it('setStars upgrades but never downgrades', () => {
    const sm = new SaveManager();
    sm.setStars(0, 1);
    expect(sm.getStars(0)).toBe(1);
    sm.setStars(0, 3);
    expect(sm.getStars(0)).toBe(3);
    sm.setStars(0, 1);
    expect(sm.getStars(0)).toBe(3);
  });

  it('beating map N unlocks map N+1', () => {
    const sm = new SaveManager();
    expect(sm.isUnlocked(1)).toBe(false);
    sm.setStars(0, 2);
    expect(sm.isUnlocked(1)).toBe(true);
  });

  it('getTotalStars sums all maps', () => {
    const sm = new SaveManager();
    sm.setStars(0, 3);
    sm.setStars(1, 2);
    expect(sm.getTotalStars()).toBe(5);
  });
});

describe('SaveManager — migration', () => {
  it('migrates a legacy bare array into a v1 envelope and deletes the old key', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([3,2,0,0,0,0,0,0,0,0]));
    const sm = new SaveManager();
    expect(sm.getStars(0)).toBe(3);
    expect(sm.getStars(1)).toBe(2);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    const env = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(env.version).toBe(1);
    expect(env.maps).toEqual([3,2,0,0,0,0,0,0,0,0]);
    expect(env.upgrades).toEqual([]);
    expect(env.stats).toEqual({ kills: 0, gamesPlayed: 0, victories: 0, defeats: 0, bestWave: 0 });
  });

  it('corrupt JSON in either key falls back to a fresh envelope', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const sm = new SaveManager();
    expect(sm.getTotalStars()).toBe(0);
    expect(sm.getPurchasedUpgrades()).toEqual([]);
  });
});

describe('SaveManager — upgrades & stats', () => {
  it('upgrades round-trip and persist', () => {
    const sm = new SaveManager();
    sm.setPurchasedUpgrades(['log_supply_cache']);
    expect(sm.getPurchasedUpgrades()).toEqual(['log_supply_cache']);
    const reloaded = new SaveManager();
    expect(reloaded.getPurchasedUpgrades()).toEqual(['log_supply_cache']);
  });

  it('stats round-trip and persist', () => {
    const sm = new SaveManager();
    sm.setStats({ kills: 12, victories: 1 });
    expect(sm.getStats()).toEqual({ kills: 12, gamesPlayed: 0, victories: 1, defeats: 0, bestWave: 0 });
    const reloaded = new SaveManager();
    expect(reloaded.getStats().kills).toBe(12);
  });

  it('getPurchasedUpgrades returns a copy, not the internal array', () => {
    const sm = new SaveManager();
    sm.setPurchasedUpgrades(['log_supply_cache']);
    sm.getPurchasedUpgrades().push('hacked');
    expect(sm.getPurchasedUpgrades()).toEqual(['log_supply_cache']);
  });
});
