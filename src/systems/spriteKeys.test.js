import { describe, it, expect } from 'vitest';
import { spriteTextureKey, entitySpriteKey, registeredStates } from './spriteKeys.js';

describe('spriteTextureKey', () => {
  it('derives sprite-<category>-<type>-<state>', () => {
    expect(spriteTextureKey('enemy', 'drone', 'move')).toBe('sprite-enemy-drone-move');
    expect(spriteTextureKey('tower', 'archer', 'attack')).toBe('sprite-tower-archer-attack');
  });
});

describe('entitySpriteKey', () => {
  const reg = ['sprite-enemy-drone-move', 'sprite-tower-archer-idle'];
  it('returns the key when registered', () => {
    expect(entitySpriteKey('enemy', 'drone', 'move', reg)).toBe('sprite-enemy-drone-move');
  });
  it('returns null when not registered', () => {
    expect(entitySpriteKey('enemy', 'drone', 'death', reg)).toBeNull();
  });
  it('returns null for an empty registry', () => {
    expect(entitySpriteKey('tower', 'archer', 'idle', [])).toBeNull();
  });
});

describe('registeredStates', () => {
  it('filters to only the registered states', () => {
    const reg = ['sprite-enemy-drone-move'];
    expect(registeredStates('enemy', 'drone', ['idle', 'move', 'death'], reg)).toEqual(['move']);
  });
  it('returns [] when nothing registered', () => {
    expect(registeredStates('enemy', 'drone', ['idle', 'move'], [])).toEqual([]);
  });
});
