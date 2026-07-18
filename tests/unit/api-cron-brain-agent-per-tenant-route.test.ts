// @vitest-environment node
/**
 * Unit tests for the per-tenant Company Brain agent sweep cron handler.
 *
 * Scope: the auth gate, the "agents service not configured" early-return,
 * the entitlement skip branch, and the per-tenant success/failure isolation
 * that drives the 200-vs-500 envelope. `db`, `isAuthorizedCron`,
 * `isBrainEntitled`, and the agents-client calls are all mocked so this file
 * is self-contained and does not touch a real DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// withCronHealth is a pass-through wrapper in tests.
vi.mock('@/lib/cron-health', () => ({
  withCronHealth: (
    _opts: unknown,
    fn: (req: Request) => Promise<Response>,
  ) => fn,
}));

const isAuthorizedCronMock = vi.fn();
vi.mock('@/lib/cron-auth', () => ({
  isAuthorizedCron: (...args: unknown[]) => isAuthorizedCronMock(...args),
}));

type ClientRow = { id: number; userId: number };
const selectState: { rows: ClientRow[] } = { rows: [] };

const dbMock = {
  select: vi.fn(() => ({
    from: vi.fn(() => Promise.resolve(selectState.rows)),
  })),
};
vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/db/schema', () => ({
  clients: { id: 'id', userId: 'userId' },
}));

const isBrainEntitledMock = vi.fn();
vi.mock('@/lib/brain/entitlement', () => ({
  isBrainEntitled: (...args: unknown[]) => isBrainEntitledMock(...args),
}));

const runBrainWorkflowOnServiceMock = vi.fn();
const agentsServiceConfiguredMock = vi.fn();
vi.mock('@/lib/ai/agents-client', () => ({
  runBrainWorkflowOnService: (...args: unknown[]) =>
    runBrainWorkflowOnServiceMock(...args),
  agentsServiceConfigured: (...args: unknown[]) =>
    agentsServiceConfiguredMock(...args),
}));

async function callHandler(): Promise<{ body: Record<string, unknown>; status: number }> {
  const { GET } = await import('@/app/api/cron/brain-agent-per-tenant/route');
  const req = new Request('http://localhost/api/cron/brain-agent-per-tenant', {
    headers: { 'x-vercel-cron': '1' },
  });
  const res = await GET(req);
  return { body: (await res.json()) as Record<string, unknown>, status: res.status };
}

beforeEach(() => {
  vi.resetModules();
  selectState.rows = [];
  isAuthorizedCronMock.mockReset();
  isAuthorizedCronMock.mockReturnValue(true);
  agentsServiceConfiguredMock.mockReset();
  agentsServiceConfiguredMock.mockReturnValue(true);
  isBrainEntitledMock.mockReset();
  isBrainEntitledMock.mockResolvedValue(true);
  runBrainWorkflowOnServiceMock.mockReset();
  runBrainWorkflowOnServiceMock.mockResolvedValue(undefined);
  dbMock.select.mockClear();
});

describe('GET /api/cron/brain-agent-per-tenant', () => {
  it('rejects unauthorized requests with 401 and success:false', async () => {
    isAuthorizedCronMock.mockReturnValue(false);

    const { body, status } = await callHandler();

    expect(status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.message).toBe('Unauthorized');
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('short-circuits with a skipped envelope when the agents service is not configured', async () => {
    agentsServiceConfiguredMock.mockReturnValue(false);

    const { body, status } = await callHandler();

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    const data = body.data as { skipped: string; processed: number };
    expect(data.skipped).toMatch(/agents service not configured/);
    expect(data.processed).toBe(0);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('returns 200 success:true with correct counts when all entitled tenants succeed', async () => {
    selectState.rows = [
      { id: 1, userId: 100 },
      { id: 2, userId: 200 },
    ];

    const { body, status } = await callHandler();

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      processed: 2,
      succeeded: 2,
      failed: 0,
      skipped: 0,
      errors: [],
    });
    expect(runBrainWorkflowOnServiceMock).toHaveBeenCalledTimes(2);
    expect(runBrainWorkflowOnServiceMock).toHaveBeenNthCalledWith(1, {
      clientId: 1,
      userId: 100,
      query: expect.any(String),
      scopes: ['brain:read'],
    });
  });

  it('returns 500 success:false when one tenant fails, but continues the sweep for the rest', async () => {
    selectState.rows = [
      { id: 1, userId: 100 },
      { id: 2, userId: 200 },
    ];
    runBrainWorkflowOnServiceMock.mockImplementation(
      async ({ clientId }: { clientId: number }) => {
        if (clientId === 1) throw new Error('agent run failed');
        return undefined;
      },
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { body, status } = await callHandler();

    expect(status).toBe(500);
    expect(body.success).toBe(false);
    const data = body.data as {
      processed: number;
      succeeded: number;
      failed: number;
      skipped: number;
      errors: Array<{ clientId: number; error: string }>;
    };
    expect(data.processed).toBe(2);
    expect(data.succeeded).toBe(1);
    expect(data.failed).toBe(1);
    expect(data.skipped).toBe(0);
    expect(data.errors).toEqual([{ clientId: 1, error: 'agent run failed' }]);
    // The sweep continued past the failing tenant to tenant 2.
    expect(runBrainWorkflowOnServiceMock).toHaveBeenCalledTimes(2);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('counts non-entitled tenants as skipped and never calls the agents service for them', async () => {
    selectState.rows = [
      { id: 1, userId: 100 },
      { id: 2, userId: 200 },
    ];
    isBrainEntitledMock.mockImplementation(async (clientId: number) => clientId === 2);

    const { body, status } = await callHandler();

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      processed: 2,
      succeeded: 1,
      failed: 0,
      skipped: 1,
      errors: [],
    });
    expect(runBrainWorkflowOnServiceMock).toHaveBeenCalledTimes(1);
    expect(runBrainWorkflowOnServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 2 }),
    );
  });

  it('returns 200 success:true with all-skipped counts when no tenant is entitled', async () => {
    selectState.rows = [
      { id: 1, userId: 100 },
      { id: 2, userId: 200 },
    ];
    isBrainEntitledMock.mockResolvedValue(false);

    const { body, status } = await callHandler();

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      processed: 2,
      succeeded: 0,
      failed: 0,
      skipped: 2,
      errors: [],
    });
    expect(runBrainWorkflowOnServiceMock).not.toHaveBeenCalled();
  });
});
