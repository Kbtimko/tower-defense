import { describe, it, expect } from 'vitest';
import { MAPS } from '../data/maps.js';
import { planArrival, arrivalFrame, easeInOut, nextMissionId } from './arrivalPlan.js';

const zeros = () => MAPS.map(() => 0);
const win = (mapId, prevStars, stars) => ({ mapId, result: 'victory', prevStars, stars });
const withStars = (o) => Object.assign(zeros(), o);

describe('planArrival', () => {
  it('advance only for a first clear of the frontier', () => {
    expect(planArrival({ from: win(0, 0, 2), stars: withStars({ 0: 2 }) })).toMatchObject({
      kind: 'advance', mapId: 0, toId: 1, newStars: 2,
    });
  });
  it('advance flies to the real frontier on a gap save (the next map is already starred)', () => {
    expect(planArrival({ from: win(1, 0, 1), stars: withStars({ 0: 1, 1: 1, 2: 2 }) })).toMatchObject({
      kind: 'advance', mapId: 1, toId: 3,
    });
  });
  it('advance never targets past the last map', () => {
    const s = MAPS.map(() => 3);
    expect(planArrival({ from: win(1, 0, 3), stars: s })).toMatchObject({ kind: 'advance', mapId: 1, toId: MAPS.length - 1 });
  });
  it('none for defeat and abandon', () => {
    for (const result of ['defeat', 'abandon']) {
      expect(planArrival({ from: { ...win(0, 0, 0), result }, stars: zeros() }).kind).toBe('none');
    }
  });
  it('none for missing or malformed from', () => {
    for (const from of [undefined, {}, { mapId: 'x' }]) {
      expect(planArrival({ from, stars: zeros() }).kind).toBe('none');
    }
  });
  it('none for a replay with <= stars', () => {
    expect(planArrival({ from: win(0, 3, 2), stars: withStars({ 0: 3 }) }).kind).toBe('none');
    expect(planArrival({ from: win(0, 2, 2), stars: withStars({ 0: 2 }) }).kind).toBe('none');
  });
  it('none for a gap-save first clear', () => {
    expect(planArrival({ from: win(2, 0, 1), stars: withStars({ 0: 3, 2: 1 }) }).kind).toBe('none');
  });
  it('stamp when a cleared map improves', () => {
    expect(planArrival({ from: win(0, 1, 3), stars: withStars({ 0: 3 }) })).toMatchObject({
      kind: 'stamp', mapId: 0, newStars: 3, prevStars: 1,
    });
  });
  it('complete on first clear of the last map', () => {
    const last = MAPS.length - 1;
    const s = MAPS.map(() => 3);
    expect(planArrival({ from: win(last, 0, 3), stars: s })).toMatchObject({ kind: 'complete', mapId: last });
  });
});

describe('arrivalFrame', () => {
  const adv = planArrival({ from: win(0, 0, 2), stars: withStars({ 0: 2 }) });

  it('end state at Infinity', () => {
    expect(arrivalFrame(adv, Infinity)).toMatchObject({
      done: true, shipT: 1, frontT: 1, stamped: 2, nextLit: true, cardOpen: true,
    });
  });
  // worldRoute's flight() owns the trail; a frame copy of it would only drift.
  it('carries no trail field for any plan kind', () => {
    const last = MAPS.length - 1;
    const plans = [
      adv,
      planArrival({ from: win(0, 1, 3), stars: withStars({ 0: 3 }) }),
      planArrival({ from: undefined, stars: zeros() }),
      planArrival({ from: win(last, 0, 3), stars: MAPS.map(() => 3) }),
    ];
    for (const p of plans) {
      for (const t of [0, 1000, Infinity]) expect(arrivalFrame(p, t)).not.toHaveProperty('trailT');
    }
  });
  it('is monotonic', () => {
    for (const plan of [adv, planArrival({ from: win(0, 1, 3), stars: withStars({ 0: 3 }) })]) {
      let prev = arrivalFrame(plan, 0);
      for (let t = 50; t <= 3300; t += 50) {
        const f = arrivalFrame(plan, t);
        for (const k of Object.keys(f)) expect(Number(f[k])).toBeGreaterThanOrEqual(Number(prev[k]));
        prev = f;
      }
    }
  });
  it('beat boundaries', () => {
    expect(arrivalFrame(adv, 299).stamped).toBe(0);
    expect(arrivalFrame(adv, 300).stamped).toBe(1);
    expect(arrivalFrame(adv, 450).stamped).toBe(2);
    expect(arrivalFrame(adv, 749).stamped).toBe(2);
    expect(arrivalFrame(adv, 750).shipT).toBe(0);
    expect(arrivalFrame(adv, 2750).shipT).toBe(1);
    expect(arrivalFrame(adv, 1750).frontT).toBe(0);
    expect(arrivalFrame(adv, 2750).frontT).toBe(1);
    expect(arrivalFrame(adv, 2749).nextLit).toBe(false);
    expect(arrivalFrame(adv, 2750).nextLit).toBe(true);
    expect(arrivalFrame(adv, 3049).cardOpen).toBe(false);
    expect(arrivalFrame(adv, 3050).cardOpen).toBe(true);
    expect(arrivalFrame(adv, 3199).done).toBe(false);
    expect(arrivalFrame(adv, 3200).done).toBe(true);
  });
  it('stamp plan: done after last star, no flight, stamps from prev', () => {
    const p = planArrival({ from: win(0, 1, 3), stars: withStars({ 0: 3 }) });
    expect(arrivalFrame(p, 0).stamped).toBe(1);
    expect(arrivalFrame(p, 300).stamped).toBe(2);
    expect(arrivalFrame(p, 599).done).toBe(false);
    expect(arrivalFrame(p, 600)).toMatchObject({ done: true, stamped: 3, shipT: 0, frontT: 0 });
    expect(arrivalFrame(p, Infinity)).toMatchObject({ shipT: 0, done: true });
    expect(arrivalFrame(p, Infinity).stamped).toBe(p.newStars);
  });
  it('none: done at t = 0', () => {
    expect(arrivalFrame(planArrival({ from: undefined, stars: zeros() }), 0).done).toBe(true);
  });
  it('complete: trail to core, haze fades, next never lit', () => {
    const last = MAPS.length - 1;
    const p = planArrival({ from: win(last, 0, 3), stars: MAPS.map(() => 3) });
    expect(arrivalFrame(p, Infinity)).toMatchObject({ shipT: 1, frontT: 1, nextLit: false, cardOpen: true, done: true });
  });
  it('easeInOut is a clamped cubic', () => {
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
    expect(easeInOut(0.5)).toBe(0.5);
  });
});

describe('nextMissionId', () => {
  it('uses the injected maps for the last-map boundary', () => {
    const from = { mapId: 1, result: 'victory', prevStars: 3, stars: 3, next: true };
    const stars = withStars({ 0: 3, 1: 3 });
    const plan = { kind: 'none' };
    expect(nextMissionId({ from, plan, stars }, [{}, {}, {}])).toBe(2);
    expect(nextMissionId({ from, plan, stars }, [{}, {}])).toBeNull();
  });
  const next = (mapId) => ({ mapId, result: 'victory', prevStars: 0, stars: 1, next: true });
  it('null when next was not requested', () => {
    const from = { mapId: 0, result: 'victory', prevStars: 0, stars: 2 };
    const stars = withStars({ 0: 2 });
    expect(nextMissionId({ from, plan: planArrival({ from, stars }), stars })).toBeNull();
    expect(nextMissionId({ from: null, plan: { kind: 'none' }, stars })).toBeNull();
  });
  it('advance returns the flight destination', () => {
    const stars = withStars({ 0: 1 });
    const from = next(0);
    expect(nextMissionId({ from, plan: planArrival({ from, stars }), stars })).toBe(1);
  });
  it('advance on a gap save returns the post-win frontier, not mapId + 1', () => {
    const stars = withStars({ 0: 1, 1: 1, 2: 2 });
    const from = next(1);
    expect(nextMissionId({ from, plan: planArrival({ from, stars }), stars })).toBe(3);
  });
  it('complete returns null', () => {
    const last = MAPS.length - 1;
    const stars = MAPS.map(() => 1);
    const from = next(last);
    const plan = planArrival({ from, stars });
    expect(plan.kind).toBe('complete');
    expect(nextMissionId({ from, plan, stars })).toBeNull();
  });
  it('stamp returns mapId + 1 when this map is open', () => {
    const stars = withStars({ 0: 3, 1: 0 });
    const from = { mapId: 0, result: 'victory', prevStars: 1, stars: 3, next: true };
    const plan = planArrival({ from, stars });
    expect(plan.kind).toBe('stamp');
    expect(nextMissionId({ from, plan, stars })).toBe(1);
  });
  it('none returns mapId + 1 for a replay with no gain', () => {
    const stars = withStars({ 0: 3 });
    const from = { mapId: 0, result: 'victory', prevStars: 3, stars: 1, next: true };
    const plan = planArrival({ from, stars });
    expect(plan.kind).toBe('none');
    expect(nextMissionId({ from, plan, stars })).toBe(1);
  });
  it('stamp or none on the last map returns null (past the end)', () => {
    const last = MAPS.length - 1;
    const stars = MAPS.map(() => 2);
    const from = { mapId: last, result: 'victory', prevStars: 2, stars: 1, next: true };
    expect(nextMissionId({ from, plan: planArrival({ from, stars }), stars })).toBeNull();
  });
  it('none returns null when the played map is not open (no stars)', () => {
    const stars = zeros();
    const from = next(0);
    expect(nextMissionId({ from, plan: { kind: 'none' }, stars })).toBeNull();
  });
});
