/**
 * Integration tests for portal CRM contacts routes + adjacent merge endpoint.
 *
 * Covers:
 *   - POST  /api/portal/crm/contacts                — create
 *   - PUT   /api/portal/crm/contacts/[id]           — update (canonical verb)
 *   - DELETE /api/portal/crm/contacts/[id]          — delete
 *   - GET   /api/portal/crm/contacts/[id]/emails    — list (single endpoint, GET-only)
 *   - POST  /api/portal/crm/contacts/merge          — merge two contacts
 *
 * Each mutation verifies happy path, 401, cross-tenant rejection, 400, and 404.
 *
 * Note: app/api/portal/crm/contacts/[id]/emails/route.ts only exports GET — there is no
 * POST to test. We exercise the GET so the surface still has integration coverage
 * (auth, cross-tenant filtering).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';
import { grantBundle } from '../../../helpers/entitlements';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

async function seedContact(clientId: number, firstName = 'Seed') {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_contacts (client_id, first_name)
    VALUES (${clientId}, ${firstName})
    RETURNING id
  `;
  return row.id;
}

describe('POST /api/portal/crm/contacts @crm @tenancy', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('contacts-post');
    await grantBundle(A.client.id);
  });

  it('happy path: creates contact under caller tenant (201)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contacts/route');
    const res = await callHandler<{ success: boolean; data: { id: number; clientId: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { firstName: 'Alice', email: 'a@example.test' } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.clientId).toBe(A.client.id);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/contacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { firstName: 'X' } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects empty firstName with 400', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { firstName: '' } },
    );
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/portal/crm/contacts/[id] @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let contactB: number;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('contacts-put-a'),
      sessionForNewClientUser('contacts-put-b'),
    ]);
    await grantBundle(A.client.id);
    contactB = await seedContact(B.client.id, 'BobB');
  });

  it('happy path: updates own contact (200)', async () => {
    const myId = await seedContact(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contacts/[id]/route');
    const res = await callHandler<{ success: boolean; data: { firstName: string } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(myId) }, body: { firstName: 'NewName' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.firstName).toBe('NewName');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/contacts/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(contactB) }, body: { firstName: 'X' } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot mutate B\'s contact (404, DB untouched)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contacts/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(contactB) }, body: { firstName: 'Hijack' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ first_name: string }[]>`
      SELECT first_name FROM ${sql(TEST_SCHEMA)}.crm_contacts WHERE id = ${contactB}
    `;
    expect(row.first_name).toBe('BobB');
  });

  it('returns 400 for invalid id', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contacts/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: 'abc' }, body: { firstName: 'X' } },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when contact missing for caller', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contacts/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: '99999' }, body: { firstName: 'X' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/portal/crm/contacts/[id] @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('contacts-del-a'),
      sessionForNewClientUser('contacts-del-b'),
    ]);
    await grantBundle(A.client.id);
  });

  it('happy path: deletes own contact (200)', async () => {
    const id = await seedContact(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contacts/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/contacts/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot delete B\'s contact (404, preserved)', async () => {
    const id = await seedContact(B.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contacts/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.crm_contacts WHERE id = ${id}
    `;
    expect(rows.length).toBe(1);
  });

  it('returns 404 when missing', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contacts/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '987654' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /api/portal/crm/contacts/[id]/emails @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('emails-a'),
      sessionForNewClientUser('emails-b'),
    ]);
    await grantBundle(A.client.id);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/contacts/[id]/emails/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid id', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contacts/[id]/emails/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: 'nan' } },
    );
    expect(res.status).toBe(400);
  });

  it('cross-tenant: A querying B\'s contactId returns zero emails', async () => {
    const sql = getTestSql();
    const contactB = await seedContact(B.client.id, 'BcontactEmail');
    // Seed an email activity under B
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.crm_activities (client_id, contact_id, type, title)
      VALUES (${B.client.id}, ${contactB}, 'email', 'B-only email')
    `;
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contacts/[id]/emails/route');
    const res = await callHandler<{ success: boolean; data: { emails: unknown[]; total: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(contactB) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.emails).toEqual([]);
    expect(res.data?.data.total).toBe(0);
  });
});

describe('POST /api/portal/crm/contacts/merge @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('merge-a'),
      sessionForNewClientUser('merge-b'),
    ]);
    await grantBundle(A.client.id);
  });

  it('happy path: merges two same-tenant contacts (200, secondary deleted)', async () => {
    const primary = await seedContact(A.client.id, 'Primary');
    const secondary = await seedContact(A.client.id, 'Secondary');
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contacts/merge/route');
    const res = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { primaryId: primary, secondaryId: secondary } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.id).toBe(primary);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.crm_contacts WHERE id = ${secondary}
    `;
    expect(rows.length).toBe(0);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/contacts/merge/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { primaryId: 1, secondaryId: 2 } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects missing ids with 400', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contacts/merge/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: {} },
    );
    expect(res.status).toBe(400);
  });

  it('rejects identical primary/secondary with 400', async () => {
    const id = await seedContact(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contacts/merge/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { primaryId: id, secondaryId: id } },
    );
    expect(res.status).toBe(400);
  });

  it('cross-tenant: A cannot merge a B-owned contact (404, secondary preserved)', async () => {
    const primaryA = await seedContact(A.client.id, 'A-Primary');
    const secondaryB = await seedContact(B.client.id, 'B-Secondary');
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contacts/merge/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { primaryId: primaryA, secondaryId: secondaryB } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.crm_contacts WHERE id = ${secondaryB}
    `;
    expect(rows.length).toBe(1);
  });
});
