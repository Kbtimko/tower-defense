import { describe, it, expect, vi } from 'vitest';
import { ProjectilePool } from './ProjectilePool.js';

const makeProj = (opts) => ({
  opts, reset: vi.fn(function (o) { this.opts = o; }),
  deactivate: vi.fn(), destroy: vi.fn(),
});

describe('ProjectilePool', () => {
  it('creates via the factory when nothing is free', () => {
    const factory = vi.fn(makeProj);
    const pool = new ProjectilePool(factory);
    const p = pool.acquire({ a: 1 });
    expect(factory).toHaveBeenCalledWith({ a: 1 });
    expect(p.opts).toEqual({ a: 1 });
  });

  it('reuses a released instance and resets it with the new opts', () => {
    const factory = vi.fn(makeProj);
    const pool = new ProjectilePool(factory);
    const p = pool.acquire({ a: 1 });
    pool.release(p);
    expect(p.deactivate).toHaveBeenCalledOnce();
    const q = pool.acquire({ a: 2 });
    expect(q).toBe(p);
    expect(p.reset).toHaveBeenCalledWith({ a: 2 });
    expect(factory).toHaveBeenCalledOnce();
  });

  it('ignores a double release so one instance is never handed out twice', () => {
    const pool = new ProjectilePool(makeProj);
    const p = pool.acquire({});
    pool.release(p);
    pool.release(p);
    const a = pool.acquire({});
    const b = pool.acquire({});
    expect(a).toBe(p);
    expect(b).not.toBe(p);
  });

  it('tolerates instances without deactivate', () => {
    const pool = new ProjectilePool(() => ({ reset() {}, destroy() {} }));
    const p = pool.acquire({});
    expect(() => pool.release(p)).not.toThrow();
  });

  it('destroyAll destroys free and live instances', () => {
    const pool = new ProjectilePool(makeProj);
    const live = pool.acquire({});
    const freed = pool.acquire({});
    pool.release(freed);
    pool.destroyAll();
    expect(live.destroy).toHaveBeenCalledOnce();
    expect(freed.destroy).toHaveBeenCalledOnce();
    // Pool is empty afterwards: next acquire builds a fresh one.
    expect(pool.acquire({})).not.toBe(freed);
  });
});
