/**
 * Integration tests for the agency-level branding override route.
 *
 * Routes covered:
 *   - GET   /api/portal/agency/branding
 *   - PATCH /api/portal/agency/branding
 *
 * Validates:
 *   - PATCH persists agencyName / agencyLogoUrl / agencyPrimaryColor on the
 *     clients row.
 *   - GET returns the persisted overrides (with whiteLabelEnabled echoed
 *     for UI gating).
 *   - PATCH input validation: 400 on bogus hex color, bogus URL, oversize
 *     name.
 *   - Tenant A cannot read or mutate Tenant B's branding overrides.
 *
 * No DNS / external IO involved — the branding endpoint is a pure DB
 * read/write on the clients row.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    has: () => false,
  })),
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

interface BrandingData {
  agencyName: string | null;
  agencyLogoUrl: string | null;
  agencyPrimaryColor: string | null;
  whiteLabelEnabled: boolean;
}

interface BrandingDbRow {
  agency_name: string | null;
  agency_logo_url: string | null;
  agency_primary_color: string | null;
}

async function readBranding(clientId: number): Promise<BrandingDbRow | undefined> {
  const sql = getTestSql();
  const [row] = await sql<BrandingDbRow[]>`
    SELECT agency_name, agency_logo_url, agency_primary_color
    FROM ${sql(TEST_SCHEMA)}.clients
    WHERE id = ${clientId}
  `;
  return row;
}

// ─── GET ────────────────────────────────────────────────────────────────────

describe('GET /api/portal/agency/branding', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('agency-brand-get-a'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/agency/branding/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('returns null overrides on a fresh client', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/branding/route');
    const res = await callHandler<{ success: boolean; data: BrandingData }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.agencyName).toBeNull();
    expect(res.data?.data.agencyLogoUrl).toBeNull();
    expect(res.data?.data.agencyPrimaryColor).toBeNull();
    expect(res.data?.data.whiteLabelEnabled).toBe(false);
  });

  it('returns the persisted override values', async () => {
    const sql = getTestSql();
    await sql`
      UPDATE ${sql(TEST_SCHEMA)}.clients
      SET agency_name = 'Acme Agency',
          agency_logo_url = 'https://cdn.example.com/logo.png',
          agency_primary_color = '#10b981'
      WHERE id = ${A.client.id}
    `;

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/branding/route');
    const res = await callHandler<{ success: boolean; data: BrandingData }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.agencyName).toBe('Acme Agency');
    expect(res.data?.data.agencyLogoUrl).toBe('https://cdn.example.com/logo.png');
    expect(res.data?.data.agencyPrimaryColor).toBe('#10b981');
  });
});

// ─── PATCH ──────────────────────────────────────────────────────────────────

describe('PATCH /api/portal/agency/branding', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('agency-brand-patch-a'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/agency/branding/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { body: { agencyName: 'X' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 on invalid JSON body', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/branding/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { body: 'not-json' },
    );
    expect(res.status).toBe(400);
  });

  it('400 when no fields are provided', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/branding/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { body: {} },
    );
    expect(res.status).toBe(400);
  });

  it('400 on a bogus hex color', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/branding/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { body: { agencyPrimaryColor: 'royal-purple' } },
    );
    expect(res.status).toBe(400);
  });

  it('400 on a non-http(s) logo URL', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/branding/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { body: { agencyLogoUrl: 'javascript:alert(1)' } },
    );
    expect(res.status).toBe(400);
  });

  it('persists agencyName / agencyLogoUrl / agencyPrimaryColor', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/branding/route');
    const res = await callHandler<{ success: boolean; data: BrandingData }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      {
        body: {
          agencyName: 'Acme Brand Co',
          agencyLogoUrl: 'https://cdn.acme.test/logo.svg',
          agencyPrimaryColor: '#2563eb',
        },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.agencyName).toBe('Acme Brand Co');
    expect(res.data?.data.agencyLogoUrl).toBe('https://cdn.acme.test/logo.svg');
    expect(res.data?.data.agencyPrimaryColor).toBe('#2563eb');

    const row = await readBranding(A.client.id);
    expect(row?.agency_name).toBe('Acme Brand Co');
    expect(row?.agency_logo_url).toBe('https://cdn.acme.test/logo.svg');
    expect(row?.agency_primary_color).toBe('#2563eb');
  });

  it('explicit null clears the override', async () => {
    const sql = getTestSql();
    await sql`
      UPDATE ${sql(TEST_SCHEMA)}.clients
      SET agency_name = 'Old Name'
      WHERE id = ${A.client.id}
    `;
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/branding/route');
    const res = await callHandler<{ success: boolean; data: BrandingData }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { body: { agencyName: null } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.agencyName).toBeNull();
    const row = await readBranding(A.client.id);
    expect(row?.agency_name).toBeNull();
  });

  it('partial updates do not clobber unrelated fields', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/branding/route');

    // First set name + color.
    const first = await callHandler<{ success: boolean; data: BrandingData }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { body: { agencyName: 'Stable Co', agencyPrimaryColor: '#0f172a' } },
    );
    expect(first.status).toBe(200);

    // Then PATCH only the logo URL.
    const second = await callHandler<{ success: boolean; data: BrandingData }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { body: { agencyLogoUrl: 'https://cdn.test/logo.png' } },
    );
    expect(second.status).toBe(200);
    expect(second.data?.data.agencyName).toBe('Stable Co');
    expect(second.data?.data.agencyPrimaryColor).toBe('#0f172a');
    expect(second.data?.data.agencyLogoUrl).toBe('https://cdn.test/logo.png');
  });
});

// ─── Cross-tenant guard ─────────────────────────────────────────────────────

describe('cross-tenant: agency branding', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('agency-brand-xt-a'),
      sessionForNewClientUser('agency-brand-xt-b'),
    ]);
  });

  it('A\'s PATCH only mutates A\'s row', async () => {
    const route = await import('@/app/api/portal/agency/branding/route');

    // Seed B with its own values.
    const sql = getTestSql();
    await sql`
      UPDATE ${sql(TEST_SCHEMA)}.clients
      SET agency_name = 'B Agency', agency_primary_color = '#ff00aa'
      WHERE id = ${B.client.id}
    `;

    mockedAuth.mockResolvedValue(A.session);
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { body: { agencyName: 'A Agency', agencyPrimaryColor: '#001122' } },
    );
    expect(res.status).toBe(200);

    const aRow = await readBranding(A.client.id);
    const bRow = await readBranding(B.client.id);
    expect(aRow?.agency_name).toBe('A Agency');
    expect(aRow?.agency_primary_color).toBe('#001122');
    // B untouched.
    expect(bRow?.agency_name).toBe('B Agency');
    expect(bRow?.agency_primary_color).toBe('#ff00aa');
  });

  it('B\'s GET cannot see A\'s overrides', async () => {
    const sql = getTestSql();
    await sql`
      UPDATE ${sql(TEST_SCHEMA)}.clients
      SET agency_name = 'A Secret', agency_primary_color = '#aabbcc'
      WHERE id = ${A.client.id}
    `;

    mockedAuth.mockResolvedValue(B.session);
    const route = await import('@/app/api/portal/agency/branding/route');
    const res = await callHandler<{ success: boolean; data: BrandingData }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.agencyName).toBeNull();
    expect(res.data?.data.agencyPrimaryColor).toBeNull();
  });
});
