/**
 * Email templates — POST, PATCH, DELETE.
 *
 * Contract:
 *   - 401 unauth
 *   - 403 without `email` service subscription
 *   - 400 missing name or content (POST)
 *   - 404 when patching a template that belongs to another tenant
 *   - 200 happy path on PATCH; htmlContent re-rendered when blockContent provided
 *   - DELETE removes the row; cross-tenant does not affect foreign row
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

async function seedTemplate(ctx: TenantCtx, name = 'tpl') {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_templates (client_id, name, html_content)
    VALUES (${ctx.client.id}, ${`${name}-${Date.now()}`}, '<p>v1</p>')
    RETURNING id
  `;
  return row;
}

describe('POST /api/portal/email/templates @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/templates/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { name: 'X', htmlContent: '<p>x</p>' },
    });
    expect(res.status).toBe(401);
  });

  it('403 without email subscription', async () => {
    const A = await sessionForNewClientUser('email-tpl-no-svc');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/templates/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { name: 'X', htmlContent: '<p>x</p>' },
    });
    expect(res.status).toBe(403);
  });

  it('400 when name or content missing', async () => {
    const A = await sessionForNewClientUser('email-tpl-bad');
    await enableEmail(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/templates/route');
    const noName = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { htmlContent: '<p>x</p>' },
    });
    expect(noName.status).toBe(400);

    const noContent = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { name: 'NoContent' },
    });
    expect(noContent.status).toBe(400);
  });

  it('201 creates from htmlContent', async () => {
    const A = await sessionForNewClientUser('email-tpl-html');
    await enableEmail(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/templates/route');
    const res = await callHandler<{ success: boolean; data: { id: number; clientId: number; htmlContent: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'Welcome', htmlContent: '<h1>welcome</h1>' } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.clientId).toBe(A.client.id);
    expect(res.data?.data.htmlContent).toContain('<h1>welcome</h1>');
  });

  it('201 creates from blockContent (htmlContent rendered server-side)', async () => {
    const A = await sessionForNewClientUser('email-tpl-blocks');
    await enableEmail(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/templates/route');
    const res = await callHandler<{ success: boolean; data: { htmlContent: string; blockContent: unknown } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        body: {
          name: 'Block-driven',
          blockContent: { blocks: [
            { id: 'h', type: 'heading', order: 0, content: 'Block Heading', level: 2 },
          ] },
        },
      },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.htmlContent).toContain('Block Heading');
    expect(res.data?.data.htmlContent).toContain('<h2');
    expect(res.data?.data.blockContent).toBeTruthy();
  });
});

describe('PATCH /api/portal/email/templates/[id] @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/templates/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'PATCH', {
      params: { id: '1' }, body: { name: 'X' },
    });
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant', async () => {
    const A = await sessionForNewClientUser('email-tpl-patch-a');
    const B = await sessionForNewClientUser('email-tpl-patch-b');
    await enableEmail(A);
    await enableEmail(B);
    const tplB = await seedTemplate(B, 'B');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/templates/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'PATCH', {
      params: { id: String(tplB.id) }, body: { name: 'Hijack' },
    });
    expect(res.status).toBe(404);
  });

  it('200 updates name + subject', async () => {
    const A = await sessionForNewClientUser('email-tpl-patch-ok');
    await enableEmail(A);
    const tpl = await seedTemplate(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/templates/[id]/route');
    const res = await callHandler<{ success: boolean; data: { name: string; subject: string } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(tpl.id) }, body: { name: 'After', subject: 'Subj' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('After');
    expect(res.data?.data.subject).toBe('Subj');
  });

  it('200 PATCH with blockContent rerenders htmlContent', async () => {
    const A = await sessionForNewClientUser('email-tpl-patch-blocks');
    await enableEmail(A);
    const tpl = await seedTemplate(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/templates/[id]/route');
    const res = await callHandler<{ success: boolean; data: { htmlContent: string } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        params: { id: String(tpl.id) },
        body: { blockContent: { blocks: [
          { id: 'h', type: 'heading', order: 0, content: 'Patched H', level: 1 },
        ] } },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.htmlContent).toContain('Patched H');
  });
});

describe('DELETE /api/portal/email/templates/[id] @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/templates/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: '1' },
    });
    expect(res.status).toBe(401);
  });

  it('cross-tenant call does NOT remove foreign template', async () => {
    const A = await sessionForNewClientUser('email-tpl-del-a');
    const B = await sessionForNewClientUser('email-tpl-del-b');
    await enableEmail(A);
    await enableEmail(B);
    const tplB = await seedTemplate(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/templates/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: String(tplB.id) },
    });
    expect(res.status).toBe(200); // route always 200s

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.email_templates WHERE id = ${tplB.id}
    `;
    expect(rows).toHaveLength(1);
  });

  it('200 deletes own template', async () => {
    const A = await sessionForNewClientUser('email-tpl-del-ok');
    await enableEmail(A);
    const tpl = await seedTemplate(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/templates/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: String(tpl.id) },
    });
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.email_templates WHERE id = ${tpl.id}
    `;
    expect(rows).toHaveLength(0);
  });
});
