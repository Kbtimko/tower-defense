# Damage-number pool priority (backlog #23) — design

**Status:** self-approved (`[auto]` item), 2026-11-24.

## Intent

`DamageNumberOverlay` (`src/systems/DamageNumberOverlay.js`) shows floating damage numbers from a 24-slot pool. Since #17 it also shows muted `🛡N` numbers for hits that armour absorbed. A per-enemy 700 ms throttle limits how often each enemy gets one, but nothing limits the total. In a crowded armoured wave (map 9 wave 18: 6 titans + 12 brutes under archer fire), `🛡` numbers alone can hold the whole pool. Once the pool is full, every new hit is dropped, including the big and AoE numbers that had the pool to themselves before #17.

The absorbed numbers are the least valuable of the set, so they should give way first. The backlog asks for a priority rule, not a bigger pool.

## Goals

- When the pool is full, an incoming **big** (amount ≥ 30) or **AoE** number takes the slot of the **oldest in-flight absorbed** number, and is shown.
- An incoming **absorbed** number never evicts anything. When the pool is full it is dropped, exactly as today, and its enemy's throttle window is not spent (existing behaviour, unchanged).
- When the pool is full and no absorbed number is in flight, a big or AoE number is dropped, as today.

## Non-goals

- No change to `POOL_SIZE`, `THRESHOLD`, `ABSORBED_COOLDOWN_MS`, the styles, the labels or the tween shape.
- No priority between big and AoE numbers.

## Anti-goals

- An evicted text must never end up both shown and back in the pool. Its tweens are killed on eviction, so its old `onComplete` must never run and recycle it while it shows the new number.
- A text that has already finished as an absorbed number and been reused for a big number must never be evicted as if it were still absorbed. The absorbed tracking has to drop a text when its tween completes.

## Approaches

1. **Evict the oldest absorbed number (chosen).** The pool stays fully usable for absorbed numbers when nothing more important is happening. A big hit always wins a slot while any absorbed number is showing. The cost is one extra insertion-ordered collection.
2. **Cap absorbed numbers at a share of the pool** (for example 12 of 24). This is simpler, but it leaves slots idle in quiet moments, and big numbers can still be dropped once they fill their share. Rejected.
3. **A bigger pool.** The backlog rules this out: it moves the ceiling and doesn't set a priority.

## Design

- Track in-flight absorbed texts in insertion order (a `Set`; its first entry is the oldest).
- On a show request with the pool full and nothing free:
  - **absorbed** → return (drop);
  - **big or AoE** → take the first text in the absorbed set. If there is none, return. Otherwise `tweens.killTweensOf(text)`, remove it from the absorbed set and from `_inUse`, then continue as if it came from the pool.
- When a shown text is absorbed, add it to the absorbed set. In the tween's `onComplete`, delete it from the absorbed set along with the existing `_inUse` delete.
- Phaser 3.90's `killTweensOf` calls `tween.destroy()`, which does not fire `onComplete` (checked in `node_modules/phaser/src/tweens/TweenManager.js`). The live check must confirm this in the real engine.

## Left to the builder

Local naming, and whether the eviction lives in a small private helper.
