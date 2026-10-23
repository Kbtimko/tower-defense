import { CARD_COPY } from '../data/campaign.js';
import { starsDisplay } from '../utils/display.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

// Renders a briefingCardModel into #map-featured. Ids are kept because the capture
// harness and the scene tests address them. All text is DOM (no canvas text).
export function renderBriefingCard(rootEl, model) {
  const $ = (id) => rootEl.querySelector(`#${id}`);

  $('featured-mission').textContent = `${CARD_COPY.missionPrefix}${model.missionNo}`;
  $('featured-name').textContent = model.name;

  // <q> supplies the quotation marks, so the text node stays the verbatim line.
  $('featured-quote').replaceChildren(
    el('span', 'fq-by', CARD_COPY.attribution),
    el('q', 'fq-text', model.quote),
  );

  const threats = $('featured-threats');
  if (model.threats.length > 0) {
    threats.replaceChildren(CARD_COPY.threatPrefix, el('strong', '', model.threats.join(', ')));
    threats.hidden = false;
  } else {
    threats.replaceChildren();
    threats.hidden = true;
  }

  $('featured-tier').textContent = `${CARD_COPY.tierPrefix}${model.maxTier}`;
  $('featured-stars').textContent = model.stars > 0 ? starsDisplay(model.stars) : CARD_COPY.noStars;

  const play = $('featured-play');
  play.textContent = CARD_COPY.launch;
  play.disabled = !model.launchable;
}
