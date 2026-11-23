// Itch.io upload limits (per itch's HTML5 upload rules) and the release-media
// capture settings. Pure data: the packaging script and tests read these.

export const ITCH_LIMITS = {
  maxFiles: 1000,
  maxTotalBytes: 500_000_000,
  maxFileBytes: 200_000_000,
  maxPathLength: 240,
};

// OS and VCS droppings that must never reach the zip.
export const JUNK_FILES = ['.DS_Store', '.gitkeep'];

export const RELEASE_MEDIA = {
  device: 'desktop1080',
  shotMaps: [0, 3, 4, 6, 8, 9],
  // Shots and the clip open this many waves before the last (0 = the last wave), with
  // auto-send on. 2 left maps 3 and 6 with too few enemies mid-road within the window.
  wavesFromEnd: 0,
  // A shot is the best frame between these sim times.
  shotFromSimMs: 8000,
  shotToSimMs: 45000,
  // Only enemies this far along the road count as "the action" (not the spawn or the exit),
  // and a shot needs at least minMiddleEnemies of them.
  midBand: { from: 0.15, to: 0.85 },
  minMiddleEnemies: 3,
  cover: { map: 9, cropWidth: 1134, cropHeight: 900, width: 630, height: 500 },
  // The clip trims from the first crowded mid-road moment, giving up waiting at maxLeadSimMs.
  clip: { map: 9, seconds: 15, maxLeadSimMs: 45000, gifWidth: 640, gifFps: 8, gifWarnBytes: 10_000_000 },
};
