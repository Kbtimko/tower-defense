#!/usr/bin/env node
// Per-map balance report. Run with: npm run balance [-- --verbose] [-- --map 7]
//
// Reports only — it never edits src/data/maps.js. Treat the suggestions as a
// starting point for a playtest, not as authoritative numbers.
import { MAPS } from '../src/data/maps.js';
import { MAP_WAVES, totalEnemyHpForMap } from '../src/data/waves.js';
import { simulateMap } from '../src/sim/simulate.js';
import { greedyBuildPlan } from '../src/sim/buildPolicy.js';
import { TOWER_DEFS } from '../src/data/towers.js';
import { goldCeiling, cheapestFullBoardCost, goldPerHp } from '../src/sim/economy.js';
import { findWinMultiplier } from '../src/sim/deficit.js';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const mapArg = args.indexOf('--map');
const onlyMap = mapArg !== -1 ? Number(args[mapArg + 1]) : null;

// A healthy map is won, but not comfortably: the player should finish having
// lost some lives. All-lives-intact means the map never threatened them.
const COMFORT_CEILING = 0.9;   // kept >90% of lives -> too easy
const COMFORT_FLOOR   = 0.25;  // kept <25% of lives -> punishing

function verdict(r, startLives) {
  if (!r.won) return { tag: 'UNWINNABLE', note: `lost at wave ${r.wavesSurvived + 1}/${r.totalWaves}` };
  const kept = r.livesRemaining / startLives;
  if (kept >= COMFORT_CEILING) return { tag: 'TOO EASY', note: `kept ${(kept * 100).toFixed(0)}% of lives` };
  if (kept <= COMFORT_FLOOR)   return { tag: 'PUNISHING', note: `kept ${(kept * 100).toFixed(0)}% of lives` };
  return { tag: 'OK', note: `kept ${(kept * 100).toFixed(0)}% of lives` };
}

function suggest(r, map) {
  if (!r.won) {
    return `try startGold ${map.startGold} -> ${Math.round(map.startGold * 1.25)} `
         + `or rewardMult ${map.rewardMult} -> ${(map.rewardMult * 1.3).toFixed(2)}`;
  }
  const kept = r.livesRemaining / map.startLives;
  if (kept >= COMFORT_CEILING) {
    return `try rewardMult ${map.rewardMult} -> ${(map.rewardMult * 0.8).toFixed(2)} `
         + `or startGold ${map.startGold} -> ${Math.round(map.startGold * 0.85)}`;
  }
  if (kept <= COMFORT_FLOOR) {
    return `try rewardMult ${map.rewardMult} -> ${(map.rewardMult * 1.15).toFixed(2)}`;
  }
  return '—';
}

const targets = MAPS.filter(m => onlyMap === null || m.id === onlyMap);
const rows = [];

for (const map of targets) {
  const waves = MAP_WAVES[map.id];
  if (!waves) { console.error(`map ${map.id} (${map.name}) has no waves — skipped`); continue; }
  const r = simulateMap({ map, waves, buildPlan: greedyBuildPlan });
  const deficit = findWinMultiplier(map, waves, { buildPlan: greedyBuildPlan });
  rows.push({ map, r, v: { ...verdict(r, map.startLives), deficit } });
}

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

console.log('\nSimulated combat — towers + tier upgrades + hero auto-attack + barracks soldiers');
console.log('(blocking, melee and respawn), buying and upgrading by the damage a tower actually');
console.log('lands against the enemies still to come. Omits hero abilities, meta upgrades,');
console.log('soldier repositioning and the send-wave-early bonus, so this model is still');
console.log('PESSIMISTIC — less so than before.\n');
console.log(pad('#', 3) + pad('Map', 22) + padL('waves', 7) + padL('lives', 8)
          + padL('gold', 7) + padL('towers', 8) + padL('leaked', 8) + padL('blocked', 9)
          + padL('heroDmg', 9) + padL('/mapHP', 8) + padL('heroLv', 8)
          + '  ' + pad('verdict', 12) + 'needs');
console.log('-'.repeat(120));

for (const { map, r, v } of rows) {
  console.log(
    pad(map.id, 3)
    + pad(map.name, 22)
    + padL(`${r.wavesSurvived}/${r.totalWaves}`, 7)
    + padL(`${r.livesRemaining}/${map.startLives}`, 8)
    + padL(r.goldFinal, 7)
    + padL(`${r.towersBuilt}/${map.towerSlots.length}`, 8)
    + padL(r.leaked, 8)
    + padL(`${r.blockedSeconds}s`, 9)
    + padL(r.heroDamageDealt, 9)
    + padL((r.heroDamageDealt / totalEnemyHpForMap(map.id)).toFixed(3), 8)
    + padL(`L${r.heroLevel}`, 8)
    + '  ' + pad(v.tag, 12)
    + (v.deficit === null ? '>8x damage' : v.deficit === 1 ? v.note : `${v.deficit}x damage`),
  );
}

if (verbose) {
  for (const { map, r } of rows) {
    console.log(`\n── map ${map.id} · ${map.name} — per-wave detail`);
    console.log('  ' + pad('wave', 6) + padL('gold in', 9) + padL('gold out', 10)
              + padL('towers', 8) + padL('lives lost', 12) + padL('lives left', 12)
              + padL('heroDmg', 9) + padL('heroLv', 8));
    for (const e of r.waveLog) {
      console.log('  ' + pad(e.wave, 6) + padL(e.goldAtWaveStart, 9) + padL(e.goldAfter, 10)
                + padL(e.towersBuilt, 8) + padL(e.livesLost, 12) + padL(e.livesRemaining, 12)
                + padL(e.heroDamageDealt, 9) + padL(`L${e.heroLevel}`, 8)
                + (e.timedOut ? '  (wave timed out)' : ''));
    }
  }
}

// ── Blocking sensitivity ───────────────────────────────────────────────────
// The default policy opens with one barracks, which costs 100 gold and a slot.
// Those two columns separate what blocking is WORTH from what it COSTS: "free"
// refunds the gold and hands the map a spare slot at the same spot, so nothing
// is displaced. If "free" is much better than "bought", blocking is priced
// wrong rather than weak.
//
// Caveat: this now runs through greedyBuildPlan's scored upgrade pass, which
// cannot buy MORE blocking (see the comment on the upgrade pass in
// buildPolicy.js) — barracksTarget only controls the opening purchase. These
// columns price the opening barracks, not blocking depth.
const barracksPlan = n => ctx => greedyBuildPlan({ ...ctx, barracksTarget: n });

console.log('\nBlocking sensitivity — damage multiplier needed, by how the barracks is paid for.\n');
console.log(pad('#', 3) + pad('Map', 22) + padL('no barracks', 13) + padL('bought', 9) + padL('free', 9));
console.log('-'.repeat(120));

for (const { map } of rows) {
  const waves = MAP_WAVES[map.id];
  const free = {
    ...map,
    startGold: map.startGold + TOWER_DEFS.barracks.cost,
    towerSlots: [...map.towerSlots, map.towerSlots[0]],
  };
  const show = v => (v === null ? '>8x' : `${v}x`);
  console.log(
    pad(map.id, 3) + pad(map.name, 22)
    + padL(show(findWinMultiplier(map, waves, { buildPlan: barracksPlan(0) })), 13)
    + padL(show(findWinMultiplier(map, waves, { buildPlan: barracksPlan(1) })), 9)
    + padL(show(findWinMultiplier(free, waves, { buildPlan: barracksPlan(1) })), 9),
  );
}
console.log('');

// ── Matchup sensitivity ────────────────────────────────────────────────────
// How much of each map's difficulty was the MODEL rather than the MAP. "blind"
// is the old policy — rank purchases by raw damage-per-gold and upgrade
// cheapest-first; "aware" is the new one — score BOTH purchases and upgrades
// by damage actually landed against what is coming. matchupAware flips two
// behaviours at once, not one, and they move the roster differently: the
// upgrade change concentrates gold into fewer towers instead of lifting the
// whole board evenly. This table cannot separate "better tower choice" from
// "better upgrade ordering" — don't attribute the whole delta to tower
// choice. A large delta means the map was never as hard as the report used
// to claim. The multiplier alone can also hide the improvement: it saturates
// at 1x once a map is winnable, so a map that already won under both
// policies (e.g. map 2) shows "1x / 1x" even when the lives kept getting the
// win are wildly different — the kept-lives figure alongside each multiplier
// is what actually carries that result. Kept for one release so backlog #16
// can tell a smarter model apart from an easier map.
const awarePlan = on => ctx => greedyBuildPlan({ ...ctx, matchupAware: on });

console.log('\nMatchup sensitivity — damage multiplier needed and lives kept getting there, by');
console.log('how the model picks AND upgrades towers (not separable in this table).\n');
console.log(pad('#', 3) + pad('Map', 22) + padL('blind', 15) + padL('aware', 15) + padL('delta', 10));
console.log('-'.repeat(120));

for (const { map } of rows) {
  const waves = MAP_WAVES[map.id];
  const show = v => (v === null ? '>8x' : `${v}x`);
  const kept = run => `${Math.round((run.livesRemaining / map.startLives) * 100)}%`;
  const blindRun = simulateMap({ map, waves, buildPlan: awarePlan(false) });
  const awareRun = simulateMap({ map, waves, buildPlan: awarePlan(true) });
  const blind = findWinMultiplier(map, waves, { buildPlan: awarePlan(false) });
  const aware = findWinMultiplier(map, waves, { buildPlan: awarePlan(true) });
  const diff = (blind === null || aware === null) ? null : blind - aware;
  const delta = diff === null ? '—' : diff === 0 ? '0.00x'
              : `${(diff > 0 ? '-' : '+')}${Math.abs(diff).toFixed(2)}x`;
  console.log(pad(map.id, 3) + pad(map.name, 22)
            + padL(`${show(blind)} (${kept(blindRun)})`, 15)
            + padL(`${show(aware)} (${kept(awareRun)})`, 15)
            + padL(delta, 10));
}
console.log('');

// ── Economy diagnostic ─────────────────────────────────────────────────────
// Exact, not modelled: derived only from map data + wave tables. Independent of
// how well the simulated towers shoot, so trust these numbers over the sim.
console.log('Economy ceiling — exact, model-free (perfect play: every kill, every wave cleared).\n');
console.log(pad('#', 3) + pad('Map', 22) + padL('start', 7) + padL('kills', 8) + padL('clears', 8)
          + padL('TOTAL', 8) + padL('board', 8) + padL('boards', 8) + padL('gold/hp', 9));
console.log('-'.repeat(120));

for (const { map } of rows) {
  const waves = MAP_WAVES[map.id];
  const c = goldCeiling(map, waves);
  const board = cheapestFullBoardCost(map);
  const boards = board === 0 ? 0 : c.total / board;
  console.log(
    pad(map.id, 3) + pad(map.name, 22)
    + padL(c.startGold, 7) + padL(c.killGold, 8) + padL(c.clearGold, 8)
    + padL(c.total, 8) + padL(board, 8)
    + padL(boards.toFixed(2), 8)
    + padL(goldPerHp(map, waves).toFixed(4), 9),
  );
}
console.log('  heroDmg = post-armour damage the hero landed; /mapHP its share of the map\'s');
console.log('            total base enemy HP — the quantity hero levelling is paced against.');
console.log('  needs  = uniform damage multiplier at which the modelled defence clears the map;');
console.log('           i.e. how much everything this model omits (hero abilities, meta upgrades,');
console.log('           soldier repositioning, the send-wave-early bonus) has to be worth.\n');
console.log('\n  board  = cheapest tower x every slot on the map');
console.log('  boards = how many times over the map\'s whole gold ceiling could fill that board');
console.log('           (< 1.00 means a full cheap board is NEVER affordable, even with flawless play)\n');

const unwinnable = rows.filter(r => !r.r.won).length;
const tooEasy = rows.filter(r => r.v.tag === 'TOO EASY').length;
console.log(`\n${rows.length} maps · ${unwinnable} unwinnable · ${tooEasy} too easy\n`);
