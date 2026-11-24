import { describe, it, expect } from 'vitest';
import { verdict } from './verdict.js';

const won = livesRemaining => ({ won: true, livesRemaining, wavesSurvived: 10, totalWaves: 10 });

describe('verdict', () => {
  it('kept 90% is TOO EASY', () => {
    expect(verdict(won(18), 20).tag).toBe('TOO EASY');
  });
  it('kept 25% is PUNISHING', () => {
    expect(verdict(won(5), 20).tag).toBe('PUNISHING');
  });
  it('in between is OK', () => {
    expect(verdict(won(10), 20).tag).toBe('OK');
  });
  it('a loss is UNWINNABLE and names the wave', () => {
    const v = verdict({ won: false, livesRemaining: 0, wavesSurvived: 4, totalWaves: 10 }, 20);
    expect(v.tag).toBe('UNWINNABLE');
    expect(v.note).toBe('lost at wave 5/10');
  });
});
