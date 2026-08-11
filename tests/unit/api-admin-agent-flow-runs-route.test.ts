// @vitest-environment node
/**
 * Unit tests for GET /api/admin/agent-flow-runs.
 *
 * This route is deliberately UNSCOPED by tenant — it is the staff-wide rollup
 * of every client's agent-flow runs. That makes the staff gate the only thing
 * standing between a non-staff session and every tenant's execution history,
 * so it is what these tests are mostly about.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const chain: Record<string, unknown> = {};
  let result: unknown[] = [];
  const captured: { where?: unknown; limit?: number } = {};

  // Every builder method returns the same thenable so the route's long
  // select().from().innerJoin()...limit() chain resolves to `result`.
  for (const m of ['from', 'innerJoin', 'leftJoin', 'orderBy']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.where = vi.fn((w: unknown) => { captured.where = w; return chain; });
  chain.limit = vi.fn((n: number) => { captured.limit = n; return Promise.resolve(result); });

  return {
    chain,
    captured,
    setResult: (r: unknown[]) => { result = r; },
    db: { select: vi.fn(() => chain) },
    auth: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db/schema', () => ({
  agentFlowRuns: { id: 'id', status: 'status', startedAt: 'startedAt', graph: 'graph', flowId: 'flowId', projectId: 'projectId', clientId: 'clientId', parentRunId: 'p', depth: 'd', inputTokens: 'it', outputTokens: 'ot', finishedAt: 'f', lastEventAt: 'l' },
  agentFlows: { id: 'id', name: 'name' },
  projects: { id: 'id', name: 'name' },
  clients: { id: 'id', company: 'company', userId: 'userId' },
  users: { id: 'id', name: 'name', email: 'email' },
}));
vi.mock('drizzle-orm', () => ({
  desc: vi.fn((x: unknown) => x),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  inArray: vi.fn((col: unknown, vals: unknown[]) => ({ inArray: [col, vals] })),
  sql: Object.assign(
    vi.fn(() => ({ as: vi.fn(() => ({})) })),
    { raw: vi.fn() },
  ),
}));

function req(url = 'http://localhost/api/admin/agent-flow-runs') {
  return new Request(url);
}

async function load() {
  return import('@/app/api/admin/agent-flow-runs/route');
}

describe('GET /api/admin/agent-flow-runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setResult([]);
    delete mocks.captured.where;
    delete mocks.captured.limit;
  });

  it('401s with no session', async () => {
    mocks.auth.mockResolvedValue(null);
    const { GET } = await load();
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mocks.db.select).not.toHaveBeenCalled();
  });

  it('401s for a signed-in non-staff user', async () => {
    mocks.auth.mockResolvedValue({ user: { id: '9', role: 'client' } });
    const { GET } = await load();
    const res = await GET(req());
    expect(res.status).toBe(401);
    // The gate must stop the query, not just filter the response.
    expect(mocks.db.select).not.toHaveBeenCalled();
  });

  it.each(['admin', 'employee'])('allows role=%s', async (role) => {
    mocks.auth.mockResolvedValue({ user: { id: '1', role } });
    mocks.setResult([{ id: 1, status: 'running' }]);
    const { GET } = await load();
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, data: [{ id: 1, status: 'running' }] });
  });

  it('applies no tenant filter by default — this rollup is cross-tenant on purpose', async () => {
    mocks.auth.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    const { GET } = await load();
    await GET(req());
    expect(mocks.captured.where).toBeUndefined();
  });

  it('filter=active narrows to running + waiting', async () => {
    mocks.auth.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    const { GET } = await load();
    await GET(req('http://localhost/api/admin/agent-flow-runs?filter=active'));
    expect(mocks.captured.where).toEqual({ inArray: ['status', ['running', 'waiting']] });
  });

  it('filter=terminal narrows to the terminal statuses', async () => {
    mocks.auth.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    const { GET } = await load();
    await GET(req('http://localhost/api/admin/agent-flow-runs?filter=terminal'));
    expect(mocks.captured.where).toEqual({
      inArray: ['status', ['succeeded', 'failed', 'abandoned']],
    });
  });

  it('caps limit at 200 even when asked for more', async () => {
    mocks.auth.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    const { GET } = await load();
    await GET(req('http://localhost/api/admin/agent-flow-runs?limit=5000'));
    expect(mocks.captured.limit).toBe(200);
  });

  it('falls back to the default limit on a garbage value', async () => {
    mocks.auth.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    const { GET } = await load();
    await GET(req('http://localhost/api/admin/agent-flow-runs?limit=abc'));
    expect(mocks.captured.limit).toBe(100);
  });
});
