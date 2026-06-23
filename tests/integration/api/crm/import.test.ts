/**
 * Integration tests for portal CRM CSV import route.
 *
 * Note: the recon plan referenced `contacts/imports/route.ts` — the actual
 * exposed route is `/api/portal/crm/import` (POST), which accepts a multipart
 * form-data payload with `file`, `entityType`, optional `mapping`, and
 * `skipDuplicates`. This file covers happy path + auth + bad-input.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

function buildImportRequest(opts: {
  csv?: string;
  entityType?: string;
  mapping?: Record<string, string>;
}): NextRequest {
  const form = new FormData();
  if (opts.csv !== undefined) {
    form.append('file', new Blob([opts.csv], { type: 'text/csv' }), 'test.csv');
  }
  if (opts.entityType !== undefined) form.append('entityType', opts.entityType);
  if (opts.mapping !== undefined) form.append('mapping', JSON.stringify(opts.mapping));
  return new NextRequest('http://localhost:3000/', { method: 'POST', body: form });
}

async function invoke(req: NextRequest) {
  const route = await import('@/app/api/portal/crm/import/route');
  const res = await (route.POST as (req: Request) => Promise<Response>)(req);
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? await res.json() : null;
  return { status: res.status, data };
}

describe('POST /api/portal/crm/import @crm @tenancy', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('imp-a');
  });

  it('happy path: imports contacts under caller tenant', async () => {
    await asTenant(A);
    const csv = 'firstName,lastName,email\nAda,Lovelace,ada@example.test\nGrace,Hopper,grace@example.test\n';
    const res = await invoke(buildImportRequest({ csv, entityType: 'contact' }));
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.imported).toBe(2);

    const sql = getTestSql();
    const rows = await sql<{ first_name: string; client_id: number }[]>`
      SELECT first_name, client_id FROM ${sql(TEST_SCHEMA)}.crm_contacts
      WHERE client_id = ${A.client.id}
      ORDER BY first_name
    `;
    expect(rows.length).toBe(2);
    for (const r of rows) expect(r.client_id).toBe(A.client.id);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const csv = 'firstName\nX\n';
    const res = await invoke(buildImportRequest({ csv, entityType: 'contact' }));
    expect(res.status).toBe(401);
  });

  it('rejects missing file (400)', async () => {
    await asTenant(A);
    const res = await invoke(buildImportRequest({ entityType: 'contact' }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid entityType (400)', async () => {
    await asTenant(A);
    const csv = 'foo\n1\n';
    const res = await invoke(buildImportRequest({ csv, entityType: 'banana' }));
    expect(res.status).toBe(400);
  });

  it('rejects CSV with only a header (400)', async () => {
    await asTenant(A);
    const res = await invoke(buildImportRequest({ csv: 'firstName\n', entityType: 'contact' }));
    expect(res.status).toBe(400);
  });

  it('reports row-level errors for missing required fields without aborting', async () => {
    await asTenant(A);
    const csv = 'firstName,email\nAlice,alice@example.test\n,no-name@example.test\n';
    const res = await invoke(buildImportRequest({ csv, entityType: 'contact' }));
    expect(res.status).toBe(200);
    expect(res.data?.data.imported).toBe(1);
    expect(res.data?.data.skipped).toBe(1);
    expect(Array.isArray(res.data?.data.errors)).toBe(true);
    expect(res.data?.data.errors.length).toBe(1);
  });
});
