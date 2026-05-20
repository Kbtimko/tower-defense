import { SaveManager }    from './SaveManager.js';
import { UpgradeManager } from './UpgradeManager.js';

// Helper: a SaveManager with `total` stars spread across maps (3 per map).
function saveWithStars(total) {
  localStorage.clear();
  const sm = new SaveManager();
  let mapId = 0;
  while (total > 0) {
    const give = Math.min(3, total);
    sm.setStars(mapId++, give);
    total -= give;
  }
  return sm;
}

describe('UpgradeManager — getAvailableStars', () => {
  it('equals total stars when nothing purchased', () => {
    const um = new UpgradeManager(saveWithStars(10));
    expect(um.getAvailableStars()).toBe(10);
  });

  it('subtracts the cost of purchased nodes', () => {
    const sm = saveWithStars(10);
    const um = new UpgradeManager(sm);
    um.purchase('log_supply_cache'); // cost 2
    expect(um.getAvailableStars()).toBe(8);
  });
});

describe('UpgradeManager — canPurchase', () => {
  it('rejects an already-owned node', () => {
    const um = new UpgradeManager(saveWithStars(10));
    um.purchase('log_supply_cache');
    expect(um.canPurchase('log_supply_cache')).toBe(false);
  });

  it('rejects a node whose prerequisite is not owned', () => {
    const um = new UpgradeManager(saveWithStars(10));
    expect(um.canPurchase('log_deep_reserves')).toBe(false);
  });

  it('rejects a node whose starThreshold is not met', () => {
    const sm = saveWithStars(14); // < 15
    const um = new UpgradeManager(sm);
    um.purchase('cmd_battle_hardened');
    um.purchase('cmd_veteran');
    expect(um.canPurchase('cmd_elite')).toBe(false);
  });

  it('rejects a node the player cannot afford', () => {
    const um = new UpgradeManager(saveWithStars(1)); // supply cache costs 2
    expect(um.canPurchase('log_supply_cache')).toBe(false);
  });

  it('accepts a node when prereq, threshold and affordability all pass', () => {
    const sm = saveWithStars(20);
    const um = new UpgradeManager(sm);
    um.purchase('cmd_battle_hardened');
    um.purchase('cmd_veteran');
    expect(um.canPurchase('cmd_elite')).toBe(true); // 20 earned >= 15, 14 available >= 6
  });
});

describe('UpgradeManager — purchase', () => {
  it('throws when the node cannot be purchased', () => {
    const um = new UpgradeManager(saveWithStars(10));
    expect(() => um.purchase('log_deep_reserves')).toThrow();
  });

  it('persists the purchase through SaveManager', () => {
    const sm = saveWithStars(10);
    new UpgradeManager(sm).purchase('log_supply_cache');
    expect(sm.getPurchasedUpgrades()).toContain('log_supply_cache');
  });
});

describe('UpgradeManager — refund cascade', () => {
  it('refunding a leaf removes only that node', () => {
    const um = new UpgradeManager(saveWithStars(10));
    um.purchase('cmd_battle_hardened');
    um.purchase('cmd_rapid_redeploy');
    um.refund('cmd_rapid_redeploy');
    expect(um.isPurchased('cmd_rapid_redeploy')).toBe(false);
    expect(um.isPurchased('cmd_battle_hardened')).toBe(true);
  });

  it('refunding a root cascades to all transitive dependents and recovers all stars', () => {
    const sm = saveWithStars(20);
    const um = new UpgradeManager(sm);
    um.purchase('cmd_battle_hardened'); // 2
    um.purchase('cmd_veteran');         // 4
    um.purchase('cmd_rapid_redeploy');  // 3
    um.purchase('cmd_elite');           // 6
    expect(um.getAvailableStars()).toBe(5);
    um.refund('cmd_battle_hardened');
    expect(um.getPurchasedUpgrades()).toEqual([]);
    expect(um.getAvailableStars()).toBe(20);
  });

  it('refunding an unowned node is a no-op', () => {
    const um = new UpgradeManager(saveWithStars(10));
    expect(() => um.refund('cmd_elite')).not.toThrow();
  });
});

describe('UpgradeManager — getNodeState', () => {
  it('reports the lifecycle states', () => {
    const sm = saveWithStars(14);
    const um = new UpgradeManager(sm);
    expect(um.getNodeState('cmd_battle_hardened')).toBe('affordable');
    expect(um.getNodeState('cmd_veteran')).toBe('locked-prereq');
    um.purchase('cmd_battle_hardened');
    expect(um.getNodeState('cmd_battle_hardened')).toBe('purchased');
    um.purchase('cmd_veteran');
    expect(um.getNodeState('cmd_elite')).toBe('locked-threshold'); // 14 < 15
  });

  it('reports unaffordable when prereq met but stars too low', () => {
    const sm = saveWithStars(2);
    const um = new UpgradeManager(sm);
    um.purchase('log_supply_cache');     // spends 2, 0 available
    expect(um.getNodeState('log_bounty')).toBe('unaffordable'); // bounty costs 4
  });
});

describe('UpgradeManager — getModifiers', () => {
  it('returns all defaults when nothing is purchased', () => {
    const um = new UpgradeManager(saveWithStars(0));
    expect(um.getModifiers()).toEqual({
      heroMaxHpBonus: 0, heroStartLevel: 1, heroRespawnDelta: 0,
      startGoldBonus: 0, killGoldMult: 1.0, startLivesBonus: 0,
      towerCostMult: 1.0, towerRangeMult: 1.0, towerDamageMult: 1.0,
      soldierMaxHpBonus: 0, soldierRespawnMult: 1.0,
    });
  });

  it('aggregates additive starting gold from both logistics nodes', () => {
    const sm = saveWithStars(10);
    const um = new UpgradeManager(sm);
    um.purchase('log_supply_cache');
    um.purchase('log_deep_reserves');
    expect(um.getModifiers().startGoldBonus).toBe(120);
  });

  it('Elite Commander beats Veteran Commander for heroStartLevel', () => {
    const sm = saveWithStars(20);
    const um = new UpgradeManager(sm);
    um.purchase('cmd_battle_hardened');
    um.purchase('cmd_veteran');
    expect(um.getModifiers().heroStartLevel).toBe(2);
    um.purchase('cmd_elite');
    expect(um.getModifiers().heroStartLevel).toBe(3);
  });
});
