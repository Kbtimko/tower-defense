import { describe, it, expect } from 'vitest';
import { spriteTextureKey, entitySpriteKey, registeredStates, tierVariant, variantTextureKey, resolveSpriteKey } from './spriteKeys.js';

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

describe('tier variant keys (#49)', () => {
  const base = 'sprite-soldier-default-idle';
  const t3 = base + '-t3';
  const t4a = base + '-t4a';

  it('tierVariant maps level + branch', () => {
    expect([[1, null], [2, null], [3, null], [4, 'A'], [4, 'B'], [4, null]].map(([l, b]) => tierVariant(l, b)))
      .toEqual(['t1', 't2', 't3', 't4a', 't4b', 't3']);
  });
  it('variantTextureKey suffixes the base key', () => {
    expect(variantTextureKey('soldier', 'default', 'idle', 't2')).toBe('sprite-soldier-default-idle-t2');
  });
  it('resolveSpriteKey prefers variant, falls back to base, never hops t4a to t3', () => {
    expect(resolveSpriteKey('soldier', 'default', 'idle', 't4a', [base, t4a])).toBe(t4a);
    expect(resolveSpriteKey('soldier', 'default', 'idle', 't4a', [base, t3])).toBe(base);
    expect(resolveSpriteKey('soldier', 'default', 'idle', 't1', [base])).toBe(base);
    expect(resolveSpriteKey('soldier', 'default', 'idle', 't2', [])).toBeNull();
  });
  it('registeredStates honours the variant chain', () => {
    expect(registeredStates('soldier', 'default', ['idle', 'attack'], [t4a], 't4a')).toEqual(['idle']);
    expect(registeredStates('soldier', 'default', ['idle', 'attack'], [base])).toEqual(['idle']);
  });
});
