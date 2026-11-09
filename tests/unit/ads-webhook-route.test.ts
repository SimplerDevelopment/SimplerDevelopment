import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/ads/lead-intake', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ads/lead-intake')>();
  return {
    ...actual,
    intakeAdLead: vi.fn(async () => ({ contactId: 42, created: true })),
  };
});

import { POST } from '@/app/api/ads/webhook/route';
import { signAdsPayload } from '@/lib/ads/webhook';

const SECRET = 'route-test-secret'; // pragma: allowlist secret (fake HMAC fixture, never a real credential)
const BODY = JSON.stringify({
  clientId: 9,
  provider: 'mock',
  contact: { email: 'lead@acme.test' },
});

function req(body: string, signature: string | null) {
  return new Request('http://x/api/ads/webhook', {
    method: 'POST',
    headers: signature ? { 'x-ads-signature': signature } : {},
    body,
  });
}

describe('POST /api/ads/webhook', () => {
  const saved = process.env.ADS_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.ADS_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.ADS_WEBHOOK_SECRET;
    else process.env.ADS_WEBHOOK_SECRET = saved;
  });

  it('503 when the secret is not configured (fail closed, never unsigned)', async () => {
    delete process.env.ADS_WEBHOOK_SECRET;
    const res = await POST(req(BODY, 'anything'));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('201 on a valid signed lead', async () => {
    const res = await POST(req(BODY, signAdsPayload(BODY, SECRET)));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({ success: true, data: { contactId: 42, created: true } });
  });

  it('403 on a bad signature', async () => {
    const res = await POST(req(BODY, 'deadbeef'));
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
  });

  it('400 on signed-but-invalid payload', async () => {
    const bad = JSON.stringify({ nope: true });
    const res = await POST(req(bad, signAdsPayload(bad, SECRET)));
    expect(res.status).toBe(400);
  });
});
