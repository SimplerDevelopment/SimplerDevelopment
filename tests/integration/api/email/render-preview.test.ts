/**
 * Email render preview — POST /api/portal/email/render-preview
 *
 * Pure rendering surface: server-side block JSON → wrapped HTML preview.
 * No DB writes, no Resend calls. The interesting bits to assert:
 *   - 401 unauth
 *   - 403 without `email` service subscription
 *   - 400 when blockContent.blocks is missing
 *   - 200 returns a string `data.html` that:
 *       * is a complete `<!DOCTYPE html>` document (buildCampaignHtml wrapper)
 *       * inlines the previewText hidden div when provided
 *       * contains the rendered output of each block (heading text, button URL, etc.)
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

describe('POST /api/portal/email/render-preview @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/render-preview/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { blockContent: { blocks: [] } },
    });
    expect(res.status).toBe(401);
  });

  it('403 without email subscription', async () => {
    const A = await sessionForNewClientUser('email-rp-no-svc');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/render-preview/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { blockContent: { blocks: [] } },
    });
    expect(res.status).toBe(403);
  });

  it('400 when blockContent.blocks is missing', async () => {
    const A = await sessionForNewClientUser('email-rp-bad');
    await enableEmail(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/render-preview/route');
    const noBlocks = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { blockContent: {} },
    });
    expect(noBlocks.status).toBe(400);

    const noBlockContent = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: {},
    });
    expect(noBlockContent.status).toBe(400);
  });

  it('200 wraps output in a full HTML document and renders heading + text + button blocks', async () => {
    const A = await sessionForNewClientUser('email-rp-shape');
    await enableEmail(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/render-preview/route');
    const res = await callHandler<{ success: boolean; data: { html: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        body: {
          blockContent: {
            previewText: 'Quick preview text',
            blocks: [
              { id: 'h', type: 'heading', order: 0, content: 'Hello World', level: 1 },
              { id: 't', type: 'text', order: 1, content: 'A short body.' },
              { id: 'b', type: 'button', order: 2, text: 'Click me', url: 'https://example.test/cta' },
            ],
          },
        },
      },
    );

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    const html = res.data?.data.html ?? '';

    // Document wrapper from buildCampaignHtml.
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');

    // Preview text injected as hidden mso-hide div.
    expect(html).toContain('Quick preview text');
    expect(html).toContain('mso-hide');

    // Heading renders as <h1> with the supplied content.
    expect(html).toMatch(/<h1[^>]*>[\s\S]*Hello World[\s\S]*<\/h1>/);

    // Text renders as <p> with the body string.
    expect(html).toContain('A short body.');

    // Button renders the link with the href.
    expect(html).toContain('https://example.test/cta');
    expect(html).toContain('Click me');

    // Footer unsubscribe link is a placeholder '#' (per the route's call to buildCampaignHtml).
    expect(html).toContain('Unsubscribe');
  });

  it('200 with empty blocks array still returns a wrapped document', async () => {
    const A = await sessionForNewClientUser('email-rp-empty');
    await enableEmail(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/render-preview/route');
    const res = await callHandler<{ success: boolean; data: { html: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { blockContent: { blocks: [] } } },
    );
    expect(res.status).toBe(200);
    const html = res.data?.data.html ?? '';
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Unsubscribe');
  });
});
