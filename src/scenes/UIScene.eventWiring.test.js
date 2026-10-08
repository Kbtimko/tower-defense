// Derived, not hardcoded: UIScene sat dormant for months and accumulated
// listeners for events nothing emits and emits nothing listens to, while
// GameScene grew its own copy of the UI. Each orphan looked harmless and two
// hid live bugs (#34). Read the real sources so a new orphan fails here.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
function sources(dir = SRC) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith('.js') && !p.endsWith('.test.js') ? [p] : [];
  });
}
const files = sources();
const ui = readFileSync(join(SRC, 'scenes', 'UIScene.js'), 'utf8');
const others = files.filter(f => !f.endsWith('UIScene.js')).map(f => readFileSync(f, 'utf8')).join('\n');

// Only `game.events` crosses scenes. A scene's own `this.events` (where
// EconomyManager emits game:defeat) never reaches UIScene.
// Any quote style, and `once` counts as listening.
const names = (text, verbs) =>
  [...text.matchAll(new RegExp(`game\\.events\\.(?:${verbs})\\(\\s*['"\`]([^'"\`]+)['"\`]`, 'g'))].map(m => m[1]);
const LISTEN = 'on|once';
const EMIT   = 'emit';

describe('UIScene cross-scene event wiring', () => {
  it('finds the wiring it checks, so the guard is never vacuous', () => {
    expect(names(ui, LISTEN).length).toBeGreaterThan(0);
    expect(names(ui, EMIT).length).toBeGreaterThan(0);
    expect(names(others, LISTEN).length).toBeGreaterThan(0);
    expect(names(others, EMIT).length).toBeGreaterThan(0);
  });

  it('listens only for events some other module emits on game.events', () => {
    const emitted = new Set(names(others, EMIT));
    const orphans = names(ui, LISTEN).filter(n => !emitted.has(n));
    expect(orphans).toEqual([]);
  });

  it('emits only events some other module listens for on game.events', () => {
    const heard = new Set(names(others, LISTEN));
    const orphans = [...new Set(names(ui, EMIT))].filter(n => !heard.has(n));
    expect(orphans).toEqual([]);
  });
});
