import { describe, it, expect } from 'vitest';
import { SPRITE_MANIFEST, getSpriteConfig } from './sprites.js';
import { TOWER_DEFS } from './towers.js';
import { HEROES } from './heroes.js';

describe('SPRITE_MANIFEST', () => {
  it('registers every tower and hero under its runtime id', () => {
    for (const t of Object.keys(TOWER_DEFS)) expect(getSpriteConfig('tower', t)).not.toBeNull();
    for (const h of Object.keys(HEROES))     expect(getSpriteConfig('hero', h)).not.toBeNull();
    expect(getSpriteConfig('soldier', 'default')).not.toBeNull();
    expect(getSpriteConfig('sentry',  'default')).not.toBeNull();
  });

  it('gives every one-shot state more than one frame', () => {
    // A single-frame one-shot never fires animationcomplete, so the entity
    // would stay stuck on that frame forever (and a dead enemy never destroys).
    for (const e of SPRITE_MANIFEST) {
      for (const st of ['attack', 'death']) {
        if (!e.states[st]) continue;
        expect(e.states[st].frames, `${e.category}/${e.type} ${st}`).toBeGreaterThan(1);
      }
    }
  });

  it('has a looping state to revert to after every one-shot', () => {
    for (const e of SPRITE_MANIFEST) {
      if (!e.states.attack) continue;
      expect(Boolean(e.states.idle || e.states.move),
             `${e.category}/${e.type}`).toBe(true);
    }
  });

  it('declares a square frame for every state', () => {
    for (const e of SPRITE_MANIFEST) {
      for (const [st, def] of Object.entries(e.states)) {
        expect(def.frameWidth, `${e.category}/${e.type} ${st}`).toBe(def.frameHeight);
      }
    }
  });
});
