/**
 * Integration tests for GET /api/portal/crm/contracts/[id]/signing-events.
 *
 * Returns the audit-trail rows for a contract, tenant-scoped by clientId.
 *
 * NOTE on order: brief says "chronological" — the route source uses
 * `desc(crmContractSigningEvents.occurredAt)` (newest-first). We assert the
 * route's actual order. If the product calls "chronological=ascending",
 * that requires a route change (out of scope for this test ticket).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

async function seedContract(clientId: number) {
  const sql = getTestSql();
  const token = `tk_${Date.now()}_${Math.floor(Math.random() * 99999)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_contracts (client_id, title, status, client_token)
    VALUES (${clientId}, ${'Audit Trail Contract'}, 'draft', ${token})
    RETURNING id
  `;
  return row.id;
}

async function seedEvent(opts: {
  contractId: number;
  clientId: number;
  kind: string;
  occurredAt: Date;
  actorEmail?: string | null;
}) {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_contract_signing_events
      (contract_id, client_id, kind, actor_email, payload, occurred_at)
    VALUES (${opts.contractId}, ${opts.clientId}, ${opts.kind},
            ${opts.actorEmail ?? null}, ${JSON.stringify({})}::json, ${opts.occurredAt})
  `;
}

describe('GET /api/portal/crm/contracts/[id]/signing-events @esign', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('audit-events');
  });

  it('returns audit events newest-first (route uses desc(occurredAt)), scoped to caller tenant', async () => {
    const id = await seedContract(A.client.id);

    // Three events, distinct timestamps so we can prove order deterministically.
    const t0 = new Date('2026-04-01T10:00:00Z');
    const t1 = new Date('2026-04-02T10:00:00Z');
    const t2 = new Date('2026-04-03T10:00:00Z');

    await seedEvent({ contractId: id, clientId: A.client.id, kind: 'sent', occurredAt: t0 });
    await seedEvent({ contractId: id, clientId: A.client.id, kind: 'opened', occurredAt: t1, actorEmail: 'signer@test.local' });
    await seedEvent({ contractId: id, clientId: A.client.id, kind: 'signed', occurredAt: t2, actorEmail: 'signer@test.local' });

    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contracts/[id]/signing-events/route');
    const res = await callHandler<{
      success: boolean;
      data: Array<{ kind: string; clientId: number; contractId: number; occurredAt: string }>;
    }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(id) } },
    );

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    const events = res.data?.data ?? [];
    expect(events.length).toBe(3);
    // DESC by occurredAt — newest first.
    expect(events.map(e => e.kind)).toEqual(['signed', 'opened', 'sent']);
    // Timestamps strictly decreasing.
    const times = events.map(e => new Date(e.occurredAt).getTime());
    expect(times[0]).toBeGreaterThan(times[1]);
    expect(times[1]).toBeGreaterThan(times[2]);
    // All events are tenant-owned.
    for (const e of events) {
      expect(e.clientId).toBe(A.client.id);
      expect(e.contractId).toBe(id);
    }
  });

  it('returns 200 with empty list when contract has no audit events', async () => {
    const id = await seedContract(A.client.id);
    await asTenant(A);

    const route = await import('@/app/api/portal/crm/contracts/[id]/signing-events/route');
    const res = await callHandler<{ success: boolean; data: unknown[] }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data).toEqual([]);
  });

  it('@tenancy: A cannot read events on B\'s contract — 404, no leak of B\'s rows', async () => {
    const B = await sessionForNewClientUser('audit-events-b');
    const idB = await seedContract(B.client.id);
    await seedEvent({ contractId: idB, clientId: B.client.id, kind: 'sent', occurredAt: new Date() });
    await seedEvent({ contractId: idB, clientId: B.client.id, kind: 'signed', occurredAt: new Date() });

    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contracts/[id]/signing-events/route');
    const res = await callHandler<{ success: boolean; data?: unknown[]; error?: string }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(idB) } },
    );
    expect(res.status).toBe(404);
    expect(res.data?.success).toBe(false);
    // No data leak.
    expect(res.data?.data).toBeUndefined();
  });

  it('rejects 401 when unauthenticated', async () => {
    const id = await seedContract(A.client.id);
    await asTenant(null);

    const route = await import('@/app/api/portal/crm/contracts/[id]/signing-events/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid contract id', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contracts/[id]/signing-events/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: 'not-a-number' } },
    );
    expect(res.status).toBe(400);
  });
});
