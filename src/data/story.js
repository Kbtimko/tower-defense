export const STORY_SPEAKERS = {
  command: { name: 'Sol Command',    color: 0x4aa3ff, portraitKey: 'portrait-command' },
  rael:    { name: 'Commander Rael', color: 0xffd24a, portraitKey: 'portrait-rael'    },
  vorn:    { name: 'The Vorn',       color: 0x9b4dff, portraitKey: 'portrait-vorn'    },
};

// Convention: briefing/epilogue sequence ids derive from a map's storyKey.
export function briefKey(storyKey)    { return `brief_${storyKey}`; }
export function epilogueKey(storyKey) { return `epilogue_${storyKey}`; }

// Which full-screen sequence plays on victory: the finale on the last map, else the epilogue.
export function victorySequenceId(storyKey, isFinalMap) {
  return isFinalMap ? 'campaign_ending' : epilogueKey(storyKey);
}

export const STORY_SEQUENCES = {
  campaign_intro: { panels: [
    { speaker: 'command', text: 'Forty years of silence beyond the orbit of Mars — and then they came. The Vorn fleet burned through the home fleet in a single night.' },
    { speaker: 'command', text: 'Earth still stands. Barely. Every defense line that holds buys the evacuation convoys another hour.' },
    { speaker: 'rael',    text: "This is Commander Rael, Sol Vanguard. I've held worse with less. Give me towers and a field of fire, and I'll give you that hour." },
    { speaker: 'command', text: 'Outpost Sigma is the last station between the Vorn and the inner colonies, Commander. Hold it.' },
  ] },

  brief_outpost_sigma: { panels: [
    { speaker: 'command', text: "Outpost Sigma — humanity's last forward base. Vorn drones inbound in waves." },
    { speaker: 'rael',    text: "Standard swarm. Build your line, layer your fire, don't let a single one reach the core." },
  ] },
  epilogue_outpost_sigma: { panels: [
    { speaker: 'rael',    text: 'Sigma holds. The drones broke on our towers like surf on rock.' },
    { speaker: 'command', text: 'Confirmed. Command authorizes advance to the Lunar Gate. Push them off the Moon, Commander.' },
  ] },

  brief_lunar_gate: { panels: [
    { speaker: 'command', text: 'The Lunar Gate controls every approach to Earth. The Vorn took it in the first hour. Take it back.' },
    { speaker: 'rael',    text: 'They learn fast. Expect them harder and quicker than Sigma. We come harder still.' },
  ] },
  epilogue_lunar_gate: { panels: [
    { speaker: 'rael',    text: "Gate's ours. The road to the outer system is open." },
    { speaker: 'command', text: "Good. The enemy is regrouping near the old mining crater. Don't give them time." },
  ] },

  brief_the_crater: { panels: [
    { speaker: 'command', text: 'The Crater rim is cover for us — and a maze the Vorn have already mapped. Watch your chokepoints.' },
    { speaker: 'rael',    text: "Let them think they know the ground. We'll teach them otherwise." },
  ] },
  epilogue_the_crater: { panels: [
    { speaker: 'rael',    text: "Crater secured. We're pushing them back faster than they can dig in." },
    { speaker: 'command', text: "Intel shows a heavy presence at the Orbital Station — they've taken our own guns. Prepare to launch." },
  ] },

  brief_orbital_station: { panels: [
    { speaker: 'command', text: "The Vorn hold Orbital Station, and they're calling in fliers. Expect airborne drones this assault." },
    { speaker: 'rael',    text: 'Anything that flies still falls. Keep your firing arcs wide.' },
  ] },
  epilogue_orbital_station: { panels: [
    { speaker: 'rael',    text: "Station's back under human guns. They're retreating toward the belt." },
    { speaker: 'command', text: 'Then we follow. The Asteroid Belt is the edge of Sol — and the edge of what we know.' },
  ] },

  brief_asteroid_belt: { panels: [
    { speaker: 'command', text: "The mining platforms give you high ground. The Vorn are massing beyond the belt in numbers we can't count." },
    { speaker: 'rael',    text: "High ground and a clear shot. That's all I've ever needed." },
  ] },
  epilogue_asteroid_belt: { panels: [
    { speaker: 'rael',    text: "Belt's clear. We've pushed them out of Sol entirely." },
    { speaker: 'command', text: 'Commander… long-range scans just picked up something moving in Vorn space. Something enormous.' },
    { speaker: 'vorn',    text: 'You come to us now. Good.' },
  ] },

  brief_titans_reach: { panels: [
    { speaker: 'command', text: "You've crossed into Vorn-held space, Commander. We can't protect you out here." },
    { speaker: 'rael',    text: "We're not here to be protected. We're here to finish it." },
    { speaker: 'command', text: 'Surface scanners read an organism the size of a frigate. Designation: TITAN. Armor like a hull — pierce is the only thing that bites.' },
    { speaker: 'vorn',    text: 'We grow our walls from the bones of the worlds we eat. Yours will do nicely.' },
  ] },
  epilogue_titans_reach: { panels: [
    { speaker: 'rael',    text: "First Titan's down. Big. Slow. Dead." },
    { speaker: 'command', text: "More where that came from — but for the first time, we're the ones advancing. Press deeper." },
  ] },

  brief_deep_space_corridor: { panels: [
    { speaker: 'command', text: "Every comm relay ahead is dark. Past this point you're on your own, Vanguard." },
    { speaker: 'rael',    text: "On our own is how we started. Nothing's changed but the scenery." },
  ] },
  epilogue_deep_space_corridor: { panels: [
    { speaker: 'rael',    text: "Corridor's clear. No support, no losses we couldn't take." },
    { speaker: 'command', text: 'Ahead is the Void Frontier — the deep dark outside their homeworld. Whatever waits there has waited a long time.' },
  ] },

  brief_the_void_frontier: { panels: [
    { speaker: 'command', text: 'Multiple Titan-class contacts. This close to home, they travel in packs.' },
    { speaker: 'rael',    text: 'Then we kill them in packs. Layer the pierce. Hold the line.' },
  ] },
  epilogue_the_void_frontier: { panels: [
    { speaker: 'rael',    text: "Frontier's broken. We have a clear lane to their world." },
    { speaker: 'command', text: "We've got the homeworld coordinates, Commander. We're going to end this where it began." },
  ] },

  brief_enemy_homeworld: { panels: [
    { speaker: 'command', text: "This is it — the Vorn homeworld. Their defenses are unlike anything we've faced. Hold the perimeter and push in." },
    { speaker: 'vorn',    text: 'You stand on the shell of a living world. It does not want you here.' },
    { speaker: 'rael',    text: "Noted. We're not staying — we're just here to turn the lights off." },
  ] },
  epilogue_enemy_homeworld: { panels: [
    { speaker: 'rael',    text: 'Their outer defenses are shattered. One stronghold left.' },
    { speaker: 'command', text: 'Their last redoubt, Commander — the Last Light, the core of the hive-mind itself. Finish this.' },
  ] },

  brief_last_light: { panels: [
    { speaker: 'command', text: "Everything they have left is here, between you and the hive-core. Six waves of their absolute best." },
    { speaker: 'vorn',    text: 'If we fall, the silence will be very long, little commander. For both of us.' },
    { speaker: 'rael',    text: 'This is Rael, Sol Vanguard. If we hold here, Earth lives. So we hold. We do not fall.' },
  ] },

  campaign_ending: { panels: [
    { speaker: 'rael',    text: "The core's dark. The voices… they've stopped. It's over." },
    { speaker: 'command', text: 'Confirmed across every channel. The Vorn hive-mind is gone. The war is won, Commander.' },
    { speaker: 'command', text: 'Earth is sending word to every colony, every convoy, every soul who hid in the dark waiting for it to end. You held the line — all of it.' },
    { speaker: 'rael',    text: "We all did. This is the Last Light — and it's still burning. Rael out." },
  ] },
};

// Friendly labels for the replay Story Log, ordered as the campaign plays.
export const STORY_LOG_LABELS = {
  campaign_intro:            'Prologue',
  brief_outpost_sigma:       'Outpost Sigma — Briefing',
  epilogue_outpost_sigma:    'Outpost Sigma — Epilogue',
  brief_lunar_gate:          'Lunar Gate — Briefing',
  epilogue_lunar_gate:       'Lunar Gate — Epilogue',
  brief_the_crater:          'The Crater — Briefing',
  epilogue_the_crater:       'The Crater — Epilogue',
  brief_orbital_station:     'Orbital Station — Briefing',
  epilogue_orbital_station:  'Orbital Station — Epilogue',
  brief_asteroid_belt:       'Asteroid Belt — Briefing',
  epilogue_asteroid_belt:    'Asteroid Belt — Epilogue',
  brief_titans_reach:        "Titan's Reach — Briefing",
  epilogue_titans_reach:     "Titan's Reach — Epilogue",
  brief_deep_space_corridor: 'Deep Space Corridor — Briefing',
  epilogue_deep_space_corridor: 'Deep Space Corridor — Epilogue',
  brief_the_void_frontier:   'The Void Frontier — Briefing',
  epilogue_the_void_frontier: 'The Void Frontier — Epilogue',
  brief_enemy_homeworld:     'Enemy Homeworld — Briefing',
  epilogue_enemy_homeworld:  'Enemy Homeworld — Epilogue',
  brief_last_light:          'Last Light — Briefing',
  campaign_ending:           'Finale',
};

// Returns the seen sequence beats as ordered {id,label} entries for the Story Log.
export function storyLogEntries(seenBeats) {
  return Object.keys(STORY_LOG_LABELS)
    .filter(id => seenBeats[id])
    .map(id => ({ id, label: STORY_LOG_LABELS[id] }));
}

// Mid-wave single-banner beats (consumed by StoryManager). No `unlock` sub-panel —
// post-victory narrative now lives in epilogue_*/campaign_ending sequences.
export const STORY_PANELS = {
  outpost_sigma: { waves: {
    3: { headline: 'Intel — Wave 3', body: 'Three more drone waves inbound. Reinforce the line before they regroup.' },
    7: { headline: "Rael's Log — Wave 7", body: 'Seven waves held. Whatever the Vorn send next will be bigger. Stay sharp.' },
  } },
  lunar_gate: { waves: {
    3: { headline: 'Intel — Wave 3', body: 'The Vorn are adapting to our positions. Expect faster assault patterns.' },
    7: { headline: 'Transmission — Wave 7', body: 'Hold three more waves and the gate is ours for good.' },
  } },
  the_crater: { waves: {
    4: { headline: 'Intel — Wave 4', body: 'They have our chokepoints mapped. Expect a new approach vector.' },
    8: { headline: "Rael's Log — Wave 8", body: 'The towers have held against everything. Trust the line.' },
  } },
  orbital_station: { waves: {
    4: { headline: 'Intercept — Wave 4', body: 'Vorn calling in aerial support. Flying drones next assault.' },
    8: { headline: 'Status — Wave 8', body: 'Station systems at 60%. Eight waves repelled. They are throwing everything at us.' },
  } },
  asteroid_belt: { waves: {
    4: { headline: 'Mining Log — Wave 4', body: 'Multiple attack vectors active across the platforms.' },
    9: { headline: 'Field Report — Wave 9', body: 'They are clustering heavier units. Prioritize armor-piercing fire.' },
  } },
  titans_reach: { waves: {
    5: { headline: 'Warning — Wave 5', body: 'TITAN-class organism on approach. Pierce is the only thing that bites.' },
    10: { headline: 'Broadcast — Wave 10', body: 'First Titan neutralized. There are more. Armor-piercing towers are keeping us alive.' },
  } },
  deep_space_corridor: { waves: {
    5: { headline: 'Nav Alert — Wave 5', body: 'No comm relays, no support. Every resource matters.' },
    10: { headline: 'Tactical — Wave 10', body: 'The corridor narrows ahead — the enemy will have nowhere to flank.' },
  } },
  the_void_frontier: { waves: {
    5: { headline: 'Sensors — Wave 5', body: 'Titan-class contacts emerging from the void. They run in packs out here.' },
    10: { headline: 'Warning — Wave 10', body: 'Network still holding. Five more waves. Let nothing through.' },
  } },
  enemy_homeworld: { waves: {
    5: { headline: 'Breach — Wave 5', body: 'Inside enemy territory. Their home defenses are unlike anything we have seen.' },
    11: { headline: 'Last Stand — Wave 11', body: 'Their numbers are not infinite. Keep pushing.' },
  } },
  last_light: { waves: {
    6: { headline: 'Final Transmission — Wave 6', body: 'Six waves of their absolute best. This is what we trained for.' },
    12: { headline: "Rael's Last Log — Wave 12", body: 'Six waves left. If we fall here, no one is left to defend Earth. We do not fall.' },
  } },
};
