import { describe, it, expect } from 'vitest';
import { MAPS } from '../data/maps.js';
import { planArrival, arrivalFrame, easeInOut } from './arrivalPlan.js';

const zeros = () => MAPS.map(() => 0);
const win = (mapId, prevStars, stars) => ({ mapId, result: 'victory', prevStars, stars });
const withStars = (o) => Object.assign(zeros(), o);

describe('planArrival', () => {
  it('advance only for a first clear of the frontier', () => {
    expect(planArrival({ from: win(0, 0, 2), stars: withStars({ 0: 2 }) })).toMatchObject({
      kind: 'advance', mapId: 0, toId: 1, newStars: 2,
    });
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
      kind: 'stamp', mapId: 0, newStars: 2, prevStars: 1,
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
      done: true, shipT: 1, trailT: 1, frontT: 1, stamped: 2, nextLit: true, cardOpen: true,
    });
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
    expect(arrivalFrame(p, 600)).toMatchObject({ done: true, stamped: 3, shipT: 0, trailT: 0, frontT: 0 });
    expect(arrivalFrame(p, Infinity)).toMatchObject({ shipT: 0, done: true });
  });
  it('none: done at t = 0', () => {
    expect(arrivalFrame(planArrival({ from: undefined, stars: zeros() }), 0).done).toBe(true);
  });
  it('complete: trail to core, haze fades, next never lit', () => {
    const last = MAPS.length - 1;
    const p = planArrival({ from: win(last, 0, 3), stars: MAPS.map(() => 3) });
    expect(arrivalFrame(p, Infinity)).toMatchObject({ trailT: 1, frontT: 1, nextLit: false, cardOpen: true, done: true });
  });
  it('easeInOut is a clamped cubic', () => {
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
    expect(easeInOut(0.5)).toBe(0.5);
  });
});
