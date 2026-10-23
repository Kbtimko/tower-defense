import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TitleScreen } from './TitleScreen.js';
import { TITLE, TITLE_PROMPT } from '../data/title.js';

function mountRoot() {
  document.body.replaceChildren();
  const root = document.createElement('div');
  root.id = 'title-screen';
  root.append(document.createElement('canvas'));
  const logo = document.createElement('div');
  logo.className = 'title-logo';
  const prompt = document.createElement('div');
  prompt.className = 'title-prompt';
  root.append(logo, prompt);
  document.body.appendChild(root);
  return root;
}

function setFonts(value) {
  Object.defineProperty(document, 'fonts', { value, configurable: true });
}

// Counts add/remove per event type on each target, so a pair shows up as a net 0.
function trackListeners(...targets) {
  const net = new Map();
  for (const t of targets) {
    const add = t.addEventListener.bind(t);
    const remove = t.removeEventListener.bind(t);
    vi.spyOn(t, 'addEventListener').mockImplementation((type, ...rest) => {
      net.set(type, (net.get(type) ?? 0) + 1);
      return add(type, ...rest);
    });
    vi.spyOn(t, 'removeEventListener').mockImplementation((type, ...rest) => {
      net.set(type, (net.get(type) ?? 0) - 1);
      return remove(type, ...rest);
    });
  }
  return net;
}

const key = (k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const LIT_AFTER_SWEEP = TITLE.sweepDelayMs + TITLE.sweepMs + TITLE.settleMs;

describe('TitleScreen', () => {
  let root;
  let screen;

  beforeEach(() => {
    // jsdom has no 2D canvas; null is the real "no canvas" signal SpaceCanvas no-ops on.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    setFonts(undefined);
    root = mountRoot();
    screen = new TitleScreen(root);
  });

  afterEach(() => {
    screen.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('click calls onStart exactly once even on a double click', () => {
    const onStart = vi.fn();
    screen.show({ motion: true, pointerFine: true, onStart });
    root.click();
    root.click();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("Enter and Space start; other keys don't", () => {
    const onStart = vi.fn();
    screen.show({ motion: true, pointerFine: true, onStart });
    key('a');
    key('Escape');
    key('Tab');
    expect(onStart).not.toHaveBeenCalled();
    key('Enter');
    expect(onStart).toHaveBeenCalledTimes(1);

    screen.destroy();
    const onSpace = vi.fn();
    screen = new TitleScreen(root);
    screen.show({ motion: true, pointerFine: true, onStart: onSpace });
    key(' ');
    key(' ');
    expect(onSpace).toHaveBeenCalledTimes(1);
  });

  it('destroy removes click + keydown listeners', () => {
    const net = trackListeners(root, document);
    const onStart = vi.fn();
    screen.show({ motion: true, pointerFine: true, onStart });
    expect(net.get('click')).toBe(1);
    expect(net.get('keydown')).toBe(1);
    screen.destroy();
    expect(net.get('click')).toBe(0);
    expect(net.get('keydown')).toBe(0);
    root.click();
    key('Enter');
    expect(onStart).not.toHaveBeenCalled();
  });

  it('destroy hides the screen', () => {
    screen.show({ motion: true, pointerFine: true, onStart() {} });
    expect(root.style.display).not.toBe('none');
    screen.destroy();
    expect(root.style.display).toBe('none');
  });

  it('motion off -> data-phase "lit" immediately, no sweep class', () => {
    screen.show({ motion: false, pointerFine: true, onStart() {} });
    expect(root.dataset.phase).toBe('lit');
    expect(root.classList.contains('title-sweep')).toBe(false);
    expect(root.classList.contains('motion-off')).toBe(true);
  });

  it('motion on clears a stale motion-off class', () => {
    root.classList.add('motion-off');
    screen.show({ motion: true, pointerFine: true, onStart() {} });
    expect(root.classList.contains('motion-off')).toBe(false);
  });

  it('prompt text: fine -> CLICK TO START, coarse -> TAP TO START', () => {
    const prompt = root.querySelector('.title-prompt');
    screen.show({ motion: true, pointerFine: true, onStart() {} });
    expect(prompt.textContent).toBe(TITLE_PROMPT.fine);
    screen.destroy();
    screen = new TitleScreen(root);
    screen.show({ motion: true, pointerFine: false, onStart() {} });
    expect(prompt.textContent).toBe(TITLE_PROMPT.coarse);
  });

  it('publishes the TITLE timings as --title-* custom properties', () => {
    screen.show({ motion: true, pointerFine: true, onStart() {} });
    expect(root.style.getPropertyValue('--title-sweep-delay')).toBe(`${TITLE.sweepDelayMs}ms`);
    expect(root.style.getPropertyValue('--title-sweep')).toBe(`${TITLE.sweepMs}ms`);
    expect(root.style.getPropertyValue('--title-settle')).toBe(`${TITLE.settleMs}ms`);
    expect(root.style.getPropertyValue('--title-prompt-delay')).toBe(`${TITLE.promptDelayMs}ms`);
    expect(root.style.getPropertyValue('--title-pulse')).toBe(`${TITLE.pulseMs}ms`);
  });

  describe('fonts (Review Focus 2)', () => {
    beforeEach(() => vi.useFakeTimers());

    it('document.fonts undefined -> still reaches "lit" within fontWaitMs + sweep + settle', async () => {
      setFonts(undefined);
      screen.show({ motion: true, pointerFine: true, onStart() {} });
      await vi.advanceTimersByTimeAsync(TITLE.fontWaitMs + TITLE.sweepMs + TITLE.settleMs);
      expect(root.dataset.phase).toBe('lit');
    });

    it('load() rejecting -> still reaches "lit" within fontWaitMs + sweep + settle', async () => {
      setFonts({ load: () => Promise.reject(new Error('blocked')) });
      screen.show({ motion: true, pointerFine: true, onStart() {} });
      await vi.advanceTimersByTimeAsync(TITLE.fontWaitMs + TITLE.sweepMs + TITLE.settleMs);
      expect(root.dataset.phase).toBe('lit');
    });

    it('load() throwing synchronously -> still sweeps', async () => {
      setFonts({ load: () => { throw new Error('SyntaxError'); } });
      screen.show({ motion: true, pointerFine: true, onStart() {} });
      await vi.advanceTimersByTimeAsync(0);
      expect(root.dataset.phase).toBe('sweep');
    });

    it('load() that never settles: waits in shadow for fontWaitMs, then sweeps and lights', async () => {
      setFonts({ load: () => new Promise(() => {}) });
      screen.show({ motion: true, pointerFine: true, onStart() {} });
      await vi.advanceTimersByTimeAsync(TITLE.fontWaitMs - 1);
      expect(root.dataset.phase).toBe('waiting');
      expect(root.classList.contains('title-sweep')).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(root.dataset.phase).toBe('sweep');
      expect(root.classList.contains('title-sweep')).toBe(true);
      await vi.advanceTimersByTimeAsync(LIT_AFTER_SWEEP - 1);
      expect(root.dataset.phase).toBe('sweep');
      await vi.advanceTimersByTimeAsync(1);
      expect(root.dataset.phase).toBe('lit');
    });

    it('a font that loads starts the sweep without waiting out the cap', async () => {
      setFonts({ load: () => Promise.resolve([]) });
      screen.show({ motion: true, pointerFine: true, onStart() {} });
      await vi.advanceTimersByTimeAsync(0);
      expect(root.dataset.phase).toBe('sweep');
    });

    it('destroy mid-wait cancels the pending phases', async () => {
      setFonts({ load: () => new Promise(() => {}) });
      screen.show({ motion: true, pointerFine: true, onStart() {} });
      screen.destroy();
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(TITLE.fontWaitMs + LIT_AFTER_SWEEP);
      expect(root.dataset.phase).toBe('waiting');
    });

    it('destroy mid-sweep clears the lit timer', async () => {
      setFonts(undefined);
      screen.show({ motion: true, pointerFine: true, onStart() {} });
      await vi.advanceTimersByTimeAsync(0);
      expect(root.dataset.phase).toBe('sweep');
      screen.destroy();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('a font promise from an earlier show cannot start a later show early', async () => {
      let settleFirst;
      setFonts({ load: () => new Promise((resolve) => { settleFirst ??= resolve; }) });
      screen.show({ motion: true, pointerFine: true, onStart() {} });
      screen.destroy();
      screen.show({ motion: true, pointerFine: true, onStart() {} });
      settleFirst();
      await vi.advanceTimersByTimeAsync(0);
      expect(root.dataset.phase).toBe('waiting');
    });
  });
});
