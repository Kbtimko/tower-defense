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
