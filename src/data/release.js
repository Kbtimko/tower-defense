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
  warmupSimMs: 6000,
  cover: { map: 9, cropWidth: 1134, cropHeight: 900, width: 630, height: 500 },
  clip: { map: 9, seconds: 15, gifWidth: 640, gifFps: 10, gifWarnBytes: 10_000_000 },
};
