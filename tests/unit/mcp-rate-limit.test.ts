/**
 * AAF-003: per-credential rate limit (preventive) + high-risk-burst anomaly
 * signal (detective) on MCP tool calls, wired into `wrapRegisterTool`
 * (`lib/mcp/telemetry.ts`). Both `@/lib/db` and `@/lib/security/rate-limit`
 * are mocked so this stays a fast, deterministic unit test — no DB, no real
 * limiter backend.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture every db.insert(table).values(v) call — mirrors
// tests/unit/mcp-audit-instrumentation.test.ts's mock shape.
const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
vi.mock('@/lib/db', () => ({
  db: {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        return { then: (f?: () => void) => { f?.(); return { catch: () => {} }; }, catch: () => {} };
      },
    }),
  },
}));

const checkRateLimitMock = vi.fn<(key: string, limit: number, windowMs: number) => Promise<boolean>>();
vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: (key: string, limit: number, windowMs: number) => checkRateLimitMock(key, limit, windowMs),
}));

const notifyApproversMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/crm/notifications', () => ({
  notifyApprovers: (params: unknown) => notifyApproversMock(params),
}));

import { wrapRegisterTool } from '@/lib/mcp/telemetry';

type Handler = (...args: unknown[]) => unknown;

function wrappedServer(ctx: unknown) {
  const registered: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _config: unknown, handler: Handler) => {
      registered[name] = handler;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wrapRegisterTool(server as any, ctx as any);
  return { server, registered };
}

const ctx = { userId: 7, keyId: 3, client: { id: 42 }, scopes: [] as string[], runId: 'run-xyz' };

// Let any fire-and-forget microtask chains (the anomaly detector) settle.
async function flush() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe('MCP per-credential rate limit + anomaly signal (AAF-003)', () => {
  beforeEach(() => {
    inserts.length = 0;
    checkRateLimitMock.mockReset();
    notifyApproversMock.mockReset();
    notifyApproversMock.mockResolvedValue(undefined);
    delete process.env.MCP_TELEMETRY_DISABLED;
  });

  it('runs the handler normally when under the limit', async () => {
    checkRateLimitMock.mockResolvedValue(true); // every checkRateLimit call allows
    const { server, registered } = wrappedServer(ctx);
    const handlerFn = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    server.registerTool('benign_tool', {}, handlerFn);

    const result = await registered['benign_tool']({ foo: 'bar' });

    expect(handlerFn).toHaveBeenCalledTimes(1);
    expect((result as { isError?: boolean }).isError).not.toBe(true);
    // Overall throttle key was checked.
    expect(checkRateLimitMock).toHaveBeenCalledWith('mcp-tool:k3', 240, 60_000);
  });

  it('blocks the call and does not run the handler when over the overall limit', async () => {
    checkRateLimitMock.mockImplementation(async (key: string) => {
      if (key.startsWith('mcp-tool:')) return false; // over limit
      return true;
    });
    const { server, registered } = wrappedServer(ctx);
    const handlerFn = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    server.registerTool('throttled_tool', {}, handlerFn);

    const result = await registered['throttled_tool']({ foo: 'bar' }) as {
      isError?: boolean;
      content?: Array<{ text?: string }>;
    };

    expect(handlerFn).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain('Rate limit exceeded');
  });

  it('fails open and still runs the handler when checkRateLimit throws', async () => {
    checkRateLimitMock.mockRejectedValue(new Error('backend down'));
    const { server, registered } = wrappedServer(ctx);
    const handlerFn = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    server.registerTool('flaky_limiter_tool', {}, handlerFn);

    const result = await registered['flaky_limiter_tool']({ foo: 'bar' });

    expect(handlerFn).toHaveBeenCalledTimes(1);
    expect((result as { isError?: boolean }).isError).not.toBe(true);
  });

  it('alerts (debounced) and still executes a high-risk tool that bursts past the threshold', async () => {
    checkRateLimitMock.mockImplementation(async (key: string) => {
      if (key.startsWith('mcp-tool:')) return true; // under overall limit
      if (key.startsWith('mcp-hr-burst:')) return false; // over high-risk burst threshold — anomaly
      if (key.startsWith('mcp-hr-alert:')) return true; // first alert this window
      return true;
    });
    const { server, registered } = wrappedServer(ctx);
    // '_delete' suffix matches HIGH_RISK_SUFFIX_RE in lib/mcp/high-risk-tools.ts
    const handlerFn = vi.fn(async () => ({ content: [{ type: 'text', text: 'deleted' }] }));
    server.registerTool('crm_deals_delete', {}, handlerFn);

    const result = await registered['crm_deals_delete']({ id: 1 });
    await flush();

    // Anomaly is a detective signal only — the call still executes.
    expect(handlerFn).toHaveBeenCalledTimes(1);
    expect((result as { isError?: boolean }).isError).not.toBe(true);
    expect(notifyApproversMock).toHaveBeenCalledTimes(1);
    expect(notifyApproversMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 42,
        type: 'agent_anomaly',
        entityType: 'mcp_anomaly',
      }),
    );
  });

  it('does not alert a second time within the same debounce window', async () => {
    checkRateLimitMock.mockImplementation(async (key: string) => {
      if (key.startsWith('mcp-tool:')) return true;
      if (key.startsWith('mcp-hr-burst:')) return false; // still bursting
      if (key.startsWith('mcp-hr-alert:')) return false; // already alerted this window
      return true;
    });
    const { server, registered } = wrappedServer(ctx);
    const handlerFn = vi.fn(async () => ({ content: [{ type: 'text', text: 'deleted' }] }));
    server.registerTool('crm_deals_delete', {}, handlerFn);

    await registered['crm_deals_delete']({ id: 1 });
    await flush();

    expect(handlerFn).toHaveBeenCalledTimes(1);
    expect(notifyApproversMock).not.toHaveBeenCalled();
  });

  it('does not alert on a benign (non-high-risk) burst', async () => {
    checkRateLimitMock.mockImplementation(async (key: string) => {
      if (key.startsWith('mcp-tool:')) return true;
      // Would-be burst keys should never even be checked for a non-high-risk tool.
      return false;
    });
    const { server, registered } = wrappedServer(ctx);
    const handlerFn = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    server.registerTool('crm_deals_list', {}, handlerFn);

    await registered['crm_deals_list']({});
    await flush();

    expect(handlerFn).toHaveBeenCalledTimes(1);
    expect(notifyApproversMock).not.toHaveBeenCalled();
    expect(checkRateLimitMock).not.toHaveBeenCalledWith(
      expect.stringContaining('mcp-hr-burst:'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('skips rate limiting entirely when the context has no keyId or userId', async () => {
    const anonCtx = { userId: null, keyId: null, client: { id: 42 }, scopes: [] as string[], runId: null };
    const { server, registered } = wrappedServer(anonCtx);
    const handlerFn = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    server.registerTool('anon_tool', {}, handlerFn);

    await registered['anon_tool']({});

    expect(handlerFn).toHaveBeenCalledTimes(1);
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });
});
