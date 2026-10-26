import { vi } from 'vitest';
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
  it('migrates a legacy bare array into the current envelope and deletes the old key', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([3,2,0,0,0,0,0,0,0,0]));
    const sm = new SaveManager();
    expect(sm.getStars(0)).toBe(3);
    expect(sm.getStars(1)).toBe(2);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    const env = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(env.version).toBe(5);
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

describe('SaveManager — v2 settings', () => {
  it('fresh load: settings have audio defaults', () => {
    const sm = new SaveManager();
    expect(sm.getSettings()).toEqual({
      masterVol: 0.8,
      sfxVol:    1.0,
      musicVol:  0.6,
      muted:     false,
      ambientMotion: null,
      mapGrade: null,
    });
  });

  it('setSettings merges partial and persists', () => {
    const sm = new SaveManager();
    sm.setSettings({ masterVol: 0.5, muted: true });
    expect(sm.getSettings()).toEqual({
      masterVol: 0.5,
      sfxVol:    1.0,
      musicVol:  0.6,
      muted:     true,
      ambientMotion: null,
      mapGrade: null,
    });
    const env = JSON.parse(localStorage.getItem('lastlight_save'));
    expect(env.version).toBe(5);
    expect(env.settings.masterVol).toBe(0.5);
    expect(env.settings.muted).toBe(true);
  });

  it('migrates a v1 envelope by adding settings and bumping version', () => {
    localStorage.setItem('lastlight_save', JSON.stringify({
      version: 1,
      maps: [3, 2, 0, 0, 0, 0, 0, 0, 0, 0],
      upgrades: ['command-1'],
      stats: { kills: 100, gamesPlayed: 1, victories: 1, defeats: 0, bestWave: 5 },
    }));
    const sm = new SaveManager();
    expect(sm.getStars(0)).toBe(3);
    expect(sm.getPurchasedUpgrades()).toEqual(['command-1']);
    expect(sm.getSettings().musicVol).toBe(0.6);
    const env = JSON.parse(localStorage.getItem('lastlight_save'));
    expect(env.version).toBe(5);
    expect(env.settings).toBeDefined();
  });

  it('getSettings returns defaults when settings block is missing or malformed', () => {
    localStorage.setItem('lastlight_save', JSON.stringify({
      version: 2,
      maps: new Array(10).fill(0),
      upgrades: [],
      stats: { kills: 0, gamesPlayed: 0, victories: 0, defeats: 0, bestWave: 0 },
      settings: 'corrupt',
    }));
    const sm = new SaveManager();
    expect(sm.getSettings()).toEqual({
      masterVol: 0.8,
      sfxVol:    1.0,
      musicVol:  0.6,
      muted:     false,
      ambientMotion: null,
      mapGrade: null,
    });
  });
});

describe('SaveManager — future-version save', () => {
  it('logs a warning and loads a v3+ envelope as-is without resetting', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('lastlight_save', JSON.stringify({
      version: 999,
      maps: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      upgrades: ['command-1'],
      stats: { kills: 5, gamesPlayed: 1, victories: 1, defeats: 0, bestWave: 2 },
      settings: { masterVol: 0.5, sfxVol: 1.0, musicVol: 0.6, muted: false },
      futureField: 'kept',
    }));
    const sm = new SaveManager();
    expect(sm.getStars(0)).toBe(3);
    expect(sm.getPurchasedUpgrades()).toEqual(['command-1']);
    expect(warn).toHaveBeenCalled();
    const env = JSON.parse(localStorage.getItem('lastlight_save'));
    expect(env.version).toBe(999); // not overwritten
    warn.mockRestore();
  });
});

describe('SaveManager v3 — selectedHeroId + cmd_* rename', () => {
  it('fresh save defaults selectedHeroId to "rael"', () => {
    localStorage.clear();
    const mgr = new SaveManager();
    expect(mgr.getSelectedHero()).toBe('rael');
  });

  it('v2 → v3 migrates cmd_* upgrade ids to rael_*', () => {
    localStorage.clear();
    localStorage.setItem('lastlight_save', JSON.stringify({
      version: 2, maps: new Array(10).fill(0),
      upgrades: ['cmd_battle_hardened', 'cmd_veteran', 'log_supply_cache'],
      stats: { kills:0, gamesPlayed:0, victories:0, defeats:0, bestWave:0 },
      settings: { masterVol:0.8, sfxVol:1.0, musicVol:0.6, muted:false },
    }));
    const mgr = new SaveManager();
    const ups = mgr.getPurchasedUpgrades();
    expect(ups).toContain('rael_hp');
    expect(ups).toContain('rael_veteran');
    expect(ups).toContain('log_supply_cache');
    expect(ups).not.toContain('cmd_battle_hardened');
  });

  it('v2 → v3 sets selectedHeroId to "rael" when missing', () => {
    localStorage.clear();
    localStorage.setItem('lastlight_save', JSON.stringify({
      version: 2, maps: new Array(10).fill(0), upgrades: [],
      stats: { kills:0, gamesPlayed:0, victories:0, defeats:0, bestWave:0 },
      settings: { masterVol:0.8, sfxVol:1.0, musicVol:0.6, muted:false },
    }));
    const mgr = new SaveManager();
    expect(mgr.getSelectedHero()).toBe('rael');
  });

  it('v3 passes through', () => {
    localStorage.clear();
    localStorage.setItem('lastlight_save', JSON.stringify({
      version: 3, maps: new Array(10).fill(0), upgrades: [],
      stats: { kills:0, gamesPlayed:0, victories:0, defeats:0, bestWave:0 },
      settings: { masterVol:0.8, sfxVol:1.0, musicVol:0.6, muted:false },
      selectedHeroId: 'pyro',
    }));
    const mgr = new SaveManager();
    expect(mgr.getSelectedHero()).toBe('pyro');
  });

  it('setSelectedHero rejects unknown ids', () => {
    localStorage.clear();
    const mgr = new SaveManager();
    mgr.setSelectedHero('not_a_hero');
    expect(mgr.getSelectedHero()).toBe('rael');
  });

  it('getSelectedHero falls back to rael when stored id is unknown', () => {
    localStorage.clear();
    localStorage.setItem('lastlight_save', JSON.stringify({
      version: 3, maps: new Array(10).fill(0), upgrades: [],
      stats: { kills:0, gamesPlayed:0, victories:0, defeats:0, bestWave:0 },
      settings: { masterVol:0.8, sfxVol:1.0, musicVol:0.6, muted:false },
      selectedHeroId: 'corrupt',
    }));
    const mgr = new SaveManager();
    expect(mgr.getSelectedHero()).toBe('rael');
  });

  it('isHeroUnlocked: rael always true', () => {
    localStorage.clear();
    const mgr = new SaveManager();
    expect(mgr.isHeroUnlocked('rael')).toBe(true);
  });

  it('isHeroUnlocked: engineer true after map index 2 has ≥1 star', () => {
    localStorage.clear();
    const mgr = new SaveManager();
    expect(mgr.isHeroUnlocked('engineer')).toBe(false);
    mgr.setStars(2, 1);
    expect(mgr.isHeroUnlocked('engineer')).toBe(true);
  });
});

describe('seenStoryBeats (v4)', () => {
  beforeEach(() => localStorage.clear());

  it('fresh save starts with empty seenStoryBeats and version 5', () => {
    const sm = new SaveManager();
    expect(sm.hasSeenBeat('campaign_intro')).toBe(false);
    expect(sm.getSeenBeats()).toEqual({});
    const raw = JSON.parse(localStorage.getItem('lastlight_save'));
    expect(raw.version).toBe(5);
  });

  it('markBeatSeen persists and round-trips through a reload', () => {
    const sm = new SaveManager();
    sm.markBeatSeen('brief_outpost_sigma');
    expect(sm.hasSeenBeat('brief_outpost_sigma')).toBe(true);
    const sm2 = new SaveManager();
    expect(sm2.hasSeenBeat('brief_outpost_sigma')).toBe(true);
    expect(sm2.getSeenBeats()).toEqual({ brief_outpost_sigma: true });
  });

  it('migrates a v3 save to v4 preserving all fields and adding seenStoryBeats', () => {
    const v3 = {
      version: 3,
      maps: [3, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      upgrades: ['rael_hp'],
      stats: { kills: 42, gamesPlayed: 5, victories: 3, defeats: 2, bestWave: 9 },
      settings: { masterVol: 0.5, sfxVol: 0.5, musicVol: 0.5, muted: true, ambientMotion: false },
      selectedHeroId: 'engineer',
    };
    localStorage.setItem('lastlight_save', JSON.stringify(v3));
    const sm = new SaveManager();
    expect(sm.getStars(0)).toBe(3);
    expect(sm.getStars(1)).toBe(1);
    expect(sm.getPurchasedUpgrades()).toEqual(['rael_hp']);
    expect(sm.getStats().kills).toBe(42);
    expect(sm.getSettings().muted).toBe(true);
    expect(sm.getSelectedHero()).toBe('engineer');
    expect(sm.getSeenBeats()).toEqual({});
    const raw = JSON.parse(localStorage.getItem('lastlight_save'));
    expect(raw.version).toBe(5);
  });

  it('migrates a v1 save all the way to v4', () => {
    const v1 = {
      version: 1,
      maps: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      upgrades: ['cmd_veteran'],
      stats: { kills: 1, gamesPlayed: 1, victories: 1, defeats: 0, bestWave: 1 },
      settings: { masterVol: 0.8, sfxVol: 1, musicVol: 0.6, muted: false, ambientMotion: null },
    };
    localStorage.setItem('lastlight_save', JSON.stringify(v1));
    const sm = new SaveManager();
    expect(sm.getPurchasedUpgrades()).toEqual(['rael_veteran']); // cmd_*→rael_* still applied
    expect(sm.getSeenBeats()).toEqual({});
    expect(JSON.parse(localStorage.getItem('lastlight_save')).version).toBe(5);
  });
});

describe('SaveManager — cross-instance writes', () => {
  // Several instances live at once (boot registry, GameScene, MapSelectScene); a mutator
  // on a stale one must not clobber what another instance already saved.
  it('setSettings on a boot-time instance keeps stars another instance saved', () => {
    const a = new SaveManager();
    const b = new SaveManager();
    b.setStars(0, 3);
    a.setSettings({ masterVol: 0.3 });
    const fresh = new SaveManager();
    expect(fresh.getStars(0)).toBe(3);
    expect(fresh.getSettings().masterVol).toBe(0.3);
  });

  it('setStars keeps the max against storage, not the stale snapshot', () => {
    const a = new SaveManager();
    const b = new SaveManager();
    b.setStars(0, 3);
    a.setStars(0, 2);
    expect(new SaveManager().getStars(0)).toBe(3);
  });

  it('setStats keeps a story beat another instance marked', () => {
    const a = new SaveManager();
    const b = new SaveManager();
    b.markBeatSeen('x');
    a.setStats({ kills: 5 });
    const fresh = new SaveManager();
    expect(fresh.hasSeenBeat('x')).toBe(true);
    expect(fresh.getStats().kills).toBe(5);
  });

  it('setSelectedHero keeps upgrades another instance purchased', () => {
    const a = new SaveManager();
    const b = new SaveManager();
    b.setPurchasedUpgrades(['rael_hp']);
    a.setSelectedHero('rael');
    expect(new SaveManager().getPurchasedUpgrades()).toEqual(['rael_hp']);
  });

  it('setPurchasedUpgrades keeps stars another instance saved', () => {
    const a = new SaveManager();
    const b = new SaveManager();
    b.setStars(1, 2);
    a.setPurchasedUpgrades(['rael_hp']);
    expect(new SaveManager().getStars(1)).toBe(2);
  });

  it('markBeatSeen keeps settings another instance changed', () => {
    const a = new SaveManager();
    const b = new SaveManager();
    b.setSettings({ muted: true });
    a.markBeatSeen('y');
    expect(new SaveManager().getSettings().muted).toBe(true);
  });
});

const NULL_RECORDS = new Array(10).fill(null);

describe('SaveManager v5 — per-map records', () => {
  const v4 = () => ({
    version: 4,
    maps: [3, 2, 1, 0, 0, 0, 0, 0, 0, 0],
    upgrades: ['rael_hp'],
    stats: { kills: 9, gamesPlayed: 4, victories: 3, defeats: 1, bestWave: 7 },
    settings: { masterVol: 0.5, sfxVol: 1, musicVol: 0.6, muted: true, ambientMotion: 'off', mapGrade: null },
    selectedHeroId: 'rael',
    seenStoryBeats: { intro: true },
  });
  const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY));

  it('v4 fixture migrates to v5 with null records and every other field identical', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v4()));
    new SaveManager();
    const { version, records, ...rest } = stored();
    const { version: _v, ...fixtureRest } = v4();
    expect(version).toBe(5);
    expect(records).toEqual(NULL_RECORDS);
    expect(rest).toEqual(fixtureRest);
  });

  it('v1, v2 and v3 fixtures all land on v5 with null records', () => {
    for (const version of [1, 2, 3]) {
      localStorage.clear();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...v4(), version }));
      new SaveManager();
      expect(stored().version).toBe(5);
      expect(stored().records).toEqual(NULL_RECORDS);
    }
  });

  it('fresh save has v5 and null records', () => {
    new SaveManager();
    expect(stored().version).toBe(5);
    expect(stored().records).toEqual(NULL_RECORDS);
  });

  it('a v5 save round-trips its records', () => {
    const records = NULL_RECORDS.slice();
    records[2] = { livesLost: 1, timeMs: 90000 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...v4(), version: 5, records }));
    const sm = new SaveManager();
    expect(sm.getRecord(2)).toEqual({ livesLost: 1, timeMs: 90000 });
    expect(sm.getRecord(0)).toBeNull();
  });

  it.each([
    ['a string', 'x'],
    ['wrong length', [null, null]],
    ['not an array', { 0: { livesLost: 1, timeMs: 5 } }],
  ])('garbage records (%s) sanitize to nulls', (_n, records) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...v4(), version: 5, records }));
    const sm = new SaveManager();
    for (let i = 0; i < 10; i++) expect(sm.getRecord(i)).toBeNull();
  });

  it('old-shaped entries inside a right-length array sanitize to null, valid ones survive', () => {
    const records = NULL_RECORDS.slice();
    records[0] = { lives: 18 };
    records[1] = { livesLost: 2, timeMs: 1000 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...v4(), version: 5, records }));
    const sm = new SaveManager();
    expect(sm.getRecord(0)).toBeNull();
    expect(sm.getRecord(1)).toEqual({ livesLost: 2, timeMs: 1000 });
  });

  it('a future v6 keeps sanitized records', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const records = NULL_RECORDS.slice();
    records[3] = { livesLost: 0, timeMs: 5000 };
    records[4] = { lives: 18 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...v4(), version: 6, records }));
    const sm = new SaveManager();
    expect(sm.getRecord(3)).toEqual({ livesLost: 0, timeMs: 5000 });
    expect(sm.getRecord(4)).toBeNull();
    warn.mockRestore();
  });

  it('recordRun returns the flags and persists', () => {
    const sm = new SaveManager();
    expect(sm.recordRun(0, { livesLost: 3, timeMs: 80000 })).toEqual({ newBest: { livesLost: false, time: false } });
    expect(sm.recordRun(0, { livesLost: 1, timeMs: 90000 })).toEqual({ newBest: { livesLost: true, time: false } });
    expect(sm.recordRun(0, { livesLost: 1, timeMs: 70000 })).toEqual({ newBest: { livesLost: false, time: true } });
    expect(stored().records[0]).toEqual({ livesLost: 1, timeMs: 70000 });
    expect(new SaveManager().getRecord(0)).toEqual({ livesLost: 1, timeMs: 70000 });
  });

  it('recordRun makes no setItem call when nothing improved', () => {
    const sm = new SaveManager();
    sm.recordRun(0, { livesLost: 1, timeMs: 70000 });
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    const res = sm.recordRun(0, { livesLost: 1, timeMs: 70000 });
    sm.recordRun(0, { livesLost: 4, timeMs: 99999 });
    expect(res.newBest).toEqual({ livesLost: false, time: false });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('getRecord returns a copy', () => {
    const sm = new SaveManager();
    sm.recordRun(0, { livesLost: 1, timeMs: 70000 });
    sm.getRecord(0).livesLost = 99;
    expect(sm.getRecord(0)).toEqual({ livesLost: 1, timeMs: 70000 });
  });

  it('getRecord is null for an unplayed or out-of-range map', () => {
    const sm = new SaveManager();
    expect(sm.getRecord(0)).toBeNull();
    expect(sm.getRecord(99)).toBeNull();
  });

  it('recordRun on a stale instance keeps stars another instance saved', () => {
    const a = new SaveManager();
    const b = new SaveManager();
    a.setStars(0, 3);
    b.recordRun(0, { livesLost: 0, timeMs: 60000 });
    const fresh = new SaveManager();
    expect(fresh.getStars(0)).toBe(3);
    expect(fresh.getRecord(0)).toEqual({ livesLost: 0, timeMs: 60000 });
  });

  it('setSettings on a stale instance keeps a record another instance saved', () => {
    const a = new SaveManager();
    const b = new SaveManager();
    a.recordRun(1, { livesLost: 2, timeMs: 61000 });
    b.setSettings({ masterVol: 0.1 });
    expect(new SaveManager().getRecord(1)).toEqual({ livesLost: 2, timeMs: 61000 });
  });
});
