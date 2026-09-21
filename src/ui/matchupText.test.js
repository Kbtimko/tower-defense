import { describe, it, expect } from 'vitest';
import { formatCounters } from './matchupText.js';

// {kind, type, name, icon} shapes, same as describeEnemy(...).vulnerableTo/resists.
const tower = (name) => ({ kind: 'tower', type: name.toLowerCase(), name, icon: '⚔' });
const hero  = (name) => ({ kind: 'hero',  type: name.toLowerCase(), name, icon: '★' });

describe('formatCounters', () => {
  it('renders towers only as a plain comma list', () => {
    expect(formatCounters([tower('Mage'), tower('Cannon'), tower('Sniper')]))
      .toBe('Mage, Cannon, Sniper');
  });

  it('renders heroes only, tagged as heroes', () => {
    expect(formatCounters([hero('Dax')])).toBe('heroes: Dax');
  });

  it('renders a mix as towers then a parenthetical heroes group', () => {
    expect(formatCounters([tower('Mage'), tower('Cannon'), tower('Sniper'), hero('Dax')]))
      .toBe('Mage, Cannon, Sniper (heroes: Dax)');
  });

  it('returns an empty string for an empty list', () => {
    expect(formatCounters([])).toBe('');
  });

  // Towers first, heroes second, regardless of how they arrive interleaved —
  // this is the actual bug (a player must never mistake a hero for a tower).
  it('reorders an interleaved mix to towers-first, heroes-second', () => {
    expect(formatCounters([hero('Vex'), tower('Cannon'), hero('Mira'), tower('Mage')]))
      .toBe('Cannon, Mage (heroes: Vex, Mira)');
  });

  // Each group preserves the order it arrived in, independent of the other group.
  it('preserves within-group order for both towers and heroes', () => {
    expect(formatCounters([hero('Mira'), hero('Vex'), tower('Sniper'), tower('Archer')]))
      .toBe('Sniper, Archer (heroes: Mira, Vex)');
  });
});
