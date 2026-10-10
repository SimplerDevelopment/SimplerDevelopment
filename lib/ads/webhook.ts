/**
 * Ads inbound webhook — provider-signed lead intake (Content Engine Fase 2).
 *
 * Trust model (mirrors the CRON_SECRET precedent in docs/deploy/railway.md):
 * the tenant is NOT derived from a session — there is none on a provider
 * callback. Instead the caller proves possession of ADS_WEBHOOK_SECRET via
 * `x-ads-signature: hex(HMAC-SHA256(rawBody, secret))`, compared with
 * timingSafeEqual. The signed body carries an explicit `clientId`, which is
 * only trusted because the signature verified. Missing secret → 503 (refuse
 * to run unsigned rather than silently accept everything).
 *
 * Native Meta/Google leadgen verification (app-secret proof, page-scoped
 * subscriptions) is the follow-up once tenant OAuth apps exist; this generic
 * HMAC hook already serves Make/Zapier forwarders and the mock provider.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { normalizeLeadPayload, intakeAdLead, type IntakeAdLeadResult } from './lead-intake';
import type { AdLeadPayload } from './types';

export function signAdsPayload(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

/** Constant-time HMAC check (pure, tested). False when anything is missing. */
export function verifyAdsSignature(
  rawBody: string,
  signature: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !signature) return false;
  const expected = signAdsPayload(rawBody, secret);
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

const webhookBodySchema = z.object({
  clientId: z.number().int().positive(),
  provider: z.enum(['mock', 'meta', 'google']),
  campaignRef: z.string().max(200).optional(),
  campaign: z.string().max(200).optional(),
  contact: z.object({
    email: z.string(),
    displayName: z.string().max(200).optional(),
    name: z.string().max(200).optional(),
    phone: z.string().max(40).optional(),
  }).optional(),
  email: z.string().optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});

export interface VerifiedAdsWebhook {
  clientId: number;
  lead: AdLeadPayload;
}

/** Validate + normalize a verified body (pure, tested). Null when invalid. */
export function parseAdsWebhookBody(json: unknown): VerifiedAdsWebhook | null {
  const parsed = webhookBodySchema.safeParse(json);
  if (!parsed.success) return null;
  const lead = normalizeLeadPayload(parsed.data.provider, parsed.data);
  if (!lead) return null;
  return { clientId: parsed.data.clientId, lead };
}

export interface HandleAdsWebhookArgs {
  rawBody: string;
  signature: string | null;
  secret: string | undefined;
}

/** Full pipeline: verify → parse → intake (userId 0 = system, per schema default). */
export async function handleAdsWebhook(args: HandleAdsWebhookArgs): Promise<IntakeAdLeadResult> {
  if (!args.secret) {
    throw new Error('ADS_WEBHOOK_SECRET is not configured — refusing unsigned intake');
  }
  if (!verifyAdsSignature(args.rawBody, args.signature, args.secret)) {
    throw new Error('Invalid webhook signature');
  }
  let json: unknown;
  try {
    json = JSON.parse(args.rawBody);
  } catch {
    throw new Error('Invalid webhook JSON');
  }
  const verified = parseAdsWebhookBody(json);
  if (!verified) {
    throw new Error('Invalid lead payload: clientId + contact email required');
  }
  return intakeAdLead({ clientId: verified.clientId, userId: 0, lead: verified.lead });
}
