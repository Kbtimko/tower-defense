import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseStyleAnchor, parseOverworldPrompts, parsePortraitPrompts, buildPrompt,
  parseFencedSection, parseSpritePrompts,
} from './promptParser.js';
import { MAPS } from '../data/maps.js';
import { STORY_SPEAKERS } from '../data/story.js';

const overworldMd = readFileSync('public/assets/overworld/PROMPTS.md', 'utf8');
const portraitMd  = readFileSync('public/assets/portraits/PROMPTS.md', 'utf8');
const spriteMd    = readFileSync('public/assets/sprites/PROMPTS.md', 'utf8');

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

  it('no real style anchor quotes a proper noun the model would render as text', () => {
    // FLUX runs at CFG 0, so negative prompts are inert and a quoted title in
    // the positive prompt gets drawn as poster lettering. This bit four of the
    // ten overworld nodes once; the anchors must stay free of quoted names.
    for (const [name, md] of [['overworld', overworldMd], ['portraits', portraitMd]]) {
      const style = parseStyleAnchor(md);
      expect(style, `${name} anchor missing`).toBeTruthy();
      expect(style, `${name} anchor quotes a proper noun`).not.toMatch(/['"“][A-Z][\w ]+['"”]/);
      expect(style.toLowerCase(), `${name} anchor names the game`).not.toContain('last light');
    }
  });

  it('the anchor is not polluted by an adjacent explanatory blockquote', () => {
    // Notes in these files must be plain prose; adjacent > lines merge into one
    // block and would otherwise be sent to the model as part of the style.
    for (const md of [overworldMd, portraitMd]) {
      const style = parseStyleAnchor(md);
      expect(style).not.toMatch(/\*\*/);          // markdown bold leaking in
      expect(style.length).toBeLessThan(400);
    }
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


describe('parseFencedSection', () => {
  it('returns the fenced block under the named heading, unwrapped', () => {
    const md = [
      '## Shared style anchor (paste into EVERY sprite prompt)',
      '',
      '```',
      '(top-down 3/4 game sprite:1.2), sci-fi unit,',
      'bold readable silhouette',
      '```',
      '',
      '## Shared negative prompt',
      '',
      '```',
      'photo, text, watermark',
      '```',
    ].join('\n');
    expect(parseFencedSection(md, 'Shared style anchor'))
      .toBe('(top-down 3/4 game sprite:1.2), sci-fi unit, bold readable silhouette');
    expect(parseFencedSection(md, 'Shared negative prompt')).toBe('photo, text, watermark');
  });

  it('returns null when the heading is absent', () => {
    expect(parseFencedSection('## Other\n\n```\nx\n```', 'Shared style anchor')).toBeNull();
  });
});

describe('parseSpritePrompts', () => {
  it('pairs each entity bullet with the fenced prompt beneath it', () => {
    const md = [
      '### (b) Enemies — `public/assets/sprites/enemies/`',
      '',
      '- **drone** — `Veth Drone`, hp 70, ground, tint `#33ff66`:',
      '  ```',
      '  small alien recon drone, hexagonal chitin carapace, single glowing green',
      '  optic, four skittering biomech legs',
      '  ```',
      '- **skitter** — `Veth Skitter`, fast, ground, tint `#ff6600`:',
      '  ```',
      '  fast insectoid skirmisher, sharp diamond-shaped body',
      '  ```',
    ].join('\n');
    expect(parseSpritePrompts(md)).toEqual([
      { category: 'enemy', type: 'drone',
        subject: 'small alien recon drone, hexagonal chitin carapace, single glowing green optic, four skittering biomech legs' },
      { category: 'enemy', type: 'skitter',
        subject: 'fast insectoid skirmisher, sharp diamond-shaped body' },
    ]);
  });

  it('derives the category from the section heading', () => {
    const md = [
      '### (c) Towers — `assets/sprites/towers/`',
      '',
      '- **archer** — `#8B4513` brown: `crossbow turret`',
      '',
      '### (d) Heroes / Soldiers / Sentries',
      '',
      '- **rael** — `Commander Rael`:',
      '  ```',
      '  human Vanguard commander',
      '  ```',
      '- **soldier** — barracks green:',
      '  ```',
      '  small infantry trooper',
      '  ```',
      '- **sentry** — engineer copper:',
      '  ```',
      '  small deployable auto-turret',
      '  ```',
    ].join('\n');
    const got = parseSpritePrompts(md);
    expect(got.map(e => [e.category, e.type])).toEqual([
      ['tower', 'archer'], ['hero', 'rael'], ['soldier', 'soldier'], ['sentry', 'sentry'],
    ]);
  });
});

describe('the real sprites PROMPTS.md', () => {
  it('yields a prompt for every enemy in ENEMY_DEFS', async () => {
    const { ENEMY_DEFS } = await import('../data/enemies.js');
    const enemies = parseSpritePrompts(spriteMd).filter(e => e.category === 'enemy');
    expect(enemies.map(e => e.type).sort()).toEqual(Object.keys(ENEMY_DEFS).sort());
    for (const e of enemies) expect(e.subject.length).toBeGreaterThan(20);
  });

  it('exposes the shared style anchor and negative prompt', () => {
    expect(parseFencedSection(spriteMd, 'Shared style anchor')).toMatch(/game sprite/);
    expect(parseFencedSection(spriteMd, 'Shared negative prompt')).toMatch(/watermark/);
  });
});
