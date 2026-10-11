/**
 * AI Content Engine — Fase 4: Ads + leads loop (tipos).
 *
 * V1: interfaz de proveedor + intake de leads al CRM. Los proveedores reales
 * (Meta Marketing API, Google Ads API) se implementan detrás de `AdProvider`;
 * el `MockAdProvider` permite e2e sin credenciales.
 */

export type AdProviderName = 'mock' | 'meta' | 'google';

export interface AdCampaignInput {
  name: string;
  headline: string;
  body: string;
  cta: string;
  imagePrompt?: string;
  budgetCents?: number;
  targetUrl?: string;
}

export interface AdCampaignRef {
  provider: AdProviderName;
  externalId: string;
  name: string;
}

export interface AdLeadContact {
  email: string;
  displayName?: string;
  phone?: string;
}

export interface AdLeadPayload {
  provider: AdProviderName;
  campaignRef: string;
  contact: AdLeadContact;
  /** Campos extra del formulario (utm, answers...). */
  custom?: Record<string, unknown>;
}

export interface AdProvider {
  readonly name: AdProviderName;
  createCampaign(input: AdCampaignInput): Promise<AdCampaignRef>;
  /** Normaliza el webhook crudo del proveedor a AdLeadPayload o null si inválido. */
  parseLeadWebhook(raw: unknown): AdLeadPayload | null;
}
