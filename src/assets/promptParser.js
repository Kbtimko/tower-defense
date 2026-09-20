// Parses the human-written PROMPTS.md files into machine-usable prompts.
//
// The .md files stay the single source of truth — they are what a person reads
// and edits when tuning the art direction. Parsing them (rather than keeping a
// duplicate prompt table in code) means an edit to the prose immediately
// changes what gets generated, with no second copy to forget.

// Markdown wraps prose at a column, which can split a hyphenated compound
// ("deep-\nspace"). Naively joining with a space yields "deep- space" and
// corrupts the phrase the model receives, so rejoin those without a space.
function joinWrapped(parts) {
  let out = '';
  for (const part of parts) {
    const piece = part.trim();
    if (!piece) continue;
    if (!out) { out = piece; continue; }
    out = /\w-$/.test(out) && /^[a-z]/.test(piece) ? out + piece : `${out} ${piece}`;
  }
  return out;
}

// The shared style sentence: the first blockquote whose body is a quoted,
// italicised sentence. Other blockquotes in these files carry model notes and
// must not be mistaken for it.
export function parseStyleAnchor(md) {
  const blocks = [];
  let current = [];
  for (const line of md.split('\n')) {
    if (line.startsWith('>')) {
      current.push(line.replace(/^>\s?/, ''));
    } else if (current.length) {
      blocks.push(joinWrapped(current));
      current = [];
    }
  }
  if (current.length) blocks.push(joinWrapped(current));

  const quoted = blocks.find(b => /^\*?["“]/.test(b));
  if (!quoted) return null;
  return quoted
    .replace(/^\*+/, '').replace(/\*+$/, '')     // strip italic markers
    .replace(/^["“]/, '').replace(/["”]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Overworld format:  - `file.png` — *Name:* subject text (may wrap lines)
export function parseOverworldPrompts(md) {
  const out = [];
  const lines = md.split('\n');
  let cur = null;

  for (const line of lines) {
    const start = line.match(/^-\s+`([^`]+\.png)`\s*[—-]\s*(.*)$/);
    if (start) {
      if (cur) out.push(cur);
      cur = { file: start[1], subject: start[2].trim() };
      continue;
    }
    if (cur) {
      // A continuation is an indented line that is not a new bullet or heading.
      if (/^\s+\S/.test(line) && !/^\s*[-#>|]/.test(line)) {
        cur.subject = joinWrapped([cur.subject, line]);
      } else if (line.trim() === '' || /^[-#>|]/.test(line)) {
        out.push(cur);
        cur = null;
      }
    }
  }
  if (cur) out.push(cur);

  return out.map(e => ({
    file: e.file,
    subject: cleanSubject(e.subject),
  }));
}

// Portrait format: a markdown table row
//   | `key` | **Speaker** | subject | tonal anchor |
export function parsePortraitPrompts(md) {
  const out = [];
  for (const line of md.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    if (cells.length < 3) continue;
    const keyMatch = cells[0].match(/^`([^`]+)`$/);
    if (!keyMatch || !keyMatch[1].startsWith('portrait-')) continue;
    out.push({
      key: keyMatch[1],
      speaker: cells[1].replace(/\*\*/g, '').trim(),
      subject: cleanSubject(cells[2]),
    });
  }
  return out;
}

// The sprite file keeps its shared style anchor and shared negative prompt in
// fenced code blocks under named headings, rather than the blockquote the
// overworld/portrait files use — those blockquotes carry model notes here.
export function parseFencedSection(md, heading) {
  const lines = md.split('\n');
  const at = lines.findIndex(l => /^#{1,6}\s/.test(l) && l.includes(heading));
  if (at === -1) return null;
  for (let i = at + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) return null;      // next heading, no block
    if (!/^\s*```/.test(lines[i])) continue;
    const body = [];
    for (let j = i + 1; j < lines.length && !/^\s*```/.test(lines[j]); j++) body.push(lines[j]);
    return joinWrapped(body);
  }
  return null;
}

// Per-entity sprite prompts:  - **type** — <metadata>: followed by a fenced
// block (or an inline `backtick` prompt). The category comes from the enclosing
// "### (x) Enemies / Towers / Heroes" heading; soldier and sentry live under
// the heroes heading but are their own categories.
const SECTION_CATEGORY = [
  [/enem/i, 'enemy'], [/tower/i, 'tower'], [/hero/i, 'hero'],
];

export function parseSpritePrompts(md) {
  const lines = md.split('\n');
  const out = [];
  let category = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,6}\s/.test(line)) {
      const hit = SECTION_CATEGORY.find(([re]) => re.test(line));
      category = hit ? hit[1] : null;
      continue;
    }
    if (!category) continue;

    const bullet = line.match(/^-\s+\*\*([a-z0-9_]+)\*\*\s*[—-]\s*(.*)$/i);
    if (!bullet) continue;
    const type = bullet[1];

    // Fenced form wins whenever there is a fence. The bullet's metadata may
    // wrap onto continuation lines before it opens. The scan stops at any
    // unindented line, so it cannot run into the next bullet's fence.
    let subject = null;
    let j = i + 1;
    while (j < lines.length && !/^\s*```/.test(lines[j])
           && (lines[j].trim() === '' || /^\s+\S/.test(lines[j]))) j++;
    if (j < lines.length && /^\s*```/.test(lines[j])) {
      const body = [];
      for (let k = j + 1; k < lines.length && !/^\s*```/.test(lines[k]); k++) body.push(lines[k]);
      subject = joinWrapped(body);
      i = j + body.length + 1;
    } else {
      // Inline form:  - **archer** — `#8B4513` brown: `crossbow turret`
      // Split on backticks so odd segments are exactly the quoted spans; a
      // regex here backtracks across a PAIR of spans and captures the text
      // between them. Take the last long span: barracks ends with a
      // "(no `attack`)" aside. This heuristic cannot distinguish a prompt from
      // a documented output path, which is why a fence takes precedence.
      const spans = bullet[2].split('`').filter((_, k) => k % 2 === 1);
      subject = spans.filter(x => x.length >= 15).pop() ?? null;
    }
    if (!subject) continue;

    // soldier/sentry are their own manifest categories despite sharing the
    // heroes heading, and both entities construct with type 'default' — the
    // type must be the runtime one or getSpriteConfig never matches.
    const isUnit = category === 'hero' && (type === 'soldier' || type === 'sentry');
    out.push({
      category: isUnit ? type : category,
      type: isUnit ? 'default' : type,
      subject: cleanSubject(subject),
    });
  }
  return out;
}

// Strip the leading "*Name:*" label and markdown emphasis, leaving the prose a
// diffusion model should actually receive.
function cleanSubject(raw) {
  return raw
    .replace(/^\*[^*]+:\*\s*/, '')     // *Outpost Sigma:* ...
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// The full prompt handed to the model: shared style sentence, then the subject.
export function buildPrompt(styleAnchor, subject) {
  const style = (styleAnchor ?? '').trim().replace(/[.\s]*$/, '');
  const body = subject.trim().replace(/^[.\s]+/, '');
  return style ? `${style}. ${body}` : body;
}
