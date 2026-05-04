/**
 * Email analytics — GET /api/portal/email/analytics
 *
 * The route aggregates campaign + subscriber stats. The interesting safety
 * property is tenant scoping: tenant A querying analytics MUST NOT see
 * tenant B's open / click / bounce counts in the rolled-up totals or
 * recentCampaigns list.
 *
 * Contract:
 *   - 401 unauth
 *   - 403 without `email` service subscription
 *   - 200 with envelope { overview, subscribers, recentCampaigns }
 *   - tenant-isolation: A's overview totals only reflect A's campaigns,
 *     and the recentCampaigns list contains zero rows from B
 */
import { describe, it, expect, vi, type Mock } from 'vitest';

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

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function enableEmail(ctx: TenantCtx) {
  const sql = getTestSql();
  const slug = `email-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle)
    VALUES ('Email', ${slug}, 'email', 0, 'monthly') RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${ctx.client.id}, ${svc.id}, 'active')
  `;
}

interface SeedCmpOpts {
  totalSent?: number;
  totalOpened?: number;
  totalClicked?: number;
  totalBounced?: number;
  totalUnsubscribed?: number;
  name?: string;
}

async function seedSentCampaign(ctx: TenantCtx, listId: number, o: SeedCmpOpts = {}) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_campaigns
      (client_id, list_id, name, subject, from_name, from_email, html_content, status, sent_at,
       total_sent, total_opened, total_clicked, total_bounced, total_unsubscribed)
    VALUES (
      ${ctx.client.id}, ${listId},
      ${o.name ?? `cmp-${Date.now()}-${Math.floor(Math.random() * 1e9)}`},
      'S', 'F', 'f@t.test', '<p/>', 'sent', now(),
      ${o.totalSent ?? 0}, ${o.totalOpened ?? 0}, ${o.totalClicked ?? 0},
      ${o.totalBounced ?? 0}, ${o.totalUnsubscribed ?? 0}
    ) RETURNING id
  `;
  return row;
}

async function seedList(ctx: TenantCtx) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_lists (client_id, name)
    VALUES (${ctx.client.id}, ${`list-${Date.now()}-${Math.floor(Math.random() * 1e9)}`})
    RETURNING id
  `;
  return row;
}

describe('GET /api/portal/email/analytics @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/analytics/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('403 without email subscription', async () => {
    const A = await sessionForNewClientUser('email-an-no-svc');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/analytics/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(403);
  });

  it('200 returns overview + subscribers + recentCampaigns shape', async () => {
    const A = await sessionForNewClientUser('email-an-shape');
    await enableEmail(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/analytics/route');
    const res = await callHandler<{
      success: boolean;
      data: {
        overview: { totalCampaigns: number; totalSent: number; openRate: string; clickRate: string };
        subscribers: { total: number; active: number; totalLists: number; listBreakdown: unknown[] };
        recentCampaigns: unknown[];
      };
    }>(route as unknown as Record<string, unknown>, 'GET');

    expect(res.status).toBe(200);
    expect(res.data?.data).toHaveProperty('overview');
    expect(res.data?.data).toHaveProperty('subscribers');
    expect(res.data?.data).toHaveProperty('recentCampaigns');
    expect(typeof res.data?.data.overview.openRate).toBe('string');
    expect(typeof res.data?.data.overview.clickRate).toBe('string');
    expect(Array.isArray(res.data?.data.subscribers.listBreakdown)).toBe(true);
    expect(Array.isArray(res.data?.data.recentCampaigns)).toBe(true);
  });

  it('tenant isolation: A\'s overview totals do NOT include B\'s campaigns', async () => {
    const A = await sessionForNewClientUser('email-an-iso-a');
    const B = await sessionForNewClientUser('email-an-iso-b');
    await enableEmail(A);
    await enableEmail(B);

    // A: 1 sent campaign with 100 opens, 50 clicks
    const listA = await seedList(A);
    await seedSentCampaign(A, listA.id, { totalSent: 200, totalOpened: 100, totalClicked: 50, name: 'A-only' });

    // B: 2 sent campaigns with massive numbers — must NOT bleed into A's view
    const listB = await seedList(B);
    await seedSentCampaign(B, listB.id, { totalSent: 99999, totalOpened: 99999, totalClicked: 99999, name: 'B-1' });
    await seedSentCampaign(B, listB.id, { totalSent: 99999, totalOpened: 99999, totalClicked: 99999, name: 'B-2' });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/analytics/route');
    const res = await callHandler<{
      success: boolean;
      data: {
        overview: { totalCampaigns: number; totalSent: number; totalOpened: number; totalClicked: number };
        recentCampaigns: { id: number; name: string }[];
      };
    }>(route as unknown as Record<string, unknown>, 'GET');

    expect(res.status).toBe(200);
    expect(res.data?.data.overview.totalCampaigns).toBe(1);
    expect(res.data?.data.overview.totalSent).toBe(200);
    expect(res.data?.data.overview.totalOpened).toBe(100);
    expect(res.data?.data.overview.totalClicked).toBe(50);

    // recentCampaigns must contain only A-only.
    const names = res.data?.data.recentCampaigns.map(c => c.name) ?? [];
    expect(names).toEqual(['A-only']);
    expect(names).not.toContain('B-1');
    expect(names).not.toContain('B-2');
  });
});
