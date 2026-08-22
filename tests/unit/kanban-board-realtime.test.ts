// @vitest-environment node
/**
 * Unit tests for live Kanban board updates:
 *   - lib/kanban/events.ts                                  (NOTIFY publisher)
 *   - lib/kanban/stream.ts                                  (channel naming)
 *   - app/api/portal/projects/[id]/board-stream/route.ts     (SSE auth guards)
 *
 * Strategy mirrors tests/unit/api-portal-pathviz-routes.test.ts: db is mocked
 * with a queue of select() rows, and `@/lib/kanban/stream` is fully mocked so
 * no real Postgres LISTEN connection is ever attempted.
 *
 * The channel-name agreement test is the load-bearing one. events.ts and
 * stream.ts each define `boardChannel` independently — deliberately, so the
 * LISTEN side never imports Drizzle — which means a rename on one side would
 * silently stop every board updating, with nothing failing anywhere else.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (must precede imports of the modules under test)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));

const isPortalStaffMock = vi.fn();
vi.mock('@/lib/portal', () => ({ isPortalStaff: () => isPortalStaffMock() }));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...a: unknown[]) => getPortalClientMock(...a),
}));

const subscribeBoardChannelMock = vi.fn();
vi.mock('@/lib/kanban/stream', () => ({
  subscribeBoardChannel: (...a: unknown[]) => subscribeBoardChannelMock(...a),
  boardChannel: (projectId: number) => `kanban_board_${projectId}`,
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: true, strings: Array.from(strings), values,
    }),
    {},
  ),
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (t: string) =>
    new Proxy({ __table: t }, { get: (_x, p: string) => (p === '__table' ? t : { __col: p, __table: t }) });
  return new Proxy({}, {
    has: () => true,
    get: (_t, p: string) =>
      p === 'then' || p === '__esModule' || p === 'default' ? undefined : wrap(p),
  });
});

let selectQueue: Array<Array<Record<string, unknown>>> = [];
const executed: unknown[] = [];
let executeShouldThrow = false;

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let p: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => (p ??= Promise.resolve(selectQueue.shift() ?? []));
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy']) {
      chain[m] = () => chain;
    }
    chain.then = (res: unknown, rej: unknown) =>
      materialize().then(res as never, rej as never);
    return chain;
  }
  return {
    db: {
      select: () => buildSelect(),
      execute: (q: unknown) => {
        if (executeShouldThrow) return Promise.reject(new Error('pg down'));
        executed.push(q);
        return Promise.resolve([]);
      },
    },
  };
});

import {
  boardChannel as eventsBoardChannel,
  publishBoardChanged,
  publishBoardChangedForCard,
} from '@/lib/kanban/events';
import { GET as boardStreamGET } from '@/app/api/portal/projects/[id]/board-stream/route';

beforeEach(() => {
  selectQueue = [];
  executed.length = 0;
  executeShouldThrow = false;
  authMock.mockReset();
  isPortalStaffMock.mockReset();
  getPortalClientMock.mockReset();
  subscribeBoardChannelMock.mockReset();
  subscribeBoardChannelMock.mockReturnValue({
    ready: Promise.resolve(),
    unsubscribe: async () => {},
  });
});

// ---------------------------------------------------------------------------

describe('kanban board channel naming', () => {
  it('agrees between the NOTIFY and LISTEN sides', async () => {
    // The two modules define this independently on purpose (stream.ts must not
    // import Drizzle). A rename on one side alone silently kills every board.
    const stream = await import('@/lib/kanban/stream');
    expect(eventsBoardChannel(153)).toBe('kanban_board_153');
    expect(stream.boardChannel(153)).toBe(eventsBoardChannel(153));
  });
});

describe('publishBoardChanged', () => {
  it('issues one pg_notify carrying an empty payload', async () => {
    await publishBoardChanged(153);
    expect(executed).toHaveLength(1);
    const q = executed[0] as { values: unknown[]; strings: string[] };
    // Only the channel is parameterized; the payload is the SQL literal '' —
    // deliberately empty, because this is a wakeup and not a diff.
    expect(q.values).toEqual(['kanban_board_153']);
    expect(q.strings.join('?')).toContain('pg_notify');
    expect(q.strings.join('?')).toContain("''");
  });

  it('refuses a non-positive or non-integer project id without touching the db', async () => {
    await publishBoardChanged(0);
    await publishBoardChanged(-1);
    await publishBoardChanged(1.5);
    expect(executed).toHaveLength(0);
  });

  it('swallows a db failure — realtime must never fail the write that triggered it', async () => {
    executeShouldThrow = true;
    await expect(publishBoardChanged(153)).resolves.toBeUndefined();
  });
});

describe('publishBoardChangedForCard', () => {
  it("resolves the card's project and notifies that board", async () => {
    selectQueue.push([{ projectId: 404 }]);
    await publishBoardChangedForCard(77);
    expect(executed).toHaveLength(1);
    expect((executed[0] as { values: unknown[] }).values[0]).toBe('kanban_board_404');
  });

  it('does nothing when the card no longer exists', async () => {
    selectQueue.push([]);
    await publishBoardChangedForCard(77);
    expect(executed).toHaveLength(0);
  });
});

describe('GET /api/portal/projects/:id/board-stream', () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  it('rejects a non-numeric project id', async () => {
    const res = await boardStreamGET(new Request('http://x'), params('abc'));
    expect(res.status).toBe(400);
  });

  it('404s an unauthenticated caller', async () => {
    authMock.mockResolvedValue(null);
    const res = await boardStreamGET(new Request('http://x'), params('153'));
    expect(res.status).toBe(404);
    expect(subscribeBoardChannelMock).not.toHaveBeenCalled();
  });

  it('404s a caller from another tenant and never opens a LISTEN', async () => {
    // TENANCY: the channel is derived from a guessable project id, so this
    // guard is the only thing standing between tenants.
    authMock.mockResolvedValue({ user: { id: '181' } });
    isPortalStaffMock.mockResolvedValue(false);
    selectQueue.push([{ id: 153, clientId: 104 }]);   // project belongs to 104
    getPortalClientMock.mockResolvedValue({ id: 999 }); // caller belongs to 999
    const res = await boardStreamGET(new Request('http://x'), params('153'));
    expect(res.status).toBe(404);
    expect(subscribeBoardChannelMock).not.toHaveBeenCalled();
  });

  it('404s when the project does not exist', async () => {
    authMock.mockResolvedValue({ user: { id: '181' } });
    isPortalStaffMock.mockResolvedValue(true);
    selectQueue.push([]);
    const res = await boardStreamGET(new Request('http://x'), params('153'));
    expect(res.status).toBe(404);
  });

  it('opens an SSE stream for a member of the owning tenant', async () => {
    authMock.mockResolvedValue({ user: { id: '181' } });
    isPortalStaffMock.mockResolvedValue(false);
    selectQueue.push([{ id: 153, clientId: 104 }]);
    getPortalClientMock.mockResolvedValue({ id: 104 });
    const res = await boardStreamGET(new Request('http://x'), params('153'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    // Proxies must not buffer an event stream or nothing arrives until it ends.
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');
    expect(subscribeBoardChannelMock).toHaveBeenCalledWith(153, expect.any(Function));
  });

  it('lets staff subscribe to any tenant without a portal-client lookup', async () => {
    authMock.mockResolvedValue({ user: { id: '1' } });
    isPortalStaffMock.mockResolvedValue(true);
    selectQueue.push([{ id: 153, clientId: 104 }]);
    const res = await boardStreamGET(new Request('http://x'), params('153'));
    expect(res.status).toBe(200);
    expect(getPortalClientMock).not.toHaveBeenCalled();
  });
});
