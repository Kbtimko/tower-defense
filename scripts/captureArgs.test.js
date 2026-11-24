// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

// Spawned, not imported: capture.mjs runs main() on import. Parsing must reject before any build.
function run(args) {
  return spawnSync('node', ['scripts/capture.mjs', ...args], { encoding: 'utf8', timeout: 20_000 });
}

describe('capture.mjs flag values', () => {
  it('--serve followed by another flag is rejected, not consumed as the directory', () => {
    const r = run(['--flow', '--serve', '--no-build']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/--serve needs a value/);
  }, 30_000);

  it('--base-path followed by another flag is rejected', () => {
    const r = run(['--flow', '--serve', 'dist', '--base-path', '--no-build']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/--base-path needs a value/);
  }, 30_000);
});
