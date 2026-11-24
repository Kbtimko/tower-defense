import { describe, it, expect } from 'vitest';
import { exitPayload } from './missionExit.js';

describe('exitPayload: the five GameScene.returnToMap oracle cases', () => {
  it('fresh victory', () => {
    expect(exitPayload({ mapId: 0, result: 'victory', entryStars: 0, savedStars: 3, runStars: 3 }))
      .toEqual({ mapId: 0, result: 'victory', prevStars: 0, stars: 3 });
  });
  it('prevStars is the entry value, not the post-setStars save', () => {
    expect(exitPayload({ mapId: 0, result: 'victory', entryStars: 1, savedStars: 3, runStars: 3 }))
      .toEqual({ mapId: 0, result: 'victory', prevStars: 1, stars: 3 });
  });
  it('worse replay keeps saved as prevStars and reports this run', () => {
    expect(exitPayload({ mapId: 0, result: 'victory', entryStars: 3, savedStars: 3, runStars: 1 }))
      .toEqual({ mapId: 0, result: 'victory', prevStars: 3, stars: 1 });
  });
  it('defeat reports saved stars unchanged', () => {
    expect(exitPayload({ mapId: 2, result: 'defeat', entryStars: 2, savedStars: 2, runStars: 0 }))
      .toEqual({ mapId: 2, result: 'defeat', prevStars: 2, stars: 2 });
  });
  it('abandon reports saved stars unchanged', () => {
    expect(exitPayload({ mapId: 1, result: 'abandon', entryStars: 1, savedStars: 1, runStars: 0 }))
      .toEqual({ mapId: 1, result: 'abandon', prevStars: 1, stars: 1 });
  });
});

describe('exitPayload: retry chains', () => {
  it('first clear + retry + defeat still owes the flight', () => {
    expect(exitPayload({ mapId: 0, result: 'defeat', entryStars: 0, savedStars: 1, runStars: 0 }))
      .toEqual({ mapId: 0, result: 'victory', prevStars: 0, stars: 1 });
  });
  it('first clear 3 stars + retry 1 star keeps the saved 3', () => {
    expect(exitPayload({ mapId: 0, result: 'victory', entryStars: 0, savedStars: 3, runStars: 1 }))
      .toEqual({ mapId: 0, result: 'victory', prevStars: 0, stars: 3 });
  });
  it('first clear + retry + abandon still owes the flight', () => {
    expect(exitPayload({ mapId: 4, result: 'abandon', entryStars: 0, savedStars: 2, runStars: 0 }))
      .toEqual({ mapId: 4, result: 'victory', prevStars: 0, stars: 2 });
  });
  it('first clear 1 star, retry, win again, NEXT MISSION keeps next', () => {
    expect(exitPayload({ mapId: 0, result: 'victory', entryStars: 0, savedStars: 1, runStars: 1, next: true }))
      .toEqual({ mapId: 0, result: 'victory', prevStars: 0, stars: 1, next: true });
  });
});

describe('exitPayload: next key', () => {
  it('is absent unless next is exactly true', () => {
    for (const next of [undefined, false, 0, 'yes']) {
      expect(exitPayload({ mapId: 0, result: 'victory', entryStars: 0, savedStars: 1, runStars: 1, next }))
        .not.toHaveProperty('next');
    }
  });
});
