// Capture-harness device table, shared with Vitest (the world-map fit test) so the
// viewports are derived from one source and never re-typed.
import { devices } from 'playwright';

// Landscape presets: the game is landscape-only, so portrait shots would only
// show the letterboxing. `portrait` names the same device upright, for the
// rotate-the-phone audit (a player always starts holding it upright).
// Playwright ships no 844x390 / 932x430 descriptors; these are the iPhone 14 landscape
// emulation resized to the common modern-phone viewports.
const phone = (width, height) => ({
  ...devices['iPhone 14 landscape'],
  viewport: { width, height },
  portrait: { ...devices['iPhone 14'], viewport: { width: height, height: width } },
});

export const DEVICES = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  desktop1440: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  desktop1080: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  phone844: phone(844, 390),
  phone932: phone(932, 430),
  iphone:  { ...devices['iPhone 14 landscape'], portrait: 'iPhone 14' },
  pixel:   { ...devices['Pixel 7 landscape'], portrait: 'Pixel 7' },
  ipad:    { ...devices['iPad Pro 11 landscape'], portrait: 'iPad Pro 11' },
};
