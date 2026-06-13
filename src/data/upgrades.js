// Phase 7 permanent upgrade tree — 25 nodes.
// `requires` — id of the prerequisite node, or null for branch roots.
// `starThreshold` — total stars EARNED required before the node can be purchased.
// `heroUnlock` — hero id that must be unlocked before this node is purchasable.

export const UPGRADES = [
  // ─── Rael ───
  { id: 'rael_hp',             branch: 'rael',     name: 'Battle-Hardened',
    effect: 'Rael +50 max HP',           cost: 2, requires: null },
  { id: 'rael_rapid_redeploy', branch: 'rael',     name: 'Rapid Redeployment',
    effect: 'Rael respawn −6s',          cost: 3, requires: 'rael_hp' },
  { id: 'rael_veteran',        branch: 'rael',     name: 'Veteran Commander',
    effect: 'Rael starts at L2',         cost: 4, requires: 'rael_hp' },
  { id: 'rael_elite',          branch: 'rael',     name: 'Elite Commander',
    effect: 'Rael starts at L3',         cost: 6, requires: 'rael_veteran', starThreshold: 15 },

  // ─── Engineer (hero-gated) ───
  { id: 'engineer_hp',             branch: 'engineer', name: 'Reinforced Plating',
    effect: 'Engineer +40 max HP',       cost: 2, requires: null,                  heroUnlock: 'engineer' },
  { id: 'engineer_rapid_redeploy', branch: 'engineer', name: 'Field Recovery',
    effect: 'Engineer respawn −6s',      cost: 3, requires: 'engineer_hp',         heroUnlock: 'engineer' },
  { id: 'engineer_veteran',        branch: 'engineer', name: 'Field-Tested',
    effect: 'Engineer starts at L2',     cost: 4, requires: 'engineer_hp',         heroUnlock: 'engineer' },
  { id: 'engineer_elite',          branch: 'engineer', name: 'Master Engineer',
    effect: 'Engineer starts at L3',     cost: 6, requires: 'engineer_veteran',    heroUnlock: 'engineer', starThreshold: 15 },

  // ─── Scout (hero-gated) ───
  { id: 'scout_hp',             branch: 'scout',    name: 'Lightweight Armor',
    effect: 'Scout +30 max HP',          cost: 2, requires: null,                  heroUnlock: 'scout' },
  { id: 'scout_rapid_redeploy', branch: 'scout',    name: 'Quick Recovery',
    effect: 'Scout respawn −6s',         cost: 3, requires: 'scout_hp',            heroUnlock: 'scout' },
  { id: 'scout_veteran',        branch: 'scout',    name: 'Pathfinder',
    effect: 'Scout starts at L2',        cost: 4, requires: 'scout_hp',            heroUnlock: 'scout' },
  { id: 'scout_elite',          branch: 'scout',    name: 'Master Scout',
    effect: 'Scout starts at L3',        cost: 6, requires: 'scout_veteran',       heroUnlock: 'scout', starThreshold: 15 },

  // ─── Pyromancer (hero-gated) ───
  { id: 'pyro_hp',             branch: 'pyro',     name: 'Heat Resistance',
    effect: 'Pyromancer +35 max HP',     cost: 2, requires: null,                  heroUnlock: 'pyro' },
  { id: 'pyro_rapid_redeploy', branch: 'pyro',     name: 'Reignition',
    effect: 'Pyromancer respawn −6s',    cost: 3, requires: 'pyro_hp',             heroUnlock: 'pyro' },
  { id: 'pyro_veteran',        branch: 'pyro',     name: 'Pyrokinetic',
    effect: 'Pyromancer starts at L2',   cost: 4, requires: 'pyro_hp',             heroUnlock: 'pyro' },
  { id: 'pyro_elite',          branch: 'pyro',     name: 'Master Pyromancer',
    effect: 'Pyromancer starts at L3',   cost: 6, requires: 'pyro_veteran',        heroUnlock: 'pyro', starThreshold: 15 },

  // ─── Logistics ───
  { id: 'log_supply_cache',  branch: 'logistics', name: 'Supply Cache',
    effect: '+40 starting gold',         cost: 2, requires: null },
  { id: 'log_deep_reserves', branch: 'logistics', name: 'Deep Reserves',
    effect: '+80 starting gold',         cost: 3, requires: 'log_supply_cache' },
  { id: 'log_bounty',        branch: 'logistics', name: 'Bounty Protocol',
    effect: '+20% gold from kills',      cost: 4, requires: 'log_supply_cache' },
  { id: 'log_garrison',      branch: 'logistics', name: 'Garrison Command',
    effect: '+2 starting lives',         cost: 4, requires: 'log_bounty', starThreshold: 15 },

  // ─── Arsenal ───
  { id: 'ars_munitions',  branch: 'arsenal', name: 'Munitions Discount',
    effect: 'Towers cost 10% less',      cost: 3, requires: null },
  { id: 'ars_optics',     branch: 'arsenal', name: 'Targeting Optics',
    effect: 'All towers +8% range',      cost: 3, requires: 'ars_munitions' },
  { id: 'ars_recruits',   branch: 'arsenal', name: 'Hardened Recruits',
    effect: 'Soldiers +30 max HP',       cost: 3, requires: 'ars_munitions' },
  { id: 'ars_overcharge', branch: 'arsenal', name: 'Overcharged Rounds',
    effect: 'All towers +6% damage',     cost: 5, requires: 'ars_optics', starThreshold: 15 },
  { id: 'ars_drills',     branch: 'arsenal', name: 'Combat Drills',
    effect: 'Soldiers respawn 25% faster', cost: 3, requires: 'ars_recruits' },
];
