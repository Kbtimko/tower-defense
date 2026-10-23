// Story structure for the world map. Tunable copy lives here, not in UI code.
export const ACTS = [
  { id: 'I',   name: 'Retake Sol',      mapIds: [0, 1, 2, 3, 4] },
  { id: 'II',  name: 'Into Veth Space', mapIds: [5, 6, 7] },
  { id: 'III', name: 'The Hive',        mapIds: [8, 9] },
];

// Shown while the map is the frontier. Each line paraphrases story.js (source in the comment).
export const OBJECTIVES = {
  outpost_sigma: 'Hold Outpost Sigma',               // campaign_intro "Hold it."
  lunar_gate: 'Push them off the Moon',              // epilogue_outpost_sigma
  the_crater: 'Hit them before they dig in',         // epilogue_lunar_gate "Don't give them time"
  orbital_station: 'Take back our own guns',         // epilogue_the_crater "they've taken our own guns"
  asteroid_belt: 'Drive them to the edge of Sol',    // epilogue_orbital_station
  titans_reach: 'Bring down the first Titan',        // brief_titans_reach
  deep_space_corridor: 'Press on without support',   // brief_deep_space_corridor
  the_void_frontier: 'Break the Titan packs',        // brief_the_void_frontier
  enemy_homeworld: 'End it where it began',          // epilogue_the_void_frontier
  last_light: 'Turn the lights off',                 // brief_enemy_homeworld / epilogue "Finish this."
};

export const CAMPAIGN_COMPLETE = { act: 'CAMPAIGN COMPLETE', objective: 'The war is won' };

// Briefing-card copy (spec 2.2). The quote itself comes verbatim from story.js.
export const CARD_COPY = {
  missionPrefix: 'MISSION ',
  attribution: 'SOL COMMAND',
  threatPrefix: 'New threat: ',
  tierPrefix: 'Towers upgrade to Tier ',
  launch: '▶ LAUNCH',
  noStars: '☆☆☆',
};

// Meta-bar fullscreen toggle: only the .mb-label text and aria-label change, so
// the icon span survives (and the compact icon-only bar keeps its glyph).
export const FULLSCREEN_COPY = { enter: 'Fullscreen', exit: 'Exit fullscreen' };
