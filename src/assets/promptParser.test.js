import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseStyleAnchor, parseOverworldPrompts, parsePortraitPrompts, buildPrompt,
} from './promptParser.js';
import { MAPS } from '../data/maps.js';
import { STORY_SPEAKERS } from '../data/story.js';

const overworldMd = readFileSync('public/assets/overworld/PROMPTS.md', 'utf8');
const portraitMd  = readFileSync('public/assets/portraits/PROMPTS.md', 'utf8');

describe('parseStyleAnchor', () => {
  it('picks the quoted style sentence, not a neighbouring model note', () => {
    const md = [
      '> **Model:** FLUX.1 [schnell], run locally.',
      '',
      '> *"A painted icon, centered subject, no text."*',
      '',
    ].join('\n');
    expect(parseStyleAnchor(md)).toBe('A painted icon, centered subject, no text.');
  });

  it('joins a style sentence wrapped across several quoted lines', () => {
    const md = '> *"A painted sci-fi icon,\n> centered single subject,\n> no text."*';
    expect(parseStyleAnchor(md)).toBe('A painted sci-fi icon, centered single subject, no text.');
  });

  it('rejoins a hyphenated compound split across lines, without inserting a space', () => {
    const md = '> *"A painted icon on a dark deep-\n> space background, no text."*';
    expect(parseStyleAnchor(md)).toBe('A painted icon on a dark deep-space background, no text.');
  });

  it('does not glue a trailing hyphen onto a capitalised next word', () => {
    const md = '> *"Ends with a dash -\n> Next sentence."*';
    expect(parseStyleAnchor(md)).toBe('Ends with a dash - Next sentence.');
  });

  it('returns null when there is no quoted blockquote', () => {
    expect(parseStyleAnchor('# Heading\n\nSome prose.\n')).toBeNull();
  });

  it('finds a style anchor in both real PROMPTS.md files', () => {
    expect(parseStyleAnchor(overworldMd)).toMatch(/campaign-map icon/i);
    expect(parseStyleAnchor(portraitMd)).toMatch(/character portrait/i);
  });
});

describe('parseOverworldPrompts', () => {
  it('reads filename and subject from a bullet, stripping the name label', () => {
    const md = '- `overworld_0_x.png` — *Outpost Sigma:* a small fortified outpost.';
    expect(parseOverworldPrompts(md)).toEqual([
      { file: 'overworld_0_x.png', subject: 'a small fortified outpost.' },
    ]);
  });

  it('joins a subject that wraps onto continuation lines', () => {
    const md = [
      '- `overworld_1_y.png` — *Lunar Gate:* a moon base with a glowing',
      '  transit ring-gate, cold blue light.',
      '',
    ].join('\n');
    expect(parseOverworldPrompts(md)[0].subject)
      .toBe('a moon base with a glowing transit ring-gate, cold blue light.');
  });

  it('does not swallow the following bullet into the previous subject', () => {
    const md = [
      '- `a.png` — *A:* first subject.',
      '- `b.png` — *B:* second subject.',
    ].join('\n');
    const out = parseOverworldPrompts(md);
    expect(out).toHaveLength(2);
    expect(out[0].subject).toBe('first subject.');
    expect(out[1].subject).toBe('second subject.');
  });

  it('rejoins hyphenated wraps inside a subject too', () => {
    const md = [
      '- `x.png` — *X:* an ominous deep-',
      '  purple void with cold stars.',
      '',
    ].join('\n');
    expect(parseOverworldPrompts(md)[0].subject)
      .toBe('an ominous deep-purple void with cold stars.');
  });

  it('no parsed prompt contains a broken hyphen-space artefact', () => {
    for (const p of parseOverworldPrompts(overworldMd)) {
      expect(p.subject, `${p.file} has "- " artefact`).not.toMatch(/\w- /);
    }
    expect(parseStyleAnchor(overworldMd)).not.toMatch(/\w- /);
  });

  it('extracts exactly one prompt per map that declares overworld art', () => {
    const parsed = parseOverworldPrompts(overworldMd);
    const wanted = MAPS.filter(m => m.overworldArt).map(m => m.overworldArt);
    expect(parsed.map(p => p.file).sort()).toEqual([...wanted].sort());
  });

  it('produces a non-trivial subject for every node', () => {
    for (const p of parseOverworldPrompts(overworldMd)) {
      expect(p.subject.length, `${p.file} subject too short`).toBeGreaterThan(20);
      expect(p.subject).not.toMatch(/^\*/);
    }
  });
});

describe('parsePortraitPrompts', () => {
  it('reads key, speaker and subject from a table row', () => {
    const md = [
      '| Key | Speaker | Subject | Tonal |',
      '|-----|---------|---------|-------|',
      '| `portrait-x` | **Someone** | a stern officer, blue uniform. | `#fff` |',
    ].join('\n');
    expect(parsePortraitPrompts(md)).toEqual([
      { key: 'portrait-x', speaker: 'Someone', subject: 'a stern officer, blue uniform.' },
    ]);
  });

  it('ignores table rows that are not portrait keys', () => {
    const md = '| `not-a-portrait` | x | y | z |\n| `portrait-a` | S | subj | t |';
    expect(parsePortraitPrompts(md).map(p => p.key)).toEqual(['portrait-a']);
  });

  it('covers every speaker key the game actually asks for', () => {
    const parsed = parsePortraitPrompts(portraitMd).map(p => p.key).sort();
    const wanted = [...new Set(Object.values(STORY_SPEAKERS).map(s => s.portraitKey))].sort();
    expect(parsed).toEqual(wanted);
  });
});

describe('buildPrompt', () => {
  it('joins the style anchor and subject with a single separator', () => {
    expect(buildPrompt('A painted icon, no text.', 'a moon base.'))
      .toBe('A painted icon, no text. a moon base.');
  });

  it('tolerates a missing style anchor', () => {
    expect(buildPrompt(null, 'a moon base.')).toBe('a moon base.');
  });

  it('does not double up punctuation or whitespace', () => {
    expect(buildPrompt('Style.  ', '  subject.')).toBe('Style. subject.');
  });
});
