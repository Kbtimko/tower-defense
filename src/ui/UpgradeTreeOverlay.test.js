import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UpgradeTreeOverlay } from './UpgradeTreeOverlay.js';

function setupDom() {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  const overlay = document.createElement('div');
  overlay.id = 'upgrade-overlay';
  overlay.style.display = 'none';

  const avail = document.createElement('span');
  avail.id = 'upgrade-available';
  overlay.appendChild(avail);

  const closeBtn = document.createElement('button');
  closeBtn.id = 'upgrade-close';
  overlay.appendChild(closeBtn);

  const tree = document.createElement('div');
  tree.id = 'upgrade-tree';
  overlay.appendChild(tree);

  document.body.appendChild(overlay);
}

function makeMgr() {
  return {
    getAvailableStars: vi.fn(() => 5),
    getNodeState:      vi.fn(() => 'affordable'),
    purchase:          vi.fn(),
    refund:            vi.fn(),
  };
}

beforeEach(() => setupDom());

describe('UpgradeTreeOverlay (post-refactor)', () => {
  it('open() shows overlay and renders exactly 2 branch columns', () => {
    const ov = new UpgradeTreeOverlay(makeMgr());
    ov.open();
    expect(document.getElementById('upgrade-overlay').style.display).toBe('flex');
    const cols = document.querySelectorAll('.upgrade-branch');
    expect(cols.length).toBe(2);
    const headings = Array.from(cols).map(c => c.querySelector('h3').textContent);
    expect(headings).toEqual(['Logistics', 'Arsenal']);
  });

  it('no rael/engineer/scout/pyro branch headings render', () => {
    const ov = new UpgradeTreeOverlay(makeMgr());
    ov.open();
    const headings = Array.from(document.querySelectorAll('.upgrade-branch h3'))
      .map(h => h.textContent.toLowerCase());
    for (const banned of ['rael', 'engineer', 'scout', 'pyromancer']) {
      expect(headings.some(h => h.includes(banned))).toBe(false);
    }
  });

  it('Available chip reflects getAvailableStars', () => {
    const mgr = makeMgr();
    mgr.getAvailableStars.mockReturnValue(7);
    new UpgradeTreeOverlay(mgr).open();
    expect(document.getElementById('upgrade-available').textContent).toBe('Available: 7★');
  });

  it('close-button click closes the overlay', () => {
    const ov = new UpgradeTreeOverlay(makeMgr());
    ov.open();
    document.getElementById('upgrade-close').click();
    expect(document.getElementById('upgrade-overlay').style.display).toBe('none');
  });

  it('close() then open() does not stack close-button listeners', () => {
    const mgr = makeMgr();
    const ov  = new UpgradeTreeOverlay(mgr);
    ov.open(); ov.close(); ov.open();
    document.getElementById('upgrade-close').click();
    expect(document.getElementById('upgrade-overlay').style.display).toBe('none');
    // No second click needed — first click should have closed cleanly.
  });
});
