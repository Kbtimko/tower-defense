// xorshift32 — small, fast, deterministic 32-bit RNG.
// Note: seed 0 is reserved (would degenerate); we coerce it to 1.
export class SeededRandom {
  constructor(seed) {
    this._state = (seed | 0) || 1;
  }

  next() {
    let x = this._state;
    x ^= x << 13; x |= 0;
    x ^= x >>> 17; x |= 0;
    x ^= x << 5;  x |= 0;
    this._state = x;
    // Map signed 32-bit to [0, 1)
    return ((x >>> 0) / 0x100000000);
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  range(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}
