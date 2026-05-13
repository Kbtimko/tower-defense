import { describe, it, expect } from 'vitest';
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
});
