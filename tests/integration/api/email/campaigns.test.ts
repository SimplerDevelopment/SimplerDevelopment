/**
 * Email campaigns — list, create, read, update, delete + send.
 *
 * Contract covered:
 *   - 401 unauth on every verb
 *   - 404 cross-tenant on GET/PATCH/DELETE/[id], and 404 when listId belongs to another tenant on POST
 *   - 400 on missing required fields (POST), and on PATCH-after-sent
 *   - 200/201 happy path with envelope { success, data }
 *   - tenant-scoped GET only sees own campaigns
 *   - emitEvent wiring on POST does not break the response (fire-and-forget)
 *
 * The /send/[id] route is tested in ./campaign-send.test.ts (separated because
 * it adds Resend MSW assertions that would otherwise inflate this file).
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

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function enableEmailService(ctx: TenantCtx): Promise<void> {
  const sql = getTestSql();
  const slug = `email-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle)
    VALUES ('Email Marketing', ${slug}, 'email', 0, 'monthly') RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${ctx.client.id}, ${svc.id}, 'active')
  `;
}

async function seedList(ctx: TenantCtx, name = 'List'): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_lists (client_id, name)
    VALUES (${ctx.client.id}, ${`${name}-${Date.now()}`})
    RETURNING id
  `;
  return row;
}

async function seedCampaign(
  ctx: TenantCtx,
  listId: number,
  overrides: { status?: string; name?: string } = {},
): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_campaigns
      (client_id, list_id, name, subject, from_name, from_email, html_content, status)
    VALUES (
      ${ctx.client.id}, ${listId},
      ${overrides.name ?? `Campaign-${Date.now()}`},
      'Subject', 'From', 'from@test.local', '<p>hi</p>',
      ${overrides.status ?? 'draft'}
    ) RETURNING id
  `;
  return row;
}

// ── /api/portal/email/campaigns ───────────────────────────────────────────

describe('GET /api/portal/email/campaigns @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/campaigns/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('403 when client lacks email service subscription', async () => {
    const A = await sessionForNewClientUser('email-cmp-no-svc');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/campaigns/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(403);
  });

  it('returns campaigns scoped to the caller', async () => {
    const A = await sessionForNewClientUser('email-cmp-scope-a');
    const B = await sessionForNewClientUser('email-cmp-scope-b');
    await enableEmailService(A);
    await enableEmailService(B);

    const listA = await seedList(A);
    const listB = await seedList(B);
    await seedCampaign(A, listA.id, { name: 'A1' });
    await seedCampaign(A, listA.id, { name: 'A2' });
    await seedCampaign(B, listB.id, { name: 'B1' });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/campaigns/route');
    const res = await callHandler<{ success: boolean; data: { name: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    const names = (res.data?.data ?? []).map(c => c.name).sort();
    expect(names).toEqual(['A1', 'A2']);
  });
});

describe('POST /api/portal/email/campaigns @email', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('email-cmp-create');
    await enableEmailService(A);
    mockedAuth.mockResolvedValue(A.session);
  });

  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/campaigns/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', { body: {} });
    expect(res.status).toBe(401);
  });

  it('400 when required fields are missing', async () => {
    const route = await import('@/app/api/portal/email/campaigns/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { name: 'Just a name' },
    });
    expect(res.status).toBe(400);
    expect(res.data).toMatchObject({ success: false });
  });

  it('404 when listId belongs to another tenant', async () => {
    const B = await sessionForNewClientUser('email-cmp-foreign-list');
    await enableEmailService(B);
    const foreign = await seedList(B);

    const route = await import('@/app/api/portal/email/campaigns/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: {
        name: 'X', subject: 'S', fromName: 'F', fromEmail: 'f@t.test',
        listId: foreign.id, htmlContent: '<p>hi</p>',
      },
    });
    expect(res.status).toBe(404);
  });

  it('happy path: 201 with row inserted under caller\'s clientId', async () => {
    const list = await seedList(A);
    const route = await import('@/app/api/portal/email/campaigns/route');
    const res = await callHandler<{ success: boolean; data: { id: number; clientId: number; status: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        body: {
          name: 'Welcome Series', subject: 'Hello', fromName: 'Acme', fromEmail: 'hi@acme.test',
          listId: list.id, htmlContent: '<h1>hi</h1>',
        },
      },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.clientId).toBe(A.client.id);
    expect(res.data?.data.status).toBe('draft');
  });

  it('renders blockContent.blocks to htmlContent when only blockContent is provided', async () => {
    const list = await seedList(A);
    const route = await import('@/app/api/portal/email/campaigns/route');
    const res = await callHandler<{ success: boolean; data: { htmlContent: string; blockContent: unknown } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        body: {
          name: 'Block-driven', subject: 'BS', fromName: 'F', fromEmail: 'f@t.test',
          listId: list.id,
          blockContent: { blocks: [
            { id: 'h1', type: 'heading', order: 0, content: 'Big heading', level: 1 },
            { id: 't1', type: 'text', order: 1, content: 'Body text' },
          ] },
        },
      },
    );
    expect(res.status).toBe(201);
    // The renderer outputs <h1>...</h1> and a <p>...</p> chunk.
    expect(res.data?.data.htmlContent).toContain('Big heading');
    expect(res.data?.data.htmlContent).toContain('Body text');
    expect(res.data?.data.blockContent).toBeTruthy();
  });
});

// ── /api/portal/email/campaigns/[id] ──────────────────────────────────────

describe('GET /api/portal/email/campaigns/[id] @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/campaigns/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET', {
      params: { id: '1' },
    });
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant', async () => {
    const A = await sessionForNewClientUser('email-cmp-get-a');
    const B = await sessionForNewClientUser('email-cmp-get-b');
    await enableEmailService(A);
    await enableEmailService(B);
    const listB = await seedList(B);
    const cmpB = await seedCampaign(B, listB.id);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/campaigns/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET', {
      params: { id: String(cmpB.id) },
    });
    expect(res.status).toBe(404);
  });

  it('200 returns { campaign, sends } envelope for owner', async () => {
    const A = await sessionForNewClientUser('email-cmp-get-ok');
    await enableEmailService(A);
    const list = await seedList(A);
    const cmp = await seedCampaign(A, list.id);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/campaigns/[id]/route');
    const res = await callHandler<{ success: boolean; data: { campaign: { id: number }; sends: unknown[] } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(cmp.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.campaign.id).toBe(cmp.id);
    expect(Array.isArray(res.data?.data.sends)).toBe(true);
  });
});

describe('PATCH /api/portal/email/campaigns/[id] @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/campaigns/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'PATCH', {
      params: { id: '1' },
      body: { subject: 'New' },
    });
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant', async () => {
    const A = await sessionForNewClientUser('email-cmp-patch-a');
    const B = await sessionForNewClientUser('email-cmp-patch-b');
    await enableEmailService(A);
    await enableEmailService(B);
    const listB = await seedList(B);
    const cmpB = await seedCampaign(B, listB.id);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/campaigns/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'PATCH', {
      params: { id: String(cmpB.id) },
      body: { subject: 'Hijacked' },
    });
    expect(res.status).toBe(404);
  });

  it('400 when campaign already sent', async () => {
    const A = await sessionForNewClientUser('email-cmp-patch-sent');
    await enableEmailService(A);
    const list = await seedList(A);
    const cmp = await seedCampaign(A, list.id, { status: 'sent' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/campaigns/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'PATCH', {
      params: { id: String(cmp.id) },
      body: { subject: 'Late' },
    });
    expect(res.status).toBe(400);
  });

  it('200 updates a draft campaign', async () => {
    const A = await sessionForNewClientUser('email-cmp-patch-ok');
    await enableEmailService(A);
    const list = await seedList(A);
    const cmp = await seedCampaign(A, list.id);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/campaigns/[id]/route');
    const res = await callHandler<{ success: boolean; data: { subject: string } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(cmp.id) }, body: { subject: 'New subject' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.subject).toBe('New subject');
  });
});

describe('DELETE /api/portal/email/campaigns/[id] @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/campaigns/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: '1' },
    });
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant', async () => {
    const A = await sessionForNewClientUser('email-cmp-del-a');
    const B = await sessionForNewClientUser('email-cmp-del-b');
    await enableEmailService(A);
    await enableEmailService(B);
    const listB = await seedList(B);
    const cmpB = await seedCampaign(B, listB.id);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/campaigns/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: String(cmpB.id) },
    });
    expect(res.status).toBe(404);

    // Cross-tenant attempt must NOT delete the row.
    const sql = getTestSql();
    const [still] = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.email_campaigns WHERE id = ${cmpB.id}
    `;
    expect(still?.id).toBe(cmpB.id);
  });

  it('400 when campaign is currently sending', async () => {
    const A = await sessionForNewClientUser('email-cmp-del-sending');
    await enableEmailService(A);
    const list = await seedList(A);
    const cmp = await seedCampaign(A, list.id, { status: 'sending' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/campaigns/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: String(cmp.id) },
    });
    expect(res.status).toBe(400);
  });

  it('200 deletes a draft campaign and the row is gone', async () => {
    const A = await sessionForNewClientUser('email-cmp-del-ok');
    await enableEmailService(A);
    const list = await seedList(A);
    const cmp = await seedCampaign(A, list.id);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/campaigns/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: String(cmp.id) },
    });
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.email_campaigns WHERE id = ${cmp.id}
    `;
    expect(rows).toHaveLength(0);
  });
});
