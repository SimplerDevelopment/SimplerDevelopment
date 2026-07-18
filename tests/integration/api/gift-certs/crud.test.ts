/**
 * Gift Certificates CRUD — /api/portal/tools/gift-certificates
 *   (no DELETE on this resource — there's GET/POST on the collection
 *    and GET/PUT on the [id]; no PATCH)
 *
 * Contract covered:
 *   - Service gate: 403 when client has no `booking` subscription;
 *     200 once a clientServices row is active.
 *   - 401 unauthenticated on every endpoint.
 *   - POST issue: 400 missing amount, 400 amount<100 (cents),
 *     201 + remainingAmount = initialAmount, status='active', code matches /^CERT-/.
 *   - GET list: only returns rows for the caller's client (cross-tenant scoping).
 *   - GET [id]: 404 when the cert lives in another tenant; returns redemption[]
 *     for the owning tenant.
 *   - PUT [id]: 404 cross-tenant (and target row is not mutated);
 *     200 own with editable fields updated.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function enableBookingService(ctx: TenantCtx): Promise<void> {
  const sql = getTestSql();
  const slug = `booking-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle)
    VALUES ('Booking', ${slug}, 'booking', 0, 'monthly') RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${ctx.client.id}, ${svc.id}, 'active')
  `;
}

async function seedCert(ctx: TenantCtx, opts: {
  amount?: number; remaining?: number; status?: string; code?: string;
} = {}): Promise<{ id: number; code: string }> {
  const sql = getTestSql();
  const code = opts.code ?? `CERT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 999)}`;
  const amount = opts.amount ?? 5000;
  const [row] = await sql<{ id: number; code: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.gift_certificates (
      client_id, code, initial_amount, remaining_amount, status,
      purchaser_name, purchaser_email, payment_status, redeemable_at
    ) VALUES (
      ${ctx.client.id}, ${code}, ${amount},
      ${opts.remaining ?? amount},
      ${opts.status ?? 'active'},
      'Test Purchaser', 'p@test.local',
      'paid', 'both'
    ) RETURNING id, code
  `;
  return row;
}

describe('Gift certs — service gate @gift-certs', () => {
  it('GET 403 when client has no booking subscription', async () => {
    const A = await sessionForNewClientUser('gc-nogate');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/gift-certificates/route');
    const res = await callHandler<{ success: boolean; requiresService: string; upsellUrl: string }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(403);
    expect(res.data?.success).toBe(false);
    expect(res.data?.requiresService).toBe('booking');
    expect(res.data?.upsellUrl).toBe('/portal/services');
  });

  it('GET 200 once booking service is active', async () => {
    const A = await sessionForNewClientUser('gc-gate-ok');
    await enableBookingService(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/gift-certificates/route');
    const res = await callHandler<{ success: boolean; data: unknown[] }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(Array.isArray(res.data?.data)).toBe(true);
  });

  it('POST 403 without booking subscription', async () => {
    const A = await sessionForNewClientUser('gc-post-nogate');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/gift-certificates/route');
    const res = await callHandler<{ success: boolean; requiresService: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { amount: 5000 } },
    );
    expect(res.status).toBe(403);
    expect(res.data?.requiresService).toBe('booking');
  });
});

describe('Gift certs — auth @gift-certs', () => {
  beforeEach(() => { mockedAuth.mockResolvedValue(null); });

  it('GET unauth 401', async () => {
    const route = await import('@/app/api/portal/tools/gift-certificates/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('POST unauth 401', async () => {
    const route = await import('@/app/api/portal/tools/gift-certificates/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', { body: { amount: 5000 } });
    expect(res.status).toBe(401);
  });

  it('GET [id] unauth 401', async () => {
    const route = await import('@/app/api/portal/tools/gift-certificates/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET', { params: { id: '1' } });
    expect(res.status).toBe(401);
  });

  it('PUT [id] unauth 401', async () => {
    const route = await import('@/app/api/portal/tools/gift-certificates/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'PUT', { params: { id: '1' }, body: { status: 'void' } });
    expect(res.status).toBe(401);
  });
});

describe('Gift certs — POST issue @gift-certs', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('gc-issue');
    await enableBookingService(A);
    mockedAuth.mockResolvedValue(A.session);
  });

  it('400 when amount is missing', async () => {
    const route = await import('@/app/api/portal/tools/gift-certificates/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { purchaserEmail: 'p@test.local' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/minimum/i);
  });

  it('400 when amount is below 100 cents', async () => {
    const route = await import('@/app/api/portal/tools/gift-certificates/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { amount: 50 } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/minimum/i);
  });

  it('201 issues a CERT-prefixed code, status=active, remaining=initial', async () => {
    const route = await import('@/app/api/portal/tools/gift-certificates/route');
    const res = await callHandler<{ success: boolean; data: {
      id: number; code: string; status: string; initialAmount: number; remainingAmount: number;
      purchaserName: string; recipientName: string | null;
    }}>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: {
        amount: 7500,
        purchaserName: 'Alice',
        recipientName: 'Bob',
        recipientEmail: 'bob@test.local',
        personalMessage: 'Cheers',
        redeemableAt: 'both',
      }},
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.code).toMatch(/^CERT-/);
    expect(res.data?.data.status).toBe('active');
    expect(res.data?.data.initialAmount).toBe(7500);
    expect(res.data?.data.remainingAmount).toBe(7500);
    expect(res.data?.data.recipientName).toBe('Bob');
  });
});

describe('Gift certs — list / get cross-tenant @gift-certs @tenancy', () => {
  it('GET list only returns rows for the caller\'s client', async () => {
    const A = await sessionForNewClientUser('gc-list-a');
    const B = await sessionForNewClientUser('gc-list-b');
    await enableBookingService(A);
    await enableBookingService(B);
    const certA = await seedCert(A);
    const certB = await seedCert(B);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/gift-certificates/route');
    const res = await callHandler<{ success: boolean; data: { id: number; code: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    const codes = res.data?.data.map(r => r.code) ?? [];
    expect(codes).toContain(certA.code);
    expect(codes).not.toContain(certB.code);
  });

  it('GET [id] returns 404 when cert is in another tenant', async () => {
    const A = await sessionForNewClientUser('gc-get-a');
    const B = await sessionForNewClientUser('gc-get-b');
    await enableBookingService(A);
    await enableBookingService(B);
    const cert = await seedCert(B);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/gift-certificates/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(cert.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('GET [id] returns the cert + empty redemptions[] for owner', async () => {
    const A = await sessionForNewClientUser('gc-get-own');
    await enableBookingService(A);
    const cert = await seedCert(A, { amount: 3000 });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/gift-certificates/[id]/route');
    const res = await callHandler<{ success: boolean; data: { id: number; redemptions: unknown[] } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(cert.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.id).toBe(cert.id);
    expect(Array.isArray(res.data?.data.redemptions)).toBe(true);
    expect(res.data?.data.redemptions.length).toBe(0);
  });
});

describe('Gift certs — PUT update @gift-certs @tenancy', () => {
  it('PUT 404 cross-tenant + does NOT mutate', async () => {
    const A = await sessionForNewClientUser('gc-put-a');
    const B = await sessionForNewClientUser('gc-put-b');
    await enableBookingService(A);
    await enableBookingService(B);
    const cert = await seedCert(B, { amount: 9999 });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/gift-certificates/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(cert.id) }, body: { status: 'cancelled', recipientName: 'Owned' } },
    );
    expect(res.status).toBe(404);

    // Verify the row was not mutated
    const sql = getTestSql();
    const [row] = await sql<{ status: string; recipient_name: string | null }[]>`
      SELECT status, recipient_name FROM ${sql(TEST_SCHEMA)}.gift_certificates WHERE id = ${cert.id}
    `;
    expect(row.status).toBe('active');
    expect(row.recipient_name).toBeNull();
  });

  it('PUT 200 updates editable fields (status, recipientName, message, redeemableAt)', async () => {
    const A = await sessionForNewClientUser('gc-put-own');
    await enableBookingService(A);
    const cert = await seedCert(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/gift-certificates/[id]/route');
    const res = await callHandler<{ success: boolean; data: {
      status: string; recipientName: string; personalMessage: string; redeemableAt: string;
    }}>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(cert.id) }, body: {
        status: 'cancelled',
        recipientName: 'Updated',
        personalMessage: 'Updated msg',
        redeemableAt: 'booking',
      }},
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.status).toBe('cancelled');
    expect(res.data?.data.recipientName).toBe('Updated');
    expect(res.data?.data.personalMessage).toBe('Updated msg');
    expect(res.data?.data.redeemableAt).toBe('booking');
  });
});
