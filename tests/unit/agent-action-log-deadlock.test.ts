// @vitest-environment node
/**
 * agent_action_log deadlock retry.
 *
 * The table carries three FKs (client_id, user_id, rule_id), so every insert
 * takes FOR KEY SHARE locks on those parent rows. Callers log fire-and-forget,
 * so an insert can still be in flight when something else touches the same
 * parents — Postgres then kills one side with 40P01. Before the retry, that row
 * was silently dropped and only a console.warn recorded it.
 *
 * These assert the retry is real (not just a swallowed error), that it is
 * bounded, and that it doesn't fire for unrelated failures.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const valuesMock = vi.fn();
vi.mock('@/lib/db', () => ({ db: { insert: () => ({ values: valuesMock }) } }));
vi.mock('@/lib/db/schema', () => ({ agentActionLog: {} }));

const { logAgentAction } = await import('@/lib/audit/agent-action-log');

const ENTRY = {
  clientId: 1,
  source: 'assistant' as const,
  tool: 'get_dashboard',
  paramsHash: 'abc',
  outcome: 'success' as const,
};

/** Shaped like the postgres.js error drizzle surfaces (code on the cause). */
function deadlock() {
  const e = new Error('deadlock detected') as Error & { code?: string };
  e.code = '40P01';
  return e;
}

describe('logAgentAction — deadlock retry', () => {
  beforeEach(() => {
    valuesMock.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  // `console` is global and this project sets neither `restoreMocks` nor
  // `clearMocks`, so a spy left in place outlives this file and silences warns
  // in every test that shares the worker afterwards. Restore explicitly.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retries once and succeeds when the first insert deadlocks', async () => {
    valuesMock.mockRejectedValueOnce(deadlock()).mockResolvedValueOnce(undefined);
    await logAgentAction(ENTRY);
    expect(valuesMock).toHaveBeenCalledTimes(2);
    // The row landed, so nothing should have been reported as lost.
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('gives up after one retry rather than looping', async () => {
    valuesMock.mockRejectedValue(deadlock());
    await logAgentAction(ENTRY);
    expect(valuesMock).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalled();
  });

  it('does not retry errors that are not deadlocks', async () => {
    const e = new Error('null value violates not-null constraint') as Error & { code?: string };
    e.code = '23502';
    valuesMock.mockRejectedValue(e);
    await logAgentAction(ENTRY);
    expect(valuesMock).toHaveBeenCalledTimes(1);
  });

  it('reads the code off err.cause too (how drizzle wraps driver errors)', async () => {
    const wrapped = new Error('Failed query') as Error & { cause?: { code?: string } };
    wrapped.cause = { code: '40P01' };
    valuesMock.mockRejectedValueOnce(wrapped).mockResolvedValueOnce(undefined);
    await logAgentAction(ENTRY);
    expect(valuesMock).toHaveBeenCalledTimes(2);
  });

  it('never throws — logging must not break the tool call', async () => {
    valuesMock.mockRejectedValue(new Error('connection terminated'));
    await expect(logAgentAction(ENTRY)).resolves.toBeUndefined();
  });
});
