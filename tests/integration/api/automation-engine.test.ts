/**
 * Automation engine integration tests.
 *
 * Exercises the full event → rule-match → condition-eval → template-resolve
 * → action-dispatch → log-insertion chain. `executePortalTool` is mocked so
 * we can observe calls and inject success/failure without needing the real
 * portal tool logic to be stateful.
 *
 * Contract covered:
 *   - emitEvent is fire-and-forget; handlers flush before our assertion
 *   - Triggers match exactly on event name
 *   - Triggers match on filters (shallow key equality)
 *   - Disabled rules are skipped
 *   - Cross-tenant: rule for client B does not fire for event from client A
 *   - Conditions: all must pass (AND semantics)
 *   - Templates: {{event.field}} and {{event.nested.field}} resolve
 *   - Log row persisted with status = success / partial / failed
 *   - Rule stats: executionCount incremented, lastExecutedAt stamped
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

vi.mock('@/lib/ai/portal-tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/portal-tools')>();
  return {
    ...actual,
    executePortalTool: vi.fn(),
  };
});

import { executePortalTool } from '@/lib/ai/portal-tools';
const mockTool = executePortalTool as unknown as Mock;

// Engine + event bus — importing initializes the engine, idempotent
import { emitEvent } from '@/lib/automation';
import { sessionForNewClientUser, type TenantCtx } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

interface RuleInput {
  clientId: number;
  name?: string;
  trigger: { event: string; filters?: Record<string, unknown> };
  conditions?: unknown[];
  actions: Array<{ tool: string; params: Record<string, unknown>; delay?: number }>;
  enabled?: boolean;
}

async function createRule(r: RuleInput): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.automation_rules (
      client_id, name, trigger, conditions, actions, enabled, source
    ) VALUES (
      ${r.clientId}, ${r.name ?? 'Test rule'},
      ${JSON.stringify(r.trigger)}::jsonb,
      ${JSON.stringify(r.conditions ?? [])}::jsonb,
      ${JSON.stringify(r.actions)}::jsonb,
      ${r.enabled ?? true},
      'manual'
    )
    RETURNING id
  `;
  return row.id;
}

async function latestLog(clientId: number) {
  const sql = getTestSql();
  const [row] = await sql<{
    rule_id: number;
    trigger_event: string;
    status: string;
    duration: number | null;
    actions_executed: unknown;
    trigger_payload: unknown;
    error_message: string | null;
  }[]>`
    SELECT rule_id, trigger_event, status, duration, actions_executed, trigger_payload, error_message
    FROM ${sql(TEST_SCHEMA)}.automation_logs
    WHERE client_id = ${clientId}
    ORDER BY id DESC LIMIT 1
  `;
  return row ?? null;
}

/** Wait for the engine's async handler chain (match → execute → log → stats)
 * to complete. Poll the automation_logs table for the expected row count
 * rather than hard-sleeping, because Railway round-trips are uneven. */
async function flushUntilLogs(clientId: number, expected: number, timeoutMs = 4000): Promise<void> {
  const sql = getTestSql();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM ${sql(TEST_SCHEMA)}.automation_logs
      WHERE client_id = ${clientId}
    `;
    if ((rows[0]?.c ?? 0) >= expected) return;
    await new Promise(r => setTimeout(r, 30));
  }
}
/** Hard sleep — used only for the "should NOT fire" negative assertions. */
async function waitIdle(ms = 300) { await new Promise(r => setTimeout(r, ms)); }

describe('Automation engine @automations', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    mockTool.mockReset();
    mockTool.mockResolvedValue({ ok: true });
    [A, B] = await Promise.all([
      sessionForNewClientUser('auto-a'),
      sessionForNewClientUser('auto-b'),
    ]);
  });
  afterEach(async () => {
    const sql = getTestSql();
    await sql`DELETE FROM ${sql(TEST_SCHEMA)}.automation_logs`;
    await sql`DELETE FROM ${sql(TEST_SCHEMA)}.automation_rules`;
  });

  it('dispatches a matching event to the rule action and persists a success log', async () => {
    const ruleId = await createRule({
      clientId: A.client.id,
      trigger: { event: 'booking.created' },
      actions: [{ tool: 'send_email', params: { to: 'static@test.local', subject: 'hi' } }],
    });

    emitEvent('booking.created', A.client.id, A.user.id, { bookingId: 123 });
    await flushUntilLogs(A.client.id, 1);

    expect(mockTool).toHaveBeenCalledTimes(1);
    expect(mockTool).toHaveBeenCalledWith(
      'send_email',
      { to: 'static@test.local', subject: 'hi' },
      A.client.id,
      A.user.id,
    );

    const log = await latestLog(A.client.id);
    expect(log?.rule_id).toBe(ruleId);
    expect(log?.trigger_event).toBe('booking.created');
    expect(log?.status).toBe('success');
    expect(log?.error_message).toBeNull();
  });

  it('resolves {{event.field}} and nested {{event.a.b}} templates in action params', async () => {
    await createRule({
      clientId: A.client.id,
      trigger: { event: 'booking.created' },
      actions: [{
        tool: 'send_email',
        params: {
          to: '{{event.guestEmail}}',
          subject: 'Hi {{event.guest.name}}',
          body: 'Your booking id is {{event.bookingId}}',
        },
      }],
    });

    emitEvent('booking.created', A.client.id, A.user.id, {
      bookingId: 42,
      guestEmail: 'jane@test.local',
      guest: { name: 'Jane' },
    });
    await flushUntilLogs(A.client.id, 1);

    expect(mockTool).toHaveBeenCalledWith(
      'send_email',
      {
        to: 'jane@test.local',
        subject: 'Hi Jane',
        body: 'Your booking id is 42',
      },
      A.client.id,
      A.user.id,
    );
  });

  it('does NOT fire when trigger filters don\'t match the payload', async () => {
    await createRule({
      clientId: A.client.id,
      trigger: { event: 'booking.created', filters: { source: 'web' } },
      actions: [{ tool: 'send_email', params: { to: 'a@t.l' } }],
    });

    emitEvent('booking.created', A.client.id, A.user.id, { source: 'api' });
    await waitIdle();
    expect(mockTool).not.toHaveBeenCalled();

    emitEvent('booking.created', A.client.id, A.user.id, { source: 'web' });
    await flushUntilLogs(A.client.id, 1);
    expect(mockTool).toHaveBeenCalledTimes(1);
  });

  it('skips disabled rules', async () => {
    await createRule({
      clientId: A.client.id,
      trigger: { event: 'booking.created' },
      actions: [{ tool: 'send_email', params: { to: 'a@t.l' } }],
      enabled: false,
    });
    emitEvent('booking.created', A.client.id, A.user.id, {});
    await waitIdle();
    expect(mockTool).not.toHaveBeenCalled();
  });

  it('is tenant-scoped — A\'s rule does not fire for B\'s event', async () => {
    await createRule({
      clientId: A.client.id,
      trigger: { event: 'booking.created' },
      actions: [{ tool: 'send_email', params: { to: 'a@t.l' } }],
    });
    // Event emitted under B — A's rule must NOT fire
    emitEvent('booking.created', B.client.id, B.user.id, {});
    await waitIdle();
    expect(mockTool).not.toHaveBeenCalled();
  });

  it('evaluates AND conditions — all must pass for the rule to fire', async () => {
    await createRule({
      clientId: A.client.id,
      trigger: { event: 'crm.deal.updated' },
      conditions: [
        { field: 'stage', operator: 'equals', value: 'won' },
        { field: 'value', operator: 'gt', value: 1000 },
      ],
      actions: [{ tool: 'send_email', params: { to: 'a@t.l' } }],
    });

    // Fails second condition
    emitEvent('crm.deal.updated', A.client.id, A.user.id, { stage: 'won', value: 500 });
    await waitIdle();
    expect(mockTool).not.toHaveBeenCalled();

    // Passes both
    emitEvent('crm.deal.updated', A.client.id, A.user.id, { stage: 'won', value: 2500 });
    await flushUntilLogs(A.client.id, 1);
    expect(mockTool).toHaveBeenCalledTimes(1);
  });

  it('partial status — some actions succeed, some fail', async () => {
    mockTool.mockReset();
    mockTool
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('boom'));

    await createRule({
      clientId: A.client.id,
      trigger: { event: 'booking.created' },
      actions: [
        { tool: 'send_email', params: { to: 'a@t.l' } },
        { tool: 'flaky_tool', params: {} },
      ],
    });

    emitEvent('booking.created', A.client.id, A.user.id, {});
    await flushUntilLogs(A.client.id, 1);

    const log = await latestLog(A.client.id);
    expect(log?.status).toBe('partial');
    expect(log?.error_message).toBe('boom');
  });

  it('failed status — all actions fail', async () => {
    mockTool.mockReset();
    mockTool.mockRejectedValue(new Error('down'));

    await createRule({
      clientId: A.client.id,
      trigger: { event: 'booking.created' },
      actions: [{ tool: 'down_tool', params: {} }],
    });
    emitEvent('booking.created', A.client.id, A.user.id, {});
    await flushUntilLogs(A.client.id, 1);

    const log = await latestLog(A.client.id);
    expect(log?.status).toBe('failed');
    expect(log?.error_message).toBe('down');
  });

  it('increments rule executionCount + stamps lastExecutedAt', async () => {
    const ruleId = await createRule({
      clientId: A.client.id,
      trigger: { event: 'booking.created' },
      actions: [{ tool: 'send_email', params: { to: 'a@t.l' } }],
    });

    emitEvent('booking.created', A.client.id, A.user.id, {});
    await flushUntilLogs(A.client.id, 1);
    emitEvent('booking.created', A.client.id, A.user.id, {});
    await flushUntilLogs(A.client.id, 2);

    const sql = getTestSql();
    const [row] = await sql<{ execution_count: number; last_executed_at: Date | null }[]>`
      SELECT execution_count, last_executed_at
      FROM ${sql(TEST_SCHEMA)}.automation_rules WHERE id = ${ruleId}
    `;
    expect(row.execution_count).toBe(2);
    expect(row.last_executed_at).not.toBeNull();
  });

  it('does NOT fire on a different event name even with same client', async () => {
    await createRule({
      clientId: A.client.id,
      trigger: { event: 'booking.created' },
      actions: [{ tool: 'send_email', params: { to: 'a@t.l' } }],
    });
    emitEvent('booking.cancelled', A.client.id, A.user.id, {});
    await waitIdle();
    expect(mockTool).not.toHaveBeenCalled();
  });
});
