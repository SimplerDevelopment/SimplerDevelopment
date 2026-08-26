import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mcpCall, restPost, assertClientMatches, CliError } from '../../../packages/cli/src/client.js';
import type { ResolvedConfig } from '../../../packages/cli/src/config.js';

function baseConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    apiUrl: 'https://portal.example.com',
    apiKey: 'sd_mcp_testkey1234',
    source: 'flag',
    apiUrlSource: 'flag',
    apiKeySource: 'flag',
    timeout: 5000,
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('mcpCall', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses content[0].text as JSON on success', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: JSON.stringify({ id: 42, title: 'Hello' }) }] },
      }),
    );

    const result = await mcpCall(baseConfig(), 'posts_get', { id: 42 });
    expect(result.data).toEqual({ id: 42, title: 'Hello' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://portal.example.com/api/mcp');
    expect(JSON.parse(init.body).method).toBe('tools/call');
  });

  it('throws a tool_error CliError (exit 1) when isError is true', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        jsonrpc: '2.0',
        id: 1,
        result: { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'boom' }) }] },
      }),
    );

    await expect(mcpCall(baseConfig(), 'posts_get', {})).rejects.toMatchObject({
      exitCode: 1,
      code: 'tool_error',
    });
  });

  it('throws an rpc_error CliError (exit 1) on a JSON-RPC error envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Invalid params' } }),
    );

    await expect(mcpCall(baseConfig(), 'posts_get', {})).rejects.toMatchObject({
      exitCode: 1,
      code: 'rpc_error',
      message: 'Invalid params',
    });
  });

  it('throws an unauthorized CliError (exit 3) on HTTP 401', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'unauthorized' }));

    await expect(mcpCall(baseConfig(), 'posts_get', {})).rejects.toMatchObject({
      exitCode: 3,
      code: 'unauthorized',
    });
  });

  it('throws an unauthorized CliError (exit 3) on HTTP 403', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: 'forbidden' }));

    await expect(mcpCall(baseConfig(), 'posts_get', {})).rejects.toMatchObject({
      exitCode: 3,
      code: 'unauthorized',
    });
  });

  it('throws a network_error CliError (exit 5) when fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));

    await expect(mcpCall(baseConfig(), 'posts_get', {})).rejects.toMatchObject({
      exitCode: 5,
      code: 'network_error',
    });
  });

  it('throws a no_api_key CliError (exit 3) when the key is missing', async () => {
    await expect(mcpCall(baseConfig({ apiKey: null }), 'posts_get', {})).rejects.toMatchObject({
      exitCode: 3,
      code: 'no_api_key',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws a no_api_url CliError (exit 3) when the URL is missing', async () => {
    await expect(mcpCall(baseConfig({ apiUrl: null }), 'posts_get', {})).rejects.toMatchObject({
      exitCode: 3,
      code: 'no_api_url',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('restPost', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns status + parsed JSON body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true, data: { token: 'abc' } }));
    const res = await restPost({ apiUrl: 'https://portal.example.com', timeout: 5000 }, '/api/portal/auth/mobile-sign-in', {
      email: 'a@b.com',
      password: 'pw',
    });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ success: true, data: { token: 'abc' } });
  });

  it('throws an unauthorized CliError on 401', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { success: false, message: 'Wrong email or password' }));
    await expect(
      restPost({ apiUrl: 'https://portal.example.com', timeout: 5000 }, '/api/portal/auth/mobile-sign-in', {
        email: 'a@b.com',
        password: 'wrong',
      }),
    ).rejects.toMatchObject({ exitCode: 3, code: 'unauthorized' });
  });
});

// JUL9-001: the `--client <id>` safety gate. This is the fix for a stored
// key silently belonging to a different tenant than the operator believed —
// resolution must come from a LIVE whoami call, never a locally-stored label.
describe('assertClientMatches', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function whoamiResponse(body: unknown): Response {
    return jsonResponse(200, { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify(body) }] } });
  }

  it('resolves successfully when the expected client id is the credential\'s default tenant', async () => {
    fetchMock.mockResolvedValueOnce(
      whoamiResponse({ client: { id: 117, company: 'W.H. Peters Outdoor Adventures' }, clients: [{ id: 117, company: 'W.H. Peters Outdoor Adventures' }] }),
    );
    const result = await assertClientMatches(baseConfig(), 117);
    expect(result).toEqual({
      resolvedClientId: 117,
      resolvedCompany: 'W.H. Peters Outdoor Adventures',
      reachable: [{ id: 117, company: 'W.H. Peters Outdoor Adventures' }],
    });
  });

  it('resolves successfully when the expected id is reachable but not the default (multi-tenant credential)', async () => {
    fetchMock.mockResolvedValueOnce(
      whoamiResponse({
        client: { id: 104, company: 'SimplerDevelopment' },
        clients: [
          { id: 104, company: 'SimplerDevelopment' },
          { id: 117, company: 'W.H. Peters Outdoor Adventures' },
        ],
      }),
    );
    const result = await assertClientMatches(baseConfig(), 117);
    expect(result.resolvedClientId).toBe(117);
    expect(result.resolvedCompany).toBe('W.H. Peters Outdoor Adventures');
  });

  it('throws a tenant_mismatch CliError (exit 3) — the exact JUL9-001 scenario: key resolves to the wrong company', async () => {
    fetchMock.mockResolvedValueOnce(
      whoamiResponse({ client: { id: 117, company: 'W.H. Peters Outdoor Adventures' }, clients: [{ id: 117, company: 'W.H. Peters Outdoor Adventures' }] }),
    );
    await expect(assertClientMatches(baseConfig(), 104)).rejects.toMatchObject({
      exitCode: 3,
      code: 'tenant_mismatch',
    });
  });

  it('includes the reachable companies in the mismatch error message', async () => {
    fetchMock.mockResolvedValueOnce(
      whoamiResponse({ client: { id: 117, company: 'W.H. Peters Outdoor Adventures' }, clients: [{ id: 117, company: 'W.H. Peters Outdoor Adventures' }] }),
    );
    await expect(assertClientMatches(baseConfig(), 104)).rejects.toThrow(/117 \(W\.H\. Peters Outdoor Adventures\)/);
  });

  it('throws tenant_mismatch when whoami returns no companies at all', async () => {
    fetchMock.mockResolvedValueOnce(whoamiResponse({ client: undefined, clients: [] }));
    await expect(assertClientMatches(baseConfig(), 104)).rejects.toMatchObject({ code: 'tenant_mismatch' });
  });

  it('propagates an underlying auth failure (e.g. expired key) rather than reporting a tenant mismatch', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'unauthorized' }));
    await expect(assertClientMatches(baseConfig(), 104)).rejects.toMatchObject({
      exitCode: 3,
      code: 'unauthorized',
    });
  });
});

describe('CliError', () => {
  it('carries message/exitCode/code', () => {
    const err = new CliError('boom', 2, 'usage_error');
    expect(err.message).toBe('boom');
    expect(err.exitCode).toBe(2);
    expect(err.code).toBe('usage_error');
    expect(err).toBeInstanceOf(Error);
  });
});
