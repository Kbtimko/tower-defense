import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RadialMenu, RADIAL_HUB } from './RadialMenu.js';
import { buildItems } from '../systems/radialItems.js';
import { radialMetrics } from '../systems/radialLayout.js';
import { TOWER_DEFS } from '../data/towers.js';
import { RAIL_WIDTH, HUD_CELL, WORLD_WIDTH, WORLD_HEIGHT } from '../data/layout.js';
import { CONFIRM_WINDOW_MS, LONG_PRESS_MS } from '../data/input.js';
import { RADIAL_MARGIN } from '../data/radial.js';

// The real #radial markup from index.html, mounted inside a #hud-layer, so the
// presenter is tested against what ships rather than a hand-built copy.
const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
const shipped = new DOMParser().parseFromString(html, 'text/html').getElementById('radial');

function mount() {
  document.body.replaceChildren();
  const layer = document.createElement('div');
  layer.id = 'hud-layer';
  layer.appendChild(document.importNode(shipped, true));
  document.body.appendChild(layer);
  return document.getElementById('radial');
}

const ptr = (type, pointerType) =>
  Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerType, clientX: 0, clientY: 0 });
const click = (detail = 1) => new MouseEvent('click', { bubbles: true, cancelable: true, detail });
// A real press: pointerdown, pointerup, then the browser's click.
function press(el, pointerType) {
  el.dispatchEvent(ptr('pointerdown', pointerType));
  el.dispatchEvent(ptr('pointerup', pointerType));
  el.dispatchEvent(click());
}
const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

const item = (id, over = {}) => ({
  id, slot: { upgrade: -90, branchA: -120, branchB: -60, reposition: 180, sell: 90 }[id] ?? 0,
  label: id, cost: null, variant: 'currency', state: 'ready', ariaLabel: `${id} aria`, ...over,
});
const ring = (over = {}) => [
  item('upgrade', { label: '⬆ Longbow', cost: 120, tier: 2, range: 135, ...over.upgrade }),
  item('sell', { label: '💰 +36g', variant: 'danger', ...over.sell }),
];
const HUB = ['T1', 'DMG 10', 'RNG 120'];

const $item = (id) => document.querySelector(`.radial-item[data-id="${id}"]`);
const $hub = () => document.getElementById('radial-hub');
const caption = (el) => el.querySelector('.radial-label').textContent;
const hubText = () => [...$hub().querySelectorAll('.radial-hub-line')].map((s) => s.textContent);

describe('RadialMenu', () => {
  let root, cb, menu;
  beforeEach(() => {
    vi.useFakeTimers();
    root = mount();
    cb = { onActivate: vi.fn(), onPreview: vi.fn(), onPeek: vi.fn() };
    menu = new RadialMenu(document, cb);
  });
  afterEach(() => { menu.destroy(); vi.useRealTimers(); });

  // The user's finger has to come down on the radial after it appeared.
  const openRing = (items = ring(), extra = {}) => {
    menu.open({ kind: 'tower', anchor: { x: 640, y: 360 }, items, hub: HUB, ...extra });
  };

  describe('markup and open', () => {
    it('ships hidden: a hub and 6 kit items, none using the disabled attribute', () => {
      expect(shipped.hidden).toBe(true);
      expect(shipped.querySelectorAll('.radial-item').length).toBe(6);
      expect(shipped.querySelector('#radial-hub.ui-btn')).not.toBeNull();
      expect(shipped.querySelectorAll('[disabled]').length).toBe(0);
      // DOM order is slot order then the hub, so Tab matches the arrow keys.
      expect(shipped.lastElementChild.id).toBe('radial-hub');
    });

    it('build: renders every item in order with cost, variant and affordability', () => {
      const items = buildItems({ towerDefs: TOWER_DEFS, gold: 90 });
      menu.open({ kind: 'build', anchor: { x: 640, y: 360 }, items, hub: ['Build'], target: { slot: 1 } });
      expect(menu.isOpen).toBe(true);
      expect(menu.kind).toBe('build');
      expect(menu.target).toEqual({ slot: 1 });
      expect(root.hidden).toBe(false);
      expect(root.dataset.kind).toBe('build');
      const shown = [...root.querySelectorAll('.radial-item:not([hidden])')];
      expect(shown.map((b) => b.dataset.id)).toEqual(items.map((i) => i.id));
      const archer = $item('build:archer');
      expect(archer.classList.contains('ui-btn--currency')).toBe(true);
      expect(archer.getAttribute('aria-label')).toBe('Build Archer, 60 gold');
      expect(archer.textContent).toContain('60g');
      expect(archer.textContent).toContain(TOWER_DEFS.archer.icon);
      expect(archer.hasAttribute('aria-disabled')).toBe(false);
      const sniper = $item('build:sniper');                // 120g > 90 gold
      expect(sniper.classList.contains('is-disabled')).toBe(true);
      expect(sniper.getAttribute('aria-disabled')).toBe('true');
      expect(sniper.disabled).toBe(false);
      expect(hubText()).toEqual(['Build']);
    });

    it('ring: unused slots are hidden; locked and maxed items are aria-disabled', () => {
      openRing([item('upgrade', { label: '🔒 Map 3', state: 'locked', cost: 300 }), item('sell', { variant: 'danger' })]);
      expect(root.querySelectorAll('.radial-item:not([hidden])').length).toBe(2);
      expect($item('upgrade').classList.contains('is-disabled')).toBe(true);
      expect($item('upgrade').getAttribute('aria-disabled')).toBe('true');
      expect($item('sell').classList.contains('ui-btn--danger')).toBe(true);
      expect(hubText()).toEqual(HUB);
      openRing([item('upgrade', { label: 'MAX', state: 'maxed' }), item('sell')]);
      expect($item('upgrade').classList.contains('maxed')).toBe(true);
      expect($item('upgrade').getAttribute('aria-disabled')).toBe('true');
    });

    it('positions in layer px: world point + RAIL_WIDTH, centre clamped at a corner', () => {
      const m = radialMetrics(HUD_CELL);
      openRing(ring(), { anchor: { x: 640, y: 360 } });
      expect($hub().style.left).toBe(`${RAIL_WIDTH + 640}px`);
      expect($hub().style.top).toBe('360px');
      expect($item('upgrade').style.left).toBe(`${RAIL_WIDTH + 640}px`);
      expect($item('upgrade').style.top).toBe(`${360 - m.radius}px`);
      openRing(ring(), { anchor: { x: 0, y: 0 } });
      const top = parseFloat($item('upgrade').style.top);
      expect(top - m.item / 2).toBeGreaterThanOrEqual(RADIAL_MARGIN - 1e-9);
      const left = parseFloat($hub().style.left) - RAIL_WIDTH;
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThan(WORLD_WIDTH);
      expect(parseFloat($hub().style.top)).toBeLessThan(WORLD_HEIGHT);
    });

    it('close hides, clears kind/target, clears preview and drops focus', () => {
      openRing(ring(), { target: { id: 7 } });
      $item('sell').focus();
      menu.close();
      expect(root.hidden).toBe(true);
      expect(menu.isOpen).toBe(false);
      expect(menu.kind).toBeNull();
      expect(menu.target).toBeNull();
      expect(root.contains(document.activeElement)).toBe(false);
      expect(cb.onPreview).toHaveBeenLastCalledWith(null);
    });
  });

  describe('opening-release guard', () => {
    it('the release/click that opened the radial does not activate the item under the finger', () => {
      menu.open({ kind: 'build', anchor: { x: 640, y: 360 }, items: buildItems({ towerDefs: TOWER_DEFS, gold: 999 }), hub: ['Build'] });
      // The opening tap's pointerdown was on the canvas; only its up + compat click land here.
      $item('build:archer').dispatchEvent(ptr('pointerup', 'touch'));
      $item('build:archer').dispatchEvent(click());
      expect(cb.onActivate).not.toHaveBeenCalled();
      press($item('build:archer'), 'touch');
      expect(cb.onActivate).toHaveBeenCalledTimes(1);
      expect(cb.onActivate.mock.calls[0][0].id).toBe('build:archer');
    });

    it('a pointerdown before a retarget does not count for the new radial', () => {
      openRing();
      $item('sell').dispatchEvent(ptr('pointerdown', 'mouse'));
      openRing();                                    // retarget
      $item('sell').dispatchEvent(click());
      expect(cb.onActivate).not.toHaveBeenCalled();
    });

    it('keyboard activation (detail 0) needs no pointerdown', () => {
      openRing();
      $item('upgrade').dispatchEvent(click(0));
      expect(cb.onActivate).toHaveBeenCalledTimes(1);
    });
  });

  describe('activation', () => {
    it('build items activate on one touch tap (no confirm)', () => {
      menu.open({ kind: 'build', anchor: { x: 640, y: 360 }, items: buildItems({ towerDefs: TOWER_DEFS, gold: 999 }), hub: ['Build'] });
      press($item('build:mage'), 'touch');
      expect(cb.onActivate).toHaveBeenCalledTimes(1);
    });

    it('reposition activates on one touch tap', () => {
      openRing([item('reposition', { variant: 'primary' }), ...ring()]);
      press($item('reposition'), 'touch');
      expect(cb.onActivate.mock.calls[0][0].id).toBe('reposition');
    });

    it('an aria-disabled item stays focusable and only reports itself (the owner toasts), never arms', () => {
      openRing(ring({ upgrade: { state: 'disabled' } }));
      $item('upgrade').focus();
      expect(document.activeElement).toBe($item('upgrade'));
      press($item('upgrade'), 'touch');
      expect(cb.onActivate).toHaveBeenCalledTimes(1);
      expect(cb.onActivate.mock.calls[0][0].state).toBe('disabled');
      expect($item('upgrade').classList.contains('confirming')).toBe(false);
    });

    it('the hub reports a hub activation', () => {
      openRing();
      press($hub(), 'touch');
      expect(cb.onActivate).toHaveBeenCalledWith({ id: RADIAL_HUB });
    });
  });

  // Ported from GameScene.touchInput.test.js "touch two-step confirm".
  describe('touch two-step confirm', () => {
    beforeEach(() => openRing());

    it('touch: first press arms ("Tap again" + hub prompt + peek), second executes', () => {
      press($item('upgrade'), 'touch');
      expect(cb.onActivate).not.toHaveBeenCalled();
      expect($item('upgrade').classList.contains('confirming')).toBe(true);
      expect(caption($item('upgrade'))).toBe('Tap again');
      expect(hubText()).toEqual(['Tap again: ⬆ Longbow']);
      expect(cb.onPeek).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'upgrade' }), expect.any(Object));
      press($item('upgrade'), 'touch');
      expect(cb.onActivate).toHaveBeenCalledTimes(1);
      expect($item('upgrade').classList.contains('confirming')).toBe(false);
      expect(caption($item('upgrade'))).toBe('⬆ Longbow');
      expect(hubText()).toEqual(HUB);
    });

    it('pen behaves like touch', () => {
      press($item('sell'), 'pen');
      expect(cb.onActivate).not.toHaveBeenCalled();
      expect(caption($item('sell'))).toBe('Tap again');
    });

    it('mouse executes on the first click and never arms', () => {
      press($item('upgrade'), 'mouse');
      expect(cb.onActivate).toHaveBeenCalledTimes(1);
      expect($item('upgrade').classList.contains('confirming')).toBe(false);
    });

    it('a keyboard activation (click with detail 0) executes at once despite a stale touch pointerType', () => {
      $item('upgrade').dispatchEvent(ptr('pointerdown', 'touch'));
      $item('upgrade').dispatchEvent(click(0));
      expect(cb.onActivate).toHaveBeenCalledTimes(1);
    });

    it('reverts after CONFIRM_WINDOW_MS (peek hidden), and a later press re-arms', () => {
      press($item('upgrade'), 'touch');
      vi.advanceTimersByTime(CONFIRM_WINDOW_MS);
      expect($item('upgrade').classList.contains('confirming')).toBe(false);
      expect(caption($item('upgrade'))).toBe('⬆ Longbow');
      expect(hubText()).toEqual(HUB);
      expect(cb.onPeek).toHaveBeenLastCalledWith(null);
      press($item('upgrade'), 'touch');
      expect(cb.onActivate).not.toHaveBeenCalled();
      expect($item('upgrade').classList.contains('confirming')).toBe(true);
    });

    it('pressing the other item disarms the first and arms the second', () => {
      press($item('upgrade'), 'touch');
      press($item('sell'), 'touch');
      expect($item('upgrade').classList.contains('confirming')).toBe(false);
      expect(caption($item('upgrade'))).toBe('⬆ Longbow');
      expect($item('sell').classList.contains('confirming')).toBe(true);
      press($item('upgrade'), 'touch');            // must re-arm, not confirm
      expect(cb.onActivate).not.toHaveBeenCalled();
    });

    it('close disarms: the next press after reopening arms again', () => {
      press($item('upgrade'), 'touch');
      menu.close();
      expect($item('upgrade').classList.contains('confirming')).toBe(false);
      openRing();
      press($item('upgrade'), 'touch');
      expect(cb.onActivate).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(1);          // only the new arm's revert
    });

    it('retarget disarms: tower B does not upgrade on one tap with A\'s armed gate', () => {
      press($item('upgrade'), 'touch');
      openRing(ring(), { target: { id: 2 } });
      expect($item('upgrade').classList.contains('confirming')).toBe(false);
      press($item('upgrade'), 'touch');
      expect(cb.onActivate).not.toHaveBeenCalled();
      expect($item('upgrade').classList.contains('confirming')).toBe(true);
    });

    it('branch items use the same gate, keyed per branch', () => {
      openRing([item('branchA', { label: 'Frost', cost: 300 }), item('branchB', { label: 'Shard', cost: 300 }), item('sell')]);
      press($item('branchA'), 'touch');
      expect(caption($item('branchA'))).toBe('Tap again');
      press($item('branchB'), 'touch');
      expect(cb.onActivate).not.toHaveBeenCalled();
      expect(caption($item('branchA'))).toBe('Frost');
      press($item('branchB'), 'touch');
      expect(cb.onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: 'branchB' }));
    });

    it('destroy clears an armed item and cancels the timer', () => {
      press($item('upgrade'), 'touch');
      menu.destroy();
      expect($item('upgrade')).toBeNull();          // data-id stripped
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('refresh', () => {
    it('gold change: states re-derive in place; focus and an armed confirm survive', () => {
      openRing(ring({ upgrade: { state: 'disabled' } }));
      $item('sell').focus();
      press($item('sell'), 'touch');
      menu.refresh(ring(), HUB);                   // gold rose: upgrade affordable
      expect($item('upgrade').classList.contains('is-disabled')).toBe(false);
      expect($item('upgrade').hasAttribute('aria-disabled')).toBe(false);
      expect(document.activeElement).toBe($item('sell'));
      expect($item('sell').classList.contains('confirming')).toBe(true);
      expect(caption($item('sell'))).toBe('Tap again');
      expect(hubText()).toEqual(['Tap again: 💰 +36g']);
      press($item('sell'), 'touch');
      expect(cb.onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: 'sell' }));
    });

    it('the armed item turning unaffordable disarms it', () => {
      openRing();
      press($item('upgrade'), 'touch');
      menu.refresh(ring({ upgrade: { state: 'disabled' } }), HUB);
      expect($item('upgrade').classList.contains('confirming')).toBe(false);
      expect($item('upgrade').classList.contains('is-disabled')).toBe(true);
      expect(caption($item('upgrade'))).toBe('⬆ Longbow');
      expect(vi.getTimerCount()).toBe(0);
      press($item('upgrade'), 'touch');            // disabled: report only
      expect(cb.onActivate.mock.calls[0][0].state).toBe('disabled');
    });

    it('a re-render (upgrade bought) disarms and keeps focus on the same slot', () => {
      openRing();
      $item('upgrade').focus();
      press($item('upgrade'), 'touch');
      menu.refresh(ring({ upgrade: { label: '⬆ Ranger', cost: 200, tier: 3 } }), ['T2', 'DMG 15', 'RNG 135']);
      expect($item('upgrade').classList.contains('confirming')).toBe(false);
      expect(caption($item('upgrade'))).toBe('⬆ Ranger');
      expect(hubText()).toEqual(['T2', 'DMG 15', 'RNG 135']);
      expect(document.activeElement).toBe($item('upgrade'));
    });

    it('T3: focus on upgrade moves to branch A; a vanished slot sends focus to the hub', () => {
      openRing();
      $item('upgrade').focus();
      menu.refresh([item('branchA', { label: 'Frost' }), item('branchB', { label: 'Shard' }), item('sell')], HUB);
      expect(document.activeElement).toBe($item('branchA'));
      menu.refresh([item('upgrade', { label: 'MAX', state: 'maxed' }), item('sell')], HUB);
      expect(document.activeElement).toBe($hub());
    });

    it('refresh while closed is a no-op', () => {
      menu.refresh(ring(), HUB);
      expect(root.hidden).toBe(true);
    });
  });

  describe('keyboard navigation', () => {
    it('arrows cycle clockwise / counter-clockwise through items then the hub', () => {
      openRing([item('reposition'), item('upgrade'), item('sell')]);
      $item('reposition').focus();
      key(document.activeElement, 'ArrowRight');
      expect(document.activeElement).toBe($item('upgrade'));
      key(document.activeElement, 'ArrowDown');
      expect(document.activeElement).toBe($item('sell'));
      key(document.activeElement, 'ArrowRight');
      expect(document.activeElement).toBe($hub());
      key(document.activeElement, 'ArrowRight');
      expect(document.activeElement).toBe($item('reposition'));
      key(document.activeElement, 'ArrowLeft');
      expect(document.activeElement).toBe($hub());
      key(document.activeElement, 'ArrowUp');
      expect(document.activeElement).toBe($item('sell'));
    });

    it('arrows skip hidden slots and include aria-disabled items', () => {
      openRing(ring({ upgrade: { state: 'disabled' } }));
      $hub().focus();
      key(document.activeElement, 'ArrowRight');
      expect(document.activeElement).toBe($item('upgrade'));
    });
  });

  describe('preview and peek', () => {
    it('mouse hover previews and peeks; leave clears both', () => {
      openRing();
      $item('upgrade').dispatchEvent(ptr('pointerenter', 'mouse'));
      expect(cb.onPreview).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'upgrade' }));
      expect(cb.onPeek).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'upgrade' }), expect.any(Object));
      $item('upgrade').dispatchEvent(ptr('pointerleave', 'mouse'));
      expect(cb.onPreview).toHaveBeenLastCalledWith(null);
      expect(cb.onPeek).toHaveBeenLastCalledWith(null);
    });

    it('a touch pointerenter does not peek; a touch press previews until release', () => {
      openRing();
      $item('upgrade').dispatchEvent(ptr('pointerenter', 'touch'));
      expect(cb.onPeek).not.toHaveBeenCalled();
      $item('upgrade').dispatchEvent(ptr('pointerdown', 'touch'));
      expect(cb.onPreview).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'upgrade' }));
      $item('upgrade').dispatchEvent(ptr('pointerup', 'touch'));
      expect(cb.onPreview).toHaveBeenLastCalledWith(null);
    });

    it('focus previews and blur clears', () => {
      openRing();
      $item('upgrade').focus();
      expect(cb.onPreview).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'upgrade' }));
      $item('upgrade').blur();
      expect(cb.onPreview).toHaveBeenLastCalledWith(null);
    });

    it('keyboard focus on the hub peeks the hub', () => {
      openRing();
      $hub().focus();
      expect(cb.onPeek).toHaveBeenLastCalledWith({ id: RADIAL_HUB }, expect.any(Object));
    });

    it('touch long-press on an item peeks WITHOUT activating, arming or closing', () => {
      openRing();
      $item('sell').dispatchEvent(ptr('pointerdown', 'touch'));
      vi.advanceTimersByTime(LONG_PRESS_MS);
      expect(cb.onPeek).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'sell' }), expect.any(Object));
      $item('sell').dispatchEvent(ptr('pointerup', 'touch'));
      $item('sell').dispatchEvent(click());
      expect(cb.onPeek).toHaveBeenLastCalledWith(null);
      expect(cb.onActivate).not.toHaveBeenCalled();
      expect($item('sell').classList.contains('confirming')).toBe(false);
      expect(menu.isOpen).toBe(true);
    });

    it('touch long-press on the hub peeks the hub without a hub activation', () => {
      openRing();
      $hub().dispatchEvent(ptr('pointerdown', 'touch'));
      vi.advanceTimersByTime(LONG_PRESS_MS);
      $hub().dispatchEvent(ptr('pointerup', 'touch'));
      $hub().dispatchEvent(click());
      expect(cb.onPeek).toHaveBeenCalledWith({ id: RADIAL_HUB }, expect.any(Object));
      expect(cb.onActivate).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle', () => {
    it('destroy restores the shipped markup exactly', () => {
      const before = root.outerHTML;
      openRing();
      // No focus() here: jsdom's focus/blur schedule their own timers.
      press($item('upgrade'), 'touch');
      menu.destroy();
      expect(root.outerHTML).toBe(before);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('a destroyed menu ignores further events', () => {
      openRing();
      const btn = root.querySelector('.radial-item');
      menu.destroy();
      root.hidden = false;
      press(btn, 'mouse');
      key(btn, 'ArrowRight');
      btn.dispatchEvent(ptr('pointerenter', 'mouse'));
      expect(cb.onActivate).not.toHaveBeenCalled();
      expect(cb.onPeek).not.toHaveBeenCalled();
    });

    it('single wiring after 3 construct/open/destroy cycles', () => {
      menu.destroy();
      const stale = [];
      for (let i = 0; i < 3; i++) {
        const c = { onActivate: vi.fn(), onPreview: vi.fn(), onPeek: vi.fn() };
        const m = new RadialMenu(document, c);
        m.open({ kind: 'tower', anchor: { x: 640, y: 360 }, items: ring(), hub: HUB });
        m.destroy();
        stale.push(c);
      }
      menu = new RadialMenu(document, cb);
      openRing();
      press($item('upgrade'), 'mouse');
      $item('upgrade').dispatchEvent(ptr('pointerenter', 'mouse'));
      expect(cb.onActivate).toHaveBeenCalledTimes(1);
      expect(cb.onPeek).toHaveBeenCalledTimes(1);
      for (const c of stale) {
        expect(c.onActivate).not.toHaveBeenCalled();
        expect(c.onPeek).not.toHaveBeenCalled();
      }
    });
  });
});
