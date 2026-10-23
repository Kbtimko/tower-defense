import { describe, it, expect } from 'vitest';
import { resolveTap, hasMode } from './tapResolve.js';

const idle = { aimSlot: null, repositioning: false, selectedType: null, radial: null };
const none = { tower: null, slot: null, onPath: false, inspectable: null };
const T = { id: 't' };
const PAD = { slotIndex: 3, x: 10, y: 20 };

describe('resolveTap branches', () => {
  it('aim fires with its slot (slot 0 counts)', () => {
    expect(resolveTap({ ...idle, aimSlot: 0 }, none)).toEqual({ type: 'fireAim', slot: 0 });
  });
  it('reposition', () => {
    expect(resolveTap({ ...idle, repositioning: true }, none)).toEqual({ type: 'reposition' });
  });
  it('tower hit opens the ring and clears build, without closeRadial', () => {
    expect(resolveTap(idle, { ...none, tower: T })).toEqual({ type: 'openRing', tower: T, clearBuild: true });
  });
  it('inspectable pins and closes the radial', () => {
    const e = { id: 'e' };
    expect(resolveTap(idle, { ...none, inspectable: e })).toEqual({ type: 'pin', target: e, closeRadial: true });
  });
  it('place when build armed and slot found', () => {
    expect(resolveTap({ ...idle, selectedType: 'archer' }, { ...none, slot: PAD }))
      .toEqual({ type: 'place', closeRadial: true });
  });
  it('cancelBuild when armed and no slot', () => {
    expect(resolveTap({ ...idle, selectedType: 'archer' }, none))
      .toEqual({ type: 'cancelBuild', reason: 'noSlot', closeRadial: true });
  });
  it('a free pad with nothing armed opens the build radial at that pad', () => {
    expect(resolveTap(idle, { ...none, slot: PAD })).toEqual({ type: 'openBuild', slot: PAD });
  });
  it('moveHero on path', () => {
    expect(resolveTap(idle, { ...none, onPath: true })).toEqual({ type: 'moveHero', closeRadial: true });
  });
  it('offPath otherwise', () => {
    expect(resolveTap(idle, none)).toEqual({ type: 'offPath', closeRadial: true });
  });
});

// D5: an open radial eats the next canvas tap.
describe('resolveTap with a radial open', () => {
  const ring = { ...idle, radial: { kind: 'tower', target: T } };
  const build = { ...idle, radial: { kind: 'build', target: PAD } };
  const other = { id: 'other' };

  it('a tap on another tower retargets the ring', () => {
    expect(resolveTap(ring, { ...none, tower: other })).toEqual({ type: 'openRing', tower: other, clearBuild: true });
  });
  it('a tap on its own tower (the hub) closes', () => {
    expect(resolveTap(ring, { ...none, tower: T })).toEqual({ type: 'none', closeRadial: true });
  });
  it('a tap on a free pad retargets a ring to a build radial', () => {
    expect(resolveTap(ring, { ...none, slot: PAD })).toEqual({ type: 'openBuild', slot: PAD });
  });
  it('a tap on its own pad closes the build radial (slots compare by index, hits are fresh objects)', () => {
    expect(resolveTap(build, { ...none, slot: { ...PAD } })).toEqual({ type: 'none', closeRadial: true });
  });
  it('a tap on another free pad retargets the build radial', () => {
    const pad2 = { slotIndex: 4, x: 90, y: 20 };
    expect(resolveTap(build, { ...none, slot: pad2 })).toEqual({ type: 'openBuild', slot: pad2 });
  });
  it('a tap on a tower retargets a build radial to its ring', () => {
    expect(resolveTap(build, { ...none, tower: T })).toEqual({ type: 'openRing', tower: T, clearBuild: true });
  });
  it('any other tap only closes: no hero move, pin or toast', () => {
    for (const hits of [{ ...none, onPath: true }, { ...none, inspectable: {} }, none]) {
      expect(resolveTap(ring, hits)).toEqual({ type: 'none', closeRadial: true });
      expect(resolveTap(build, hits)).toEqual({ type: 'none', closeRadial: true });
    }
  });
  it('aim and reposition still win over an open radial', () => {
    expect(resolveTap({ ...ring, aimSlot: 'w' }, { ...none, tower: T }).type).toBe('fireAim');
    expect(resolveTap({ ...ring, repositioning: true }, { ...none, tower: T }).type).toBe('reposition');
  });
});

describe('resolveTap dead hero', () => {
  const dead = { ...idle, heroDead: true };
  it('dead hero + onPath is a no-op that closes the radial', () => {
    expect(resolveTap(dead, { ...none, onPath: true })).toEqual({ type: 'none', closeRadial: true });
  });
  it('dead hero + offPath is a no-op that closes the radial', () => {
    expect(resolveTap(dead, none)).toEqual({ type: 'none', closeRadial: true });
  });
  it('heroDead does not affect earlier branches', () => {
    expect(resolveTap({ ...dead, aimSlot: 0 }, none).type).toBe('fireAim');
    expect(resolveTap({ ...dead, repositioning: true }, none).type).toBe('reposition');
    expect(resolveTap(dead, { ...none, tower: T }).type).toBe('openRing');
    expect(resolveTap(dead, { ...none, inspectable: {} }).type).toBe('pin');
    expect(resolveTap({ ...dead, selectedType: 'a' }, { ...none, slot: PAD }).type).toBe('place');
    expect(resolveTap({ ...dead, selectedType: 'a' }, none).type).toBe('cancelBuild');
    expect(resolveTap(dead, { ...none, slot: PAD }).type).toBe('openBuild');
  });
});

describe('resolveTap priority', () => {
  const all = { tower: T, slot: PAD, onPath: true, inspectable: {} };
  it('aim beats everything', () => {
    expect(resolveTap({ aimSlot: 1, repositioning: true, selectedType: 'a', radial: { kind: 'tower', target: T } }, all).type).toBe('fireAim');
  });
  it('reposition beats tower', () => {
    expect(resolveTap({ ...idle, repositioning: true, selectedType: 'a' }, all).type).toBe('reposition');
  });
  it('tower beats inspect and build', () => {
    expect(resolveTap({ ...idle, selectedType: 'a' }, all).type).toBe('openRing');
  });
  it('inspect beats build', () => {
    expect(resolveTap({ ...idle, selectedType: 'a' }, { ...all, tower: null }).type).toBe('pin');
  });
  it('an armed build places on a free pad: no radial', () => {
    expect(resolveTap({ ...idle, selectedType: 'a' }, { ...all, tower: null, inspectable: null }).type).toBe('place');
  });
  it('a free pad beats the path (a tap within the pad radius opens the build radial)', () => {
    expect(resolveTap(idle, { ...all, tower: null, inspectable: null }).type).toBe('openBuild');
  });
  it('inspect beats a free pad', () => {
    expect(resolveTap(idle, { ...all, tower: null }).type).toBe('pin');
  });
});

describe('hasMode', () => {
  it('hasMode true for each mode alone, false when idle', () => {
    expect(hasMode(idle)).toBe(false);
    expect(hasMode({ ...idle, aimSlot: 0 })).toBe(true);
    expect(hasMode({ ...idle, repositioning: true })).toBe(true);
    expect(hasMode({ ...idle, selectedType: 'x' })).toBe(true);
  });
  it('an open radial counts, so Esc and the Cancel button close it', () => {
    expect(hasMode({ ...idle, radial: { kind: 'build', target: PAD } })).toBe(true);
  });
});
