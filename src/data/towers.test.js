import { TOWER_DEFS } from './towers.js';

describe('TOWER_DEFS', () => {
  const REQUIRED = ['name','icon','cost','color','range','damage','fireRate',
                    'splashRadius','pierce','slow','tier2','tier3','tier4A','tier4B','ability'];

  for (const [type, def] of Object.entries(TOWER_DEFS)) {
    it(`${type} has all required fields`, () => {
      for (const field of REQUIRED) expect(def).toHaveProperty(field);
    });
    it(`${type} all tier costs are positive`, () => {
      expect(def.cost).toBeGreaterThan(0);
      expect(def.tier2.cost).toBeGreaterThan(0);
      expect(def.tier3.cost).toBeGreaterThan(0);
      expect(def.tier4A.cost).toBeGreaterThan(0);
      expect(def.tier4B.cost).toBeGreaterThan(0);
    });
  }
});
