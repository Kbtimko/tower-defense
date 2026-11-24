// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { recordClip } from './release-media.mjs';
import { RELEASE_MEDIA } from '../src/data/release.js';
import { DEVICES } from './captureDevices.mjs';

afterEach(() => vi.restoreAllMocks());

describe('recordClip', () => {
  it('closes the recording context exactly once when the crowd wait times out', async () => {
    let calls = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => (++calls <= 4 ? 0 : 1e12));
    const page = {
      on: () => {},
      goto: async () => {},
      waitForFunction: async () => {},
      waitForTimeout: async () => {},
      locator: () => ({ boundingBox: async () => ({ x: 0, y: 0, width: 1920, height: 1080 }) }),
      evaluate: async (fn) => (String(fn).includes('matchMedia') ? true : { crowd: [], simMs: RELEASE_MEDIA.clip.maxLeadSimMs - 1000 }),
    };
    const close = vi.fn(async () => {});
    const browser = { newContext: async () => ({ newPage: async () => page, close }) };
    await expect(recordClip(browser, 'http://x', DEVICES[RELEASE_MEDIA.device])).rejects.toThrow(/clip: no crowd/);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
