import { describe, it, expect } from 'vitest';
import { resolveFanoutPoolMax } from '@/lib/db/fanout';

// PUX-087: the shared client stays at max:1 (12 modules depend on that making
// audit-in-transaction deadlock deterministically). The fan-out read pool is
// separate, so GET /api/portal/cards/[id]'s 17-query Promise.all stops running
// serially — it cost ~3.5s on prod.
describe('resolveFanoutPoolMax', () => {
  it('gives runtime 5 connections so a batched handler is not serialized', () => {
    expect(resolveFanoutPoolMax({})).toBe(5);
    expect(resolveFanoutPoolMax({ NEXT_PHASE: 'phase-production-server' })).toBe(5);
  });

  it('drops to 1 during a production build — 47+ static-gen workers serve no fan-out', () => {
    expect(resolveFanoutPoolMax({ NEXT_PHASE: 'phase-production-build' })).toBe(1);
  });

  it('lets DB_FANOUT_POOL_MAX override either phase', () => {
    expect(resolveFanoutPoolMax({ DB_FANOUT_POOL_MAX: '12' })).toBe(12);
    expect(
      resolveFanoutPoolMax({ DB_FANOUT_POOL_MAX: '12', NEXT_PHASE: 'phase-production-build' }),
    ).toBe(12);
  });

  it('ignores junk or non-positive overrides instead of passing 0/NaN to the driver', () => {
    // Number('') === 0, Number('nope') === NaN — both must fall through to the
    // phase default rather than reaching postgres.js as a pool size.
    for (const DB_FANOUT_POOL_MAX of ['', 'nope', '0', '-3']) {
      expect(resolveFanoutPoolMax({ DB_FANOUT_POOL_MAX })).toBe(5);
    }
  });

  it('does not disturb the shared pool, which must stay at 1', () => {
    // The shared client reads DB_POOL_MAX, not DB_FANOUT_POOL_MAX. If these two
    // ever share an env var, raising the fan-out pool would silently raise the
    // shared one and break the deterministic audit-in-tx deadlock.
    expect(resolveFanoutPoolMax({ DB_POOL_MAX: '99' })).toBe(5);
  });
});
