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

describe('CliError re-export sanity', () => {
  it('is the same class used across client/index', () => {
    expect(new CliError('x', 1, 'tool_error')).toBeInstanceOf(Error);
  });
});
