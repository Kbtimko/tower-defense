import { describe, it, expect } from 'vitest';
import {
  STORY_SPEAKERS, STORY_SEQUENCES, STORY_PANELS,
  briefKey, epilogueKey, victorySequenceId, storyLogEntries, STORY_LOG_LABELS,
} from './story.js';
import { MAPS } from './maps.js';

describe('story content integrity', () => {
  it('every speaker has name, color, portraitKey', () => {
    for (const s of Object.values(STORY_SPEAKERS)) {
      expect(typeof s.name).toBe('string');
      expect(typeof s.color).toBe('number');
      expect(typeof s.portraitKey).toBe('string');
    }
  });

  it('campaign_intro and campaign_ending exist with panels', () => {
    expect(STORY_SEQUENCES.campaign_intro.panels.length).toBeGreaterThan(0);
    expect(STORY_SEQUENCES.campaign_ending.panels.length).toBeGreaterThan(0);
  });

  it('every map has a briefing sequence', () => {
    for (const m of MAPS) {
      expect(STORY_SEQUENCES[briefKey(m.storyKey)], `missing brief for ${m.storyKey}`)
        .toBeDefined();
    }
  });

  it('maps 0-8 have an epilogue; map 9 (final) does not', () => {
    MAPS.forEach((m, i) => {
      const hasEpilogue = !!STORY_SEQUENCES[epilogueKey(m.storyKey)];
      if (i < MAPS.length - 1) expect(hasEpilogue, `missing epilogue for ${m.storyKey}`).toBe(true);
      else expect(hasEpilogue).toBe(false);
    });
  });

  it('every panel references a known speaker', () => {
    for (const seq of Object.values(STORY_SEQUENCES)) {
      for (const p of seq.panels) {
        expect(STORY_SPEAKERS[p.speaker], `unknown speaker ${p.speaker}`).toBeDefined();
        expect(typeof p.text).toBe('string');
        expect(p.text.length).toBeGreaterThan(0);
      }
    }
  });

  it('victorySequenceId routes final map to the ending, others to epilogue', () => {
    expect(victorySequenceId('outpost_sigma', false)).toBe('epilogue_outpost_sigma');
    expect(victorySequenceId('last_light', true)).toBe('campaign_ending');
  });

  it('STORY_PANELS no longer carries unlock sub-panels', () => {
    for (const entry of Object.values(STORY_PANELS)) {
      expect(entry.unlock).toBeUndefined();
      expect(entry.waves).toBeDefined();
    }
  });

  it('storyLogEntries returns only seen sequence beats, labeled, in order', () => {
    const seen = { campaign_intro: true, brief_outpost_sigma: true, brief_lunar_gate: true };
    const entries = storyLogEntries(seen);
    expect(entries[0]).toEqual({ id: 'campaign_intro', label: STORY_LOG_LABELS.campaign_intro });
    expect(entries.map(e => e.id)).toEqual(['campaign_intro', 'brief_outpost_sigma', 'brief_lunar_gate']);
  });
});
