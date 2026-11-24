import { describe, it, expect, vi } from 'vitest';
import { shouldAutoPause, resumeAudio } from './shellLifecycle.js';

const base = { hidden: false, phonePortrait: false, inLevel: true, userPaused: false, over: false };

describe('shouldAutoPause', () => {
  it('is false when nothing is wrong', () => {
    expect(shouldAutoPause(base)).toBe(false);
  });
  it('is true when the tab is hidden', () => {
    expect(shouldAutoPause({ ...base, hidden: true })).toBe(true);
  });
  it('is true on a phone in portrait', () => {
    expect(shouldAutoPause({ ...base, phonePortrait: true })).toBe(true);
  });
  it('is false outside a level even if hidden', () => {
    expect(shouldAutoPause({ ...base, hidden: true, inLevel: false })).toBe(false);
  });
  it('is false when the user already paused', () => {
    expect(shouldAutoPause({ ...base, hidden: true, userPaused: true })).toBe(false);
  });
  it('is false once the level is over', () => {
    expect(shouldAutoPause({ ...base, phonePortrait: true, over: true })).toBe(false);
  });
});

describe('resumeAudio', () => {
  it.each(['suspended', 'interrupted'])('resumes a %s context', (state) => {
    const ctx = { state, resume: vi.fn(() => Promise.resolve()) };
    resumeAudio(ctx);
    expect(ctx.resume).toHaveBeenCalledOnce();
  });
  it('leaves a running context alone', () => {
    const ctx = { state: 'running', resume: vi.fn() };
    resumeAudio(ctx);
    expect(ctx.resume).not.toHaveBeenCalled();
  });
  it('tolerates a missing context (HTML5 audio)', () => {
    expect(() => resumeAudio(undefined)).not.toThrow();
  });
  it('attaches a rejection handler to resume()', () => {
    const p = { catch: vi.fn() };
    resumeAudio({ state: 'suspended', resume: () => p });
    expect(p.catch).toHaveBeenCalledOnce();
    expect(() => p.catch.mock.calls[0][0](new Error('no gesture'))).not.toThrow();
  });
  it('tolerates a resume() that returns nothing', () => {
    const ctx = { state: 'interrupted', resume: vi.fn(() => undefined) };
    expect(() => resumeAudio(ctx)).not.toThrow();
  });
});
