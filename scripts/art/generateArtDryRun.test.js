// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The generator calls process.exit straight after printing. On macOS stdout to a
// pipe is asynchronous, so under load the tail of the listing is lost (seen: 17
// of 18 entries, exit 0). A file descriptor is written synchronously.
function dryRunOutput(args) {
  const dir = mkdtempSync(join(tmpdir(), 'gen-dry-'));
  const fd = openSync(join(dir, 'out.txt'), 'w');
  try {
    execFileSync('node', ['scripts/generate-art.mjs', ...args], { cwd: process.cwd(), stdio: ['ignore', fd, 'pipe'] });
    return readFileSync(join(dir, 'out.txt'), 'utf8');
  } finally {
    closeSync(fd);
    rmSync(dir, { recursive: true, force: true });
  }
}

// Variant bullets (archer.t4a) share the base's `<category>_<type>` id. If the legacy
// generator ever includes them it queues a 19th job that overwrites the base
// reference in .art-cache/sprites, which is the only copy of that reference.
describe('legacy generator: sprite reference jobs', () => {
  it('lists exactly the 18 base entities and never a variant', () => {
    const out = dryRunOutput(['--dry-run', '--kind', 'sprite', '--force']);
    expect(out.match(/^── sprite: /gm)).toHaveLength(18);
    expect(out.match(/^── sprite: tower_archer$/gm)).toHaveLength(1);
    expect(out).not.toMatch(/t4a/);
  }, { timeout: 30000 });
});
