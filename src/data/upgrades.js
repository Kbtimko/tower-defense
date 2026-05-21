// Phase 7 "Command Doctrine" permanent upgrade tree.
// Funded by spending earned stars (30 total in the game; 45 to buy everything).
// `requires` — id of the prerequisite node, or null for branch roots.
// `starThreshold` — total stars EARNED required before the node can be purchased.

export const UPGRADES = [
  // ─── Command — Commander Rael ───
  { id: 'cmd_battle_hardened', branch: 'command',   name: 'Battle-Hardened',
    effect: 'Hero +50 max HP',            cost: 2, requires: null },
  { id: 'cmd_veteran',         branch: 'command',   name: 'Veteran Commander',
    effect: 'Hero starts at Level 2',     cost: 4, requires: 'cmd_battle_hardened' },
  { id: 'cmd_rapid_redeploy',  branch: 'command',   name: 'Rapid Redeployment',
    effect: 'Hero respawn −6s',           cost: 3, requires: 'cmd_battle_hardened' },
  { id: 'cmd_elite',           branch: 'command',   name: 'Elite Commander',
    effect: 'Hero starts at Level 3',     cost: 6, requires: 'cmd_veteran', starThreshold: 15 },

  // ─── Logistics — economy ───
  { id: 'log_supply_cache',    branch: 'logistics', name: 'Supply Cache',
    effect: '+40 starting gold',          cost: 2, requires: null },
  { id: 'log_deep_reserves',   branch: 'logistics', name: 'Deep Reserves',
    effect: '+80 starting gold',          cost: 3, requires: 'log_supply_cache' },
  { id: 'log_bounty',          branch: 'logistics', name: 'Bounty Protocol',
    effect: '+20% gold from kills',       cost: 4, requires: 'log_supply_cache' },
  { id: 'log_garrison',        branch: 'logistics', name: 'Garrison Command',
    effect: '+2 starting lives',          cost: 4, requires: 'log_bounty', starThreshold: 15 },

  // ─── Arsenal — towers & soldiers ───
  { id: 'ars_munitions',       branch: 'arsenal',   name: 'Munitions Discount',
    effect: 'Towers cost 10% less',       cost: 3, requires: null },
  { id: 'ars_optics',          branch: 'arsenal',   name: 'Targeting Optics',
    effect: 'All towers +8% range',       cost: 3, requires: 'ars_munitions' },
  { id: 'ars_recruits',        branch: 'arsenal',   name: 'Hardened Recruits',
    effect: 'Soldiers +30 max HP',        cost: 3, requires: 'ars_munitions' },
  { id: 'ars_overcharge',      branch: 'arsenal',   name: 'Overcharged Rounds',
    effect: 'All towers +6% damage',      cost: 5, requires: 'ars_optics', starThreshold: 15 },
  { id: 'ars_drills',          branch: 'arsenal',   name: 'Combat Drills',
    effect: 'Soldiers respawn 25% faster', cost: 3, requires: 'ars_recruits' },
];
