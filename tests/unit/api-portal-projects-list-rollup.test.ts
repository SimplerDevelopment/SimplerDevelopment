// @vitest-environment node
/**
 * PUX-151 — GET /api/portal/projects carries each board's roll-up ONLY for a
 * client with the portal-redesign flag; unflagged clients get the exact
 * pre-existing shape and the roll-up is never computed for them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));
const clientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({ getPortalClient: () => clientMock() }));
vi.mock('@/lib/portal', () => ({ isPortalStaff: async () => true }));
vi.mock('@/lib/automation', () => ({ emitEvent: vi.fn() }));
vi.mock('@/lib/admin/dashboard-cache', () => ({ revalidateAdminDashboard: vi.fn() }));
const hasFlagMock = vi.fn();
vi.mock('@/lib/feature-flags', () => ({ hasFlag: (...a: unknown[]) => hasFlagMock(...a) }));
const rollupMock = vi.fn();
vi.mock('@/lib/projects/list-rollup', () => ({ getProjectListRollup: (...a: unknown[]) => rollupMock(...a) }));
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }), and: (...args: unknown[]) => ({ op: 'and', args }),
  inArray: (a: unknown, l: unknown) => ({ op: 'in', a, l }), sql: () => ({ op: 'sql' }),
}));
vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) => new Proxy({}, { get: (_t, prop: string) => ({ __col: prop, __table: name }) });
  return { projects: wrap('projects'), projectMembers: wrap('projectMembers'), kanbanColumns: wrap('kanbanColumns'), kanbanLabels: wrap('kanbanLabels'), cardTemplates: wrap('cardTemplates') };
});
let queue: Array<Array<Record<string, unknown>>> = [];
vi.mock('@/lib/db', () => {
  const make = () => {
    const rows = queue.shift() ?? [];
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy', 'limit']) chain[m] = () => chain;
    chain.offset = async () => rows;
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(rows).then(res);
    return chain;
  };
  return { db: { select: () => make() } };
});

const route = await import('@/app/api/portal/projects/route');
const req = () => new (class { nextUrl = new URL('http://x/api/portal/projects'); })() as unknown as import('next/server').NextRequest;

beforeEach(() => {
  authMock.mockResolvedValue({ user: { id: '7' } });
  clientMock.mockResolvedValue({ id: 104, featureFlags: [] });
  rollupMock.mockReset(); hasFlagMock.mockReset();
  queue = [[{ total: 1 }], [{ id: 1, name: 'Website relaunch', clientId: 104, status: 'active' }]];
});

describe('GET /api/portal/projects roll-up (PUX-151)', () => {
  it('flag off → pre-existing shape, roll-up never computed', async () => {
    hasFlagMock.mockReturnValue(false);
    const body = await (await route.GET(req())).json();
    expect(body.data[0]).toEqual({ id: 1, name: 'Website relaunch', clientId: 104, status: 'active', myRole: 'owner' });
    expect(rollupMock).not.toHaveBeenCalled();
  });

  it('flag on → each row carries rollup, computed once for the page, scoped to the client', async () => {
    hasFlagMock.mockReturnValue(true);
    rollupMock.mockResolvedValue({ 1: { total: 22, shipped: 12, pct: 55, lanes: [], lastActivityAt: null, members: [] } });
    const body = await (await route.GET(req())).json();
    expect(rollupMock).toHaveBeenCalledTimes(1);
    expect(rollupMock).toHaveBeenCalledWith(104, [1]);
    expect(body.data[0].rollup.pct).toBe(55);
  });
});
