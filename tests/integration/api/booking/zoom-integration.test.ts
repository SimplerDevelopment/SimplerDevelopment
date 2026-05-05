/**
 * Zoom integration —
 *   /api/portal/tools/booking/zoom/auth      (GET, redirects to Zoom OAuth)
 *   /api/portal/tools/booking/zoom/callback  (GET, exchanges code -> stores tokens)
 *   /api/portal/tools/booking/zoom/disconnect(POST, revokes tokens + redirects)
 *
 * Coverage:
 *   - Auth gates (401 / redirect=zoom=error)
 *   - OAuth happy-path inserts a zoom_tokens row, second callback updates
 *   - Disconnect removes the zoom_tokens row
 *   - Cross-tenant safety: two tenants can each persist independent tokens
 *
 * Zoom HTTP is mocked via the existing MSW zoomHandlers (api-mocks.ts).
 * The OAuth-revoke endpoint is added per-test with server.use().
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { http, HttpResponse } from 'msw';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({
    host: 'localhost:3000',
    'x-forwarded-proto': 'http',
  })),
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    has: () => false,
  })),
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';
import { server } from '../../../setup-api';

beforeEach(() => {
  process.env.ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID || 'zm_id_test';
  process.env.ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET || 'zm_secret_test';
});

afterEach(() => {
  server.resetHandlers();
});

describe('GET /api/portal/tools/booking/zoom/auth @booking @zoom', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/tools/booking/zoom/auth/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('redirects (302/307) to zoom.us/oauth/authorize when authed', async () => {
    const A = await sessionForNewClientUser('zoom-auth');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/zoom/auth/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect([302, 303, 307, 308]).toContain(res.status);
    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('zoom.us/oauth/authorize');
    expect(loc).toContain('client_id=');
    expect(loc).toContain('response_type=code');
  });
});

describe('GET /api/portal/tools/booking/zoom/callback @booking @zoom', () => {
  it('redirects with zoom=error when no session', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/tools/booking/zoom/callback/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/?code=anything' },
    );
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toContain('zoom=error');
  });

  it('redirects zoom=error when code is missing', async () => {
    const A = await sessionForNewClientUser('zoom-cb-no-code');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/zoom/callback/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/' },
    );
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toContain('zoom=error');
  });

  it('happy path inserts a zoom_tokens row and redirects with zoom=connected', async () => {
    const A = await sessionForNewClientUser('zoom-cb-ok');
    mockedAuth.mockResolvedValue(A.session);

    // The default zoomHandlers in api-mocks.ts already returns a token; rely on it.
    const route = await import('@/app/api/portal/tools/booking/zoom/callback/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/?code=valid-code' },
    );
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toContain('zoom=connected');

    const sql = getTestSql();
    const rows = await sql<{ access_token: string; client_id: number }[]>`
      SELECT access_token, client_id FROM ${sql(TEST_SCHEMA)}.zoom_tokens
      WHERE client_id = ${A.client.id}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].access_token).toBe('zoom.mock');
  });

  it('second callback for the same client updates (upsert) — no duplicate row', async () => {
    const A = await sessionForNewClientUser('zoom-cb-upsert');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/zoom/callback/route');

    await callHandler(route as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/?code=first-code' });

    server.use(
      http.post('https://zoom.us/oauth/token', () =>
        HttpResponse.json({ access_token: 'zoom.refreshed', refresh_token: 'rt2', expires_in: 3600 }),
      ),
    );

    await callHandler(route as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/?code=second-code' });

    const sql = getTestSql();
    const rows = await sql<{ access_token: string }[]>`
      SELECT access_token FROM ${sql(TEST_SCHEMA)}.zoom_tokens
      WHERE client_id = ${A.client.id}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].access_token).toBe('zoom.refreshed');
  });

  it('redirects zoom=error when Zoom token-exchange fails', async () => {
    const A = await sessionForNewClientUser('zoom-cb-fail');
    mockedAuth.mockResolvedValue(A.session);

    server.use(
      http.post('https://zoom.us/oauth/token', () =>
        HttpResponse.json({ error: 'invalid_grant' }, { status: 400 }),
      ),
    );

    const route = await import('@/app/api/portal/tools/booking/zoom/callback/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/?code=bad-code' },
    );
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toContain('zoom=error');

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.zoom_tokens WHERE client_id = ${A.client.id}
    `;
    expect(rows.length).toBe(0);
  });
});

describe('POST /api/portal/tools/booking/zoom/disconnect @booking @zoom', () => {
  it('401 unauth', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/tools/booking/zoom/disconnect/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST');
    expect(res.status).toBe(401);
  });

  it('removes zoom_tokens for the caller and redirects to zoom=disconnected', async () => {
    const A = await sessionForNewClientUser('zoom-dc');
    mockedAuth.mockResolvedValue(A.session);

    // First connect
    const cb = await import('@/app/api/portal/tools/booking/zoom/callback/route');
    await callHandler(cb as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/?code=valid-code' });

    // Add a revoke handler so MSW doesn't error on the best-effort revoke call
    server.use(
      http.post('https://zoom.us/oauth/revoke', () => HttpResponse.json({})),
    );

    const route = await import('@/app/api/portal/tools/booking/zoom/disconnect/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST');
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toContain('zoom=disconnected');

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.zoom_tokens WHERE client_id = ${A.client.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('cross-tenant: tenant B disconnect does not touch tenant A tokens', async () => {
    const A = await sessionForNewClientUser('zoom-iso-a');
    const B = await sessionForNewClientUser('zoom-iso-b');

    const cb = await import('@/app/api/portal/tools/booking/zoom/callback/route');

    mockedAuth.mockResolvedValue(A.session);
    await callHandler(cb as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/?code=A-code' });

    mockedAuth.mockResolvedValue(B.session);
    await callHandler(cb as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/?code=B-code' });

    server.use(
      http.post('https://zoom.us/oauth/revoke', () => HttpResponse.json({})),
    );

    // B disconnects — only B's tokens should be removed
    const dc = await import('@/app/api/portal/tools/booking/zoom/disconnect/route');
    await callHandler(dc as unknown as Record<string, unknown>, 'POST');

    const sql = getTestSql();
    const aRows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.zoom_tokens WHERE client_id = ${A.client.id}
    `;
    const bRows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.zoom_tokens WHERE client_id = ${B.client.id}
    `;
    expect(aRows.length).toBe(1);  // unaffected
    expect(bRows.length).toBe(0);  // removed
  });
});
