// Shipped variants of each map backdrop. The source PNGs live in
// assets-src/backgrounds/ (not shipped); `npm run optimize-assets` derives
// these WebPs into public/assets/backgrounds/. Ordered largest first.
export const BACKGROUND_VARIANTS = [
  { suffix: '',      scale: 1,   quality: 85 },
  { suffix: '@0.5x', scale: 0.5, quality: 80 },
];

// Width of the source art, so the picker can compare it with the canvas's
// on-screen size in device pixels without loading the file first.
export const BACKGROUND_SOURCE_WIDTH = 1659;

// Acceptance budget for roadmap 1.1: every shipped backdrop variant together.
export const BACKGROUND_BUDGET_BYTES = 6 * 1024 * 1024;
