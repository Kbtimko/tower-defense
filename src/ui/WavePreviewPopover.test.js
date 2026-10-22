import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LONG_PRESS_MS, PANEL_EDGE_MARGIN } from '../data/input.js';
import { WavePreviewPopover } from './WavePreviewPopover.js';
import { summarizeWave } from '../systems/wavePreview.js';
import { MAP_WAVES }  from '../data/waves.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { describeEnemy } from '../systems/entityDescriptors.js';

// Wave composition is balance data and HAS been retuned mid-project. Derive
// every expected count from the table instead of hardcoding it, or this file
// goes red on the next rebalance for no correctness reason.
const countOf = (mapId, waveIdx, type) =>
  MAP_WAVES[mapId][waveIdx].find(g => g.type === type).count;
const firstWaveWith = (mapId, type) =>
  MAP_WAVES[mapId].findIndex(w => w.some(g => g.type === type));

function setupDom() {
  document.body.replaceChildren();
  const wrap = document.createElement('span');
  wrap.id = 'wave-btn-wrap';
  const btn = document.createElement('button');
  btn.id = 'wave-btn';
  const pop = document.createElement('div');
  pop.id = 'wave-preview';
  wrap.append(btn, pop);
  document.body.appendChild(wrap);
  return { wrap, btn, pop };
}

describe('WavePreviewPopover', () => {
  let dom, popover;
  beforeEach(() => { dom = setupDom(); popover = new WavePreviewPopover(); });

  it('renders one row per enemy type with counts', () => {
    popover.setWave(summarizeWave(0, 1));   // drones + skitters
    popover.show();
    expect(dom.pop.classList.contains('shown')).toBe(true);
    const rows = dom.pop.querySelectorAll('.wp-row');
    expect(rows.length).toBe(2);
    expect(dom.pop.textContent).toContain('Veth Drone');
    const counts = [...dom.pop.querySelectorAll('.wp-count')].map(el => el.textContent);
    expect(counts).toContain(`×${countOf(0, 1, 'drone')}`);
    expect(counts).toContain(`×${countOf(0, 1, 'skitter')}`);
  });

  it('shows the wave number and total', () => {
    popover.setWave(summarizeWave(0, 1));
    const total = MAP_WAVES[0][1].reduce((n, g) => n + g.count, 0);
    expect(dom.pop.textContent).toContain('Wave 2');
    expect(dom.pop.textContent).toContain(String(total));
  });

  it('shows stats and matchup lines', () => {
    popover.setWave(summarizeWave(0, firstWaveWith(0, 'brute')));
    expect(dom.pop.textContent).toContain(`${ENEMY_DEFS.brute.hp} HP`);
    expect(dom.pop.textContent.toLowerCase()).toContain('cannon');
  });

  // The actual bug: Vex and Mira are heroes, not towers, and a flat comma
  // list gave a player no way to tell them apart from a buildable Mage.
  it('distinguishes hero counters from tower counters in a wave matchup line', () => {
    popover.setWave(summarizeWave(0, firstWaveWith(0, 'drone')));

    const { vulnerableTo } = describeEnemy('drone');
    const towerNames = vulnerableTo.filter(e => e.kind === 'tower').map(e => e.name);
    const heroNames  = vulnerableTo.filter(e => e.kind === 'hero').map(e => e.name);
    // Guards the regression: this only proves the fix if Drone actually has
    // a hero among its counters (it does — Vex and Mira).
    expect(heroNames.length).toBeGreaterThan(0);

    expect(dom.pop.textContent).toContain(`weak to ${towerNames.join(', ')} (heroes: ${heroNames.join(', ')})`);
  });

  it('marks flying enemies', () => {
    popover.setWave(summarizeWave(3, firstWaveWith(3, 'phantom')));
    expect(dom.pop.textContent.toLowerCase()).toContain('flying');
  });

  it('marks ground enemies', () => {
    popover.setWave(summarizeWave(0, firstWaveWith(0, 'drone')));
    expect(dom.pop.textContent.toLowerCase()).toContain('ground');
  });

  // No next wave: show nothing at all, not an empty frame.
  it('stays hidden when the wave is null', () => {
    popover.setWave(null);
    popover.show();
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  it('opens on pointerenter of the wrapper and closes on pointerleave', () => {
    popover.setWave(summarizeWave(0, 0));
    dom.wrap.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
    expect(dom.pop.classList.contains('shown')).toBe(true);
    dom.wrap.dispatchEvent(Object.assign(new Event('pointerleave'), { pointerType: 'mouse' }));
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  it('opens on KEYBOARD focusin and closes on focusout', () => {
    popover.setWave(summarizeWave(0, 0));
    dom.wrap.matches = () => true;   // jsdom has no real :focus-visible
    dom.wrap.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(dom.pop.classList.contains('shown')).toBe(true);
    dom.wrap.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  // focus/blur don't bubble, so a naive listener on the wrapper would close
  // the instant keyboard focus moved from the wrapper onto the button inside
  // it. focusin/focusout bubble, so focus reaching the button must still
  // count as focus "inside" and keep the popover open.
  it('does not open on a pointer-initiated focusin (a tap focuses the tabindex wrapper)', () => {
    popover.setWave(summarizeWave(0, 0));
    dom.wrap.matches = () => false;
    dom.wrap.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  it('ignores pen pointerenter', () => {
    popover.setWave(summarizeWave(0, 0));
    dom.wrap.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'pen' }));
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  it('opens on a bubbling focusin from the Send Wave button', () => {
    popover.setWave(summarizeWave(0, 0));
    dom.btn.matches = () => true;
    dom.btn.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(dom.pop.classList.contains('shown')).toBe(true);
  });

  it('closes on Escape', () => {
    popover.setWave(summarizeWave(0, 0));
    popover.show();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  // Touch has no hover: a long-press (on the wrapper, including over the
  // button) opens it; a plain tap must not, and must still send the wave.
  describe('touch', () => {
    const touch = (type) => Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerType: 'touch' });
    const shown = () => dom.pop.classList.contains('shown');
    beforeEach(() => { vi.useFakeTimers(); popover.setWave(summarizeWave(0, 0)); });
    afterEach(() => vi.useRealTimers());

    it('a long-press on the wrapper padding opens it', () => {
      dom.wrap.dispatchEvent(touch('pointerdown'));
      vi.advanceTimersByTime(LONG_PRESS_MS);
      expect(shown()).toBe(true);
    });

    it('a long-press on Send Wave opens the preview and swallows the click, so the wave is not sent', () => {
      const send = vi.fn();
      dom.btn.addEventListener('click', send);
      dom.btn.dispatchEvent(touch('pointerdown'));
      vi.advanceTimersByTime(LONG_PRESS_MS);
      dom.btn.dispatchEvent(touch('pointerup'));
      dom.btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(shown()).toBe(true);
      expect(send).not.toHaveBeenCalled();
    });

    it('a plain tap on Send Wave does not open it and the click goes through', () => {
      const send = vi.fn();
      dom.btn.addEventListener('click', send);
      dom.btn.dispatchEvent(touch('pointerdown'));
      dom.btn.dispatchEvent(touch('pointerup'));
      dom.btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      vi.advanceTimersByTime(LONG_PRESS_MS);
      expect(shown()).toBe(false);
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('a touch pointerenter (fired by every tap) does not open it', () => {
      dom.wrap.dispatchEvent(touch('pointerenter'));
      expect(shown()).toBe(false);
    });
  });

  it('dismisses on a pointerdown outside the wrapper', () => {
    popover.setWave(summarizeWave(0, 0));
    popover.show();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  // A mouse click on Send Wave must start the wave, not toggle a popover.
  it('does not toggle on a mouse pointerdown', () => {
    popover.setWave(summarizeWave(0, 0));
    popover.show();
    dom.wrap.dispatchEvent(
      Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType: 'mouse' }));
    expect(dom.pop.classList.contains('shown')).toBe(true);
  });

  it('keeps aria-hidden in step with visibility', () => {
    popover.setWave(summarizeWave(0, 0));
    popover.show();
    expect(dom.pop.getAttribute('aria-hidden')).toBe('false');
    popover.hide();
    expect(dom.pop.getAttribute('aria-hidden')).toBe('true');
  });

  // The leak this repo already shipped once: listeners that outlive their owner.
  it('removes every listener on destroy', () => {
    popover.setWave(summarizeWave(0, 0));
    popover.destroy();

    // destroy() clears _summary, so show() itself now no-ops — that would mask
    // a leaked hide-triggering listener. Force the "shown" class directly so
    // any listener still attached shows up as unwanted class churn.
    const forceShown = () => {
      dom.pop.classList.add('shown');
      dom.pop.setAttribute('aria-hidden', 'false');
    };

    forceShown();
    dom.wrap.dispatchEvent(Object.assign(new Event('pointerleave'), { pointerType: 'mouse' }));
    expect(dom.pop.classList.contains('shown')).toBe(true);

    forceShown();
    dom.wrap.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(dom.pop.classList.contains('shown')).toBe(true);

    // show() no-ops once the summary is cleared, so spy on the call itself: a
    // long-press listener left behind would still invoke it after the hold.
    vi.useFakeTimers();
    const showSpy = vi.spyOn(popover, 'show');
    dom.wrap.dispatchEvent(
      Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType: 'touch' }));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    vi.useRealTimers();
    expect(showSpy).not.toHaveBeenCalled();
    forceShown();

    forceShown();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(dom.pop.classList.contains('shown')).toBe(true);

    forceShown();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dom.pop.classList.contains('shown')).toBe(true);

    // pointerenter/focusin must not resurrect it either.
    dom.pop.classList.remove('shown');
    dom.wrap.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
    expect(dom.pop.classList.contains('shown')).toBe(false);
    dom.wrap.matches = () => true;
    dom.wrap.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  it('survives construction when the DOM is absent', () => {
    document.body.replaceChildren();
    const orphan = new WavePreviewPopover();
    expect(() => { orphan.setWave(summarizeWave(0, 0)); orphan.show(); orphan.destroy(); }).not.toThrow();
  });
});

// The popover lives inside #wave-btn-wrap in the scaled HUD layer (game px) and
// opens to the left of Send Wave (CSS); its vertical position is centred on the
// button and clamped into the layer, which jsdom cannot lay out, so the offsets
// are stubbed in layer px.
describe('WavePreviewPopover vertical placement', () => {
  const LAYER_H = 720;
  const define = (el, props) => {
    for (const [k, v] of Object.entries(props)) Object.defineProperty(el, k, { configurable: true, get: typeof v === 'function' ? v : () => v });
  };
  let dom, popover;
  const mount = (wrapTop, popH) => {
    document.body.replaceChildren();
    const layer = document.createElement('div');
    layer.id = 'hud-layer';
    dom = setupDom();
    layer.appendChild(dom.wrap);
    document.body.appendChild(layer);
    define(layer, { offsetHeight: LAYER_H });
    define(dom.wrap, { offsetParent: layer, offsetTop: wrapTop, offsetHeight: 88 });
    define(dom.pop, { offsetHeight: () => (dom.pop.classList.contains('shown') ? popH : 0) });
    popover = new WavePreviewPopover();
    popover.setWave(summarizeWave(0, 1));
  };
  afterEach(() => popover?.destroy());

  it('centres on the button, measured after it is shown', () => {
    mount(448, 400);
    popover.show();
    expect(dom.pop.style.top).toBe(`${448 + (88 - 400) / 2 - 448}px`);
  });

  it('clamps a tall popover inside the bottom of the layer', () => {
    mount(448, 680);
    popover.show();
    expect(dom.pop.style.top).toBe(`${LAYER_H - 680 - PANEL_EDGE_MARGIN - 448}px`);
  });

  it('clamps inside the top of the layer', () => {
    mount(0, 400);
    popover.show();
    expect(dom.pop.style.top).toBe(`${PANEL_EDGE_MARGIN}px`);
  });
});
