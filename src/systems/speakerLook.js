import { STORY_SPEAKERS } from '../data/story.js';
import { SPEAKER_LOOK_DEFAULTS } from '../data/storyDialog.js';
import { REGISTERED_PORTRAITS, resolvePortrait } from './portraitFallback.js';

const SIDES = ['left', 'right'];
const SHAPES = ['box', 'jagged'];

// null (not a default colour) for unknown speakers so CSS falls back to theme
// tokens via data-speaker="unknown".
const toHex = (n) => (typeof n === 'number' ? `#${(n & 0xffffff).toString(16).padStart(6, '0')}` : null);

// Data rows are hand-edited, so an invalid side/shape degrades to the default
// instead of reaching the DOM as a bogus attribute.
const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

export function speakerLook(
  speakerId,
  speakers = STORY_SPEAKERS,
  defaults = SPEAKER_LOOK_DEFAULTS,
  registered = REGISTERED_PORTRAITS,
) {
  const sp = speakers[speakerId];
  return {
    id: speakerId,
    name: sp?.name ?? '',
    side: pick(sp?.side, SIDES, defaults.side),
    frame: toHex(sp?.color),
    caption: toHex(sp?.caption),
    shape: pick(sp?.shape, SHAPES, defaults.shape),
    glitch: typeof sp?.glitch === 'boolean' ? sp.glitch : defaults.glitch,
    portrait: resolvePortrait(sp, registered),
  };
}
