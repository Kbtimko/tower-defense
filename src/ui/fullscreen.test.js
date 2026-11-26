import { describe, it, expect, vi } from 'vitest';
import { fullscreenSupported, isFullscreen, toggleFullscreen } from './fullscreen.js';

describe('fullscreenSupported', () => {
  it('true for the standard flag', () => {
    expect(fullscreenSupported({ fullscreenEnabled: true })).toBe(true);
  });
  it('true for the webkit flag', () => {
    expect(fullscreenSupported({ webkitFullscreenEnabled: true })).toBe(true);
  });
  it('false when neither flag is set (iPhone Safari)', () => {
    expect(fullscreenSupported({})).toBe(false);
  });
});

describe('isFullscreen', () => {
  it('reads the standard element', () => {
    expect(isFullscreen({ fullscreenElement: {} })).toBe(true);
  });
  it('reads the webkit element', () => {
    expect(isFullscreen({ webkitFullscreenElement: {} })).toBe(true);
  });
  it('false when no element is fullscreen', () => {
    expect(isFullscreen({ fullscreenElement: null })).toBe(false);
  });
});

describe('toggleFullscreen', () => {
  it('requests standard fullscreen on the element and locks landscape', async () => {
    const el = { requestFullscreen: vi.fn().mockResolvedValue() };
    const orientation = { lock: vi.fn().mockResolvedValue() };
    await toggleFullscreen({}, el, orientation);
    expect(el.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(orientation.lock).toHaveBeenCalledWith('landscape');
  });

  it('falls back to webkitRequestFullscreen', async () => {
    const el = { webkitRequestFullscreen: vi.fn().mockResolvedValue() };
    await toggleFullscreen({}, el, undefined);
    expect(el.webkitRequestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('exits via the standard API when already fullscreen', async () => {
    const doc = { fullscreenElement: {}, exitFullscreen: vi.fn().mockResolvedValue() };
    const el = { requestFullscreen: vi.fn() };
    await toggleFullscreen(doc, el, undefined);
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(el.requestFullscreen).not.toHaveBeenCalled();
  });

  it('exits via the webkit API when already fullscreen', async () => {
    const doc = { webkitFullscreenElement: {}, webkitExitFullscreen: vi.fn().mockResolvedValue() };
    await toggleFullscreen(doc, {}, undefined);
    expect(doc.webkitExitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('calls only the standard request when it returns undefined', async () => {
    const el = { requestFullscreen: vi.fn(() => undefined), webkitRequestFullscreen: vi.fn() };
    await toggleFullscreen({}, el, undefined);
    expect(el.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(el.webkitRequestFullscreen).not.toHaveBeenCalled();
  });

  it('exits only via the standard API when it returns undefined', async () => {
    const doc = { fullscreenElement: {}, exitFullscreen: vi.fn(() => undefined), webkitExitFullscreen: vi.fn() };
    await toggleFullscreen(doc, {}, undefined);
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(doc.webkitExitFullscreen).not.toHaveBeenCalled();
  });

  it('calls the chosen method on its own element and document', async () => {
    const receivers = [];
    const stdEl = { requestFullscreen: function () { receivers.push(this); } };
    await toggleFullscreen({}, stdEl, undefined);
    expect(receivers[0]).toBe(stdEl);

    const webkitEl = { webkitRequestFullscreen: function () { receivers.push(this); } };
    await toggleFullscreen({}, webkitEl, undefined);
    expect(receivers[1]).toBe(webkitEl);

    const doc = { fullscreenElement: {}, exitFullscreen: function () { receivers.push(this); } };
    await toggleFullscreen(doc, {}, undefined);
    expect(receivers[2]).toBe(doc);
  });

  it('swallows a rejecting orientation.lock', async () => {
    const el = { requestFullscreen: vi.fn().mockResolvedValue() };
    const orientation = { lock: vi.fn().mockRejectedValue(new Error('NotSupportedError')) };
    await expect(toggleFullscreen({}, el, orientation)).resolves.not.toThrow();
  });

  it('swallows a synchronously throwing orientation.lock', async () => {
    const el = { requestFullscreen: vi.fn().mockResolvedValue() };
    const orientation = { lock: () => { throw new Error('boom'); } };
    await expect(toggleFullscreen({}, el, orientation)).resolves.not.toThrow();
  });

  it('works with no orientation object and no lock method', async () => {
    const el = { requestFullscreen: vi.fn().mockResolvedValue() };
    await expect(toggleFullscreen({}, el, {})).resolves.not.toThrow();
    await expect(toggleFullscreen({}, el, null)).resolves.not.toThrow();
  });

  it('resolves without throwing when nothing is supported', async () => {
    await expect(toggleFullscreen({}, {}, undefined)).resolves.toBeUndefined();
  });
});
