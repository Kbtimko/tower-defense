import Phaser from 'phaser';
import { MAPS } from '../data/maps.js';
import { ROUTE, LAYOUT, SHIP, EARTH, NODE_PULSE_MS } from '../data/worldMap.js';
import { FULLSCREEN_COPY } from '../data/campaign.js';
import { SaveManager } from '../systems/SaveManager.js';
import { starsDisplay } from '../utils/display.js';
import { classifyOverworld } from '../systems/overworldState.js';
import { starsArray, frontierIndex, bannerFor } from '../systems/campaignProgress.js';
import { briefingCardModel } from '../systems/briefingCard.js';
import { layoutClass, routeFrameFor, cardWidth } from '../systems/worldMapLayout.js';
import { routePoints, routeParamAt, frontRadius, parkParam } from '../systems/worldRoute.js';
import { worldBackdropSource } from '../systems/worldBackdrop.js';
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
    this._selectedId = this._defaultSelection(data?.from);
    this._overworld.dataset.frontier = String(this._frontier);
    this._overworld.dataset.arrival = 'none';

    this._renderer = new WorldMapRenderer({
      backdrop: document.getElementById('wm-backdrop'),
      story: document.getElementById('wm-story'),
      maxDpr: LAYOUT.maxCanvasDpr,
      source: worldBackdropSource(this.game.registry.get('worldBackdrop')),
      motion: () => this._syncMotion(),
    });
    this._syncMotion();

    this._populateOverworld();
    this._renderBanner();
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

    if (!this._saveMgr.hasSeenBeat('campaign_intro')) {
      this._storyDialog.play('campaign_intro', () => this._saveMgr.markBeatSeen('campaign_intro'));
    }
  }

  // Defeat/abandon reopen the mission just played, so a retry is one tap; every
  // other entry (title, victory end state) opens on the frontier.
  _defaultSelection(from) {
    const last = MAPS.length - 1;
    const id = from?.mapId;
    const retry = from?.result === 'defeat' || from?.result === 'abandon';
    if (retry && Number.isInteger(id) && id >= 0 && id <= last && this._isOpen(id)) return id;
    return Math.min(this._frontier, last);
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
  }

  // Re-measure, recompute the frame, publish the --wm-* vars, place the nodes and
  // tags, redraw. Bound to resize / orientationchange / fonts loadingdone.
  _layout() {
    if (!this._renderer) return;
    const { origin, box, viewport } = this._measure();
    const cls = layoutClass(viewport);
    this._publishVars(cls, viewport);
    // Hidden or not laid out yet (jsdom): nothing to place.
    if (!(viewport.width > 0 && viewport.height > 0)) return;

    const f = routeFrameFor(viewport, cls);
    const frame = { ...f, x: f.x + origin.x, y: f.y + origin.y };
    const points = routePoints(frame, ROUTE);
    this._cls = cls;
    this._points = points;

    for (const btn of this._overworld.querySelectorAll('.ow-node')) {
      const p = points[Number(btn.dataset.mapId) + 1];
      btn.style.left = `${p.x}px`;
      btn.style.top = `${p.y}px`;
    }
    this._placeTags(frame, points, cls);

    this._renderer.resize(frame, box);
    this._renderer.render(this._storyState(points, cls));
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

  // The static (no-arrival) story state: trail and ship at the frontier, haze edge
  // through it; all cleared -> trail to the hive, no haze, the hive glow dimmed.
  _storyState(points, cls) {
    const idx = Math.min(this._frontier, MAPS.length - 1) + 1;
    const d = idx === points.length - 1 ? LAYOUT.node[cls].final : LAYOUT.node[cls].d;
    return {
      points,
      trailT: routeParamAt(points, idx),
      frontR: frontRadius(points, this._frontier),
      frontAlpha: 1,
      ship: { param: parkParam(points, idx, d / 2 + SHIP.sizePx) },
      hiveDim: this._frontier >= MAPS.length ? 1 : 0,
    };
  }

  // Nodes go in their own container: #map-overworld also holds the canvases and
  // the Earth/hive tags, which must survive a re-render.
  _populateOverworld() {
    const entries = MAPS.map(m => ({ id: m.id, unlocked: this._isOpen(m.id), stars: this._stars[m.id] }));
    const nodes = classifyOverworld(entries, MAPS.length - 1);
    document.getElementById('wm-nodes').replaceChildren(...nodes.map(n => this._nodeButton(n)));
  }

  _nodeButton(node) {
    const map = MAPS[node.id];
    const locked = node.state === 'locked';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ow-node ${node.state}` + (node.isFinal ? ' final' : '');
    if (node.id === this._selectedId && !locked) btn.classList.add('active');
    btn.dataset.mapId = String(node.id);
    btn.setAttribute('aria-label', `${node.id + 1} · ${map.name}`);
    // Disabled: no click from mouse, Enter or Space, so a locked node can't select.
    btn.disabled = locked;

    const art = document.createElement('img');
    art.className = 'ow-node-art';
    art.src       = `assets/overworld/${map.overworldArt}`;
    art.alt       = '';
    art.onerror   = () => { art.remove(); btn.classList.add('ow-node-fallback'); };

    const num = document.createElement('span');
    num.className   = 'ow-node-num';
    num.textContent = locked ? '🔒' : String(node.id + 1);

    const label = document.createElement('span');
    label.className   = 'ow-node-label';
    label.textContent = `${node.id + 1} · ${map.name}`;

    // A sibling of the label, not a child: compact CSS hides the label only.
    const stars = document.createElement('span');
    stars.className = 'ow-node-stars';
    if (node.unlocked) stars.textContent = node.stars > 0 ? starsDisplay(node.stars) : '—';

    btn.append(art, num, label, stars);
    if (!locked) btn.addEventListener('click', () => this._selectMap(node.id));
    return btn;
  }

  _selectMap(mapId) {
    this._selectedId = mapId;
    this._overworld.querySelectorAll('.ow-node.active').forEach(n => n.classList.remove('active'));
    this._overworld.querySelector(`.ow-node[data-map-id="${mapId}"]`)?.classList.add('active');
    this._renderFeatured(mapId);
  }

  _renderBanner() {
    const b = bannerFor(this._stars);
    const banner = document.getElementById('wm-banner');
    banner.querySelector('.wm-act').textContent = b.act;
    banner.querySelector('.wm-objective').textContent = b.objective;
    // The count is gold (mockup); the text stays exactly bannerFor's line.
    const [before, count, after] = b.sectors.split(SECTORS_COUNT);
    const strong = document.createElement('strong');
    strong.textContent = count ?? '';
    banner.querySelector('.wm-sectors').replaceChildren(before, strong, after ?? '');
  }

  _renderFeatured(mapId) {
    renderBriefingCard(document.getElementById('map-featured'), briefingCardModel(mapId, this._stars));
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
      `★ ${this._saveMgr.getTotalStars()} / 30`;
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
      ['Total Stars', this._saveMgr.getTotalStars()],
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
    window.removeEventListener('resize', this._layout);
    window.removeEventListener('orientationchange', this._layout);
    this._fonts?.removeEventListener?.('loadingdone', this._layout);
    this._fonts = null;
    this._stopInputGuard();
    this._renderer?.destroy();
    this._renderer = null;
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
