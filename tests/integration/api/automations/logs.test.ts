/**
 * Integration tests for portal automation logs route.
 *
 * Covers:
 *   - GET /api/portal/automations/logs              — list logs (tenant-scoped)
 *   - GET /api/portal/automations/logs?ruleId=<id>  — filter by rule
 *
 * Named leak class: cross-tenant ruleId. The handler narrows via clientId AND
 * ruleId; supplying another tenant's ruleId must NOT leak rows. This file
 * pins that behavior.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

async function seedRule(clientId: number, name = 'Seed rule'): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.automation_rules (
      client_id, name, trigger, conditions, actions, source
    ) VALUES (
      ${clientId}, ${name},
      ${JSON.stringify({ event: 'booking.created' })}::jsonb,
      ${JSON.stringify([])}::jsonb,
      ${JSON.stringify([{ tool: 'send_email', params: {} }])}::jsonb,
      'manual'
    )
    RETURNING id
  `;
  return row.id;
}

async function seedLog(opts: {
  clientId: number;
  ruleId: number;
  status?: string;
  triggerEvent?: string;
}): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.automation_logs (
      client_id, rule_id, trigger_event, trigger_payload, status
    ) VALUES (
      ${opts.clientId}, ${opts.ruleId},
      ${opts.triggerEvent ?? 'booking.created'},
      ${JSON.stringify({})}::jsonb,
      ${opts.status ?? 'success'}
    )
    RETURNING id
  `;
  return row.id;
}

describe('GET /api/portal/automations/logs @automations @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('logs-a'),
      sessionForNewClientUser('logs-b'),
    ]);
  });

  it('returns only the caller tenant\'s logs (cross-tenant rule\'s log is hidden)', async () => {
    const ruleA = await seedRule(A.client.id, 'A');
    const ruleB = await seedRule(B.client.id, 'B');
    await seedLog({ clientId: A.client.id, ruleId: ruleA });
    await seedLog({ clientId: B.client.id, ruleId: ruleB });

    await asTenant(A);
    const route = await import('@/app/api/portal/automations/logs/route');
    const res = await callHandler<{ success: boolean; logs: Array<{ ruleId: number; clientId: number }> }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.logs.length).toBe(1);
    expect(res.data?.logs[0].ruleId).toBe(ruleA);
    expect(res.data?.logs[0].clientId).toBe(A.client.id);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/automations/logs/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('filters by ruleId for own rule (returns matching logs)', async () => {
    const ruleA1 = await seedRule(A.client.id, 'A1');
    const ruleA2 = await seedRule(A.client.id, 'A2');
    await seedLog({ clientId: A.client.id, ruleId: ruleA1, triggerEvent: 'booking.created' });
    await seedLog({ clientId: A.client.id, ruleId: ruleA2, triggerEvent: 'booking.cancelled' });

    await asTenant(A);
    const route = await import('@/app/api/portal/automations/logs/route');
    const res = await callHandler<{ success: boolean; logs: Array<{ ruleId: number; triggerEvent: string }> }>(
      route as unknown as Record<string, unknown>, 'GET',
      { query: { ruleId: ruleA1 } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.logs.length).toBe(1);
    expect(res.data?.logs[0].ruleId).toBe(ruleA1);
    expect(res.data?.logs[0].triggerEvent).toBe('booking.created');
  });

  it('LEAK CLASS: cross-tenant ruleId returns empty list (does not leak B\'s logs)', async () => {
    // Seed a log under B for B's rule.
    const ruleB = await seedRule(B.client.id, 'B');
    await seedLog({ clientId: B.client.id, ruleId: ruleB });

    // A queries with B's ruleId — must return [] because the route ANDs
    // ruleId with clientId. If a future refactor drops the clientId filter
    // when ruleId is supplied, this test will catch the leak.
    await asTenant(A);
    const route = await import('@/app/api/portal/automations/logs/route');
    const res = await callHandler<{ success: boolean; logs: unknown[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { query: { ruleId: ruleB } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.logs).toEqual([]);
  });

  it('orders logs by createdAt DESC', async () => {
    const ruleA = await seedRule(A.client.id, 'A');
    const sql = getTestSql();
    // Insert two logs at controlled timestamps so DESC order is deterministic.
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.automation_logs
        (client_id, rule_id, trigger_event, trigger_payload, status, created_at)
      VALUES
        (${A.client.id}, ${ruleA}, 'booking.created', ${'{}'}::jsonb, 'success', '2024-01-01T00:00:00Z'),
        (${A.client.id}, ${ruleA}, 'booking.cancelled', ${'{}'}::jsonb, 'failed', '2024-06-01T00:00:00Z')
    `;

    await asTenant(A);
    const route = await import('@/app/api/portal/automations/logs/route');
    const res = await callHandler<{ logs: Array<{ triggerEvent: string }> }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.logs[0].triggerEvent).toBe('booking.cancelled'); // newer first
    expect(res.data?.logs[1].triggerEvent).toBe('booking.created');
  });
});
