// The star rule (roadmap 3.6). Ordered best-first; a win always earns at least `floor`.
export const STAR_RULE = Object.freeze({
  thresholds: Object.freeze([
    Object.freeze({ stars: 3, minRatio: 0.8 }),
    Object.freeze({ stars: 2, minRatio: 0.5 }),
  ]),
  floor: 1,
});

// Reveal timings (ms) and look (§6). Seeded from the approved mockup.
export const RESULTS = Object.freeze({
  fadeMs: 200,              // root dim fade; the only animation under reduced motion
  bannerMs: 400, skewDeg: 5, compactSkewDeg: 3,
  shakeAtMs: 400, shakeMs: 400,                       // defeat banner text
  starsAtMs: 500, starEachMs: 250, starMs: 350, starFromScale: 3,
  defeatChipsAtMs: 500, chipEachMs: 100, chipMs: 300, chipTiltDeg: 2,
  newBestDelayMs: 50, newBestMs: 250,
  captionOverlapMs: 50, captionMs: 350,
  actionsGapMs: 50, actionsMs: 300,
  actGuardMs: 250,
  maxLineChars: 64,
});

export const RESULTS_COPY = Object.freeze({
  banner: { victory: 'SECTOR HELD!', defeat: 'THE LINE FELL' },
  kicker: (missionNo, name) => `MISSION ${missionNo} · ${name.toUpperCase()}`,
  campaignComplete: 'CAMPAIGN COMPLETE',
  chips: { lives: 'LIVES', wave: 'WAVE', kills: 'KILLS', gold: 'GOLD', time: 'TIME' },
  newBest: 'NEW BEST',
  actions: { next: 'NEXT MISSION ▸', retry: '↻ RETRY', map: 'WORLD MAP' },
  actionNames: { next: 'Next mission', retry: 'Retry', map: 'World map' },   // aria-label
});

export const RESULT_SPEAKERS = Object.freeze({ victory: 'command', defeat: 'veth' });

export const RESULT_LINES = Object.freeze({
  victory: Object.freeze({
    3: ['Not a scratch on the line. Textbook, Commander.',
        'Clean sweep. Command is putting that one in the manuals.',
        'Barely touched. That is how it is done, Commander.',
        'Flawless hold. The convoys owe you an hour, Commander.'],
    2: ['Sector held. A few got through. Tighten it up, Commander.',
        'The line bent, but it held. Good work, Commander.',
        'Held, with losses. Earth will take it. Patch the gaps.'],
    1: ['Held, by a thread. Too close, Commander.',
        'We kept the sector. Barely. Rebuild and do better.',
        'A win is a win. That one nearly cost us everything.'],
  }),
  // The last map: campaign_ending has just played, so these close the war, not a sector.
  final: Object.freeze({
    3: ['Every line held, Commander. History will remember this one.'],
    2: ['It is over. Earth stands because you did, Commander.'],
    1: ['We kept the last light burning. Only just. Rest now, Commander.'],
  }),
  defeat: Object.freeze([
    'Your light goes out so easily.',
    'Another wall of yours, broken. We are patient.',
    'You built your towers. We built a tide.',
    'Run home, little commander. We will follow.',
    'This world tastes of iron and fear. We will finish it.',
  ]),
});
