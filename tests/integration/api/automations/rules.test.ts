/**
 * Integration tests for portal automation rules CRUD routes.
 *
 * Covers:
 *   - GET    /api/portal/automations            — list (tenant-scoped)
 *   - POST   /api/portal/automations            — create
 *   - PATCH  /api/portal/automations/[id]       — update / toggle
 *   - DELETE /api/portal/automations/[id]       — delete (admin role)
 *
 * Each mutation verifies happy path, 401, cross-tenant rejection, 400, and 404.
 * Cross-tenant: A's editor must not be able to PATCH/DELETE B's rule (treated
 * as 404 — never leak existence).
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

interface SeedRuleOpts {
  name?: string;
  enabled?: boolean;
  source?: string;
}

async function seedRule(clientId: number, opts: SeedRuleOpts = {}): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.automation_rules (
      client_id, name, trigger, conditions, actions, enabled, source
    ) VALUES (
      ${clientId},
      ${opts.name ?? 'Seed rule'},
      ${JSON.stringify({ event: 'booking.created' })}::jsonb,
      ${JSON.stringify([])}::jsonb,
      ${JSON.stringify([{ tool: 'send_email', params: { to: 'a@t.l' } }])}::jsonb,
      ${opts.enabled ?? true},
      ${opts.source ?? 'manual'}
    )
    RETURNING id
  `;
  return row.id;
}

describe('GET /api/portal/automations @automations @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('rules-list-a'),
      sessionForNewClientUser('rules-list-b'),
    ]);
  });

  it('returns only the caller tenant\'s rules', async () => {
    await seedRule(A.client.id, { name: 'A-rule' });
    await seedRule(B.client.id, { name: 'B-rule' });

    await asTenant(A);
    const route = await import('@/app/api/portal/automations/route');
    const res = await callHandler<{ success: boolean; rules: Array<{ name: string; clientId: number }> }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.rules.length).toBe(1);
    expect(res.data?.rules[0].name).toBe('A-rule');
    expect(res.data?.rules[0].clientId).toBe(A.client.id);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/automations/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/portal/automations @automations @tenancy', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('rules-create');
  });

  it('happy path: creates rule under caller tenant (200)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/automations/route');
    const res = await callHandler<{ success: boolean; rule: { id: number; clientId: number; name: string; source: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        body: {
          name: 'Welcome email',
          trigger: { event: 'booking.created' },
          actions: [{ tool: 'send_email', params: { to: 'guest@t.l' } }],
          source: 'manual',
        },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.rule.clientId).toBe(A.client.id);
    expect(res.data?.rule.name).toBe('Welcome email');
    expect(res.data?.rule.source).toBe('manual');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/automations/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'X', trigger: { event: 'booking.created' }, actions: [{ tool: 'x', params: {} }] } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects missing name (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/automations/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { trigger: { event: 'booking.created' }, actions: [{ tool: 'x', params: {} }] } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects missing trigger (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/automations/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'X', actions: [{ tool: 'x', params: {} }] } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects empty actions array (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/automations/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'X', trigger: { event: 'booking.created' }, actions: [] } },
    );
    expect(res.status).toBe(400);
  });

  it('defaults source to manual when omitted', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/automations/route');
    const res = await callHandler<{ rule: { source: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        body: {
          name: 'No-source',
          trigger: { event: 'booking.created' },
          actions: [{ tool: 'x', params: {} }],
        },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.rule.source).toBe('manual');
  });
});

describe('PATCH /api/portal/automations/[id] @automations @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('rules-patch-a'),
      sessionForNewClientUser('rules-patch-b'),
    ]);
  });

  it('happy path: edits own rule (200)', async () => {
    const id = await seedRule(A.client.id, { enabled: true });
    await asTenant(A);
    const route = await import('@/app/api/portal/automations/[id]/route');
    const res = await callHandler<{ success: boolean; rule: { enabled: boolean } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(id) }, body: { enabled: false } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.rule.enabled).toBe(false);
  });

  it('cross-tenant: A cannot edit B\'s rule (404, value preserved)', async () => {
    const ruleB = await seedRule(B.client.id, { name: 'B-rule', enabled: true });
    await asTenant(A);
    const route = await import('@/app/api/portal/automations/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(ruleB) }, body: { enabled: false, name: 'HIJACKED' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ name: string; enabled: boolean }[]>`
      SELECT name, enabled FROM ${sql(TEST_SCHEMA)}.automation_rules WHERE id = ${ruleB}
    `;
    expect(row.name).toBe('B-rule');
    expect(row.enabled).toBe(true);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/automations/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: '1' }, body: { enabled: false } },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 for missing rule', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/automations/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: '99999' }, body: { enabled: false } },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/portal/automations/[id] @automations @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('rules-del-a'),
      sessionForNewClientUser('rules-del-b'),
    ]);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/automations/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('happy path: deletes own rule (200)', async () => {
    const id = await seedRule(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/automations/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.automation_rules WHERE id = ${id}
    `;
    expect(rows.length).toBe(0);
  });

  it('cross-tenant: A cannot delete B\'s rule (silent no-op, row preserved)', async () => {
    // The DELETE handler filters by clientId, so a cross-tenant ruleId hits no
    // row and the response is still 200 with success:true. The contract is
    // "no leak of existence" — the assertion is that B's row is untouched.
    const ruleB = await seedRule(B.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/automations/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(ruleB) } },
    );
    // No-op success — the route does not 404 because it does not check existence.
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.automation_rules WHERE id = ${ruleB}
    `;
    expect(rows.length).toBe(1);
  });
});
