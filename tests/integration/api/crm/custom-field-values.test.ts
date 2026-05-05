/**
 * Integration tests for portal CRM custom-field values route.
 *
 * The cross-tenant entityId rejection on PUT is the second P0 leak class
 * cited in TESTING_PLAN.md §4 — this file pins it down end-to-end and also
 * covers the GET path (which has the same `entityBelongsToClient` guard).
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

async function seedField(clientId: number, entityType: string, fieldName = 'fav_color', fieldType = 'text') {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_custom_fields (client_id, entity_type, field_name, field_type)
    VALUES (${clientId}, ${entityType}, ${fieldName}, ${fieldType})
    RETURNING id
  `;
  return row.id;
}

async function seedContact(clientId: number, firstName = 'X') {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_contacts (client_id, first_name)
    VALUES (${clientId}, ${firstName})
    RETURNING id
  `;
  return row.id;
}

describe('GET /api/portal/crm/custom-fields/values @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('cfv-get-a'),
      sessionForNewClientUser('cfv-get-b'),
    ]);
  });

  it('happy path: returns own values', async () => {
    const fieldA = await seedField(A.client.id, 'contact');
    const contactA = await seedContact(A.client.id);
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.crm_custom_field_values
        (custom_field_id, entity_id, entity_type, value)
      VALUES (${fieldA}, ${contactA}, 'contact', 'red')
    `;
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/custom-fields/values/route');
    const res = await callHandler<{ success: boolean; data: Array<{ value: string }> }>(
      route as unknown as Record<string, unknown>, 'GET',
      { query: { entityType: 'contact', entityId: contactA } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.length).toBe(1);
    expect(res.data?.data[0].value).toBe('red');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/custom-fields/values/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { query: { entityType: 'contact', entityId: 1 } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects invalid entityType (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/custom-fields/values/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { query: { entityType: 'banana', entityId: 1 } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects missing entityId (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/custom-fields/values/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { query: { entityType: 'contact' } },
    );
    expect(res.status).toBe(400);
  });

  it('cross-tenant: A querying B\'s contactId returns 404 (entity not visible)', async () => {
    const contactB = await seedContact(B.client.id, 'B-Contact');
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/custom-fields/values/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { query: { entityType: 'contact', entityId: contactB } },
    );
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/portal/crm/custom-fields/values @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('cfv-put-a'),
      sessionForNewClientUser('cfv-put-b'),
    ]);
  });

  it('happy path: writes own values for an empty values map (no-op success)', async () => {
    // Empty values map short-circuits before the upsert. Still validates
    // the entity-belongs-to-tenant gate and the auth/envelope contract.
    const contactA = await seedContact(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/custom-fields/values/route');
    const res = await callHandler<{ success: boolean; data: Array<unknown> }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { body: { entityType: 'contact', entityId: contactA, values: {} } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data).toEqual([]);
  });

  it('happy path: upserts non-empty values, then updates on re-post (no duplicate row)', async () => {
    // Exercises the onConflictDoUpdate branch — relies on the
    // (custom_field_id, entity_id, entity_type) UNIQUE index on
    // crm_custom_field_values.
    const fieldA = await seedField(A.client.id, 'contact');
    const contactA = await seedContact(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/custom-fields/values/route');

    // First PUT: insert
    const insertRes = await callHandler<{ success: boolean; data: Array<{ value: string | null }> }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { body: {
          entityType: 'contact',
          entityId: contactA,
          values: { [String(fieldA)]: 'red' },
        } },
    );
    expect(insertRes.status).toBe(200);
    expect(insertRes.data?.success).toBe(true);
    expect(insertRes.data?.data.length).toBe(1);
    expect(insertRes.data?.data[0].value).toBe('red');

    // Second PUT: same key, different value → update
    const updateRes = await callHandler<{ success: boolean; data: Array<{ value: string | null }> }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { body: {
          entityType: 'contact',
          entityId: contactA,
          values: { [String(fieldA)]: 'blue' },
        } },
    );
    expect(updateRes.status).toBe(200);
    expect(updateRes.data?.data.length).toBe(1);
    expect(updateRes.data?.data[0].value).toBe('blue');

    // Verify single row, latest value
    const sql = getTestSql();
    const rows = await sql<{ id: number; value: string | null }[]>`
      SELECT id, value FROM ${sql(TEST_SCHEMA)}.crm_custom_field_values
      WHERE custom_field_id = ${fieldA}
        AND entity_id = ${contactA}
        AND entity_type = 'contact'
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].value).toBe('blue');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/custom-fields/values/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { body: { entityType: 'contact', entityId: 1, values: { '1': 'x' } } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects invalid entityType (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/custom-fields/values/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { body: { entityType: 'foo', entityId: 1, values: {} } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects missing values object (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/custom-fields/values/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { body: { entityType: 'contact', entityId: 1 } },
    );
    expect(res.status).toBe(400);
  });

  // ── P0: cross-tenant entityId ──
  it('P0: A cannot write field values against B\'s contact entityId (404, no row)', async () => {
    const fieldA = await seedField(A.client.id, 'contact');
    const contactB = await seedContact(B.client.id, 'BobB');
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/custom-fields/values/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { body: {
          entityType: 'contact',
          entityId: contactB,
          values: { [String(fieldA)]: 'leaked' },
        } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.crm_custom_field_values
      WHERE entity_id = ${contactB} AND entity_type = 'contact'
    `;
    expect(rows.length).toBe(0);
  });

  it('silently drops field IDs that belong to another tenant (no leak)', async () => {
    const fieldB = await seedField(B.client.id, 'contact');
    const contactA = await seedContact(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/custom-fields/values/route');
    const res = await callHandler<{ success: boolean; data: Array<unknown> }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { body: {
          entityType: 'contact',
          entityId: contactA,
          values: { [String(fieldB)]: 'should-not-store' },
        } },
    );
    // entity belongs to A, but the field belongs to B — route filters
    // unknown field IDs and returns success with an empty results array.
    expect(res.status).toBe(200);
    expect(res.data?.data.length).toBe(0);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.crm_custom_field_values
      WHERE entity_id = ${contactA} AND custom_field_id = ${fieldB}
    `;
    expect(rows.length).toBe(0);
  });
});
