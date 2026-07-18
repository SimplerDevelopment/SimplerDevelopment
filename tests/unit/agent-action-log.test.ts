// @vitest-environment node
/**
 * Unit tests for the agent-action audit-log integration.
 *
 * Verifies that:
 *   1. executePortalTool with ctx.source='automation' triggers exactly one
 *      logAgentAction call with source 'automation' and the right tool name.
 *   2. executePortalTool with ctx.source='assistant' (default) does the same.
 *   3. An unknown tool logs outcome='error' and returns the error object.
 *   4. A handler that throws logs outcome='error' and rethrows.
 *   5. A handler returning an object with an `error` key logs outcome='error'.
 *   6. hashParams produces a stable 64-char hex string and never exposes the
 *      original value.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks must be hoisted before any imports that transitively need them ──

// Mock the db so @/lib/db/schema and @/lib/db don't throw without DATABASE_URL.
vi.mock('@/lib/db', () => ({ db: { insert: vi.fn() } }));
vi.mock('@/lib/db/schema', () => ({
  agentActionLog: {},
}));
vi.mock('@/lib/automation/event-bus', () => ({ emitEvent: vi.fn() }));
vi.mock('@/lib/crm/default-pipeline', () => ({ ensureDefaultPipeline: vi.fn() }));

// Capture logAgentAction calls WITHOUT going to the real DB.
// We spy on the module itself so both the portal-tools barrel and our test
// see the same mock.
vi.mock('@/lib/audit/agent-action-log', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/audit/agent-action-log')>();
  return {
    ...orig,
    logAgentAction: vi.fn().mockResolvedValue(undefined),
  };
});

import { executePortalTool, HANDLERS } from '@/lib/ai/portal-tools';
import * as auditMod from '@/lib/audit/agent-action-log';
import { hashParams } from '@/lib/audit/agent-action-log';

// ── Helpers ─────────────────────────────────────────────────────────────────

const logSpy = vi.mocked(auditMod.logAgentAction);

beforeEach(() => {
  logSpy.mockClear();
});

// Register a minimal fake handler so we can exercise the success path
// without touching real domain modules.
const FAKE_TOOL = '__test_fake_tool__';
(HANDLERS as Record<string, unknown>)[FAKE_TOOL] = vi.fn().mockResolvedValue({ ok: true });

const FAKE_ERROR_TOOL = '__test_fake_error_tool__';
(HANDLERS as Record<string, unknown>)[FAKE_ERROR_TOOL] = vi.fn().mockResolvedValue({ error: 'something went wrong' });

const FAKE_THROW_TOOL = '__test_fake_throw_tool__';
(HANDLERS as Record<string, unknown>)[FAKE_THROW_TOOL] = vi.fn().mockRejectedValue(new Error('handler exploded'));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('executePortalTool audit logging', () => {
  it('logs exactly one row with source=automation when ctx.source=automation', async () => {
    const result = await executePortalTool(
      FAKE_TOOL,
      { x: 1 },
      42,   // clientId
      7,    // userId
      { source: 'automation', ruleId: 99 },
    );

    expect(result).toEqual({ ok: true });
    expect(logSpy).toHaveBeenCalledTimes(1);

    const entry = logSpy.mock.calls[0][0];
    expect(entry.source).toBe('automation');
    expect(entry.tool).toBe(FAKE_TOOL);
    expect(entry.clientId).toBe(42);
    expect(entry.userId).toBe(7);
    expect(entry.ruleId).toBe(99);
    expect(entry.outcome).toBe('success');
    expect(entry.paramsHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('logs exactly one row with source=assistant when ctx.source=assistant', async () => {
    await executePortalTool(FAKE_TOOL, { y: 2 }, 5, 3, { source: 'assistant' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const entry = logSpy.mock.calls[0][0];
    expect(entry.source).toBe('assistant');
    expect(entry.outcome).toBe('success');
  });

  it('defaults to source=assistant when ctx is omitted', async () => {
    await executePortalTool(FAKE_TOOL, {}, 1, 0);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0].source).toBe('assistant');
  });

  it('logs outcome=error for an unknown tool and returns the error object', async () => {
    const result = await executePortalTool('__no_such_tool__', {}, 1, 0, { source: 'automation', ruleId: 5 });

    expect((result as Record<string, unknown>).error).toMatch(/Unknown tool/);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const entry = logSpy.mock.calls[0][0];
    expect(entry.outcome).toBe('error');
    expect(entry.source).toBe('automation');
  });

  it('logs outcome=error when the handler returns an object with an error key', async () => {
    const result = await executePortalTool(FAKE_ERROR_TOOL, {}, 1, 0);

    expect((result as Record<string, unknown>).error).toBe('something went wrong');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0].outcome).toBe('error');
    expect(logSpy.mock.calls[0][0].errorMessage).toBe('something went wrong');
  });

  it('logs outcome=error and rethrows when the handler throws', async () => {
    await expect(
      executePortalTool(FAKE_THROW_TOOL, {}, 1, 0),
    ).rejects.toThrow('handler exploded');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0].outcome).toBe('error');
    expect(logSpy.mock.calls[0][0].errorMessage).toBe('handler exploded');
  });
});

describe('hashParams', () => {
  it('returns a 64-char lowercase hex string', () => {
    const h = hashParams({ foo: 'bar', n: 42 });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same input', () => {
    expect(hashParams({ a: 1 })).toBe(hashParams({ a: 1 }));
  });

  it('differs for different inputs', () => {
    expect(hashParams({ a: 1 })).not.toBe(hashParams({ a: 2 }));
  });

  it('does not contain the original value in its output', () => {
    const secret = 'super-secret-value-xyz';
    const h = hashParams({ password: secret });
    expect(h).not.toContain(secret);
  });
});
