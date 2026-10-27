import { livesLostFor, sanitizeRecord, mergeRecord } from './runRecord.js';

describe('livesLostFor', () => {
  it('computes lives lost', () => {
    expect(livesLostFor(20, 20)).toBe(0);
    expect(livesLostFor(22, 17)).toBe(5);
    expect(livesLostFor(20, 25)).toBe(0);
    expect(livesLostFor(20, NaN)).toBeNull();
    expect(livesLostFor(NaN, 5)).toBeNull();
    expect(livesLostFor(20, 3.5)).toBeNull();
  });
});

describe('sanitizeRecord', () => {
  it('keeps valid fields and rounds time', () => {
    expect(sanitizeRecord({ livesLost: 2, timeMs: 1000.4 })).toEqual({ livesLost: 2, timeMs: 1000 });
    expect(sanitizeRecord({ livesLost: 0, timeMs: null })).toEqual({ livesLost: 0, timeMs: null });
  });
  it('nulls garbage', () => {
    for (const g of ['x', [], {}, null, undefined, 5, { livesLost: -1 }, { livesLost: 1.5, timeMs: 0 },
      { livesLost: 'a', timeMs: -5 }, { lives: 18 }]) {
      expect(sanitizeRecord(g)).toBeNull();
    }
  });
  it('drops only the invalid field', () => {
    expect(sanitizeRecord({ livesLost: -1, timeMs: 500 })).toEqual({ livesLost: null, timeMs: 500 });
  });
});

describe('mergeRecord', () => {
  const none = { livesLost: false, time: false };
  it('null prev sets the record without NEW BEST', () => {
    const r = mergeRecord(null, { livesLost: 3, timeMs: 9000 });
    expect(r.record).toEqual({ livesLost: 3, timeMs: 9000 });
    expect(r.newBest).toEqual(none);
  });
  it('fewer lives lost only', () => {
    const r = mergeRecord({ livesLost: 3, timeMs: 9000 }, { livesLost: 1, timeMs: 9500 });
    expect(r.record).toEqual({ livesLost: 1, timeMs: 9000 });
    expect(r.newBest).toEqual({ livesLost: true, time: false });
  });
  it('faster time only', () => {
    const r = mergeRecord({ livesLost: 3, timeMs: 9000 }, { livesLost: 4, timeMs: 8000 });
    expect(r.record).toEqual({ livesLost: 3, timeMs: 8000 });
    expect(r.newBest).toEqual({ livesLost: false, time: true });
  });
  it('both', () => {
    const r = mergeRecord({ livesLost: 3, timeMs: 9000 }, { livesLost: 0, timeMs: 100 });
    expect(r.newBest).toEqual({ livesLost: true, time: true });
  });
  it('ties are not a new best', () => {
    const r = mergeRecord({ livesLost: 3, timeMs: 9000 }, { livesLost: 3, timeMs: 9000 });
    expect(r.newBest).toEqual(none);
    expect(r.record).toEqual({ livesLost: 3, timeMs: 9000 });
  });
  it('worse keeps the record', () => {
    const r = mergeRecord({ livesLost: 1, timeMs: 5000 }, { livesLost: 9, timeMs: 99999 });
    expect(r.record).toEqual({ livesLost: 1, timeMs: 5000 });
    expect(r.newBest).toEqual(none);
  });
  it('invalid run fields are ignored', () => {
    for (const bad of [NaN, -1, 1.5, null, undefined]) {
      const r = mergeRecord({ livesLost: 2, timeMs: 5000 }, { livesLost: bad, timeMs: 4000 });
      expect(r.record.livesLost).toBe(2);
      expect(r.newBest.livesLost).toBe(false);
    }
    for (const bad of [NaN, -1, 0, null, undefined]) {
      const r = mergeRecord({ livesLost: 2, timeMs: 5000 }, { livesLost: 1, timeMs: bad });
      expect(r.record.timeMs).toBe(5000);
      expect(r.newBest.time).toBe(false);
    }
  });
  it('a 0 ms time is invalid and ignored', () => {
    const r = mergeRecord({ livesLost: 2, timeMs: 5000 }, { livesLost: 2, timeMs: 0 });
    expect(r.record).toEqual({ livesLost: 2, timeMs: 5000 });
    expect(r.newBest.time).toBe(false);
  });
  it('a null prev field gets filled without NEW BEST', () => {
    const r = mergeRecord({ livesLost: 0, timeMs: null }, { livesLost: 0, timeMs: 500000 });
    expect(r.record).toEqual({ livesLost: 0, timeMs: 500000 });
    expect(r.newBest).toEqual(none);
  });
  it('Garrison fixture: 22/22 clear is not a new best over a 20/20 clear', () => {
    const r = mergeRecord({ livesLost: 0, timeMs: null }, { livesLost: livesLostFor(22, 22), timeMs: 500000 });
    expect(r.newBest.livesLost).toBe(false);
    expect(r.record.livesLost).toBe(0);
  });
  it('Garrison fixture: 22/21 is worse, record stays 0', () => {
    const r = mergeRecord({ livesLost: 0, timeMs: null }, { livesLost: livesLostFor(22, 21), timeMs: null });
    expect(r.newBest.livesLost).toBe(false);
    expect(r.record.livesLost).toBe(0);
  });
  it('both-invalid with null prev yields a null record', () => {
    expect(mergeRecord(null, { livesLost: NaN, timeMs: NaN }).record).toBeNull();
  });
});
