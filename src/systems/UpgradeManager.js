import { UPGRADES } from '../data/upgrades.js';

const BY_ID = new Map(UPGRADES.map(u => [u.id, u]));

export class UpgradeManager {
  constructor(saveMgr) {
    this._save = saveMgr;
  }

  _owned() {
    return new Set(this._save.getPurchasedUpgrades());
  }

  getNode(id) {
    return BY_ID.get(id) ?? null;
  }

  isPurchased(id) {
    return this._owned().has(id);
  }

  getAvailableStars() {
    let spent = 0;
    for (const id of this._owned()) {
      const node = BY_ID.get(id);
      if (node) spent += node.cost;
    }
    return this._save.getTotalStars() - spent;
  }

  canPurchase(id) {
    const node = BY_ID.get(id);
    if (!node) return false;
    const owned = this._owned();
    if (owned.has(id)) return false;
    if (node.requires && !owned.has(node.requires)) return false;
    if (node.starThreshold != null
        && this._save.getTotalStars() < node.starThreshold) return false;
    if (node.heroUnlock && !this._save.isHeroUnlocked(node.heroUnlock)) return false;
    return this.getAvailableStars() >= node.cost;
  }

  purchase(id) {
    if (!this.canPurchase(id)) {
      throw new Error(`Cannot purchase upgrade: ${id}`);
    }
    this._save.setPurchasedUpgrades([...this._save.getPurchasedUpgrades(), id]);
  }

  refund(id) {
    const owned = this._owned();
    if (!owned.has(id)) return;
    // Collect id + all transitive dependents that are currently owned.
    const toRemove = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of UPGRADES) {
        if (owned.has(node.id) && !toRemove.has(node.id)
            && node.requires && toRemove.has(node.requires)) {
          toRemove.add(node.id);
          changed = true;
        }
      }
    }
    this._save.setPurchasedUpgrades(
      [...owned].filter(uid => !toRemove.has(uid)),
    );
  }

  getPurchasedUpgrades() {
    return this._save.getPurchasedUpgrades();
  }

  getNodeState(id) {
    const node = BY_ID.get(id);
    if (!node) return 'unaffordable';
    const owned = this._owned();
    if (owned.has(id)) return 'purchased';
    if (node.heroUnlock && !this._save.isHeroUnlocked(node.heroUnlock)) return 'locked-hero';
    if (node.requires && !owned.has(node.requires)) return 'locked-prereq';
    if (node.starThreshold != null
        && this._save.getTotalStars() < node.starThreshold) return 'locked-threshold';
    return this.getAvailableStars() >= node.cost ? 'affordable' : 'unaffordable';
  }

  getModifiers(heroId) {
    const owned = this._owned();
    const has = id => owned.has(id);
    const mods = {
      heroMaxHpBonus: 0, heroStartLevel: 1, heroRespawnDelta: 0,
      startGoldBonus: 0, killGoldMult: 1.0, startLivesBonus: 0,
      towerCostMult: 1.0, towerRangeMult: 1.0, towerDamageMult: 1.0,
      soldierMaxHpBonus: 0, soldierRespawnMult: 1.0,
    };
    if (has('log_supply_cache'))    mods.startGoldBonus    += 40;
    if (has('log_deep_reserves'))   mods.startGoldBonus    += 80;
    if (has('log_bounty'))          mods.killGoldMult       = 1.2;
    if (has('log_garrison'))        mods.startLivesBonus    = 2;
    if (has('ars_munitions'))       mods.towerCostMult      = 0.9;
    if (has('ars_optics'))          mods.towerRangeMult     = 1.08;
    if (has('ars_overcharge'))      mods.towerDamageMult    = 1.06;
    if (has('ars_recruits'))        mods.soldierMaxHpBonus  = 30;
    if (has('ars_drills'))          mods.soldierRespawnMult = 0.75;
    const HERO_HP_BONUS = { rael: 50, engineer: 40, scout: 30, pyro: 35 };
    if (has(`${heroId}_hp`))             mods.heroMaxHpBonus   = HERO_HP_BONUS[heroId];
    if (has(`${heroId}_rapid_redeploy`)) mods.heroRespawnDelta = -6;
    if (has(`${heroId}_veteran`))        mods.heroStartLevel   = 2;
    if (has(`${heroId}_elite`))          mods.heroStartLevel   = 3;
    return mods;
  }
}
