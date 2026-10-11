import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ads/lead-intake', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ads/lead-intake')>();
  return {
    ...actual,
    intakeAdLead: vi.fn(async () => ({ contactId: 11, created: true })),
  };
});

import { intakeAdLead } from '@/lib/ads/lead-intake';
import {
  handleAdsWebhook,
  parseAdsWebhookBody,
  signAdsPayload,
  verifyAdsSignature,
} from '@/lib/ads/webhook';

const SECRET = 'test-secret-123';
const BODY = JSON.stringify({
  clientId: 9,
  provider: 'mock',
  campaignRef: 'promo',
  contact: { email: 'LEAD@ACME.COM', name: 'Ana' },
});
const SIG = signAdsPayload(BODY, SECRET);

describe('ads webhook signature', () => {
  it('firma y verifica round-trip', () => {
    expect(verifyAdsSignature(BODY, SIG, SECRET)).toBe(true);
  });

  it('rechaza firma incorrecta, ausente o sin secreto', () => {
    expect(verifyAdsSignature(BODY, 'deadbeef', SECRET)).toBe(false);
    expect(verifyAdsSignature(BODY, null, SECRET)).toBe(false);
    expect(verifyAdsSignature(BODY, SIG, undefined)).toBe(false);
    expect(verifyAdsSignature(BODY + 'x', SIG, SECRET)).toBe(false);
  });
});

describe('parseAdsWebhookBody', () => {
  it('normaliza clientId + lead', () => {
    const parsed = parseAdsWebhookBody(JSON.parse(BODY));
    expect(parsed?.clientId).toBe(9);
    expect(parsed?.lead.contact.email).toBe('lead@acme.com');
  });

  it('rechaza sin clientId o sin email', () => {
    expect(parseAdsWebhookBody({ provider: 'mock', contact: { email: 'a@b.com' } })).toBeNull();
    expect(parseAdsWebhookBody({ clientId: 9, provider: 'mock', contact: {} })).toBeNull();
  });
});

describe('handleAdsWebhook', () => {
  it('pipeline completo verificado delega en intakeAdLead con userId sistema', async () => {
    const result = await handleAdsWebhook({ rawBody: BODY, signature: SIG, secret: SECRET });
    expect(result).toEqual({ contactId: 11, created: true });
    expect(intakeAdLead).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 9, userId: 0 }),
    );
  });

  it('falla cerrado sin secreto o con firma invalida', async () => {
    await expect(handleAdsWebhook({ rawBody: BODY, signature: SIG, secret: undefined })).rejects.toThrow(
      /not configured/,
    );
    await expect(handleAdsWebhook({ rawBody: BODY, signature: 'nope', secret: SECRET })).rejects.toThrow(
      /Invalid webhook signature/,
    );
  });
});
