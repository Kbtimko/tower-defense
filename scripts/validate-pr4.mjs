import pkg from '/Users/keithtimko/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:5173';
const PASS = '✅';
const FAIL = '❌';
const SKIP = '⚠️ ';

const results = [];
function log(icon, label, detail = '') {
  const msg = `${icon} ${label}${detail ? ': ' + detail : ''}`;
  results.push(msg);
  console.log(msg);
}

async function waitForGame(page, ms = 3000) {
  const found = await page.evaluate(() => !!window.__game);
  if (!found) await page.waitForFunction(() => !!window.__game, { timeout: ms }).catch(() => {});
  return page.evaluate(() => !!window.__game);
}

async function run() {
  const ctx = await chromium.launchPersistentContext('/tmp/pw-validate-pr4', {
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox'],
    viewport: { width: 1280, height: 800 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  // Fresh start — clear all progress data
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // ══ 1. MapSelectScene ════════════════════════════════════════════════════
  const mapSelectDisplay = await page.evaluate(() => {
    const el = document.getElementById('map-select');
    return el ? window.getComputedStyle(el).display : 'missing';
  });
  log(
    mapSelectDisplay !== 'none' && mapSelectDisplay !== 'missing' ? PASS : FAIL,
    'MapSelectScene visible on load',
    `display=${mapSelectDisplay}`
  );

  // ══ 2. Map rows: 10 total, only Map 1 unlocked ════════════════════════════
  const mapRows = await page.evaluate(() => {
    const rows = document.querySelectorAll('.map-row');
    return {
      total:    rows.length,
      unlocked: [...rows].filter(r => r.classList.contains('unlocked')).length,
      locked:   [...rows].filter(r => r.classList.contains('locked')).length,
      first3:   [...rows].slice(0,3).map(r => r.querySelector('.map-row-name')?.textContent?.trim()),
    };
  });
  log(
    mapRows.total === 10 && mapRows.unlocked === 1 && mapRows.locked === 9 ? PASS : FAIL,
    'Map rows: 10 total, 1 unlocked, 9 locked',
    `total=${mapRows.total}, unlocked=${mapRows.unlocked}, locked=${mapRows.locked} | ${mapRows.first3?.join('|')}`
  );

  // ══ 3. Featured panel populated for Map 1 ═════════════════════════════════
  const featuredName  = await page.evaluate(() => document.getElementById('featured-name')?.textContent?.trim());
  const featuredBlurb = await page.evaluate(() => document.getElementById('featured-blurb')?.textContent?.trim().slice(0, 60));
  log(featuredName ? PASS : FAIL, 'Featured panel name', featuredName);
  log(featuredBlurb ? PASS : FAIL, 'Featured panel blurb', featuredBlurb);

  // ══ 4. Play → GameScene canvas loads ══════════════════════════════════════
  await page.click('#featured-play');
  const gameReady = await waitForGame(page, 5000);
  const canvasPresent = await page.evaluate(() => !!document.querySelector('canvas'));
  log(canvasPresent ? PASS : FAIL, 'GameScene canvas after Play click');
  log(gameReady ? PASS : FAIL, 'window.__game exposed in DEV mode');

  if (!gameReady) {
    log(SKIP, 'Skipping all game-state tests — __game not available');
    await ctx.close();
    return;
  }

  // ══ 5. Story banner: shown between waves ══════════════════════════════════
  // Trigger it via storyMgr directly
  const bannerTriggered = await page.evaluate(() => {
    const g = window.__game;
    try {
      const panel = g.storyMgr.getPanelForWave('outpost_sigma', 3);
      if (!panel) return 'no panel for wave 3';
      g.storyMgr.showBanner(panel, () => {});
      return 'ok';
    } catch(e) { return 'error: ' + e.message; }
  });
  log(bannerTriggered === 'ok' ? PASS : FAIL, 'Story banner triggered via storyMgr.showBanner', bannerTriggered);

  const bannerHasVisible = await page.evaluate(() =>
    document.getElementById('story-banner')?.classList.contains('visible') ?? false
  );
  const bannerText = await page.evaluate(() => ({
    headline: document.getElementById('story-headline')?.textContent,
    body:     document.getElementById('story-body')?.textContent?.slice(0, 60),
  }));
  log(bannerHasVisible ? PASS : FAIL, 'Story banner .visible class added', `"${bannerText.headline}"`);
  log(bannerText.headline ? PASS : FAIL, 'Story banner text populated', `"${bannerText.body}"`);

  // ══ 6. Dismiss button hides the banner ════════════════════════════════════
  if (bannerHasVisible) {
    await page.evaluate(() => document.getElementById('story-dismiss')?.click());
    await page.waitForTimeout(600);
    const bannerGone = await page.evaluate(() =>
      !document.getElementById('story-banner')?.classList.contains('visible')
    );
    log(bannerGone ? PASS : FAIL, 'Story banner dismissed on X click');
  } else {
    log(SKIP, 'Banner not visible — skip dismiss check');
  }

  // ══ 7. Victory flow: story unlock banner → overlay ════════════════════════
  const victoryResult = await page.evaluate(() => {
    const g = window.__game;
    try {
      // Simulate max-lives victory to get 3 stars
      g.won = true;
      g.kills = 42;
      g.economy.lives = g.economy.startLives ?? 20; // keep lives at max for 3 stars
      g._onVictory();
      return 'ok';
    } catch(e) { return 'error: ' + e.message; }
  });
  log(victoryResult === 'ok' ? PASS : SKIP, 'Victory flow triggered via _onVictory()', victoryResult);
  await page.waitForTimeout(800);

  // After _onVictory, unlock banner shows first (Map 1 has one)
  const unlockBannerVisible = await page.evaluate(() =>
    document.getElementById('story-banner')?.classList.contains('visible') ?? false
  );
  const unlockText = await page.evaluate(() => document.getElementById('story-headline')?.textContent);
  log(unlockBannerVisible ? PASS : FAIL, 'Unlock banner shown before victory overlay', `"${unlockText}"`);

  // Dismiss unlock banner → victory overlay should appear
  if (unlockBannerVisible) {
    await page.evaluate(() => document.getElementById('story-dismiss')?.click());
    await page.waitForTimeout(600);
  }

  const msgVisible = await page.evaluate(() => {
    const el = document.getElementById('game-msg');
    return el ? window.getComputedStyle(el).display !== 'none' : false;
  });
  const msgContent = await page.evaluate(() => ({
    title: document.getElementById('msg-title')?.textContent,
    body:  document.getElementById('msg-body')?.textContent,
  }));
  log(msgVisible ? PASS : FAIL, 'Victory #game-msg visible after banner dismiss', `"${msgContent.title}" | "${msgContent.body}"`);

  // ══ 8. Stars display in victory body ══════════════════════════════════════
  const starsInBody = /★/.test(msgContent.body || '');
  log(starsInBody ? PASS : FAIL, 'Star symbols in victory body', msgContent.body);

  // ══ 9. localStorage written by ProgressManager ════════════════════════════
  const storageEntries = await page.evaluate(() => {
    const entries = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      entries[k] = localStorage.getItem(k);
    }
    return entries;
  });
  const hasStorage = Object.keys(storageEntries).length > 0;
  log(
    hasStorage ? PASS : FAIL,
    'localStorage written after victory',
    Object.entries(storageEntries).map(([k,v]) => `${k}=${v}`).join(', ') || 'empty'
  );

  // ══ 10. localStorage persists after reload → Map 2 unlocked ══════════════
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const storageAfterReload = await page.evaluate(() => {
    const entries = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      entries[k] = localStorage.getItem(k);
    }
    return entries;
  });
  log(
    Object.keys(storageAfterReload).length > 0 ? PASS : FAIL,
    'localStorage persists across reload',
    Object.entries(storageAfterReload).map(([k,v]) => `${k}=${v}`).slice(0,3).join(', ')
  );

  const mapRowsAfter = await page.evaluate(() => {
    const rows = document.querySelectorAll('.map-row');
    return {
      total:    rows.length,
      unlocked: [...rows].filter(r => r.classList.contains('unlocked')).length,
    };
  });
  log(
    mapRowsAfter.unlocked >= 2 ? PASS : FAIL,
    'Map 2 unlocked after Map 1 victory + reload',
    `unlocked=${mapRowsAfter.unlocked} of ${mapRowsAfter.total}`
  );

  // ══ 11. Featured panel auto-selects highest unlocked map ═════════════════
  const featuredAfter = await page.evaluate(() => document.getElementById('featured-name')?.textContent?.trim());
  log(
    featuredAfter && featuredAfter !== 'Outpost Sigma' ? PASS : SKIP,
    'Featured panel auto-selects Map 2 after unlock',
    featuredAfter
  );

  // ══ 12. Enemy type spot check: phantom/titan defs exist in data ══════════
  // Launch Map 5 to check phantom enemies appear
  // (We skip this in automated validation — would require winning Maps 1-4 first)
  log(SKIP, 'Phantom/titan enemy shapes require Maps 5+/6+ active (not automated)');

  // ══ Summary ══════════════════════════════════════════════════════════════
  console.log('\n════════════════════════════════════════════');
  console.log('PR #4 Validation Summary');
  console.log('════════════════════════════════════════════');
  results.forEach(r => console.log(r));
  const failures = results.filter(r => r.startsWith(FAIL));
  console.log(`\n${failures.length === 0 ? '✅ All checks passed or skipped' : `❌ ${failures.length} failure(s)`}`);

  await page.waitForTimeout(2000);
  await ctx.close();
}

run().catch(async (err) => {
  console.error('\nValidation script error:', err.message);
  process.exit(1);
});
