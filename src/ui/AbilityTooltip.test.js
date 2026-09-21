import { describe, it, expect, beforeEach } from 'vitest';
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
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    expect(dom.card.classList.contains('shown')).toBe(true);
    expect(dom.card.textContent).toContain(HEROES.rael.abilities.q.label);
    expect(dom.card.textContent).toContain('Q');
    expect(dom.card.textContent).toContain(`${HEROES.rael.abilities.q.cooldown}s`);
    expect(dom.card.textContent).toContain(HEROES.rael.abilities.q.tooltip);
  });

  it('hides on pointerleave', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    dom.anchor.dispatchEvent(new Event('pointerleave'));
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  // The model is read at hover time, not at attach time, so cooldown and
  // level are always current.
  it('re-reads the model on every hover', () => {
    let level = 1;
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'e', { level, heroUnlocked: true, cooldownRemaining: 0 }));
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    expect(dom.card.textContent).toContain('Unlocks at level 3');
    dom.anchor.dispatchEvent(new Event('pointerleave'));
    level = 3;
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    expect(dom.card.textContent).not.toContain('Unlocks at level 3');
  });

  it('shows remaining cooldown', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q', { level: 1, heroUnlocked: true, cooldownRemaining: 9 }));
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    expect(dom.card.textContent).toContain('9s');
  });

  it('shows the hero unlock condition for a locked hero', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.scout, 'q', { level: 1, heroUnlocked: false }));
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    expect(dom.card.textContent).toContain(`Clear Map ${HEROES.scout.unlockMapAfter + 1}`);
  });

  it('opens on focus and closes on blur', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    dom.anchor.dispatchEvent(new Event('focus'));
    expect(dom.card.classList.contains('shown')).toBe(true);
    dom.anchor.dispatchEvent(new Event('blur'));
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  it('closes on Escape', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  it('stays hidden when the model getter returns null', () => {
    tip.attach(dom.anchor, () => null);
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  it('removes every listener on detachAll', () => {
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    tip.detachAll();
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    expect(dom.card.classList.contains('shown')).toBe(false);
  });

  it('supports several anchors at once', () => {
    const second = document.createElement('button');
    document.body.appendChild(second);
    tip.attach(dom.anchor, () => describeAbility(HEROES.rael, 'q'));
    tip.attach(second,     () => describeAbility(HEROES.rael, 'w'));
    second.dispatchEvent(new Event('pointerenter'));
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
    dom.anchor.dispatchEvent(new Event('pointerenter'));
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
    dom.anchor.dispatchEvent(new Event('pointerenter'));
    expect(dom.card.classList.contains('shown')).toBe(true);
    second.hide();
    expect(dom.card.classList.contains('shown')).toBe(false);
    second.detachAll();
  });
});
