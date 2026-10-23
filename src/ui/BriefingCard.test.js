import { describe, it, expect, beforeEach } from 'vitest';
import { renderBriefingCard } from './BriefingCard.js';
import { briefingCardModel, commandQuote } from '../systems/briefingCard.js';
import { CARD_COPY } from '../data/campaign.js';
import { MAPS } from '../data/maps.js';
import { starsDisplay } from '../utils/display.js';

// The card markup from index.html, by id, so the renderer is exercised against
// the elements the page actually has.
function mountCard() {
  document.body.replaceChildren();
  const root = document.createElement('div');
  root.id = 'map-featured';
  for (const id of ['featured-mission', 'featured-name', 'featured-quote', 'featured-threats', 'featured-tier', 'featured-stars']) {
    const el = document.createElement('div');
    el.id = id;
    root.appendChild(el);
  }
  const play = document.createElement('button');
  play.id = 'featured-play';
  play.textContent = CARD_COPY.launch;
  root.appendChild(play);
  document.body.appendChild(root);
  return root;
}

const $ = (id) => document.getElementById(id);
const fresh = MAPS.map(() => 0);

describe('renderBriefingCard', () => {
  let root;
  beforeEach(() => { root = mountCard(); });

  it('shows MISSION n, the name and the Command quote verbatim with the attribution', () => {
    const stars = [3, 2, 1, 0, 0, 0, 0, 0, 0, 0];
    renderBriefingCard(root, briefingCardModel(3, stars));
    expect($('featured-mission').textContent).toBe('MISSION 4');
    expect($('featured-name').textContent).toBe(MAPS[3].name);
    expect($('featured-quote').querySelector('.fq-by').textContent).toBe('SOL COMMAND');
    expect($('featured-quote').querySelector('.fq-text').textContent).toBe(commandQuote(MAPS[3].storyKey));
  });

  it('lists new threats, and hides the line when the map introduces none', () => {
    renderBriefingCard(root, briefingCardModel(0, fresh));
    const model = briefingCardModel(0, fresh);
    expect(model.threats.length).toBeGreaterThan(0);
    expect($('featured-threats').textContent).toBe(`New threat: ${model.threats.join(', ')}`);
    expect($('featured-threats').hidden).toBe(false);

    const quiet = MAPS.findIndex((_, i) => briefingCardModel(i, fresh).threats.length === 0);
    renderBriefingCard(root, briefingCardModel(quiet, fresh));
    expect($('featured-threats').textContent).toBe('');
    expect($('featured-threats').hidden).toBe(true);
  });

  it('shows the tier line, the mission stars (or empty stars) and ▶ LAUNCH', () => {
    const stars = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    renderBriefingCard(root, briefingCardModel(0, stars));
    expect($('featured-tier').textContent).toBe(`Towers upgrade to Tier ${MAPS[0].maxTierAllowed}`);
    expect($('featured-stars').textContent).toBe(starsDisplay(2));
    expect($('featured-play').textContent).toBe('▶ LAUNCH');
    renderBriefingCard(root, briefingCardModel(1, stars));
    expect($('featured-stars').textContent).toBe('☆☆☆');
  });

  it('disables LAUNCH only when the mission is not launchable', () => {
    renderBriefingCard(root, briefingCardModel(5, fresh));
    expect($('featured-play').disabled).toBe(true);
    renderBriefingCard(root, briefingCardModel(0, fresh));
    expect($('featured-play').disabled).toBe(false);
  });

  it('re-rendering replaces, never appends', () => {
    renderBriefingCard(root, briefingCardModel(0, fresh));
    renderBriefingCard(root, briefingCardModel(0, fresh));
    expect($('featured-quote').querySelectorAll('.fq-text')).toHaveLength(1);
  });
});
