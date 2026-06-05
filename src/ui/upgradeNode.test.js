import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderUpgradeNode } from './upgradeNode.js';

function makeMgr(state, available = 10) {
  return {
    getNodeState: vi.fn(() => state),
    getAvailableStars: vi.fn(() => available),
    purchase: vi.fn(),
    refund:   vi.fn(),
  };
}

const RAEL_NODE = {
  id: 'rael_hp', branch: 'rael', name: 'Battle-Hardened',
  effect: 'Rael +50 max HP', cost: 2, requires: null,
};
const RAEL_ELITE_NODE = {
  id: 'rael_elite', branch: 'rael', name: 'Elite Commander',
  effect: 'Rael starts at L3', cost: 6, requires: 'rael_veteran', starThreshold: 15,
};
const ENG_NODE = {
  id: 'engineer_hp', branch: 'engineer', name: 'Reinforced Plating',
  effect: 'Engineer +40 max HP', cost: 2, requires: null, heroUnlock: 'engineer',
};
const HERO_DEFS = {
  rael:     { displayName: 'Commander Rael',  unlockMapAfter: null },
  engineer: { displayName: 'Engineer Dax',    unlockMapAfter: 2 },
};

describe('renderUpgradeNode', () => {
  let onChange;
  beforeEach(() => { onChange = vi.fn(); });

  it('affordable: returns element with .affordable; click calls purchase + onChange', () => {
    const mgr = makeMgr('affordable');
    const el  = renderUpgradeNode(RAEL_NODE, mgr, HERO_DEFS, onChange);
    expect(el.classList.contains('affordable')).toBe(true);
    expect(el.querySelector('.upgrade-node-name').textContent).toBe('Battle-Hardened');
    expect(el.querySelector('.upgrade-node-cost').textContent).toBe('2★');
    el.click();
    expect(mgr.purchase).toHaveBeenCalledWith('rael_hp');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('purchased: returns element with .purchased + Refund button; refund click calls refund + onChange', () => {
    const mgr = makeMgr('purchased');
    const el  = renderUpgradeNode(RAEL_NODE, mgr, HERO_DEFS, onChange);
    expect(el.classList.contains('purchased')).toBe(true);
    const refundBtn = el.querySelector('.upgrade-node-refund');
    expect(refundBtn).not.toBeNull();
    refundBtn.click();
    expect(mgr.refund).toHaveBeenCalledWith('rael_hp');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('locked-threshold: returns element with .locked-threshold + gate text', () => {
    const mgr = makeMgr('locked-threshold');
    const el  = renderUpgradeNode(RAEL_ELITE_NODE, mgr, HERO_DEFS, onChange);
    expect(el.classList.contains('locked-threshold')).toBe(true);
    expect(el.querySelector('.upgrade-node-gate').textContent).toBe('Needs 15★ earned');
    el.click();
    expect(mgr.purchase).not.toHaveBeenCalled();
  });

  it('locked-hero: returns element with .locked-hero + unlock tooltip', () => {
    const mgr = makeMgr('locked-hero');
    const el  = renderUpgradeNode(ENG_NODE, mgr, HERO_DEFS, onChange);
    expect(el.classList.contains('locked-hero')).toBe(true);
    expect(el.title).toContain('Clear Map 3');
    expect(el.title).toContain('Engineer Dax');
    el.click();
    expect(mgr.purchase).not.toHaveBeenCalled();
  });

  it('unaffordable: returns element with .unaffordable and no click handler', () => {
    const mgr = makeMgr('unaffordable');
    const el  = renderUpgradeNode(RAEL_NODE, mgr, HERO_DEFS, onChange);
    expect(el.classList.contains('unaffordable')).toBe(true);
    el.click();
    expect(mgr.purchase).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('refund button click stops propagation (does not also trigger node click)', () => {
    const mgr = makeMgr('purchased');
    const el  = renderUpgradeNode(RAEL_NODE, mgr, HERO_DEFS, onChange);
    el.querySelector('.upgrade-node-refund').click();
    expect(mgr.purchase).not.toHaveBeenCalled();
  });
});
