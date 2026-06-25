import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoryDialogOverlay } from './StoryDialogOverlay.js';

// Mirrors src/ui/SettingsOverlay.test.js: append real elements with ids to the
// document body and use jsdom's real getElementById (no monkeypatching).
function setupDom() {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  const overlay = document.createElement('div');
  overlay.id = 'story-dialog';
  overlay.style.display = 'none';
  for (const [tag, id] of [
    ['div', 'story-dialog-portrait'], ['div', 'story-dialog-name'],
    ['div', 'story-dialog-text'], ['button', 'story-dialog-next'], ['button', 'story-dialog-skip'],
  ]) {
    const el = document.createElement(tag);
    el.id = id;
    overlay.appendChild(el);
  }
  document.body.appendChild(overlay);
}

describe('StoryDialogOverlay', () => {
  beforeEach(setupDom);

  it('renders the first panel and shows the overlay on play', () => {
    const ov = new StoryDialogOverlay();
    ov.play('campaign_intro', () => {});
    expect(document.getElementById('story-dialog').style.display).toBe('flex');
    expect(document.getElementById('story-dialog-name').textContent.length).toBeGreaterThan(0);
    expect(document.getElementById('story-dialog-text').textContent.length).toBeGreaterThan(0);
  });

  it('advances through panels and fires onComplete after the last', () => {
    const done = vi.fn();
    const ov = new StoryDialogOverlay();
    ov.play('epilogue_outpost_sigma', done); // 2 panels
    const next = document.getElementById('story-dialog-next');
    next.click();           // -> panel 2 (last)
    expect(done).not.toHaveBeenCalled();
    next.click();           // -> complete
    expect(done).toHaveBeenCalledTimes(1);
    expect(document.getElementById('story-dialog').style.display).toBe('none');
  });

  it('Skip closes and fires onComplete immediately', () => {
    const done = vi.fn();
    const ov = new StoryDialogOverlay();
    ov.play('campaign_intro', done);
    document.getElementById('story-dialog-skip').click();
    expect(done).toHaveBeenCalledTimes(1);
    expect(document.getElementById('story-dialog').style.display).toBe('none');
  });

  it('missing sequence id fires onComplete immediately without showing', () => {
    const done = vi.fn();
    const ov = new StoryDialogOverlay();
    ov.play('does_not_exist', done);
    expect(done).toHaveBeenCalledTimes(1);
    expect(document.getElementById('story-dialog').style.display).toBe('none');
  });

  it('re-entrant play does not stack Next listeners', () => {
    const ov = new StoryDialogOverlay();
    ov.play('campaign_intro', () => {});
    ov.play('epilogue_outpost_sigma', () => {}); // 2 panels, replaces
    const next = document.getElementById('story-dialog-next');
    next.click(); // advance to last of the SECOND sequence only
    // name should reflect second sequence's 2nd panel speaker (Sol Command)
    expect(document.getElementById('story-dialog-name').textContent).toContain('Command');
  });

  it('re-entrant play completes the interrupted sequence (fires its onComplete)', () => {
    const first = vi.fn();
    const ov = new StoryDialogOverlay();
    ov.play('campaign_intro', first);     // open, not yet complete
    expect(first).not.toHaveBeenCalled();
    ov.play('epilogue_outpost_sigma', () => {}); // interrupts -> first must complete
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('Escape closes and fires onComplete', () => {
    const done = vi.fn();
    const ov = new StoryDialogOverlay();
    ov.play('campaign_intro', done);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(done).toHaveBeenCalledTimes(1);
    expect(document.getElementById('story-dialog').style.display).toBe('none');
  });

  it('Escape after close does not fire onComplete again (listener removed)', () => {
    const done = vi.fn();
    const ov = new StoryDialogOverlay();
    ov.play('campaign_intro', done);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('backdrop click (on the overlay itself) closes and fires onComplete', () => {
    const done = vi.fn();
    const ov = new StoryDialogOverlay();
    ov.play('campaign_intro', done);
    const overlay = document.getElementById('story-dialog');
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true })); // target === overlay
    expect(done).toHaveBeenCalledTimes(1);
    expect(overlay.style.display).toBe('none');
  });

  it('clicking a child button does not trigger a backdrop dismiss', () => {
    const done = vi.fn();
    const ov = new StoryDialogOverlay();
    ov.play('epilogue_outpost_sigma', done); // 2 panels
    document.getElementById('story-dialog-next').click(); // advance, not dismiss
    expect(done).not.toHaveBeenCalled();
    expect(document.getElementById('story-dialog').style.display).toBe('flex');
  });
});
