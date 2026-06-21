import { STORY_SEQUENCES, STORY_SPEAKERS } from '../data/story.js';
import { createSequence, currentPanel, advance, isComplete } from '../systems/storySequence.js';
import { resolvePortrait } from '../systems/portraitFallback.js';

function hexColor(n) {
  return '#' + n.toString(16).padStart(6, '0');
}

export class StoryDialogOverlay {
  constructor() {
    this._overlay  = document.getElementById('story-dialog');
    this._portrait = document.getElementById('story-dialog-portrait');
    this._name     = document.getElementById('story-dialog-name');
    this._text     = document.getElementById('story-dialog-text');
    this._next     = document.getElementById('story-dialog-next');
    this._skip     = document.getElementById('story-dialog-skip');
    this._state    = null;
    this._onComplete = null;
    this._onNext   = () => this._advance();
    this._onSkip   = () => this._finish();
  }

  play(sequenceId, onComplete) {
    if (this._overlay.style.display === 'flex') this.close(); // last-wins, drop old listeners
    const seq = STORY_SEQUENCES[sequenceId];
    this._onComplete = onComplete || (() => {});
    if (!seq || seq.panels.length === 0) { this._onComplete(); this._onComplete = null; return; }
    this._state = createSequence(seq);
    this._next.addEventListener('click', this._onNext);
    this._skip.addEventListener('click', this._onSkip);
    this._overlay.style.display = 'flex';
    this._render();
  }

  _advance() {
    this._state = advance(this._state);
    if (isComplete(this._state)) { this._finish(); return; }
    this._render();
  }

  _finish() {
    const cb = this._onComplete;
    this.close();
    if (cb) cb();
  }

  _render() {
    const panel = currentPanel(this._state);
    if (!panel) return;
    const speaker = STORY_SPEAKERS[panel.speaker];
    this._name.textContent = speaker?.name ?? '';
    this._name.style.color = speaker ? hexColor(speaker.color) : '#fff';
    this._text.textContent = panel.text;
    this._renderPortrait(speaker);
    // Last panel: relabel Next to a closing verb.
    this._next.textContent = (this._state.index >= this._state.panels.length - 1) ? 'Continue ▸' : 'Next ▸';
  }

  _renderPortrait(speaker) {
    const p = resolvePortrait(speaker);
    this._portrait.replaceChildren();
    if (p.kind === 'image') {
      const img = document.createElement('img');
      img.src = `assets/portraits/${p.key}.png`;
      img.alt = speaker?.name ?? '';
      this._portrait.appendChild(img);
      this._portrait.style.background = 'transparent';
    } else {
      this._portrait.textContent = p.initial;
      this._portrait.style.background = hexColor(p.color);
    }
  }

  close() {
    this._next.removeEventListener('click', this._onNext);
    this._skip.removeEventListener('click', this._onSkip);
    this._overlay.style.display = 'none';
    this._state = null;
    this._onComplete = null;
  }
}
