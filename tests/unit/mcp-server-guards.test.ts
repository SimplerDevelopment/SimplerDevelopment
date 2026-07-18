// @vitest-environment node
/**
 * Verifies AAF-003 (per-credential rate limit + high-risk-burst anomaly) and
 * AAF-001 (encrypted high-risk argument capture) are wired into the REAL MCP
 * tool-call path: `buildMcpServer()`'s inline `server.registerTool` shadow in
 * `lib/mcp/server.ts` (the `wrappedCb` closure).
 *
 * Context: both guards were originally implemented only inside
 * `wrapRegisterTool` (`lib/mcp/telemetry.ts`), which has zero callers in
 * production — `tests/unit/mcp-rate-limit.test.ts` and
 * `mcp-high-risk-capture.test.ts` exercise that dead path and stayed green
 * while prod shipped zero `agent_action_captures` rows for real
 * `posts_delete` calls over MCP. This spec exercises `buildMcpServer`'s own
 * shadow (the one every real MCP request actually goes through) so the gap
 * can't reopen silently.
 *
 * Mocking mirrors `tests/unit/mcp-tool-registry-baseline.test.ts` (which
 * proves `@/lib/auth` + `@/lib/brain/profiles` + `@/lib/db` mocks are
 * sufficient to build the full registrar set DB-free) plus the
 * `@/lib/security/rate-limit` mock from `mcp-rate-limit.test.ts`. Real
 * `encryptApiKey`/`decryptApiKey` are used (not mocked) with a throwaway
 * `ENCRYPTION_KEY`, matching `mcp-high-risk-capture.test.ts` — this proves
 * the capture round-trips for real rather than asserting against a stub.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { PortalMcpContext } from '@/lib/mcp-auth';

const TEST_KEY = randomBytes(32).toString('hex');

// Mock @/lib/auth before the @/lib/mcp/server import chain reaches it via
// portal-auth → @/lib/auth → next-auth.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
// Brain adapter eagerly fires getOrCreateBrainProfile() at registration time;
// stub it so building the '*'-scope server (which registers brain_* tools
// too) doesn't need a migrated brain_profiles table.
vi.mock('@/lib/brain/profiles', () => ({
  getOrCreateBrainProfile: vi.fn(async () => ({ id: 1, clientId: 1 })),
  getBrainProfile: vi.fn(async () => ({ id: 1, clientId: 1 })),
}));

// Capture every db.insert(table).values(v) call — mirrors the shape used by
// mcp-high-risk-capture.test.ts / mcp-audit-instrumentation.test.ts.
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

import { buildMcpServer } from '@/lib/mcp/server';
import { agentActionCaptures } from '@/lib/db/schema';
import { decryptApiKey } from '@/lib/crypto/api-key';

type Handler = (...args: unknown[]) => unknown;

function getRegisteredTools(server: unknown): Record<string, { handler: Handler }> {
  return (server as { _registeredTools: Record<string, { handler: Handler }> })._registeredTools;
}

function makeCtx(): PortalMcpContext {
  return {
    userId: 7,
    keyId: 3,
    scopes: ['*'],
    client: { id: 42, company: 'Guard Test Co' } as PortalMcpContext['client'],
  };
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe('buildMcpServer real inline tool shadow — AAF-001 capture + AAF-003 rate limit', () => {
  beforeEach(() => {
    inserts.length = 0;
    checkRateLimitMock.mockReset();
    checkRateLimitMock.mockResolvedValue(true);
    notifyApproversMock.mockReset();
    notifyApproversMock.mockResolvedValue(undefined);
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  it('persists an encrypted agent_action_captures row for a high-risk (*_delete) tool call', async () => {
    const server = buildMcpServer(makeCtx());

    // Register through the server's OWN (already-shadowed) registerTool —
    // this exercises the exact `wrappedCb` closure in lib/mcp/server.ts,
    // not a re-implementation of it.
    server.registerTool(
      'test_thing_delete',
      { description: 'test' },
      async () => ({ content: [{ type: 'text', text: 'deleted' }] }),
    );

    const handler = getRegisteredTools(server)['test_thing_delete'].handler;
    const result = (await handler({ id: 99, password: 'sekret' })) as { isError?: boolean };

    expect(result.isError).not.toBe(true);

    const capture = inserts.find((i) => i.table === agentActionCaptures);
    expect(capture, 'a high-risk tool call should insert an agent_action_captures row').toBeDefined();

    const v = capture!.values;
    expect(v.clientId).toBe(42);
    expect(v.toolName).toBe('test_thing_delete');
    expect(v.keyId).toBe(3);
    expect(v.userId).toBe(7);
    expect(typeof v.ciphertext).toBe('string');
    expect(v.ciphertext).not.toContain('sekret');

    // Round-trips for real — proves the capture is reconstructable, not just present.
    const decrypted = JSON.parse(decryptApiKey(v.ciphertext as string));
    expect(decrypted.id).toBe(99);
    expect(decrypted.password).toBe('[REDACTED]');
  });

  it('does NOT insert an agent_action_captures row for a benign (non-high-risk) tool call', async () => {
    const server = buildMcpServer(makeCtx());
    server.registerTool('test_thing_list', { description: 'test' }, async () => ({
      content: [{ type: 'text', text: '[]' }],
    }));

    const handler = getRegisteredTools(server)['test_thing_list'].handler;
    await handler({});

    expect(inserts.find((i) => i.table === agentActionCaptures)).toBeUndefined();
  });

  it('blocks the call with a throttle error when over the overall rate limit, without running the handler or persisting a capture', async () => {
    checkRateLimitMock.mockImplementation(async (key: string) => !key.startsWith('mcp-tool:'));

    const server = buildMcpServer(makeCtx());
    const handlerFn = vi.fn(async () => ({ content: [{ type: 'text', text: 'deleted' }] }));
    server.registerTool('throttled_thing_delete', { description: 'test' }, handlerFn);

    const handler = getRegisteredTools(server)['throttled_thing_delete'].handler;
    const result = (await handler({ id: 1 })) as { isError?: boolean; content?: Array<{ text?: string }> };

    expect(handlerFn).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain('Rate limit exceeded');
    expect(inserts.find((i) => i.table === agentActionCaptures)).toBeUndefined();
  });

  it('fails open (still runs the handler) when the rate limiter throws', async () => {
    checkRateLimitMock.mockRejectedValue(new Error('backend down'));

    const server = buildMcpServer(makeCtx());
    const handlerFn = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    server.registerTool('benign_tool', { description: 'test' }, handlerFn);

    const handler = getRegisteredTools(server)['benign_tool'].handler;
    const result = (await handler({})) as { isError?: boolean };

    expect(handlerFn).toHaveBeenCalledTimes(1);
    expect(result.isError).not.toBe(true);
  });

  it('alerts (detective, non-blocking) when a high-risk credential bursts past the anomaly threshold', async () => {
    checkRateLimitMock.mockImplementation(async (key: string) => {
      if (key.startsWith('mcp-tool:')) return true; // under the overall limit
      if (key.startsWith('mcp-hr-burst:')) return false; // over the high-risk burst threshold
      if (key.startsWith('mcp-hr-alert:')) return true; // first alert this window
      return true;
    });

    const server = buildMcpServer(makeCtx());
    const handlerFn = vi.fn(async () => ({ content: [{ type: 'text', text: 'deleted' }] }));
    server.registerTool('anomaly_thing_delete', { description: 'test' }, handlerFn);

    const handler = getRegisteredTools(server)['anomaly_thing_delete'].handler;
    const result = (await handler({ id: 1 })) as { isError?: boolean };
    await flush();

    // Detective only — never gates execution.
    expect(handlerFn).toHaveBeenCalledTimes(1);
    expect(result.isError).not.toBe(true);
    expect(notifyApproversMock).toHaveBeenCalledTimes(1);
    expect(notifyApproversMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 42, type: 'agent_anomaly', entityType: 'mcp_anomaly' }),
    );
  });
});
