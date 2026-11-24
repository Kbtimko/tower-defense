import { describe, it, expect } from 'vitest';
import { speakerLook } from './speakerLook.js';
import { STORY_SPEAKERS } from '../data/story.js';
import { SPEAKER_LOOK_DEFAULTS } from '../data/storyDialog.js';

const hex = (n) => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
const none = new Set();

describe('speakerLook', () => {
  it('resolves each story speaker from its data row', () => {
    for (const [id, sp] of Object.entries(STORY_SPEAKERS)) {
      const look = speakerLook(id, STORY_SPEAKERS, SPEAKER_LOOK_DEFAULTS, none);
      expect(look.id).toBe(id);
      expect(look.name).toBe(sp.name);
      expect(look.side).toBe(sp.side ?? SPEAKER_LOOK_DEFAULTS.side);
      expect(look.shape).toBe(sp.shape ?? SPEAKER_LOOK_DEFAULTS.shape);
      expect(look.glitch).toBe(sp.glitch ?? SPEAKER_LOOK_DEFAULTS.glitch);
      expect(look.frame).toBe(hex(sp.color));
      expect(look.caption).toBe(hex(sp.caption));
    }
  });

  it('matches the approved per-speaker variants', () => {
    const d = (id) => speakerLook(id, STORY_SPEAKERS, SPEAKER_LOOK_DEFAULTS, none);
    expect(d('command')).toMatchObject({ side: 'left', shape: 'box', glitch: false });
    expect(d('rael')).toMatchObject({ side: 'right', shape: 'box', glitch: false });
    expect(d('veth')).toMatchObject({ side: 'left', shape: 'jagged', glitch: true });
  });

  it('unknown id gives defaults, null colours, empty name and ? fallback', () => {
    const look = speakerLook('nobody', STORY_SPEAKERS, SPEAKER_LOOK_DEFAULTS, none);
    expect(look).toMatchObject({ id: 'nobody', name: '', frame: null, caption: null, ...SPEAKER_LOOK_DEFAULTS });
    expect(look.portrait).toMatchObject({ kind: 'fallback', initial: '?' });
  });

  it('a row missing side/shape uses the defaults', () => {
    const sp = { x: { name: 'X', color: 0x112233, caption: 0x445566, portraitKey: 'p' } };
    const look = speakerLook('x', sp, { side: 'right', shape: 'jagged', glitch: true }, none);
    expect(look).toMatchObject({ side: 'right', shape: 'jagged', glitch: true });
  });

  it('sanitizes invalid side and shape', () => {
    const sp = { x: { name: 'X', color: 1, caption: 2, portraitKey: 'p', side: 'up', shape: 7 } };
    const look = speakerLook('x', sp, SPEAKER_LOOK_DEFAULTS, none);
    expect(look.side).toBe('left');
    expect(look.shape).toBe('box');
  });

  it('masks colour numbers to 24 bits', () => {
    const sp = { x: { name: 'X', color: 0x1abcdef, caption: 0xff123456, portraitKey: 'p' } };
    const look = speakerLook('x', sp, SPEAKER_LOOK_DEFAULTS, none);
    expect(look.frame).toBe('#abcdef');
    expect(look.caption).toBe('#123456');
  });

  it('registered portrait key gives image, unregistered gives fallback', () => {
    const key = STORY_SPEAKERS.rael.portraitKey;
    expect(speakerLook('rael', STORY_SPEAKERS, SPEAKER_LOOK_DEFAULTS, new Set([key])).portrait)
      .toEqual({ kind: 'image', key });
    expect(speakerLook('rael', STORY_SPEAKERS, SPEAKER_LOOK_DEFAULTS, none).portrait.kind).toBe('fallback');
  });
});
