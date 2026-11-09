import { describe, expect, it } from 'vitest';
import { isValidLeadEmail, normalizeLeadPayload } from '@/lib/ads/lead-intake';
import { MockAdProvider } from '@/lib/ads/providers/mock';

describe('ads lead-intake', () => {
  it('valida emails', () => {
    expect(isValidLeadEmail('lead@acme.com')).toBe(true);
    expect(isValidLeadEmail('LEAD@ACME.COM ')).toBe(true);
    expect(isValidLeadEmail('no-email')).toBe(false);
    expect(isValidLeadEmail('')).toBe(false);
  });

  it('normaliza payload con alias name/campaign', () => {
    const lead = normalizeLeadPayload('meta', {
      campaign: 'promo-enero',
      contact: { email: 'LEAD@ACME.COM', name: 'Ana López' },
    });
    expect(lead).not.toBeNull();
    expect(lead!.contact.email).toBe('lead@acme.com');
    expect(lead!.contact.displayName).toBe('Ana López');
    expect(lead!.campaignRef).toBe('promo-enero');
  });

  it('rechaza sin email', () => {
    expect(normalizeLeadPayload('mock', { contact: { name: 'Sin email' } })).toBeNull();
    expect(normalizeLeadPayload('mock', null)).toBeNull();
  });

  it('mock provider crea campaña y parsea lead', async () => {
    const provider = new MockAdProvider();
    const ref = await provider.createCampaign({ name: 'Promo', headline: 'H', body: 'B', cta: 'CTA' });
    expect(ref.provider).toBe('mock');
    expect(ref.externalId.startsWith('mock_')).toBe(true);
    expect(provider.parseLeadWebhook({ contact: { email: 'a@b.com' } })?.contact.email).toBe('a@b.com');
  });
});
