import Phaser from 'phaser';
import { MAPS } from '../data/maps.js';
import { ROUTE, LAYOUT, EARTH, NODE_PULSE_MS, ARRIVAL } from '../data/worldMap.js';
import { FULLSCREEN_COPY } from '../data/campaign.js';
import { SaveManager } from '../systems/SaveManager.js';
import { starsDisplay } from '../utils/display.js';
import { classifyOverworld } from '../systems/overworldState.js';
import { starsArray, frontierIndex, bannerFor } from '../systems/campaignProgress.js';
import { briefingCardModel } from '../systems/briefingCard.js';
import { layoutClass, routeFrameFor, cardWidth, nodeRects } from '../systems/worldMapLayout.js';
import { routePoints, routeParamAt, frontRadius, parkShip } from '../systems/worldRoute.js';
import { worldBackdropSource } from '../systems/worldBackdrop.js';
import { planArrival, arrivalFrame } from '../systems/arrivalPlan.js';
import { WorldMapRenderer } from '../ui/WorldMapRenderer.js';
import { renderBriefingCard } from '../ui/BriefingCard.js';
import { UpgradeManager }         from '../systems/UpgradeManager.js';
import { UpgradeTreeOverlay }     from '../ui/UpgradeTreeOverlay.js';
import { SettingsOverlay }        from '../ui/SettingsOverlay.js';
import { HeroManagementOverlay }  from '../ui/HeroManagementOverlay.js';
import { StoryDialogOverlay }     from '../ui/StoryDialogOverlay.js';
import { storyLogEntries }        from '../data/story.js';
import { CodexOverlay }           from '../ui/CodexOverlay.js';
import { buildCatalog, progressFromSave } from '../systems/codexCatalog.js';
import { fullscreenSupported, isFullscreen, toggleFullscreen } from '../ui/fullscreen.js';

// Everything a tap that dismissed the title (or the key that did) can still emit.
const GUARDED_EVENTS = ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup'];
const SECTORS_COUNT = /(\d+ of \d+)/;
const NODE_STATES = ['completed', 'next', 'unlocked', 'locked'];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Re-runs a one-shot CSS animation class (a stamp, a cross-fade).
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// The world map (spec 2.2). Scene key and #map-select id are kept for the harness;
// the player sees "World Map". DOM holds every word and control; the two canvases
// in #map-overworld (WorldMapRenderer) hold the vista and the story layer.
export default class MapSelectScene extends Phaser.Scene {
  constructor() {
    super('MapSelectScene');
    // Bound once so add/removeEventListener see the same reference.
    this._onFullscreenChange = this._onFullscreenChange.bind(this);
    this._layout = this._layout.bind(this);
    this._swallow = this._swallow.bind(this);
    this._endInputGuard = this._endInputGuard.bind(this);
    this._syncQuoteFade = this._syncQuoteFade.bind(this);
    this._tickArrival = this._tickArrival.bind(this);
    this._skipArrival = this._skipArrival.bind(this);
    this._onArrivalVisibility = this._onArrivalVisibility.bind(this);
  }

  create(data = {}) {
    // `once`, not `on`: the scene emitter outlives a shutdown, so `on` stacks
    // another copy every time create() runs and shutdown() then runs once per
    // entry. Same root cause as the GameScene spawn-duplication bug.
    this.events.once('shutdown', this.shutdown, this);

    this._root = document.getElementById('map-select');
    this._overworld = document.getElementById('map-overworld');
    this._root.style.display = 'block';
    this._startInputGuard();

    this._saveMgr    = new SaveManager();
    this._upgradeMgr = new UpgradeManager(this._saveMgr);
    this._overlay    = new UpgradeTreeOverlay(this._upgradeMgr);
    this._heroOverlay = new HeroManagementOverlay(this._upgradeMgr, this._saveMgr);
    this._storyDialog = new StoryDialogOverlay();

    // Sanitized once: garbage in the save reads as 0 stars everywhere below.
    this._stars = starsArray(this._saveMgr, MAPS);
    this._frontier = frontierIndex(this._stars);
    this._totalStars = this._stars.reduce((sum, n) => sum + n, 0);
    this._selectedId = this._defaultSelection(data?.from);
    this._overworld.dataset.arrival = 'none';
    this._prepareArrival(data?.from);

    this._renderer = new WorldMapRenderer({
      backdrop: document.getElementById('wm-backdrop'),
      story: document.getElementById('wm-story'),
      maxDpr: LAYOUT.maxCanvasDpr,
      source: worldBackdropSource(this.game.registry.get('worldBackdrop')),
      motion: () => this._syncMotion(),
    });
    this._syncMotion();

    this._quote = document.getElementById('featured-quote');
    this._quote.addEventListener('scroll', this._syncQuoteFade);
    this._populateOverworld();
    this._renderProgress();
    this._renderFeatured(this._selectedId);
    this._bindPlay();
    this._renderMetaBar();
    this._renderStats();
    this._bindUpgrades();
    this._bindHeroes();
    this._bindSettings();
    this._bindCodex();
    this._bindStoryLog();
    this._bindFullscreen();

    this._layout();
    window.addEventListener('resize', this._layout);
    window.addEventListener('orientationchange', this._layout);
    // Labels re-measure once the webfonts land (old WebViews have no FontFaceSet).
    this._fonts = document.fonts;
    this._fonts?.addEventListener?.('loadingdone', this._layout);

    const am = this.game.registry.get('audio');
    if (am) am.playMusic('menu');

    if (this._saveMgr.hasSeenBeat('campaign_intro')) {
      this._beginArrival();
    } else {
      // The movement waits for the dialog (spec 2.3): it starts when it closes.
      if (this._frame) this._overworld.dataset.arrival = 'waiting';
      this._storyDialog.play('campaign_intro', () => {
        this._saveMgr.markBeatSeen('campaign_intro');
        this._beginArrival();
      });
    }
  }

  // A return from a mission reopens the mission just played (a retry is one tap,
  // a replay keeps its card); a first clear then moves on to the next mission
  // through the arrival. The title opens on the frontier.
  _defaultSelection(from) {
    const last = MAPS.length - 1;
    const id = from?.mapId;
    if (Number.isInteger(id) && id >= 0 && id <= last && this._isOpen(id)) return id;
    return Math.min(this._frontier, last);
  }

  // The map opens at its pre-win state: the won map shows its old stars and, on a
  // first clear, is still the frontier. `_frame` is null when nothing plays.
  _prepareArrival(from) {
    this._plan = planArrival({ from, stars: this._stars });
    this._frame = this._plan.kind === 'none' ? null : arrivalFrame(this._plan, 0);
    this._preStars = this._stars.slice();
    if (this._frame) this._preStars[this._plan.mapId] = this._plan.prevStars;
    this._preFrontier = frontierIndex(this._preStars);
  }

  _beginArrival() {
    if (!this._frame) return;
    if (!this._syncMotion()) {
      this._finishArrival();
      return;
    }
    this._overworld.dataset.arrival = 'playing';
    this._root.addEventListener('pointerdown', this._skipArrival, true);
    this._root.addEventListener('keydown', this._skipArrival, true);
    document.addEventListener('visibilitychange', this._onArrivalVisibility);
    this._arrivalT0 = performance.now();
    this._arrivalRaf = requestAnimationFrame(this._tickArrival);
  }

  // The clock is performance.now(), not frame count, so a slow device still
  // lands on time.
  _tickArrival() {
    this._arrivalRaf = 0;
    const frame = arrivalFrame(this._plan, Math.max(0, performance.now() - this._arrivalT0));
    if (frame.done) {
      this._finishArrival();
      return;
    }
    this._applyFrame(frame);
    this._arrivalRaf = requestAnimationFrame(this._tickArrival);
  }

  // Any tap or key jumps to the end and is swallowed; the guard window then eats
  // the rest of that gesture (pointerup, click), so it can't select or launch.
  _skipArrival(e) {
    e.preventDefault();
    e.stopPropagation();
    this._finishArrival();
    this._guardInput();
  }

  // The rAF stalls while hidden; on return the arrival jumps to its end state.
  _onArrivalVisibility() {
    if (!document.hidden) this._finishArrival();
  }

  _stopArrival() {
    if (this._arrivalRaf) cancelAnimationFrame(this._arrivalRaf);
    this._arrivalRaf = 0;
    this._root?.removeEventListener('pointerdown', this._skipArrival, true);
    this._root?.removeEventListener('keydown', this._skipArrival, true);
    document.removeEventListener('visibilitychange', this._onArrivalVisibility);
  }

  _finishArrival() {
    if (!this._frame) return;
    this._stopArrival();
    this._applyFrame(arrivalFrame(this._plan, Infinity));
    this._frame = null;
    this._wonNode().classList.remove('wm-focus');
    this._renderProgress();
    this._renderStory();
    this._overworld.dataset.arrival = 'done';
  }

  _wonNode() {
    return this._overworld.querySelector(`.ow-node[data-map-id="${this._plan.mapId}"]`);
  }

  // One arrival frame into the DOM and the story canvas. DOM writes only happen
  // on a beat change, so the stamp and cross-fade animations run once each.
  _applyFrame(frame) {
    const prev = this._frame;
    this._frame = frame;
    const won = this._wonNode();
    won.classList.toggle('wm-focus', frame.focus > 0 && !frame.cardOpen);
    if (this._lit(frame) !== this._lit(prev)) {
      this._renderProgress();
    } else if (frame.stamped !== prev.stamped) {
      this._renderNodes();
    }
    if (frame.stamped !== prev.stamped) replay(won.querySelector('.ow-node-stars'), 'wm-stamp');
    const target = this._plan.toId ?? this._plan.mapId;
    if (frame.cardOpen && this._selectedId !== target) this._selectMap(target);
    this._renderStory();
  }

  // Lit = the post-win progress shows (the next node's beat, or the end).
  _lit(frame) {
    return !frame || frame.nextLit || frame.done;
  }

  // The stars the nodes, banner and data-frontier show right now.
  _shownStars() {
    return this._lit(this._frame) ? this._stars : this._preStars;
  }

  _isOpen(mapId) {
    return mapId === 0 || this._stars[mapId - 1] > 0;
  }

  // Reduced motion is read live (Settings can flip it on the map) and applied as a
  // class, because the saved setting can override the OS preference (spec 6).
  _syncMotion() {
    const on = this.game.registry.get('ambientMotion') !== false;
    this._root.classList.toggle('motion-off', !on);
    return on;
  }

  // A tap or key that left the title can't select or launch anything here.
  _startInputGuard() {
    delete this._overworld.dataset.ready;
    this._guardInput();
  }

  _guardInput() {
    if (this._guardTimer) return;
    for (const type of GUARDED_EVENTS) document.addEventListener(type, this._swallow, true);
    this._guardTimer = setTimeout(this._endInputGuard, LAYOUT.inputGuardMs);
  }

  _swallow(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  _endInputGuard() {
    this._stopInputGuard();
    this._overworld.dataset.ready = '1';
  }

  _stopInputGuard() {
    if (!this._guardTimer) return;
    clearTimeout(this._guardTimer);
    this._guardTimer = 0;
    for (const type of GUARDED_EVENTS) document.removeEventListener(type, this._swallow, true);
  }

  // The math viewport is #map-select's content box: the same box the CSS lays the
  // regions out in, safe-area padding already excluded.
  _measure() {
    const rect = this._root.getBoundingClientRect();
    const cs = getComputedStyle(this._root);
    const pad = (side) => parseFloat(cs[`padding${side}`]) || 0;
    return {
      origin: { x: pad('Left'), y: pad('Top') },
      box: { width: rect.width, height: rect.height },
      viewport: {
        width: rect.width - pad('Left') - pad('Right'),
        height: rect.height - pad('Top') - pad('Bottom'),
      },
    };
  }

  _publishVars(cls, viewport) {
    const vars = {
      '--wm-top': LAYOUT.topBand[cls],
      '--wm-card-w': cardWidth(viewport, cls),
      '--wm-stats': LAYOUT.statsStrip[cls],
      '--wm-gutter': LAYOUT.gutter,
      '--wm-node': LAYOUT.node[cls].d,
      '--wm-node-final': LAYOUT.node[cls].final,
      '--wm-label-w': LAYOUT.labelW[cls],
    };
    for (const [name, px] of Object.entries(vars)) this._root.style.setProperty(name, `${px}px`);
    this._root.style.setProperty('--wm-pulse', `${NODE_PULSE_MS}ms`);
    this._root.style.setProperty('--wm-focus-scale', String(ARRIVAL.focusScale));
    this._root.style.setProperty('--wm-focus-ms', `${ARRIVAL.focusMs}ms`);
    this._root.style.setProperty('--wm-stamp-scale', String(ARRIVAL.stampScale));
    this._root.style.setProperty('--wm-stamp-ms', `${ARRIVAL.stampEachMs}ms`);
    this._root.style.setProperty('--wm-light-ms', `${ARRIVAL.lightMs}ms`);
  }

  // Re-measure, recompute the frame, publish the --wm-* vars, place the nodes and
  // tags, redraw. Bound to resize / orientationchange / fonts loadingdone.
  _layout() {
    if (!this._renderer) return;
    const { origin, box, viewport } = this._measure();
    const cls = layoutClass(viewport);
    this._publishVars(cls, viewport);
    this._syncQuoteFade();
    // Hidden or not laid out yet (jsdom): nothing to place.
    if (!(viewport.width > 0 && viewport.height > 0)) return;

    const f = routeFrameFor(viewport, cls);
    const frame = { ...f, x: f.x + origin.x, y: f.y + origin.y };
    const points = routePoints(frame, ROUTE);
    this._cls = cls;
    this._geom = { points, rects: nodeRects(frame, ROUTE, cls), frame };

    for (const btn of this._overworld.querySelectorAll('.ow-node')) {
      const p = points[Number(btn.dataset.mapId) + 1];
      btn.style.left = `${p.x}px`;
      btn.style.top = `${p.y}px`;
    }
    this._placeTags(frame, points, cls);

    this._renderer.resize(frame, box);
    this._renderStory();
  }

  // EARTH sits under the Earth globe; the hive tag sits above node 10, held inside
  // the route frame so it never runs under the briefing card.
  _placeTags(frame, points, cls) {
    const earthTag = document.getElementById('wm-earth-tag');
    const hiveTag = document.getElementById('wm-hive-tag');
    const earth = points[0];
    const earthR = EARTH.r * Math.min(frame.w, frame.h);
    earthTag.style.left = `${earth.x}px`;
    earthTag.style.top = `${earth.y + earthR + LAYOUT.tagGap}px`;

    const hive = points[points.length - 1];
    const half = hiveTag.offsetWidth / 2;
    const x = Math.min(Math.max(hive.x, frame.x + half), frame.x + frame.w - half);
    hiveTag.style.left = `${x}px`;
    hiveTag.style.top = `${hive.y - LAYOUT.node[cls].final / 2 - LAYOUT.tagGap}px`;
  }

  _renderStory() {
    if (this._geom) this._renderer.render(this._storyState());
  }

  // The story state for a frontier: trail and ship at it, haze edge through it;
  // all cleared -> trail to the hive, no haze, the hive glow dimmed.
  _storyAt(frontier) {
    const { points, rects, frame } = this._geom;
    const idx = Math.min(frontier, MAPS.length - 1) + 1;
    const cleared = frontier >= MAPS.length;
    return {
      points,
      trailT: routeParamAt(points, idx),
      frontR: frontRadius(points, frontier),
      frontAlpha: cleared ? 0 : 1,
      ship: parkShip(points, idx, rects, frame),
      hiveDim: cleared ? 1 : 0,
    };
  }

  // Mid-arrival the story is a blend of the pre- and post-win states by the
  // frame's fractions, recomputed from the current geometry, so a resize keeps
  // going (spec 5). Without an arrival it is the saved frontier's state.
  _storyState() {
    const end = this._storyAt(this._frontier);
    const f = this._frame;
    if (!f) return end;
    const start = this._storyAt(this._preFrontier);
    return {
      points: end.points,
      trailT: lerp(start.trailT, end.trailT, f.trailT),
      frontR: lerp(start.frontR, end.frontR, f.frontT),
      frontAlpha: lerp(start.frontAlpha, end.frontAlpha, f.frontT),
      ship: {
        param: lerp(start.ship.param, end.ship.param, f.shipT),
        offset: lerp(start.ship.offset, end.ship.offset, f.shipT),
      },
      hiveDim: lerp(start.hiveDim, end.hiveDim, f.frontT),
    };
  }

  // Nodes go in their own container: #map-overworld also holds the canvases and
  // the Earth/hive tags, which must survive a re-render. States are applied by
  // _renderNodes, since an arrival changes them in place.
  _populateOverworld() {
    document.getElementById('wm-nodes').replaceChildren(...MAPS.map(m => this._nodeButton(m)));
  }

  _nodeButton(map) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ow-node' + (map.id === MAPS.length - 1 ? ' final' : '');
    btn.dataset.mapId = String(map.id);
    btn.setAttribute('aria-label', `${map.id + 1} · ${map.name}`);

    const art = document.createElement('img');
    art.className = 'ow-node-art';
    art.src       = `assets/overworld/${map.overworldArt}`;
    art.alt       = '';
    art.onerror   = () => { art.remove(); btn.classList.add('ow-node-fallback'); };

    const num = document.createElement('span');
    num.className   = 'ow-node-num';

    const label = document.createElement('span');
    label.className   = 'ow-node-label';
    label.textContent = `${map.id + 1} · ${map.name}`;

    // A sibling of the label, not a child: compact CSS hides the label only.
    const stars = document.createElement('span');
    stars.className = 'ow-node-stars';

    btn.append(art, num, label, stars);
    // A node can unlock mid-arrival, so every node listens; disabled ones can't select.
    btn.addEventListener('click', () => { if (!btn.disabled) this._selectMap(map.id); });
    return btn;
  }

  // Node states from the shown stars; the won node shows the arrival's stamped
  // count while it plays.
  _renderNodes() {
    const shown = this._shownStars();
    const entries = MAPS.map(m => ({ id: m.id, unlocked: m.id === 0 || shown[m.id - 1] > 0, stars: shown[m.id] }));
    const stamping = this._frame ? this._plan.mapId : null;
    for (const node of classifyOverworld(entries, MAPS.length - 1)) {
      const btn = this._overworld.querySelector(`.ow-node[data-map-id="${node.id}"]`);
      const locked = node.state === 'locked';
      btn.classList.remove(...NODE_STATES);
      btn.classList.add(node.state);
      btn.classList.toggle('active', node.id === this._selectedId && !locked);
      // Disabled: no click from mouse, Enter or Space, so a locked node can't select.
      btn.disabled = locked;
      btn.querySelector('.ow-node-num').textContent = locked ? '🔒' : String(node.id + 1);
      const n = node.id === stamping ? this._frame.stamped : node.stars;
      btn.querySelector('.ow-node-stars').textContent = node.unlocked ? (n > 0 ? starsDisplay(n) : '—') : '';
    }
  }

  // Nodes, banner and data-frontier, from the shown (pre- or post-win) stars.
  _renderProgress() {
    const shown = this._shownStars();
    this._overworld.dataset.frontier = String(frontierIndex(shown));
    this._renderNodes();
    this._renderBanner(shown);
  }

  _selectMap(mapId) {
    this._selectedId = mapId;
    this._overworld.querySelectorAll('.ow-node.active').forEach(n => n.classList.remove('active'));
    this._overworld.querySelector(`.ow-node[data-map-id="${mapId}"]`)?.classList.add('active');
    this._renderFeatured(mapId);
  }

  // A line whose text changes (the arrival's lit beat) cross-fades in.
  _renderBanner(stars) {
    const b = bannerFor(stars);
    const banner = document.getElementById('wm-banner');
    for (const [sel, text] of [['.wm-act', b.act], ['.wm-objective', b.objective]]) {
      const line = banner.querySelector(sel);
      if (line.textContent === text) continue;
      const first = line.textContent === '';
      line.textContent = text;
      if (!first) replay(line, 'wm-fade');
    }
    // The count is gold (mockup); the text stays exactly bannerFor's line.
    const [before, count, after] = b.sectors.split(SECTORS_COUNT);
    const strong = document.createElement('strong');
    strong.textContent = count ?? '';
    banner.querySelector('.wm-sectors').replaceChildren(before, strong, after ?? '');
  }

  _renderFeatured(mapId) {
    renderBriefingCard(document.getElementById('map-featured'), briefingCardModel(mapId, this._stars));
    this._quote.scrollTop = 0;
    this._syncQuoteFade();
  }

  // The quote is the card's only scrolling region; while more of it sits below
  // the fold, a bottom fade (.fq-more) says so. Gone once scrolled to the end.
  _syncQuoteFade() {
    const q = this._quote;
    q.classList.toggle('fq-more', q.scrollTop + q.clientHeight < q.scrollHeight - 1);
  }

  _bindPlay() {
    // Clone removes any prior event listener before re-adding (across scene re-entries).
    const old = document.getElementById('featured-play');
    const btn = old.cloneNode(true);
    old.replaceWith(btn);
    btn.addEventListener('click', () => {
      if (!this._isOpen(this._selectedId)) return;
      this.scene.start('GameScene', {
        mapId:  this._selectedId,
        heroId: this._saveMgr.getSelectedHero(),
      });
    });
  }

  _renderMetaBar() {
    document.getElementById('total-stars').textContent =
      `★ ${this._totalStars} / 30`;
  }

  _renderStats() {
    const s   = this._saveMgr.getStats();
    const el  = document.getElementById('lifetime-stats');
    el.replaceChildren();
    const chips = [
      ['Kills',       s.kills],
      ['Games',       s.gamesPlayed],
      ['Victories',   s.victories],
      ['Defeats',     s.defeats],
      ['Best Wave',   s.bestWave],
      ['Total Stars', this._totalStars],
    ];
    for (const [label, value] of chips) {
      const chip = document.createElement('div');
      chip.className = 'stat-chip';
      const valEl = document.createElement('span');
      valEl.className   = 'stat-chip-val';
      valEl.textContent = value;
      const lblEl = document.createElement('span');
      lblEl.className   = 'stat-chip-lbl';
      lblEl.textContent = label;
      chip.append(valEl, lblEl);
      el.appendChild(chip);
    }
  }

  _bindUpgrades() {
    // Clone removes any prior listener before re-adding (matches _bindPlay).
    const old = document.getElementById('open-upgrades');
    const btn = old.cloneNode(true);
    old.replaceWith(btn);
    btn.addEventListener('click', () => this._overlay.open());
  }

  _bindHeroes() {
    // Clone removes any prior listener before re-adding (matches _bindUpgrades).
    const old = document.getElementById('open-heroes');
    const btn = old.cloneNode(true);
    old.replaceWith(btn);
    btn.addEventListener('click', () => this._heroOverlay.open());
  }

  _bindSettings() {
    // Clone removes any prior listener before re-adding (matches _bindUpgrades).
    const old = document.getElementById('open-settings');
    const btn = old.cloneNode(true);
    old.replaceWith(btn);
    btn.addEventListener('click', () => {
      const am = this.game.registry.get('audio');
      if (!am) return;
      if (!this._settingsOverlay) this._settingsOverlay = new SettingsOverlay(am, this.game);
      this._settingsOverlay.open();
    });
  }

  _bindCodex() {
    // Clone removes any prior listener before re-adding (matches _bindSettings).
    const old = document.getElementById('open-codex-ms');
    if (!old) return;
    const btn = old.cloneNode(true);
    old.replaceWith(btn);
    btn.addEventListener('click', () => {
      if (!this._codexOverlay) this._codexOverlay = new CodexOverlay();
      this._codexOverlay.open(buildCatalog(progressFromSave(this.game.registry.get('save'))));
    });
  }

  _bindStoryLog() {
    const openBtn  = document.getElementById('open-story-log');
    const overlay  = document.getElementById('story-log-overlay');
    const list     = document.getElementById('story-log-list');
    const closeBtn = document.getElementById('story-log-close');
    if (!openBtn || !overlay) return;

    this._onOpenStoryLog = () => {
      list.replaceChildren();
      const entries = storyLogEntries(this._saveMgr.getSeenBeats());
      if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.id = 'story-log-empty';
        empty.textContent = 'No story unlocked yet. Play a mission to begin.';
        list.appendChild(empty);
      } else {
        for (const e of entries) {
          const btn = document.createElement('button');
          btn.className = 'ui-btn story-log-entry';
          btn.textContent = e.label;
          btn.addEventListener('click', () => {
            overlay.style.display = 'none';
            this._storyDialog.play(e.id, () => {});
          });
          list.appendChild(btn);
        }
      }
      overlay.style.display = 'flex';
    };
    this._onCloseStoryLog = () => { overlay.style.display = 'none'; };

    openBtn.addEventListener('click', this._onOpenStoryLog);
    closeBtn.addEventListener('click', this._onCloseStoryLog);
  }

  _bindFullscreen() {
    // Clone removes any prior listener before re-adding (matches _bindSettings).
    const old = document.getElementById('fullscreen-btn');
    if (!old) return;
    const btn = old.cloneNode(true);
    old.replaceWith(btn);
    if (!fullscreenSupported(document)) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = '';
    btn.addEventListener('click', () => {
      toggleFullscreen(document, document.documentElement, screen.orientation)
        // requestFullscreen rejects without a user gesture / when blocked; nothing to recover.
        .catch(() => {});
    });
    this._onFullscreenChange();
    document.addEventListener('fullscreenchange', this._onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', this._onFullscreenChange);
  }

  // Label and aria-label only: the icon span must survive (compact is icon-only).
  _onFullscreenChange() {
    const btn = document.getElementById('fullscreen-btn');
    if (!btn) return;
    const text = isFullscreen(document) ? FULLSCREEN_COPY.exit : FULLSCREEN_COPY.enter;
    const label = btn.querySelector('.mb-label');
    if (label) label.textContent = text;
    btn.setAttribute('aria-label', text);
  }

  shutdown() {
    this._stopArrival();
    window.removeEventListener('resize', this._layout);
    window.removeEventListener('orientationchange', this._layout);
    this._fonts?.removeEventListener?.('loadingdone', this._layout);
    this._fonts = null;
    this._stopInputGuard();
    this._renderer?.destroy();
    this._renderer = null;
    this._quote?.removeEventListener('scroll', this._syncQuoteFade);
    document.removeEventListener('fullscreenchange', this._onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', this._onFullscreenChange);
    // Call close() on overlays so their event listeners are torn down before the
    // DOM persists into the next scene. Direct style mutation would leak listeners.
    if (this._overlay)     this._overlay.close();
    if (this._heroOverlay) this._heroOverlay.close();
    this._settingsOverlay?.close();
    this._codexOverlay?.close();
    const openBtn  = document.getElementById('open-story-log');
    const closeBtn = document.getElementById('story-log-close');
    if (openBtn && this._onOpenStoryLog)   openBtn.removeEventListener('click', this._onOpenStoryLog);
    if (closeBtn && this._onCloseStoryLog) closeBtn.removeEventListener('click', this._onCloseStoryLog);
    this._storyDialog?.close();
    document.getElementById('map-select').style.display          = 'none';
    document.getElementById('settings-overlay').style.display    = 'none';
  }
}
