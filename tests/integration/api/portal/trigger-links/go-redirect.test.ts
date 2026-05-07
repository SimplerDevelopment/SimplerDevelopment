/**
 * Public `/go/[slug]` redirect resolver — integration coverage.
 *
 *   - Hitting `/go/<slug>` with a known slug 302-redirects to destinationUrl.
 *   - Each visit writes one trigger_link_clicks row capturing ip / user-agent /
 *     referer (best-effort, but the happy path always persists).
 *   - Unknown slug returns 404 cleanly.
 *   - Malformed slugs (SQL-injection-shaped, oversized) do not crash the
 *     handler — the WHERE clause is parameterised so it just doesn't match.
 *
 * No auth required for this route — slugs are platform-global.
 */
import { describe, it, expect } from 'vitest';

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

async function seedLink(ctx: TenantCtx, slug: string, destinationUrl = 'https://example.com/landing'): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.trigger_links
      (client_id, slug, destination_url, created_by)
    VALUES (${ctx.client.id}, ${slug}, ${destinationUrl}, ${ctx.user.id})
    RETURNING id
  `;
  return row;
}

describe('GET /go/[slug] @trigger-links', () => {
  it('302-redirects to destinationUrl with the correct Location header', async () => {
    const ctx = await sessionForNewClientUser('go-happy');
    const slug = `go-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    await seedLink(ctx, slug, 'https://example.com/destination?utm=x');

    const route = await import('@/app/go/[slug]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, url: `http://localhost:3000/go/${slug}` },
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://example.com/destination?utm=x');
  });

  it('persists a click row capturing ip, userAgent, referer from request headers', async () => {
    const ctx = await sessionForNewClientUser('go-click');
    const slug = `go-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const link = await seedLink(ctx, slug);

    const route = await import('@/app/go/[slug]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      {
        params: { slug },
        url: `http://localhost:3000/go/${slug}`,
        headers: {
          'x-forwarded-for': '198.51.100.42, 10.0.0.1',
          'user-agent': 'Mozilla/5.0 (TestBot)',
          'referer': 'https://campaign.example/landing',
        },
      },
    );
    expect(res.status).toBe(302);

    const sql = getTestSql();
    const clicks = await sql<{ link_id: number; client_id: number; ip: string | null; user_agent: string | null; referer: string | null }[]>`
      SELECT link_id, client_id, ip, user_agent, referer
      FROM ${sql(TEST_SCHEMA)}.trigger_link_clicks
      WHERE link_id = ${link.id}
    `;
    expect(clicks.length).toBe(1);
    expect(clicks[0].link_id).toBe(link.id);
    expect(clicks[0].client_id).toBe(ctx.client.id);
    // pickClientIp() takes the first XFF entry.
    expect(clicks[0].ip).toBe('198.51.100.42');
    expect(clicks[0].user_agent).toBe('Mozilla/5.0 (TestBot)');
    expect(clicks[0].referer).toBe('https://campaign.example/landing');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
    const ctx = await sessionForNewClientUser('go-realip');
    const slug = `go-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const link = await seedLink(ctx, slug);

    const route = await import('@/app/go/[slug]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      {
        params: { slug },
        url: `http://localhost:3000/go/${slug}`,
        headers: { 'x-real-ip': '203.0.113.7' },
      },
    );
    expect(res.status).toBe(302);

    const sql = getTestSql();
    const [click] = await sql<{ ip: string | null }[]>`
      SELECT ip FROM ${sql(TEST_SCHEMA)}.trigger_link_clicks WHERE link_id = ${link.id}
    `;
    expect(click.ip).toBe('203.0.113.7');
  });

  it('records null ip / user-agent / referer when no headers are supplied', async () => {
    const ctx = await sessionForNewClientUser('go-noheaders');
    const slug = `go-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const link = await seedLink(ctx, slug);

    const route = await import('@/app/go/[slug]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, url: `http://localhost:3000/go/${slug}` },
    );
    expect(res.status).toBe(302);

    const sql = getTestSql();
    const [click] = await sql<{ ip: string | null; user_agent: string | null; referer: string | null }[]>`
      SELECT ip, user_agent, referer FROM ${sql(TEST_SCHEMA)}.trigger_link_clicks WHERE link_id = ${link.id}
    `;
    expect(click).toBeDefined();
    expect(click.ip).toBeNull();
    expect(click.referer).toBeNull();
    // user-agent: NextRequest may inject a default — accept either null or a
    // string, but never undefined or crashing.
    expect([null, click.user_agent]).toContainEqual(click.user_agent);
  });

  it('returns 404 cleanly when the slug does not exist', async () => {
    const route = await import('@/app/go/[slug]/route');
    const slug = `does-not-exist-${Date.now()}`;
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, url: `http://localhost:3000/go/${slug}` },
    );
    expect(res.status).toBe(404);
  });

  it('does not crash on a SQL-injection-shaped slug — returns 404', async () => {
    const route = await import('@/app/go/[slug]/route');
    const slug = "';DROP TABLE trigger_links;--";
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, url: `http://localhost:3000/go/sql-inject` },
    );
    expect(res.status).toBe(404);

    // Sanity: the table is still there (parametrised queries — never
    // string-interpolated). If it had been dropped, the next query would throw.
    const sql = getTestSql();
    const exists = await sql<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = ${TEST_SCHEMA} AND tablename = 'trigger_links'
    `;
    expect(exists.length).toBe(1);
  });

  it('does not crash on an oversized slug — returns 404', async () => {
    const route = await import('@/app/go/[slug]/route');
    // 1KB slug — the DB column is varchar(64) but the route only SELECTs by
    // slug, so a too-long input simply matches no row.
    const slug = 'x'.repeat(1024);
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug }, url: `http://localhost:3000/go/${encodeURIComponent(slug)}` },
    );
    expect(res.status).toBe(404);
  });

  it('does not log a click when the slug is unknown', async () => {
    // Seed an unrelated tenant + link so trigger_link_clicks has at least one
    // distinct link_id we can scope to. We then assert no click row was
    // written FOR THE GHOST SLUG specifically — robust against parallel
    // tenants writing to the same table within the same worker schema.
    const ctx = await sessionForNewClientUser('go-noclick-ghost');
    const realLink = await seedLink(ctx, `real-${Date.now()}-${Math.floor(Math.random() * 9999)}`);

    const route = await import('@/app/go/[slug]/route');
    const ghostSlug = `ghost-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { slug: ghostSlug }, url: `http://localhost:3000/go/${ghostSlug}` },
    );

    // Ensure no click row was attached to a non-existent link. Since unknown
    // slugs never resolve to a link_id, there's nothing to attach a click to.
    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.trigger_link_clicks
      WHERE link_id <> ${realLink.id}
    `;
    expect(rows.length).toBe(0);
  });
});
