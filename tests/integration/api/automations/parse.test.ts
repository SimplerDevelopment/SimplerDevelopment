/**
 * Integration tests for /api/portal/automations/parse — NLP rule parser.
 *
 * The route delegates to `parseAutomationDescription` (which calls Anthropic).
 * We mock the lib export so the test never makes a real Claude call. We also
 * mock `hasCredits` / `deductCredits` so AI-credit accounting is isolated
 * from the route's contract.
 *
 * Coverage:
 *   - 401 unauthenticated
 *   - 400 missing description
 *   - 402 insufficient credits
 *   - 200 happy path: returns parsed rule + tokensUsed, deducts credits
 *   - 500 surface error from the parser without leaking detail
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

vi.mock('@/lib/ai-credits', () => ({
  hasCredits: vi.fn(),
  deductCredits: vi.fn().mockResolvedValue({ success: true, newBalance: 0 }),
}));

vi.mock('@/lib/automation', () => ({
  parseAutomationDescription: vi.fn(),
}));

import { auth } from '@/lib/auth';
import { hasCredits, deductCredits } from '@/lib/ai-credits';
import { parseAutomationDescription } from '@/lib/automation';

const mockedAuth = auth as unknown as Mock;
const mockedHasCredits = hasCredits as unknown as Mock;
const mockedDeduct = deductCredits as unknown as Mock;
const mockedParse = parseAutomationDescription as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

describe('POST /api/portal/automations/parse @automations @ai-mocked', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('parse-a');
    mockedHasCredits.mockReset().mockResolvedValue(true);
    mockedDeduct.mockReset().mockResolvedValue({ success: true, newBalance: 0 });
    mockedParse.mockReset();
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/automations/parse/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { description: 'send email when booking is made' } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects missing description (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/automations/parse/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: {} },
    );
    expect(res.status).toBe(400);
    expect(mockedParse).not.toHaveBeenCalled();
  });

  it('rejects non-string description (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/automations/parse/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { description: 42 } },
    );
    expect(res.status).toBe(400);
    expect(mockedParse).not.toHaveBeenCalled();
  });

  it('returns 402 when client has insufficient AI credits', async () => {
    mockedHasCredits.mockResolvedValueOnce(false);
    await asTenant(A);
    const route = await import('@/app/api/portal/automations/parse/route');
    const res = await callHandler<{ success: boolean; error: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { description: 'send email when booking is made' } },
    );
    expect(res.status).toBe(402);
    expect(res.data?.success).toBe(false);
    expect(res.data?.error).toMatch(/credits/i);
    expect(mockedParse).not.toHaveBeenCalled();
    expect(mockedDeduct).not.toHaveBeenCalled();
  });

  it('happy path: returns parsed rule + tokensUsed, deducts credits', async () => {
    mockedParse.mockResolvedValueOnce({
      parsed: {
        name: 'Welcome guest by email',
        trigger: { event: 'booking.created' },
        conditions: [],
        actions: [{ tool: 'send_email', params: { to: '{{event.guestEmail}}' } }],
        productScope: 'booking',
      },
      inputTokens: 120,
      outputTokens: 80,
    });

    await asTenant(A);
    const route = await import('@/app/api/portal/automations/parse/route');
    const res = await callHandler<{
      success: boolean;
      parsed: { name: string; trigger: { event: string } };
      tokensUsed: number;
    }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { description: 'send a welcome email when a booking is created' } },
    );

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.parsed.name).toBe('Welcome guest by email');
    expect(res.data?.parsed.trigger.event).toBe('booking.created');
    expect(res.data?.tokensUsed).toBe(200);

    // Credits deducted with the right tenant + total tokens.
    expect(mockedDeduct).toHaveBeenCalledTimes(1);
    const [deductClientId, deductTokens, category] = mockedDeduct.mock.calls[0];
    expect(deductClientId).toBe(A.client.id);
    expect(deductTokens).toBe(200);
    expect(category).toBe('automation_parse');
  });

  it('returns 500 when the parser throws (without leaking detail)', async () => {
    // Suppress the route's console.error during this assertion.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedParse.mockRejectedValueOnce(new Error('anthropic 429: rate limited'));

    await asTenant(A);
    const route = await import('@/app/api/portal/automations/parse/route');
    const res = await callHandler<{ success: boolean; error: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { description: 'fail this request' } },
    );

    expect(res.status).toBe(500);
    expect(res.data?.success).toBe(false);
    expect(res.data?.error).not.toMatch(/anthropic/i); // generic message only
    expect(mockedDeduct).not.toHaveBeenCalled();

    errSpy.mockRestore();
  });
});
