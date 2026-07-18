// @vitest-environment node
/**
 * Unit tests for the app → agents sub-service client (`lib/ai/agents-client.ts`).
 *
 * Asserts the transport contract: a single-tenant token is minted from the
 * caller-supplied clientId/userId, sent both as the `x-sd-tenant-token` header
 * and `body.requestContext.token`, behind the `Authorization: Bearer <internal
 * secret>` that proves the caller is the app; non-2xx and unconfigured both
 * throw `AgentsServiceError`. `mintInternalAccessToken` and global `fetch` are
 * mocked; env is set per test (module reads it at import) via resetModules.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mintMock = vi.fn(async () => ({ token: 'sd_oauth_test123', expiresAt: new Date(Date.now() + 1800_000) }));
vi.mock('@/lib/oauth/issue', () => ({
  mintInternalAccessToken: (...args: unknown[]) => mintMock(...args),
}));

const fetchMock = vi.fn();
const ORIG_ENV = { ...process.env };

async function importConfigured() {
  process.env.SD_AGENTS_URL = 'http://agents.internal:4111/';
  process.env.SD_AGENTS_INTERNAL_SECRET = 'super-secret';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
  vi.resetModules();
  return import('@/lib/ai/agents-client');
}

beforeEach(() => {
  mintMock.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  process.env = { ...ORIG_ENV };
  vi.unstubAllGlobals();
});

describe('runBrainWorkflowOnService', () => {
  it('mints a tenant-bound token and posts it to the brainWorkflow start-async endpoint', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'success', result: { ok: 1 } }), { status: 200 }));
    const { runBrainWorkflowOnService } = await importConfigured();

    const out = await runBrainWorkflowOnService({ clientId: 104, userId: 7, query: 'what do we know about X?' });
    expect(out).toEqual({ status: 'success', result: { ok: 1 } });

    // token minted bound to the session tenant/user, brain scopes, app MCP audience
    expect(mintMock).toHaveBeenCalledTimes(1);
    const mintArg = mintMock.mock.calls[0][0] as Record<string, unknown>;
    expect(mintArg.clientId).toBe(104);
    expect(mintArg.userId).toBe(7);
    expect(mintArg.scopes).toEqual(['brain:read', 'brain:write']);
    expect(mintArg.resource).toBe('https://app.example.com/api/mcp');

    // transport: correct URL, internal-secret bearer, tenant-token header + body
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://agents.internal:4111/api/workflows/brainWorkflow/start-async');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer super-secret');
    expect(headers['x-sd-tenant-token']).toBe('sd_oauth_test123');
    const body = JSON.parse(init.body as string);
    expect(body.inputData).toEqual({ query: 'what do we know about X?' });
    expect(body.requestContext).toEqual({ token: 'sd_oauth_test123' });
  });

  it('throws AgentsServiceError with status on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 502 }));
    const { runBrainWorkflowOnService, AgentsServiceError } = await importConfigured();
    await expect(runBrainWorkflowOnService({ clientId: 1, userId: 1, query: 'x' }))
      .rejects.toMatchObject({ name: 'AgentsServiceError', status: 502 });
    expect(AgentsServiceError).toBeTruthy();
  });

  it('throws when the service is not configured (no token minted, no fetch)', async () => {
    delete process.env.SD_AGENTS_URL;
    delete process.env.SD_AGENTS_INTERNAL_SECRET;
    vi.resetModules();
    const { runBrainWorkflowOnService, agentsServiceConfigured } = await import('@/lib/ai/agents-client');
    expect(agentsServiceConfigured()).toBe(false);
    await expect(runBrainWorkflowOnService({ clientId: 1, userId: 1, query: 'x' })).rejects.toThrow(/not configured/);
    expect(mintMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
