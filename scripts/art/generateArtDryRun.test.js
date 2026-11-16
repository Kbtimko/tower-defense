// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

// Variant bullets (archer.t4a) share the base's `<category>_<type>` id. If the legacy
// generator ever includes them it queues a 19th job that overwrites the base
// reference in .art-cache/sprites, which is the only copy of that reference.
describe('legacy generator: sprite reference jobs', () => {
  it('lists exactly the 18 base entities and never a variant', () => {
    const out = execFileSync('node', ['scripts/generate-art.mjs', '--dry-run', '--kind', 'sprite', '--force'],
      { cwd: process.cwd(), encoding: 'utf8' });
    expect(out.match(/^── sprite: /gm)).toHaveLength(18);
    expect(out.match(/^── sprite: tower_archer$/gm)).toHaveLength(1);
    expect(out).not.toMatch(/t4a/);
  }, { timeout: 30000 });
});
