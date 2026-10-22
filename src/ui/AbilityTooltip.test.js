import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LONG_PRESS_MS, PEEK_LINGER_MS, PANEL_EDGE_MARGIN, PEEK_GAP_PX } from '../data/input.js';
import { AbilityTooltip } from './AbilityTooltip.js';
import { describeAbility } from '../systems/entityDescriptors.js';
import { HEROES } from '../data/heroes.js';

function setupDom() {
  document.body.replaceChildren();
  const card = document.createElement('div');
  card.id = 'ability-card';
  document.body.appendChild(card);
  const anchor = document.createElement('button');
  anchor.id = 'anchor';
  document.body.appendChild(anchor);
  return { card, anchor };
}

describe('AbilityTooltip', () => {
  let dom, tip;
  beforeEach(() => { dom = setupDom(); tip = new AbilityTooltip(); });

  it('shows label, hotkey, cooldown and effect on hover', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q', { level: 1, heroUnlocked: true, cooldownRemaining: 0 }));
    dom.anchor.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
    expect(dom.card.classList.contains('shown')).toBe(true);
    expect(dom.card.textContent).toContain(HEROES.rael.abilities.q.label);
    expect(dom.card.textContent).toContain('Q');
    expect(dom.card.textContent).toContain(`${HEROES.rael.abilities.q.cooldown}s`);
    expect(dom.card.textContent).toContain(HEROES.rael.abilities.q.tooltip);
  });

  it('hides on pointerleave', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    dom.anchor.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
    dom.anchor.dispatchEvent(Object.assign(new Event('pointerleave'), { pointerType: 'mouse' }));
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  // The model is read at hover time, not at attach time, so cooldown and
  // level are always current.
  it('re-reads the model on every hover', () => {
    let level = 1;
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'e', { level, heroUnlocked: true, cooldownRemaining: 0 }));
    dom.anchor.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
    expect(dom.card.textContent).toContain('Unlocks at level 3');
    dom.anchor.dispatchEvent(Object.assign(new Event('pointerleave'), { pointerType: 'mouse' }));
    level = 3;
    dom.anchor.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
    expect(dom.card.textContent).not.toContain('Unlocks at level 3');
  });

  it('shows remaining cooldown', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q', { level: 1, heroUnlocked: true, cooldownRemaining: 9 }));
    dom.anchor.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
    expect(dom.card.textContent).toContain('9s');
  });

  it('shows the hero unlock condition for a locked hero', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.scout, 'q', { level: 1, heroUnlocked: false }));
    dom.anchor.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
    expect(dom.card.textContent).toContain(`Clear Map ${HEROES.scout.unlockMapAfter + 1}`);
  });

  // :focus-visible is true only for keyboard focus; jsdom always says false, so stub it.
  it('opens on KEYBOARD focusin and closes on focusout', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    dom.anchor.matches = () => true;
    dom.anchor.dispatchEvent(new Event('focusin'));
    expect(dom.card.classList.contains('shown')).toBe(true);
    dom.anchor.dispatchEvent(new Event('focusout'));
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  it('does not open on a pointer-initiated focusin (:focus-visible false)', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    dom.anchor.matches = () => false;
    dom.anchor.dispatchEvent(new Event('focusin'));
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  it('treats an engine without :focus-visible (matches throws) as keyboard focus', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    dom.anchor.matches = () => { throw new SyntaxError('unknown pseudo'); };
    dom.anchor.dispatchEvent(new Event('focusin'));
    expect(dom.card.classList.contains('shown')).toBe(true);
  });

  it('ignores pen pointerenter (hover is mouse-only, like the tower button)', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    dom.anchor.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'pen' }));
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  // I1: the card is display:none until shown, so it must be measured AFTER the
  // shown class lands, and clamped into the viewport on every edge. The ability
  // buttons live in the LEFT rail, so the card opens to their right, over the map.
  describe('positioning', () => {
    const rect = (r) => { dom.anchor.getBoundingClientRect = () => ({ left: 40, top: 150, width: 45, height: 45, ...r }); };
    const stubSize = (w, h) => {
      // offsetWidth/Height read 0 unless the card is shown (mimics display:none).
      Object.defineProperty(dom.card, 'offsetHeight', { configurable: true, get: () => dom.card.classList.contains('shown') ? h : 0 });
      Object.defineProperty(dom.card, 'offsetWidth',  { configurable: true, get: () => dom.card.classList.contains('shown') ? w : 0 });
    };
    beforeEach(() => {
      window.innerWidth = 800; window.innerHeight = 400;
      tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
      stubSize(200, 120);
    });
    const hover = () => dom.anchor.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));

    it('opens to the right of the anchor, vertically centred on it by its real height', () => {
      rect({});
      hover();
      expect(dom.card.style.left).toBe(`${40 + 45 + PEEK_GAP_PX}px`);
      expect(dom.card.style.top).toBe(`${150 + (45 - 120) / 2}px`);
    });
    it('clamps the bottom edge (anchor low, card cannot go below)', () => {
      rect({ top: 5000 });
      hover();
      expect(dom.card.style.top).toBe(`${400 - 120 - PANEL_EDGE_MARGIN}px`);
    });
    it('clamps the top edge', () => {
      rect({ top: 0 });
      hover();
      expect(dom.card.style.top).toBe(`${PANEL_EDGE_MARGIN}px`);
    });
    it('clamps the right edge', () => {
      rect({ left: 790 });
      hover();
      expect(dom.card.style.left).toBe(`${800 - 200 - PANEL_EDGE_MARGIN}px`);
    });
  });

  // The ability HUD attaches to a wrapper span around the (sometimes disabled)
  // button, so focus lands on a child inside the anchor, not the anchor
  // itself. focus/blur don't bubble; focusin/focusout do — this is the whole
  // reason the switch was made.
  it('shows the card when a focusable child inside the anchor receives focus, via bubbling focusin', () => {
    const wrap  = document.createElement('span');
    const child = document.createElement('button');
    wrap.appendChild(child);
    document.body.appendChild(wrap);

    tip.attach(wrap, () => describeAbility(HEROES.rael, 'q'));
    child.focus();
    expect(dom.card.classList.contains('shown')).toBe(true);
    child.blur();
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  it('closes on Escape', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    dom.anchor.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  it('stays hidden when the model getter returns null', () => {
    tip.attach(dom.anchor, () => null);
    dom.anchor.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  it('removes every listener on detachAll', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    tip.detachAll();
    dom.anchor.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  it('supports several anchors at once', () => {
    const second = document.createElement('button');
    document.body.appendChild(second);
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    tip.attach(second,     () => describeAbility(HEROES.rael, 'w'));
    second.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
    expect(dom.card.textContent).toContain(HEROES.rael.abilities.w.label);
  });

  // Task 11/12 re-render by calling detachAll() then attach() again on every
  // update, so a leak here would double (then triple, then...) every anchor's
  // listeners across re-renders — the exact shape of the past listener-leak bug.
  it('leaves exactly one listener set after a detachAll/attach cycle', () => {
    let calls = 0;
    const getModel = () => { calls++; return describeAbility(HEROES.rael, 'q'); };
    tip.attach(dom.anchor, getModel);
    tip.detachAll();
    tip.attach(dom.anchor, getModel);
    dom.anchor.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
    expect(calls).toBe(1);
  });

  // Two live AbilityTooltip instances (HUD + Hero Command) would each add
  // their own document keydown listener and both write to the same shared
  // #ability-card — harmless for hide() (idempotent) but a hover in one
  // instance followed by Escape is handled redundantly by both instances'
  // listeners. Exercised here to document that the second instance's hide()
  // does not error or throw when the first instance already hid the card.
  it('tolerates a second instance sharing the same card element', () => {
    const second = new AbilityTooltip();
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    dom.anchor.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
    expect(dom.card.classList.contains('shown')).toBe(true);
    second.hide();
    expect(dom.card.classList.contains('shown')).toBe(false);
    second.detachAll();
  });
});

describe('AbilityTooltip touch', () => {
  const model = { icon: 'x', label: 'Zap', hotkey: 'Q', effect: 'e', state: 'ready', cooldown: 5 };
  const touch = (type) => Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerType: 'touch' });
  let dom, tip, ownerClick;
  beforeEach(() => {
    vi.useFakeTimers();
    dom = setupDom();
    ownerClick = vi.fn();
    dom.anchor.addEventListener('click', ownerClick);
    tip = new AbilityTooltip();
    tip.attach(dom.anchor, () => model);
  });
  afterEach(() => { tip.destroy(); vi.useRealTimers(); });
  const shown = () => dom.card.classList.contains('shown');

  it('a touch pointerenter (every tap fires one) does not flash the card', () => {
    dom.anchor.dispatchEvent(touch('pointerenter'));
    expect(shown()).toBe(false);
  });

  it('a long-press shows the card, swallows the click, and hides after the linger', () => {
    dom.anchor.dispatchEvent(touch('pointerdown'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(shown()).toBe(true);
    dom.anchor.dispatchEvent(touch('pointerup'));
    expect(shown()).toBe(true);
    dom.anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(ownerClick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PEEK_LINGER_MS);
    expect(shown()).toBe(false);
  });

  it('a plain tap does not show the card and the click goes through', () => {
    dom.anchor.dispatchEvent(touch('pointerdown'));
    dom.anchor.dispatchEvent(touch('pointerup'));
    dom.anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(shown()).toBe(false);
    expect(ownerClick).toHaveBeenCalledTimes(1);
  });

  it('detachAll removes the long-press', () => {
    tip.detachAll();
    dom.anchor.dispatchEvent(touch('pointerdown'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(shown()).toBe(false);
  });
});
