/**
 * CLI manifest drift guard.
 *
 * packages/cli/manifest.json is generated (scripts/generate-cli-manifest.ts,
 * `bun run cli:manifest`) from the live MCP tool registry, not hand-maintained.
 * This test builds the same in-process server the generator does (mirroring
 * the mocking approach from tests/unit/mcp-tool-registry-baseline.test.ts —
 * see that file for why each mock exists) and asserts the manifest's tool
 * name set and toolCount exactly match the registry. A mismatch means the
 * registry changed (a tool was added/removed/renamed) without regenerating
 * the manifest — regenerate with `bun run cli:manifest` and commit the diff.
 *
 * Deliberately thin: this only re-checks the *set of tool names* against the
 * registry, it does not re-derive cmd/domain/destructive/scope/args — those
 * are exercised by the generator itself and by packages/cli's own manifest
 * unit tests (tests/unit/cli/manifest.test.ts) against a fixture.
 */
import { describe, it, expect, vi } from 'vitest';
import manifest from '../../../packages/cli/manifest.json';

// Same mocks as tests/unit/mcp-tool-registry-baseline.test.ts, for the same
// reasons — see that file's header comment. We never call any tool handler
// here, only introspect registered tool NAMES, so none of this needs to be
// behaviorally accurate.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/brain/profiles', () => ({
  getOrCreateBrainProfile: vi.fn(async () => ({ id: 1, clientId: 1 })),
  getBrainProfile: vi.fn(async () => ({ id: 1, clientId: 1 })),
}));
vi.mock('@/lib/db', () => ({ db: {} }));

import { buildMcpServer } from '@/lib/mcp/server';
import type { PortalMcpContext } from '@/lib/mcp-auth';

function makeCtx(scopes: string[]): PortalMcpContext {
  return {
    userId: 1,
    keyId: 1,
    scopes,
    client: { id: 1, company: 'Manifest Drift Test Co' } as PortalMcpContext['client'],
  };
}

function registeredToolNames(): Set<string> {
  const server = buildMcpServer(makeCtx(['*']));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Set(Object.keys((server as any)._registeredTools));
}

describe('CLI manifest drift @critical', () => {
  it('manifest tool names exactly match the live MCP registry', () => {
    const registryNames = registeredToolNames();
    const manifestNames = new Set(manifest.tools.map((t) => t.name));

    const missingFromManifest = [...registryNames].filter((n) => !manifestNames.has(n));
    const extraInManifest = [...manifestNames].filter((n) => !registryNames.has(n));

    expect(missingFromManifest, 'tools registered but absent from manifest.json — regenerate with `bun run cli:manifest`').toEqual([]);
    expect(extraInManifest, 'tools in manifest.json no longer registered — regenerate with `bun run cli:manifest`').toEqual([]);
  });

  it('manifest.toolCount matches the manifest.tools array length and the live registry size', () => {
    const registryNames = registeredToolNames();
    expect(manifest.toolCount).toBe(manifest.tools.length);
    expect(manifest.toolCount).toBe(registryNames.size);
  });
});
