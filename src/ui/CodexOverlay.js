// Three-tab reference for towers, heroes and enemies. Follows the
// SettingsOverlay idiom: an explicit listener array, wired in open() and
// unwired in close(), so nothing outlives the overlay.
const TABS = ['towers', 'heroes', 'enemies'];

function line(cls, text) {
  const el = document.createElement('div');
  el.className   = cls;
  el.textContent = text;
  return el;
}

// Matchup entries are already {kind, type, name, icon} from the descriptors.
function names(entries) {
  return entries.map(e => e.name).join(', ');
}

export class CodexOverlay {
  constructor() {
    this._overlay  = document.getElementById('codex-overlay');
    this._tabs     = document.getElementById('codex-tabs');
    this._list     = document.getElementById('codex-list');
    this._detail   = document.getElementById('codex-detail');
    this._closeBtn = document.getElementById('codex-close');
    this._listeners = [];
    this._catalog   = null;
    this._tab       = 'towers';
    this._onClose   = null;
  }

  open(catalog, { initialTab = 'towers', initialEntry = null, onClose = null } = {}) {
    if (!this._overlay) return;
    this._catalog = catalog;
    this._tab     = TABS.includes(initialTab) ? initialTab : 'towers';
    this._onClose = onClose;

    this._teardown();          // idempotent: a second open must not double-wire

    const close = () => this.close();
    this._bind(this._closeBtn, 'click', close, 'chrome');
    this._bind(this._overlay, 'click', (e) => { if (e.target === this._overlay) this.close(); }, 'chrome');
    this._bind(document, 'keydown', (e) => { if (e.key === 'Escape') this.close(); }, 'chrome');

    for (const btn of this._tabs.querySelectorAll('.codex-tab')) {
      this._bind(btn, 'click', () => { this._tab = btn.dataset.tab; this._renderList(); }, 'chrome');
    }

    this._overlay.style.display = 'flex';
    this._renderList(initialEntry);
  }

  close() {
    if (!this._overlay) return;
    this._teardown();
    this._overlay.style.display = 'none';
    const cb = this._onClose;
    this._onClose = null;
    cb?.();
  }

  _bind(el, evt, fn, group) {
    if (!el) return;
    el.addEventListener(evt, fn);
    this._listeners.push({ el, evt, fn, group });
  }

  // Tears down one listener group, or everything when no group is given.
  // _renderList reruns on every tab switch and rebinds one click listener
  // per entry button; without scoping teardown to the 'entry' group those
  // would only ever be cleared at close(), growing unboundedly across tab
  // switches within a single open() session even though the buttons
  // themselves are already discarded by replaceChildren.
  _teardown(group = null) {
    const keep = [];
    for (const l of this._listeners) {
      if (group === null || l.group === group) l.el.removeEventListener(l.evt, l.fn);
      else keep.push(l);
    }
    this._listeners = keep;
  }

  _entries() {
    return this._catalog?.[this._tab] ?? [];
  }

  _renderList(selectId = null) {
    this._teardown('entry');
    for (const btn of this._tabs.querySelectorAll('.codex-tab')) {
      btn.classList.toggle('active', btn.dataset.tab === this._tab);
    }
    this._list.replaceChildren();

    const entries = this._entries();
    if (!entries.length) {
      // Defensive only: a real catalog always lists every entry (dimmed
      // when unencountered, never hidden), so this fires for a malformed or
      // partial catalog, not normal play.
      this._list.appendChild(line('codex-empty', 'Nothing to show yet.'));
      this._detail.replaceChildren();
      return;
    }

    for (const entry of entries) {
      const btn = document.createElement('button');
      btn.className = 'codex-entry';
      if (!entry.encountered) btn.classList.add('codex-unseen');

      const icon = document.createElement('span');
      icon.textContent = entry.icon ?? entry.portraitChar ?? '•';
      const name = document.createElement('span');
      name.textContent = entry.name ?? entry.displayName;
      btn.append(icon, name);

      if (!entry.encountered) {
        // Dimmed and tagged, never hidden: the codex must still help you plan.
        btn.appendChild(line('codex-unseen-tag', 'not yet encountered'));
      }

      this._bind(btn, 'click', () => {
        for (const b of this._list.querySelectorAll('.codex-entry')) b.classList.remove('active');
        btn.classList.add('active');
        this._renderDetail(entry);
      }, 'entry');
      this._list.appendChild(btn);
    }

    const initial = entries.find(e => (e.type ?? e.id) === selectId) ?? entries[0];
    const idx = entries.indexOf(initial);
    this._list.querySelectorAll('.codex-entry')[idx]?.classList.add('active');
    this._renderDetail(initial);
  }

  _renderDetail(entry) {
    this._detail.replaceChildren();
    if (entry.kind === 'tower')  return this._renderTower(entry);
    if (entry.kind === 'hero')   return this._renderHero(entry);
    return this._renderEnemy(entry);
  }

  _renderEnemy(e) {
    this._detail.append(
      line('codex-detail-title', `${e.icon} ${e.name}`),
      line('codex-detail-sub', e.flying ? 'Flying' : 'Ground'),
      line('codex-stat', `HP: ${e.hp}`),
      line('codex-stat', `Armour: ${e.armor}`),
      line('codex-stat', `Speed: ${e.speed}`),
      line('codex-stat', `Bounty: ${e.reward} gold`),
      line('codex-section', 'Matchups'),
      line('codex-stat', e.vulnerableTo.length ? `Weak to: ${names(e.vulnerableTo)}` : 'No particular weakness'),
      line('codex-stat', e.resists.length ? `Resists: ${names(e.resists)}` : 'Resists nothing'),
    );
    if (!e.encountered) this._detail.appendChild(line('codex-unseen-tag', 'Not yet encountered'));
  }

  _renderTower(t) {
    this._detail.append(
      line('codex-detail-title', `${t.icon} ${t.name}`),
      line('codex-detail-sub', `${t.cost} gold`),
      line('codex-stat', `Range: ${t.range}`),
    );
    if (t.dealsDirectDamage) {
      this._detail.append(
        line('codex-stat', `Damage: ${t.damage}`),
        line('codex-stat', `Fire rate: ${t.fireRate}/s`),
      );
      if (t.splashRadius > 0) this._detail.appendChild(line('codex-stat', `Splash: ${t.splashRadius}`));
      if (t.slow > 0)         this._detail.appendChild(line('codex-stat', `Slow: ${Math.round(t.slow * 100)}%`));
    } else if (t.soldierStats) {
      // The barracks fields a squad instead of shooting.
      this._detail.appendChild(line('codex-section', 'Soldiers'));
      for (const [tier, s] of Object.entries(t.soldierStats)) {
        this._detail.appendChild(line('codex-tier',
          `${tier}: ${s.count} soldiers · ${s.hp} HP · ${s.damage} dmg · respawn ${s.respawnDuration}s${s.canBlockFlyers ? ' · blocks flyers' : ''}`));
      }
    }

    this._detail.appendChild(line('codex-section', 'Upgrade path'));
    for (const tier of t.tiers) {
      const row = document.createElement('div');
      row.className = 'codex-tier';
      const label = document.createElement('span');
      label.className   = 'codex-tier-label';
      label.textContent = `${tier.label} (${tier.cost}g)`;
      row.appendChild(label);
      const bits = [];
      if (tier.damage       != null) bits.push(`${tier.damage} dmg`);
      if (tier.range        != null) bits.push(`${tier.range} range`);
      if (tier.splashRadius != null) bits.push(`${tier.splashRadius} splash`);
      // Ice is the only tower whose tiers vary slow (0.45 -> 0.3 -> 0.2 ->
      // 0.15); without this, Deep Freeze/Blizzard show damage and range but
      // give no hint that they also strengthen the slow, which is their
      // actual point.
      if (tier.slow         != null) bits.push(`Slow: ${Math.round(tier.slow * 100)}%`);
      if (tier.passiveEffect)        bits.push(tier.passiveEffect);
      if (bits.length) row.appendChild(document.createTextNode(` — ${bits.join(', ')}`));
      this._detail.appendChild(row);
    }

    if (t.ability) {
      this._detail.append(
        line('codex-section', 'Ability'),
        line('codex-stat', `${t.ability.label} (${t.ability.cooldown}s) — ${t.ability.description}`),
      );
    }

    // Labelled "at base tier" deliberately: TIER4_OVERRIDES can invert these
    // outright (cannon is weak vs skitter at base, but Artillery is 2.0x
    // AGAINST skitter), and the tier ladder is rendered directly above.
    this._detail.append(
      line('codex-section', 'Matchups (at base tier)'),
      line('codex-stat', t.effectiveAtBase.length ? `Strong against: ${names(t.effectiveAtBase)}` : 'No particular strength'),
      line('codex-stat', t.weakAtBase.length ? `Weak against: ${names(t.weakAtBase)}` : 'No particular weakness'),
    );
  }

  _renderHero(h) {
    this._detail.append(
      line('codex-detail-title', h.displayName),
      line('codex-detail-sub', h.role),
      line('codex-stat', `HP: ${h.stats.maxHp}`),
      line('codex-stat', `Attack: ${h.stats.attackDamage} every ${h.stats.attackRate}s`),
      line('codex-stat', `Range: ${h.stats.attackRange}`),
      line('codex-stat', `Move speed: ${h.stats.moveSpeed}`),
      line('codex-section', 'Matchups'),
      line('codex-stat', h.effectiveAgainst.length ? `Strong against: ${names(h.effectiveAgainst)}` : 'No particular strength'),
      line('codex-stat', h.weakAgainst.length ? `Weak against: ${names(h.weakAgainst)}` : 'No particular weakness'),
      line('codex-section', 'Abilities'),
    );
    for (const a of h.abilities) {
      this._detail.appendChild(line('codex-tier',
        `${a.icon} ${a.label} [${a.hotkey}] — ${a.effect} · ${a.cooldown}s cooldown · unlocks at level ${a.unlockLevel}`));
    }
    if (!h.encountered && h.unlockMapAfter != null) {
      this._detail.appendChild(line('codex-unseen-tag', `Clear Map ${h.unlockMapAfter + 1} to unlock`));
    }
  }
}
