import { StoryManager } from './StoryManager.js';

const PANELS = {
  map_a: {
    waves: {
      3: { headline: 'Wave 3 headline', body: 'Wave 3 body' },
    },
    unlock: { headline: 'Unlock headline', body: 'Unlock body' },
  },
};

function buildBannerDOM() {
  const banner   = document.createElement('div');
  banner.id      = 'story-banner';
  const headline = document.createElement('div');
  headline.id    = 'story-headline';
  const body     = document.createElement('div');
  body.id        = 'story-body';
  const btn      = document.createElement('button');
  btn.id         = 'story-dismiss';
  banner.append(headline, body, btn);
  document.body.replaceChildren(banner);
}

beforeEach(buildBannerDOM);

describe('StoryManager', () => {
  it('getPanelForWave returns correct panel for valid storyKey and wave', () => {
    const sm = new StoryManager(PANELS);
    expect(sm.getPanelForWave('map_a', 3)).toEqual({ headline: 'Wave 3 headline', body: 'Wave 3 body' });
  });

  it('getPanelForWave returns null for wave number with no panel', () => {
    const sm = new StoryManager(PANELS);
    expect(sm.getPanelForWave('map_a', 5)).toBeNull();
  });

  it('getPanelForWave returns null for unknown storyKey', () => {
    const sm = new StoryManager(PANELS);
    expect(sm.getPanelForWave('unknown_key', 3)).toBeNull();
  });

  it('getUnlockPanel returns correct unlock panel for valid storyKey', () => {
    const sm = new StoryManager(PANELS);
    expect(sm.getUnlockPanel('map_a')).toEqual({ headline: 'Unlock headline', body: 'Unlock body' });
  });

  it('getUnlockPanel returns null for unknown storyKey', () => {
    const sm = new StoryManager(PANELS);
    expect(sm.getUnlockPanel('unknown_key')).toBeNull();
  });
});
