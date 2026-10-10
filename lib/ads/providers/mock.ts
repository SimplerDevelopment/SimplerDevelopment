/**
 * MockAdProvider — e2e sin credenciales + contrato ejecutable para Meta/Google.
 */

import type { AdCampaignInput, AdCampaignRef, AdLeadPayload, AdProvider } from '../types';
import { normalizeLeadPayload } from '../lead-intake';

export class MockAdProvider implements AdProvider {
  readonly name = 'mock' as const;

  async createCampaign(input: AdCampaignInput): Promise<AdCampaignRef> {
    const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'campaign';
    return { provider: 'mock', externalId: `mock_${slug}_${Date.now()}`, name: input.name };
  }

  parseLeadWebhook(raw: unknown): AdLeadPayload | null {
    return normalizeLeadPayload('mock', raw);
  }
}
