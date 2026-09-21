import { describe, it, expect, beforeEach } from 'vitest';
import { WavePreviewPopover } from './WavePreviewPopover.js';
import { summarizeWave } from '../systems/wavePreview.js';
import { MAP_WAVES }  from '../data/waves.js';
import { ENEMY_DEFS } from '../data/enemies.js';

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
    dom.wrap.dispatchEvent(new Event('pointerenter'));
    expect(dom.pop.classList.contains('shown')).toBe(true);
    dom.wrap.dispatchEvent(new Event('pointerleave'));
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  it('opens on focusin and closes on focusout', () => {
    popover.setWave(summarizeWave(0, 0));
    dom.wrap.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(dom.pop.classList.contains('shown')).toBe(true);
    dom.wrap.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  // focus/blur don't bubble, so a naive listener on the wrapper would close
  // the instant keyboard focus moved from the wrapper onto the button inside
  // it. focusin/focusout bubble, so focus reaching the button must still
  // count as focus "inside" and keep the popover open.
  it('opens on a bubbling focusin from the Send Wave button', () => {
    popover.setWave(summarizeWave(0, 0));
    dom.btn.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(dom.pop.classList.contains('shown')).toBe(true);
  });

  it('closes on Escape', () => {
    popover.setWave(summarizeWave(0, 0));
    popover.show();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  // Touch has no hover. A tap must open it, and a tap elsewhere must dismiss it.
  it('toggles on a touch tap of the wrapper', () => {
    popover.setWave(summarizeWave(0, 0));
    const tap = () => dom.wrap.dispatchEvent(
      Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType: 'touch' }));
    tap();
    expect(dom.pop.classList.contains('shown')).toBe(true);
    tap();
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  // pointerdown on #wave-btn bubbles up through the wrapper. A touch tap on
  // Send Wave must send the wave and nothing else — not open a popover that
  // then sits over the wave the button's own click handler just started.
  it('does not open on a touch tap of the Send Wave button itself', () => {
    popover.setWave(summarizeWave(0, 0));
    dom.btn.dispatchEvent(
      Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType: 'touch' }));
    expect(dom.pop.classList.contains('shown')).toBe(false);
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
    dom.wrap.dispatchEvent(new Event('pointerleave'));
    expect(dom.pop.classList.contains('shown')).toBe(true);

    forceShown();
    dom.wrap.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(dom.pop.classList.contains('shown')).toBe(true);

    forceShown();
    dom.wrap.dispatchEvent(
      Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType: 'touch' }));
    expect(dom.pop.classList.contains('shown')).toBe(true);

    forceShown();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(dom.pop.classList.contains('shown')).toBe(true);

    forceShown();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dom.pop.classList.contains('shown')).toBe(true);

    // pointerenter/focusin must not resurrect it either.
    dom.pop.classList.remove('shown');
    dom.wrap.dispatchEvent(new Event('pointerenter'));
    expect(dom.pop.classList.contains('shown')).toBe(false);
    dom.wrap.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(dom.pop.classList.contains('shown')).toBe(false);
  });

  it('survives construction when the DOM is absent', () => {
    document.body.replaceChildren();
    const orphan = new WavePreviewPopover();
    expect(() => { orphan.setWave(summarizeWave(0, 0)); orphan.show(); orphan.destroy(); }).not.toThrow();
  });
});
