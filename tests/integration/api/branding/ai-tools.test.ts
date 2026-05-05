/**
 * Integration tests for AI-bound branding routes:
 *   - POST /api/portal/branding/audit              (no LLM — deterministic rule-based)
 *   - POST /api/portal/branding/generate-messaging (Anthropic — JSON response)
 *   - POST /api/portal/branding/generate-theme     (Anthropic — JSON response)
 *   - POST /api/portal/branding/generate-block-copy (Anthropic — JSON response)
 *   - POST /api/portal/branding/rewrite-field      (Anthropic — plain text response)
 *
 * Anthropic mocking strategy:
 *   The global MSW handler (tests/helpers/api-mocks.ts) returns a generic
 *   `[{type:'text', text:'mock response'}]` for api.anthropic.com — fine for
 *   the rewrite-field route (plain text) but breaks JSON-parsing routes.
 *
 *   We therefore override the handler per-test with `server.use(...)` to:
 *     1) capture the outbound payload (body + system prompt + model)
 *     2) return canned JSON the route can JSON.parse, OR plain text for
 *        rewrite-field
 *
 *   `server.resetHandlers()` runs in beforeEach (setup-api.ts) AND in the
 *   afterEach below, so per-test overrides never leak across tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { http, HttpResponse } from 'msw';

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

import { server } from '../../../setup-api';
import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

async function seedProfile(clientId: number, overrides: { name?: string; primaryColor?: string } = {}): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.branding_profiles (client_id, name, primary_color)
    VALUES (
      ${clientId},
      ${overrides.name ?? `Profile-${Date.now()}-${Math.floor(Math.random() * 9999)}`},
      ${overrides.primaryColor ?? '#2563eb'}
    )
    RETURNING id
  `;
  return row.id;
}

interface CapturedAnthropic {
  body: { model?: string; system?: string; messages?: Array<{ role: string; content: string }>; max_tokens?: number };
  url: string;
}

/**
 * Replace the global Anthropic handler so we can:
 *   - capture outbound payload (system prompt, user message, model)
 *   - return a canned response that the route handler can parse
 */
function mockAnthropicJson(canned: unknown): { captured: CapturedAnthropic[] } {
  const captured: CapturedAnthropic[] = [];
  server.use(
    http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
      const body = (await request.json()) as CapturedAnthropic['body'];
      captured.push({ body, url: request.url });
      return HttpResponse.json({
        id: 'msg_mock',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: JSON.stringify(canned) }],
        model: 'claude-test-mock',
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    }),
  );
  return { captured };
}

function mockAnthropicText(text: string): { captured: CapturedAnthropic[] } {
  const captured: CapturedAnthropic[] = [];
  server.use(
    http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
      const body = (await request.json()) as CapturedAnthropic['body'];
      captured.push({ body, url: request.url });
      return HttpResponse.json({
        id: 'msg_mock',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text }],
        model: 'claude-test-mock',
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    }),
  );
  return { captured };
}

afterEach(() => {
  server.resetHandlers();
});

// ─── /audit (rule-based, no LLM) ───────────────────────────────────────────
describe('POST /api/portal/branding/audit @branding @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('brand-audit-a'),
      sessionForNewClientUser('brand-audit-b'),
    ]);
  });

  it('happy path: returns deterministic audit report for own profile (200)', async () => {
    const profileId = await seedProfile(A.client.id, { name: 'Auditable' });
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/audit/route');
    const res = await callHandler<{ success: boolean; report: { issues: unknown[]; counts: Record<string, number>; worst: string | null } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { profileId } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.report).toBeTruthy();
    // Audit report contract — issues[] + counts + worst (see lib/branding/audit.ts).
    expect(Array.isArray(res.data?.report.issues)).toBe(true);
    expect(typeof res.data?.report.counts).toBe('object');
    expect(res.data?.report).toHaveProperty('worst');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/branding/audit/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', { body: { profileId: 1 } });
    expect(res.status).toBe(401);
  });

  it('400 when profileId is missing', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/audit/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', { body: {} });
    expect(res.status).toBe(400);
  });

  it('400 when profileId is non-numeric', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/audit/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { profileId: 'not-a-number' },
    });
    expect(res.status).toBe(400);
  });

  it('cross-tenant: A cannot audit B\'s profile (404)', async () => {
    const bProfile = await seedProfile(B.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/audit/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { profileId: bProfile },
    });
    expect(res.status).toBe(404);
  });

  it('404 when profile id is unknown', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/audit/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { profileId: 99999999 },
    });
    expect(res.status).toBe(404);
  });
});

// ─── /generate-messaging (LLM JSON) ────────────────────────────────────────
describe('POST /api/portal/branding/generate-messaging @branding @ai', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('brand-genmsg-a');
  });

  it('happy path: returns parsed JSON from Anthropic response (200)', async () => {
    const canned = {
      companyName: 'Mock Co',
      tagline: 'We ship fast.',
      missionStatement: 'A short mission.',
      keyDifferentiators: ['speed', 'quality'],
    };
    const { captured } = mockAnthropicJson(canned);

    await asTenant(A);
    const route = await import('@/app/api/portal/branding/generate-messaging/route');
    const res = await callHandler<{ success: boolean; data: typeof canned }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { description: 'B2B SaaS for plumbers' } },
    );

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.companyName).toBe('Mock Co');
    expect(res.data?.data.keyDifferentiators).toEqual(['speed', 'quality']);

    // Captured payload — system prompt + user description forwarded.
    expect(captured.length).toBe(1);
    expect(captured[0].body.system).toMatch(/brand strategist|copywriter/i);
    expect(JSON.stringify(captured[0].body.messages)).toContain('B2B SaaS for plumbers');
  });

  it('strips leading ```json fences from model output', async () => {
    // The route does its own fence-stripping; assert it still parses.
    const captured: CapturedAnthropic[] = [];
    server.use(
      http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
        captured.push({ body: (await request.json()) as CapturedAnthropic['body'], url: request.url });
        return HttpResponse.json({
          id: 'msg_mock',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: '```json\n{"companyName":"X"}\n```' }],
          model: 'claude-test-mock',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        });
      }),
    );

    await asTenant(A);
    const route = await import('@/app/api/portal/branding/generate-messaging/route');
    const res = await callHandler<{ success: boolean; data: { companyName: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { description: 'desc' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.companyName).toBe('X');
  });

  it('400 when description is missing', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/generate-messaging/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', { body: {} });
    expect(res.status).toBe(400);
  });

  it('400 when description is whitespace-only', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/generate-messaging/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { description: '   ' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/branding/generate-messaging/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { description: 'B2B SaaS' },
    });
    expect(res.status).toBe(401);
  });
});

// ─── /generate-theme ───────────────────────────────────────────────────────
describe('POST /api/portal/branding/generate-theme @branding @ai', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('brand-gentheme-a');
  });

  it('happy path: returns parsed visual identity JSON (200)', async () => {
    const canned = {
      primaryColor: '#0ea5e9',
      secondaryColor: '#0369a1',
      accentColor: '#facc15',
      headingFont: 'Inter',
      bodyFont: 'Roboto',
      borderRadius: '8px',
    };
    const { captured } = mockAnthropicJson(canned);

    await asTenant(A);
    const route = await import('@/app/api/portal/branding/generate-theme/route');
    const res = await callHandler<{ success: boolean; data: typeof canned }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { description: 'modern fintech brand' } },
    );

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.primaryColor).toBe('#0ea5e9');
    expect(res.data?.data.headingFont).toBe('Inter');

    expect(captured.length).toBe(1);
    expect(captured[0].body.system).toMatch(/brand designer/i);
    expect(JSON.stringify(captured[0].body.messages)).toContain('modern fintech brand');
  });

  it('400 when description is missing', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/generate-theme/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', { body: {} });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/branding/generate-theme/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { description: 'fintech' },
    });
    expect(res.status).toBe(401);
  });
});

// ─── /generate-block-copy ──────────────────────────────────────────────────
describe('POST /api/portal/branding/generate-block-copy @branding @ai', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('brand-blockcopy-a');
  });

  it('happy path: returns block copy JSON (200)', async () => {
    const canned = { headline: 'Mock headline', subhead: 'Mock subhead', ctaText: 'Click me' };
    const { captured } = mockAnthropicJson(canned);

    await asTenant(A);
    const route = await import('@/app/api/portal/branding/generate-block-copy/route');
    const res = await callHandler<{ success: boolean; data: typeof canned }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { blockType: 'hero', context: 'Pricing page hero' } },
    );

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.headline).toBe('Mock headline');
    // Forwarded blockType + context
    expect(captured.length).toBe(1);
    expect(JSON.stringify(captured[0].body.messages)).toContain('hero');
  });

  it('502 when model returns non-JSON', async () => {
    mockAnthropicText('not valid json at all');
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/generate-block-copy/route');
    const res = await callHandler<{ success: boolean; message: string; raw: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { blockType: 'hero' } },
    );
    expect(res.status).toBe(502);
    expect(res.data?.success).toBe(false);
    expect(res.data?.raw).toContain('not valid json');
  });

  it('400 when blockType is missing', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/generate-block-copy/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', { body: {} });
    expect(res.status).toBe(400);
  });

  it('400 when blockType is non-string', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/generate-block-copy/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { blockType: 123 },
    });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/branding/generate-block-copy/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { blockType: 'hero' },
    });
    expect(res.status).toBe(401);
  });
});

// ─── /rewrite-field (plain text) ───────────────────────────────────────────
describe('POST /api/portal/branding/rewrite-field @branding @ai', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('brand-rewrite-a');
  });

  it('happy path: returns rewritten plain text (200)', async () => {
    const { captured } = mockAnthropicText('We make plumbers love their CRM.');

    await asTenant(A);
    const route = await import('@/app/api/portal/branding/rewrite-field/route');
    const res = await callHandler<{ success: boolean; data: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        body: {
          fieldName: 'tagline',
          fieldLabel: 'Tagline',
          currentValue: 'We sell software',
          prompt: 'Make it punchier',
          companyContext: 'B2B SaaS',
        },
      },
    );

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data).toBe('We make plumbers love their CRM.');

    // Captured payload includes both currentValue + prompt + companyContext.
    expect(captured.length).toBe(1);
    const userMsg = JSON.stringify(captured[0].body.messages);
    expect(userMsg).toContain('Tagline');
    expect(userMsg).toContain('We sell software');
    expect(userMsg).toContain('Make it punchier');
    expect(userMsg).toContain('B2B SaaS');
  });

  it('400 when fieldName is missing', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/rewrite-field/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { prompt: 'do it' },
    });
    expect(res.status).toBe(400);
  });

  it('400 when prompt is missing', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/rewrite-field/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { fieldName: 'tagline' },
    });
    expect(res.status).toBe(400);
  });

  it('400 when prompt is whitespace-only', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/rewrite-field/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { fieldName: 'tagline', prompt: '   ' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/branding/rewrite-field/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { fieldName: 'tagline', prompt: 'do it' },
    });
    expect(res.status).toBe(401);
  });
});
