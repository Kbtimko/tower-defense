import { describe, it, expect } from 'vitest';
import { resolveTap, cancelMode, hasMode } from './tapResolve.js';

const idle = { aimSlot: null, repositioning: false, selectedType: null };
const none = { tower: null, slot: null, onPath: false, inspectable: null };
const T = { id: 't' };

describe('resolveTap branches', () => {
  it('aim fires with its slot (slot 0 counts)', () => {
    expect(resolveTap({ ...idle, aimSlot: 0 }, none)).toEqual({ type: 'fireAim', slot: 0 });
  });
  it('reposition', () => {
    expect(resolveTap({ ...idle, repositioning: true }, none)).toEqual({ type: 'reposition' });
  });
  it('tower hit opens panel and clears build, without closePanel', () => {
    expect(resolveTap(idle, { ...none, tower: T })).toEqual({ type: 'openPanel', tower: T, clearBuild: true });
  });
  it('inspectable pins and closes panel', () => {
    const e = { id: 'e' };
    expect(resolveTap(idle, { ...none, inspectable: e })).toEqual({ type: 'pin', target: e, closePanel: true });
  });
  it('place when build armed and slot found', () => {
    expect(resolveTap({ ...idle, selectedType: 'archer' }, { ...none, slot: {} }))
      .toEqual({ type: 'place', closePanel: true });
  });
  it('cancelBuild when armed and no slot', () => {
    expect(resolveTap({ ...idle, selectedType: 'archer' }, none))
      .toEqual({ type: 'cancelBuild', reason: 'noSlot', closePanel: true });
  });
  it('moveHero on path', () => {
    expect(resolveTap(idle, { ...none, onPath: true })).toEqual({ type: 'moveHero', closePanel: true });
  });
  it('offPath otherwise', () => {
    expect(resolveTap(idle, none)).toEqual({ type: 'offPath', closePanel: true });
  });
});

describe('resolveTap priority', () => {
  const all = { tower: T, slot: {}, onPath: true, inspectable: {} };
  it('aim beats everything', () => {
    expect(resolveTap({ aimSlot: 1, repositioning: true, selectedType: 'a' }, all).type).toBe('fireAim');
  });
  it('reposition beats tower', () => {
    expect(resolveTap({ ...idle, repositioning: true, selectedType: 'a' }, all).type).toBe('reposition');
  });
  it('tower beats inspect and build', () => {
    expect(resolveTap({ ...idle, selectedType: 'a' }, all).type).toBe('openPanel');
  });
  it('inspect beats build', () => {
    expect(resolveTap({ ...idle, selectedType: 'a' }, { ...all, tower: null }).type).toBe('pin');
  });
  it('build beats hero move', () => {
    expect(resolveTap({ ...idle, selectedType: 'a' }, { ...all, tower: null, inspectable: null }).type).toBe('place');
  });
});

describe('cancelMode / hasMode', () => {
  it('hasMode true for each mode alone, false when idle', () => {
    expect(hasMode(idle)).toBe(false);
    expect(hasMode({ ...idle, aimSlot: 0 })).toBe(true);
    expect(hasMode({ ...idle, repositioning: true })).toBe(true);
    expect(hasMode({ ...idle, selectedType: 'x' })).toBe(true);
  });
  it('cancelMode clears all three, keeps other fields, does not mutate', () => {
    const s = { aimSlot: 2, repositioning: true, selectedType: 'x', keep: 1 };
    const out = cancelMode(s);
    expect(out).toEqual({ aimSlot: null, repositioning: false, selectedType: null, keep: 1 });
    expect(s.aimSlot).toBe(2);
    expect(hasMode(out)).toBe(false);
  });
});
