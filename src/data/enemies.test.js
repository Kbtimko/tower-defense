import { ENEMY_DEFS } from './enemies.js';

describe('ENEMY_DEFS', () => {
  const REQUIRED = ['type', 'name', 'hp', 'speed', 'reward', 'armor', 'color', 'radius', 'flying'];
  for (const [key, def] of Object.entries(ENEMY_DEFS)) {
    it(`${key} has all required fields`, () => {
      for (const field of REQUIRED) expect(def).toHaveProperty(field);
    });
    it(`${key}.type matches its key`, () => {
      expect(def.type).toBe(key);
    });
  }

  it('phantom.flying is true', () => {
    expect(ENEMY_DEFS.phantom.flying).toBe(true);
  });

  it('titan.armor equals 20 (flat damage reduction)', () => {
    expect(ENEMY_DEFS.titan.armor).toBe(20);
  });
});

describe('ENEMY_DEFS icon field', () => {
  it('every enemy def has a non-empty icon string', () => {
    for (const [type, def] of Object.entries(ENEMY_DEFS)) {
      expect(typeof def.icon).toBe('string');
      expect(def.icon.length).toBeGreaterThan(0);
    }
  });
});
