/**
 * Trigger links — portal CRUD integration coverage.
 *
 *   GET    /api/portal/trigger-links         — list (with click counts via correlated subquery)
 *   POST   /api/portal/trigger-links         — create (auto base32 slug if not provided)
 *   GET    /api/portal/trigger-links/[id]    — single + recent clicks
 *   PATCH  /api/portal/trigger-links/[id]    — update label / destinationUrl
 *   DELETE /api/portal/trigger-links/[id]    — delete (cascades click rows)
 *
 * Tenancy contract: a different tenant cannot read, edit, or delete another
 * tenant's row. To avoid leaking existence we always expect 404 (not 403)
 * when crossing tenants — the per-id route filters by `(id, clientId)` and
 * returns "not found" when the WHERE clause doesn't match a row.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, twoTenants, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

interface SeedLinkOpts {
  slug?: string;
  destinationUrl?: string;
  label?: string;
  contactFieldKey?: string;
}

async function seedLink(ctx: TenantCtx, opts: SeedLinkOpts = {}): Promise<{ id: number; slug: string }> {
  const sql = getTestSql();
  const slug = opts.slug ?? `seed-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
  const [row] = await sql<{ id: number; slug: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.trigger_links
      (client_id, slug, destination_url, label, contact_field_key, created_by)
    VALUES (
      ${ctx.client.id},
      ${slug},
      ${opts.destinationUrl ?? 'https://example.com/seed'},
      ${opts.label ?? null},
      ${opts.contactFieldKey ?? null},
      ${ctx.user.id}
    )
    RETURNING id, slug
  `;
  return row;
}

async function seedClick(linkId: number, clientId: number): Promise<void> {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.trigger_link_clicks
      (link_id, client_id, ip, user_agent, referer)
    VALUES (${linkId}, ${clientId}, '203.0.113.1', 'seed-ua', 'https://seed.example/')
  `;
}

describe('POST /api/portal/trigger-links @trigger-links @tenancy', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('triglinks-create');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/trigger-links/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { destinationUrl: 'https://example.com/x' } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects missing destinationUrl (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { label: 'no url' } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects non-http(s) destinationUrl (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { destinationUrl: 'javascript:alert(1)' } },
    );
    expect(res.status).toBe(400);
  });

  it('happy path: creates link with auto-generated base32 slug + clientId from active client', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/route');
    const res = await callHandler<{ success: boolean; data: { link: { id: number; slug: string; clientId: number; destinationUrl: string; label: string | null; createdBy: number } } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        body: {
          destinationUrl: 'https://example.com/landing',
          label: 'Newsletter CTA',
        },
      },
    );

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    const link = res.data?.data?.link;
    expect(link).toBeDefined();
    expect(link!.clientId).toBe(A.client.id);
    expect(link!.destinationUrl).toBe('https://example.com/landing');
    expect(link!.label).toBe('Newsletter CTA');
    expect(link!.createdBy).toBe(A.user.id);
    // Auto-generated slug: 8-char Crockford base32 (no i/l/o/u).
    expect(link!.slug).toMatch(/^[0-9abcdefghjkmnpqrstvwxyz]{8}$/);
  });

  it('accepts a relative path destination starting with /', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/route');
    const res = await callHandler<{ data: { link: { destinationUrl: string } } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { destinationUrl: '/portal/dashboard' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data?.link?.destinationUrl).toBe('/portal/dashboard');
  });

  it('respects an explicit valid slug', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/route');
    const res = await callHandler<{ data: { link: { slug: string } } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { destinationUrl: 'https://example.com/x', slug: 'my-custom-slug' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data?.link?.slug).toBe('my-custom-slug');
  });

  it('rejects an invalid slug format (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { destinationUrl: 'https://example.com/x', slug: 'A' /* too short, uppercase */ } },
    );
    expect(res.status).toBe(400);
  });

  it('returns 409 when an explicit slug collides', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/route');
    const taken = `taken-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const ok = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { destinationUrl: 'https://example.com/a', slug: taken } },
    );
    expect(ok.status).toBe(200);

    const dup = await callHandler<{ success: boolean; error?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { destinationUrl: 'https://example.com/b', slug: taken } },
    );
    expect(dup.status).toBe(409);
    expect(dup.data?.success).toBe(false);
  });
});

describe('GET /api/portal/trigger-links @trigger-links @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    ({ A, B } = await twoTenants());
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/trigger-links/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('lists only the caller tenant\'s links with click counts via correlated subquery', async () => {
    const aLink = await seedLink(A, { label: 'A-link' });
    await seedLink(B, { label: 'B-link' });
    await seedClick(aLink.id, A.client.id);
    await seedClick(aLink.id, A.client.id);
    await seedClick(aLink.id, A.client.id);

    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/route');
    const res = await callHandler<{ success: boolean; data: { links: Array<{ id: number; slug: string; label: string | null; clickCount: number }> } }>(
      route as unknown as Record<string, unknown>, 'GET',
    );

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    const links = res.data?.data?.links ?? [];
    expect(links.length).toBe(1);
    expect(links[0].id).toBe(aLink.id);
    expect(links[0].label).toBe('A-link');
    // Correlated subquery returns int, not bigint string.
    expect(links[0].clickCount).toBe(3);
  });

  it('returns clickCount=0 for links with no recorded clicks', async () => {
    const aLink = await seedLink(A, { label: 'No-clicks' });
    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/route');
    const res = await callHandler<{ data: { links: Array<{ id: number; clickCount: number }> } }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    const link = res.data?.data?.links?.find(l => l.id === aLink.id);
    expect(link).toBeDefined();
    expect(link!.clickCount).toBe(0);
  });
});

describe('GET /api/portal/trigger-links/[id] @trigger-links @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    ({ A, B } = await twoTenants());
  });

  it('returns the link + clickCount + recent clicks for the owning tenant', async () => {
    const link = await seedLink(A, { label: 'Detail' });
    await seedClick(link.id, A.client.id);
    await seedClick(link.id, A.client.id);

    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/[id]/route');
    const res = await callHandler<{ data: { link: { id: number; clientId: number }; clickCount: number; recentClicks: Array<{ ip: string | null }> } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(link.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data?.link?.id).toBe(link.id);
    expect(res.data?.data?.link?.clientId).toBe(A.client.id);
    expect(res.data?.data?.clickCount).toBe(2);
    expect(res.data?.data?.recentClicks?.length).toBe(2);
  });

  it('cross-tenant: A cannot GET B\'s link (404, not 403, to avoid leaking existence)', async () => {
    const linkB = await seedLink(B);
    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(linkB.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-numeric id', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: 'not-a-number' } },
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/portal/trigger-links/[id] @trigger-links @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    ({ A, B } = await twoTenants());
  });

  it('updates label + destinationUrl on own link', async () => {
    const link = await seedLink(A, { label: 'Old', destinationUrl: 'https://old.example/' });
    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/[id]/route');
    const res = await callHandler<{ data: { link: { label: string | null; destinationUrl: string } } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        params: { id: String(link.id) },
        body: { label: 'New label', destinationUrl: 'https://new.example/path' },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data?.link?.label).toBe('New label');
    expect(res.data?.data?.link?.destinationUrl).toBe('https://new.example/path');

    // Verify persisted.
    const sql = getTestSql();
    const [row] = await sql<{ label: string | null; destination_url: string }[]>`
      SELECT label, destination_url FROM ${sql(TEST_SCHEMA)}.trigger_links WHERE id = ${link.id}
    `;
    expect(row.label).toBe('New label');
    expect(row.destination_url).toBe('https://new.example/path');
  });

  it('cross-tenant: A cannot PATCH B\'s link (404, value preserved)', async () => {
    const linkB = await seedLink(B, { label: 'B-original', destinationUrl: 'https://b.example/' });
    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        params: { id: String(linkB.id) },
        body: { label: 'HIJACKED', destinationUrl: 'https://attacker.example/' },
      },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ label: string | null; destination_url: string }[]>`
      SELECT label, destination_url FROM ${sql(TEST_SCHEMA)}.trigger_links WHERE id = ${linkB.id}
    `;
    expect(row.label).toBe('B-original');
    expect(row.destination_url).toBe('https://b.example/');
  });

  it('rejects empty destinationUrl (400)', async () => {
    const link = await seedLink(A);
    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(link.id) }, body: { destinationUrl: '' } },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent id', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: '99999999' }, body: { label: 'new' } },
    );
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/trigger-links/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: '1' }, body: { label: 'x' } },
    );
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/portal/trigger-links/[id] @trigger-links @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    ({ A, B } = await twoTenants());
  });

  it('deletes own link AND cascades click rows', async () => {
    const link = await seedLink(A);
    await seedClick(link.id, A.client.id);
    await seedClick(link.id, A.client.id);

    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/[id]/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(link.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const links = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.trigger_links WHERE id = ${link.id}
    `;
    expect(links.length).toBe(0);

    // FK cascade — clicks for the deleted link must be gone too.
    const clicks = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.trigger_link_clicks WHERE link_id = ${link.id}
    `;
    expect(clicks.length).toBe(0);
  });

  it('cross-tenant: A cannot DELETE B\'s link (404, row preserved)', async () => {
    const linkB = await seedLink(B);
    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(linkB.id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.trigger_links WHERE id = ${linkB.id}
    `;
    expect(rows.length).toBe(1);
  });

  it('returns 404 for a non-existent id', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/trigger-links/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '99999999' } },
    );
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/trigger-links/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });
});
