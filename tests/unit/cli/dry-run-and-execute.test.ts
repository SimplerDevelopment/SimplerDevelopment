import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { buildDryRunPayload, executeTool } from '../../../packages/cli/src/index.js';
import type { GlobalFlags } from '../../../packages/cli/src/index.js';
import { loadManifestFromPath, findByCmd } from '../../../packages/cli/src/manifest.js';
import type { ResolvedConfig } from '../../../packages/cli/src/config.js';
import { CliError } from '../../../packages/cli/src/client.js';

const FIXTURE_PATH = resolve(__dirname, 'fixtures/manifest.fixture.json');
const manifest = loadManifestFromPath(FIXTURE_PATH);

function baseGlobal(overrides: Partial<GlobalFlags> = {}): GlobalFlags {
  return {
    yes: false,
    dryRun: false,
    verbose: false,
    help: false,
    passwordStdin: false,
    ...overrides,
  };
}

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

describe('buildDryRunPayload', () => {
  it('shapes {dryRun:true, tool, arguments}', () => {
    const tool = findByCmd(manifest, ['posts', 'list'])!;
    expect(buildDryRunPayload(tool, { status: 'draft' })).toEqual({
      dryRun: true,
      tool: 'posts_list',
      arguments: { status: 'draft' },
    });
  });
});

describe('executeTool — dry run', () => {
  it('short-circuits before any network call and returns the dry-run payload', async () => {
    const tool = findByCmd(manifest, ['posts', 'list'])!;
    const data = await executeTool(tool, {
      config: baseConfig(),
      flags: { status: 'draft' },
      global: baseGlobal({ dryRun: true }),
      isTTY: false,
    });
    expect(data).toEqual({ dryRun: true, tool: 'posts_list', arguments: { status: 'draft' } });
  });
});

describe('executeTool — arg validation', () => {
  it('throws a usage_error CliError (exit 2) for missing required args', async () => {
    const tool = findByCmd(manifest, ['posts', 'create'])!;
    await expect(
      executeTool(tool, {
        config: baseConfig(),
        flags: { title: 'Hello' },
        global: baseGlobal(),
        isTTY: false,
      }),
    ).rejects.toMatchObject({ exitCode: 2, code: 'usage_error' });
  });
});

describe('executeTool — destructive gating', () => {
  it('denies with confirmation_required (exit 4) on non-TTY without --yes', async () => {
    const tool = findByCmd(manifest, ['posts', 'delete'])!;
    await expect(
      executeTool(tool, {
        config: baseConfig(),
        flags: { 'post-id': '5' },
        global: baseGlobal(),
        isTTY: false,
      }),
    ).rejects.toMatchObject({ exitCode: 4, code: 'confirmation_required' });
  });

  it('proceeds and calls the tool when --yes is passed', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { content: [{ type: 'text', text: JSON.stringify({ id: 5, cancelled: true }) }] },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const tool = findByCmd(manifest, ['bookings', 'cancel'])!;
      const data = await executeTool(tool, {
        config: baseConfig(),
        flags: { 'booking-id': '5' },
        global: baseGlobal({ yes: true }),
        isTTY: false,
      });
      expect(data).toEqual({ id: 5, cancelled: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// JUL9-001: `--client <id>` must live-verify (via whoami) before the tool
// call runs — and before any destructive-confirmation prompt, so a tenant
// mismatch fails fast rather than prompting "run this destructive command?"
// against the wrong company first.
describe('executeTool — --client assertion gate (JUL9-001)', () => {
  function whoamiFetch(body: unknown) {
    return vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify(body) }] } }),
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a non-numeric --client with usage_error before ever calling the network', async () => {
    const fetchMock = whoamiFetch({});
    vi.stubGlobal('fetch', fetchMock);
    const tool = findByCmd(manifest, ['posts', 'list'])!;
    await expect(
      executeTool(tool, {
        config: baseConfig(),
        flags: {},
        global: baseGlobal({ assertClient: NaN }),
        isTTY: false,
      }),
    ).rejects.toMatchObject({ exitCode: 2, code: 'usage_error' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hard-fails with tenant_mismatch (exit 3) when the credential resolves to a different client, WITHOUT ever calling the real tool', async () => {
    const fetchMock = whoamiFetch({ client: { id: 117, company: 'W.H. Peters Outdoor Adventures' }, clients: [{ id: 117, company: 'W.H. Peters Outdoor Adventures' }] });
    vi.stubGlobal('fetch', fetchMock);
    const tool = findByCmd(manifest, ['posts', 'list'])!;
    await expect(
      executeTool(tool, {
        config: baseConfig(),
        flags: {},
        global: baseGlobal({ assertClient: 104 }),
        isTTY: false,
      }),
    ).rejects.toMatchObject({ exitCode: 3, code: 'tenant_mismatch' });
    // Only the whoami probe ran — never a second call to the actual tool.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails the tenant check before ever prompting/denying a destructive command', async () => {
    const fetchMock = whoamiFetch({ client: { id: 117, company: 'W.H. Peters Outdoor Adventures' }, clients: [{ id: 117, company: 'W.H. Peters Outdoor Adventures' }] });
    vi.stubGlobal('fetch', fetchMock);
    const tool = findByCmd(manifest, ['posts', 'delete'])!;
    await expect(
      executeTool(tool, {
        config: baseConfig(),
        flags: { 'post-id': '5' },
        global: baseGlobal({ assertClient: 104 }), // no --yes — if destructive gating ran first this would be confirmation_required (4), not tenant_mismatch (3)
        isTTY: false,
      }),
    ).rejects.toMatchObject({ exitCode: 3, code: 'tenant_mismatch' });
  });

  it('proceeds to the real tool call once the client id matches', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () =>
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: { content: [{ type: 'text', text: JSON.stringify({ client: { id: 104, company: 'SimplerDevelopment' }, clients: [{ id: 104, company: 'SimplerDevelopment' }] }) }] },
          }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () =>
          JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: JSON.stringify({ items: [] }) }] } }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const tool = findByCmd(manifest, ['posts', 'list'])!;
    const data = await executeTool(tool, {
      config: baseConfig(),
      flags: {},
      global: baseGlobal({ assertClient: 104 }),
      isTTY: false,
    });
    expect(data).toEqual({ items: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2); // whoami probe + the real posts_list call
  });

  it('--dry-run skips the --client verification entirely (no network call at all)', async () => {
    const fetchMock = whoamiFetch({});
    vi.stubGlobal('fetch', fetchMock);
    const tool = findByCmd(manifest, ['posts', 'list'])!;
    const data = await executeTool(tool, {
      config: baseConfig(),
      flags: {},
      global: baseGlobal({ assertClient: 104, dryRun: true }),
      isTTY: false,
    });
    expect(data).toEqual({ dryRun: true, tool: 'posts_list', arguments: {} });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('CliError re-export sanity', () => {
  it('is the same class used across client/index', () => {
    expect(new CliError('x', 1, 'tool_error')).toBeInstanceOf(Error);
  });
});
